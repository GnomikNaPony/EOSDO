/** One-time import; source SQLite is opened read-only and never altered. */
import { Database } from "bun:sqlite";
import { connect, migrate, Store } from "./store";
import type { RecordData, Value } from "./schema";

const source = Bun.argv[2];
if (!source)
  throw new Error(
    "Usage: bun src/server/import-sqlite.ts /absolute/path/eosdo.sqlite3",
  );
const sqlite = new Database(source, { readonly: true });
const services = await connect();
const uploaded: string[] = [];
try {
  await migrate(services.sql);
  const store = new Store(services.db);
  if ((await store.list("document")).length)
    throw new Error(
      "Import requires an empty PostgreSQL workspace; existing records were not modified.",
    );
  const exists = (name: string) =>
    !!sqlite
      .query("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
      .get(name);
  const rows = (name: string) =>
    exists(name)
      ? (sqlite.query(`SELECT * FROM ${name}`).all() as Record<
          string,
          unknown
        >[])
      : [];
  await services.db.transaction(async (tx) => {
    await tx.execute("SELECT pg_advisory_xact_lock(874121)");
    const s = new Store(tx);
    if ((await s.list("document")).length)
      throw new Error("Workspace is no longer empty");
    const profiles = new Map(
      rows("document_profiles").map((row) => [
        String(row.document_id),
        {
          ...(JSON.parse(String(row.config)) as RecordData),
          profile_revision: Number(row.revision),
        },
      ]),
    );
    for (const row of rows("documents"))
      await s.put(
        "document",
        {
          ...(row as RecordData),
          case_id: "",
          recipients: [],
          route: [],
          profile_revision: 0,
          ...profiles.get(String(row.id)),
        },
        undefined,
        String(row.owner_id),
      );
    for (const row of rows("versions")) {
      if (!(row.content instanceof Uint8Array))
        throw new Error(`Invalid original content for ${row.id}`);
      const key = `versions/${row.document_id}/${row.id}`;
      await services.s3.write(key, row.content);
      uploaded.push(key);
      const { content: _, ...metadata } = row;
      await s.put(
        "version",
        { ...(metadata as RecordData), object_key: key },
        String(row.document_id),
      );
    }
    const comments = rows("comments");
    const versions = rows("versions");
    for (const row of comments)
      await s.put("comment", row as RecordData, String(row.document_id));
    for (const row of rows("replies"))
      await s.put(
        "reply",
        row as RecordData,
        String(
          comments.find((comment) => comment.id === row.comment_id)
            ?.document_id,
        ),
      );
    for (const row of rows("checks"))
      await s.put(
        "check",
        {
          ...(row as RecordData),
          rules: JSON.parse(String(row.rules)) as Value,
          result: row.result ? (JSON.parse(String(row.result)) as Value) : null,
          status: row.status === "running" ? "queued" : String(row.status),
          document_id: String(
            versions.find((version) => version.id === row.version_id)
              ?.document_id,
          ),
        },
        String(
          versions.find((version) => version.id === row.version_id)
            ?.document_id,
        ),
      );
    for (const row of rows("notifications"))
      await s.put(
        "notification",
        { ...(row as RecordData), read: !!row.read },
        String(row.document_id),
        String(row.user_id),
      );
    for (const row of rows("history"))
      await s.put(
        "history",
        { ...(row as RecordData), id: `import-history-${row.id}` },
        String(row.document_id),
      );
    for (const row of rows("links"))
      await s.put(
        "link",
        { ...(row as RecordData), id: `${row.document_id}:${row.target_id}` },
        String(row.document_id),
      );
    for (const row of rows("personal_templates"))
      await s.put(
        "template",
        {
          ...(row as RecordData),
          config: JSON.parse(String(row.config)) as Value,
        },
        undefined,
        String(row.user_id),
      );
    for (const row of rows("settings")) {
      if (row.key === "rules")
        await s.set("rules", JSON.parse(String(row.value)) as RecordData);
      if (String(row.key).startsWith("notifications:"))
        await s.set(
          String(row.key).replace("notifications:", "preferences:"),
          JSON.parse(String(row.value)) as RecordData,
        );
    }
    const favorites = new Map<string, RecordData>();
    for (const row of rows("favorites")) {
      const owner = String(row.user_id);
      const entries = favorites.get(owner) ?? {};
      entries[String(row.document_id)] = true;
      favorites.set(owner, entries);
    }
    for (const [owner, entries] of favorites)
      await s.set(`favorites:${owner}`, entries);
  });
  console.log(
    "Imported SQLite records and original files. Source remains unchanged.",
  );
} catch (error) {
  for (const key of uploaded) await services.s3.delete(key);
  throw error;
} finally {
  sqlite.close();
  services.redis.close();
  await services.sql.close();
}
