import { Problem, date, documentTypes } from "./domain";
import type { RecordData } from "./schema";
import type { Store } from "./store";
import type { User } from "./workspace";

const statuses = ["new", "ai", "review", "revision", "approved", "done"];
const folders = [
  "all",
  "mine",
  "active",
  "review",
  "revision",
  "done",
  "favorites",
  "search",
];
const scopes = ["all", "filename", "text", "metadata"] as const;
export interface SearchOptions {
  q: string;
  terms: string[];
  scope: (typeof scopes)[number];
  history: "all" | "latest";
  type: string;
  status: string;
  from: string;
  to: string;
  folder: string;
  limit: number;
}
export interface SearchMatch {
  version_id: string | null;
  version_number: number | null;
  filename: string | null;
  is_latest: boolean;
  source: "metadata" | "filename" | "text";
  snippet: string;
  text_state: "ready" | "pending" | "unavailable";
}
export interface SearchItem {
  document_id: string;
  matches: SearchMatch[];
  match_count: number;
}
export interface SearchResults {
  query: string;
  items: SearchItem[];
  total: number;
  truncated: boolean;
  limit: number;
  pending_files: number;
  unavailable_files: number;
}
const normalize = (text: string) =>
  text.toLocaleLowerCase("ru-RU").replaceAll("ё", "е");

export { extractText as searchableText } from "./extraction";

/** Literal AND terms: no regex/SQL wildcards, stemming, or semantic claims. */
export function searchOptions(input: unknown): SearchOptions {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Problem(400, "Ожидаются параметры поиска");
  const values = input as Record<string, unknown>;
  const allowed = new Set([
    "q",
    "scope",
    "history",
    "type",
    "status",
    "from",
    "to",
    "folder",
    "limit",
  ]);
  if (Object.keys(values).some((key) => !allowed.has(key)))
    throw new Problem(400, "Неизвестный параметр поиска");
  const text = (key: string, fallback = "") => {
    const value = values[key] === undefined ? fallback : values[key];
    if (typeof value !== "string")
      throw new Problem(400, "Параметры поиска должны быть строками");
    return value.trim();
  };
  const q = text("q").replace(/\s+/g, " ");
  if (q.length > 200)
    throw new Problem(400, "Поисковый запрос — не больше 200 символов");
  const terms = [...new Set(normalize(q).split(" ").filter(Boolean))];
  if (terms.length > 10)
    throw new Problem(400, "В запросе допускается не больше 10 слов");
  const scope = text("scope", "all");
  const history = text("history", "all");
  const typ = text("type");
  const status = text("status");
  const folder = text("folder", "all");
  if (
    !scopes.includes(scope as SearchOptions["scope"]) ||
    !["all", "latest"].includes(history)
  )
    throw new Problem(400, "Недопустимый режим поиска");
  if (typ && !documentTypes.includes(typ))
    throw new Problem(400, "Недопустимый тип документа");
  if (status && !statuses.includes(status))
    throw new Problem(400, "Недопустимый статус");
  if (!folders.includes(folder))
    throw new Problem(400, "Недопустимый раздел реестра");
  const from = text("from"),
    to = text("to");
  if (from) date(from);
  if (to) date(to);
  if (from && to && from > to)
    throw new Problem(400, "Начало периода должно быть не позже окончания");
  const limitText = text("limit", "50");
  if (
    !/^\d{1,3}$/.test(limitText) ||
    Number(limitText) < 1 ||
    Number(limitText) > 100
  )
    throw new Problem(400, "Лимит поиска — от 1 до 100 документов");
  return {
    q,
    terms,
    scope: scope as SearchOptions["scope"],
    history: history as SearchOptions["history"],
    type: typ,
    status,
    from,
    to,
    folder,
    limit: Number(limitText),
  };
}

function excerpt(text: string, terms: string[]) {
  const content = text.replace(/\s+/g, " ").trim();
  const normalized = normalize(content);
  const positions = terms
    .map((word) => normalized.indexOf(word))
    .filter((n) => n >= 0);
  const first = positions.length ? Math.min(...positions) : 0;
  const start = Math.max(0, first - 70);
  const end = Math.min(content.length, start + 260);
  return `${start ? "…" : ""}${content.slice(start, end)}${end < content.length ? "…" : ""}`;
}

export async function searchDocuments(
  store: Pick<Store, "list" | "setting">,
  user: User,
  options: SearchOptions,
): Promise<SearchResults> {
  const favorites = await store.setting(`favorites:${user.id}`, {});
  // ACL is applied before loading any version text, not just before serializing results.
  const documents = (await store.list("document")).filter(
    (doc) =>
      (user.role === "curator" || doc.owner_id === user.id) &&
      (!options.type || doc.type === options.type) &&
      (!options.status || doc.status === options.status) &&
      (!options.from || String(doc.due) >= options.from) &&
      (!options.to || String(doc.due) <= options.to) &&
      (options.folder !== "mine" || doc.owner_id === user.id) &&
      (options.folder !== "favorites" || favorites[String(doc.id)] === true) &&
      (!["review", "revision", "done"].includes(options.folder) ||
        doc.status === options.folder) &&
      (options.folder !== "active" ||
        !["approved", "done"].includes(String(doc.status))),
  );
  // ponytail: bounded scan of extracted text; a database search index is the upgrade for a large archive.
  if (documents.length > 1000)
    throw new Problem(
      503,
      "Слишком широкий поиск. Уточните период, тип или статус (до 1000 документов).",
    );
  const users = await store.list("account");
  const directory = await store.setting("directory", {});
  const cases = Array.isArray(directory.cases) ? directory.cases : [];
  const result: SearchResults = {
    query: options.q,
    items: [],
    total: 0,
    truncated: false,
    limit: options.limit,
    pending_files: 0,
    unavailable_files: 0,
  };
  let scanned = 0;
  for (const doc of documents.reverse()) {
    const person = users.find((item) => item.id === doc.owner_id);
    const recordCase = cases.find(
      (item): item is RecordData =>
        !!item &&
        typeof item === "object" &&
        !Array.isArray(item) &&
        item.id === doc.case_id,
    );
    const metadata = [
      doc.title,
      doc.number,
      doc.type,
      doc.department,
      doc.summary,
      person?.name,
      recordCase?.code,
      recordCase?.title,
    ]
      .filter((item) => typeof item === "string")
      .join("\n");
    const meta = normalize(metadata);
    const matches: SearchMatch[] = [];
    const all = (await store.list("version", String(doc.id))).sort(
      (a, b) => Number(b.number) - Number(a.number),
    );
    const versions = options.history === "latest" ? all.slice(0, 1) : all;
    scanned += versions.length;
    if (scanned > 10000)
      throw new Problem(
        503,
        "Слишком много версий для поиска. Выберите актуальные версии или уточните фильтры.",
      );
    for (const version of versions) {
      const state =
        typeof version.text === "string" && version.text.trim()
          ? "ready"
          : version.extraction_error
            ? "unavailable"
            : "pending";
      if (state === "pending") result.pending_files++;
      if (state === "unavailable") result.unavailable_files++;
    }
    if (
      !options.terms.length ||
      (["all", "metadata"].includes(options.scope) &&
        options.terms.every((word) => meta.includes(word)))
    ) {
      matches.push({
        version_id: null,
        version_number: null,
        filename: null,
        is_latest: false,
        source: "metadata",
        snippet: excerpt(metadata, options.terms),
        text_state: "ready",
      });
    } else if (options.scope !== "metadata") {
      for (const version of versions) {
        const filename = String(version.filename ?? "");
        const text = typeof version.text === "string" ? version.text : "";
        const searchable = normalize(
          options.scope === "filename"
            ? filename
            : options.scope === "text"
              ? text
              : `${metadata}\n${filename}\n${text}`,
        );
        if (!options.terms.every((word) => searchable.includes(word))) continue;
        const textMatch =
          options.scope !== "filename" &&
          options.terms.some((word) => normalize(text).includes(word));
        matches.push({
          version_id: String(version.id),
          version_number: Number(version.number),
          filename,
          is_latest: version.id === all[0]?.id,
          source: textMatch ? "text" : "filename",
          snippet: excerpt(textMatch ? text : filename, options.terms),
          text_state: text.trim()
            ? "ready"
            : version.extraction_error
              ? "unavailable"
              : "pending",
        });
      }
    }
    if (matches.length) {
      result.total++;
      if (result.items.length < options.limit)
        result.items.push({
          document_id: String(doc.id),
          matches: matches.slice(0, 3),
          match_count: matches.length,
        });
    }
  }
  result.truncated = result.total > result.items.length;
  return result;
}
