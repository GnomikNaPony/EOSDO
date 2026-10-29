import { SQL, RedisClient, S3Client } from "bun";
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
IF OLD.kind='version' AND (TG_OP='DELETE' OR NEW.kind IS DISTINCT FROM OLD.kind OR NEW.document_id IS DISTINCT FROM OLD.document_id OR NEW.owner IS DISTINCT FROM OLD.owner OR (NEW.data - 'text' - 'extraction_error') IS DISTINCT FROM (OLD.data - 'text' - 'extraction_error')) THEN RAISE EXCEPTION 'Version originals are immutable'; END IF;
IF TG_OP='DELETE' THEN RETURN OLD; END IF;
RETURN NEW; END $$;
DROP TRIGGER IF EXISTS eosdo_version_immutable ON eosdo_records;
CREATE TRIGGER eosdo_version_immutable BEFORE UPDATE OR DELETE ON eosdo_records FOR EACH ROW EXECUTE FUNCTION eosdo_protect_version();`);
  });
}
export class Store {
  constructor(public db: Pick<Database, "select" | "insert" | "delete">) {}
  async list(kind: string, documentId?: string) {
    const rows = await this.db
      .select()
      .from(records)
      .where(
        documentId
          ? and(eq(records.kind, kind), eq(records.documentId, documentId))
          : eq(records.kind, kind),
      )
      .orderBy(records.createdAt);
    return rows.map((r) => r.data);
  }
  async get(id: string, kind?: string): Promise<RecordData | undefined> {
    const [row] = await this.db
      .select()
      .from(records)
      .where(
        kind
          ? and(eq(records.id, id), eq(records.kind, kind))
          : eq(records.id, id),
      );
    return row?.data;
  }
  async put(
    kind: string,
    data: RecordData,
    documentId?: string,
    owner?: string,
  ) {
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
      });
    return data;
  }
  async remove(id: string) {
    await this.db.delete(records).where(eq(records.id, id));
  }
  async setting(key: string, fallback: RecordData): Promise<RecordData> {
    const [row] = await this.db
      .select()
      .from(settings)
      .where(eq(settings.key, key));
    return row?.data ?? fallback;
  }
  async set(key: string, data: RecordData) {
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
