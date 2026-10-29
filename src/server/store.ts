import { SQL, RedisClient, S3Client } from "bun";
import { AsyncLocalStorage } from "node:async_hooks";

export const demoScope = new AsyncLocalStorage<string>();
import { drizzle } from "drizzle-orm/bun-sql";
import { and, eq, sql as query } from "drizzle-orm";
import { records, settings, type RecordData } from "./schema";
import { defaultRules, now, uid } from "./domain";
import { s3Options } from "./s3-config";

export async function connect() {
  const sql = new SQL(
    Bun.env.DATABASE_URL ?? "postgres://eosdo:eosdo@127.0.0.1:5432/eosdo",
  );
  await sql`SELECT 1`;
  const redis = new RedisClient(Bun.env.REDIS_URL ?? "redis://127.0.0.1:6379");
  await redis.connect();
  const s3 = new S3Client(s3Options(Bun.env));
  const db = drizzle(sql);
  return { sql, db, redis, s3 };
}
export type Services = Awaited<ReturnType<typeof connect>>;
export type Database = Services["db"];
export async function migrate(sql: SQL) {
  await sql.begin(async (transaction) => {
    await transaction`SELECT pg_advisory_xact_lock(874121)`;
    await transaction.unsafe(`CREATE TABLE IF NOT EXISTS eosdo_records (id text PRIMARY KEY, kind text NOT NULL, owner text, document_id text, data jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS eosdo_records_kind ON eosdo_records(kind);
CREATE INDEX IF NOT EXISTS eosdo_records_document ON eosdo_records(document_id);
CREATE TABLE IF NOT EXISTS eosdo_settings (key text PRIMARY KEY, data jsonb NOT NULL);
DROP TRIGGER IF EXISTS eosdo_version_immutable ON eosdo_records;
UPDATE eosdo_records SET data=(data #>> '{}')::jsonb WHERE jsonb_typeof(data)='string';
UPDATE eosdo_settings SET data=(data #>> '{}')::jsonb WHERE jsonb_typeof(data)='string';
CREATE UNIQUE INDEX IF NOT EXISTS eosdo_account_email_normalized ON eosdo_records (lower(data->>'email')) WHERE kind='account';
CREATE UNIQUE INDEX IF NOT EXISTS eosdo_version_number ON eosdo_records (document_id, (data->>'number')) WHERE kind='version';
CREATE OR REPLACE FUNCTION eosdo_protect_version() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
IF OLD.kind='comment_event' THEN RAISE EXCEPTION 'Comment events are immutable'; END IF;
IF OLD.kind='reply' THEN RAISE EXCEPTION 'Replies are immutable'; END IF;
IF OLD.kind='comment' AND (TG_OP='DELETE' OR NEW.kind IS DISTINCT FROM OLD.kind OR NEW.document_id IS DISTINCT FROM OLD.document_id OR NEW.owner IS DISTINCT FROM OLD.owner OR (NEW.data - 'status' - 'resolved_version') IS DISTINCT FROM (OLD.data - 'status' - 'resolved_version')) THEN RAISE EXCEPTION 'Comment originals are immutable'; END IF;
IF OLD.kind='version' AND (TG_OP='DELETE' OR NEW.kind IS DISTINCT FROM OLD.kind OR NEW.document_id IS DISTINCT FROM OLD.document_id OR NEW.owner IS DISTINCT FROM OLD.owner OR (NEW.data - 'text' - 'extraction_error') IS DISTINCT FROM (OLD.data - 'text' - 'extraction_error')) THEN RAISE EXCEPTION 'Version originals are immutable'; END IF;
IF TG_OP='DELETE' THEN RETURN OLD; END IF;
RETURN NEW; END $$;
DROP TRIGGER IF EXISTS eosdo_version_immutable ON eosdo_records;
CREATE TRIGGER eosdo_version_immutable BEFORE UPDATE OR DELETE ON eosdo_records FOR EACH ROW EXECUTE FUNCTION eosdo_protect_version();`);
  });
}
export class Store {
  constructor(public db: Pick<Database, "select" | "insert" | "delete">) {}
  scopeFilter() {
    return query`coalesce(${records.data}->>'demo_id', '') = ${demoScope.getStore() ?? ""}`;
  }
  async list(kind: string, documentId?: string) {
    const rows = await this.db
      .select()
      .from(records)
      .where(
        and(
          this.scopeFilter(),
          eq(records.kind, kind),
          documentId ? eq(records.documentId, documentId) : undefined,
        ),
      )
      .orderBy(records.createdAt);
    return rows.map((r) => r.data).filter((data) => this.visible(data));
  }
  visible(data: RecordData) {
    return (data.demo_id ?? "") === (demoScope.getStore() ?? "");
  }
  async get(
    id: string,
    kind?: string,
    unscoped = false,
  ): Promise<RecordData | undefined> {
    const [row] = await this.db
      .select()
      .from(records)
      .where(
        and(
          unscoped ? undefined : this.scopeFilter(),
          eq(records.id, id),
          kind ? eq(records.kind, kind) : undefined,
        ),
      );
    return row && (unscoped || this.visible(row.data)) ? row.data : undefined;
  }
  async put(
    kind: string,
    data: RecordData,
    documentId?: string,
    owner?: string,
  ) {
    const scope = demoScope.getStore();
    if (scope) data = { ...data, demo_id: scope };
    await this.db
      .insert(records)
      .values({
        id: String(data.id),
        kind,
        documentId,
        owner,
        data: query`${data}::jsonb`,
      })
      .onConflictDoUpdate({
        target: records.id,
        set: { data: query`${data}::jsonb` },
        setWhere: this.scopeFilter(),
      });
    return data;
  }
  async remove(id: string) {
    await this.db
      .delete(records)
      .where(and(eq(records.id, id), this.scopeFilter()));
  }
  async setting(key: string, fallback: RecordData): Promise<RecordData> {
    if (demoScope.getStore()) key = `demo:${demoScope.getStore()}:${key}`;
    const [row] = await this.db
      .select()
      .from(settings)
      .where(eq(settings.key, key));
    return row?.data ?? fallback;
  }
  async set(key: string, data: RecordData) {
    if (demoScope.getStore()) key = `demo:${demoScope.getStore()}:${key}`;
    await this.db
      .insert(settings)
      .values({ key, data: query`${data}::jsonb` })
      .onConflictDoUpdate({
        target: settings.key,
        set: { data: query`${data}::jsonb` },
      });
  }
  async rules() {
    return this.setting("rules", defaultRules);
  }
  async log(documentId: string, author: string, action: string) {
    return this.put(
      "history",
      {
        id: uid(),
        document_id: documentId,
        author_id: author,
        action,
        created: now(),
      },
      documentId,
    );
  }
  async notify(
    user: string,
    documentId: string,
    versionId: string | null,
    category: string,
    title: string,
    body: string,
  ) {
    const prefs = await this.setting(`preferences:${user}`, {});
    if (prefs[category] === false) return;
    return this.put(
      "notification",
      {
        id: uid(),
        user_id: user,
        document_id: documentId,
        version_id: versionId,
        category,
        title,
        body,
        read: false,
        created: now(),
      },
      documentId,
      user,
    );
  }
}
if (import.meta.main) {
  const services = await connect();
  try {
    await migrate(services.sql);
    console.log("PostgreSQL schema is ready");
  } finally {
    services.redis.close();
    await services.sql.close();
  }
}
