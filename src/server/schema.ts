import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export type Value =
  string | number | boolean | null | Value[] | { [key: string]: Value };
export type RecordData = { [key: string]: Value };

/** Domain records are versioned JSONB; kind and ownership remain indexed columns. */
export const records = pgTable("eosdo_records", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  owner: text("owner"),
  documentId: text("document_id"),
  data: jsonb("data").$type<RecordData>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
export const settings = pgTable("eosdo_settings", {
  key: text("key").primaryKey(),
  data: jsonb("data").$type<RecordData>().notNull(),
});
