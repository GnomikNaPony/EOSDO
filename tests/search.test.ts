import { describe, expect, test } from "bun:test";
import {
  searchDocuments,
  searchOptions,
  searchableText,
} from "../src/server/search";
import type { RecordData } from "../src/server/schema";
import type { User } from "../src/server/workspace";

const author: User = {
  id: "author",
  name: "Автор",
  department: "Отдел",
  role: "author",
  email: "author@example.test",
};
function fixture() {
  const documents: RecordData[] = [
    {
      id: "own",
      owner_id: "author",
      title: "Закупка материалов",
      number: "ПР-100",
      type: "Письмо",
      status: "review",
      due: "2027-01-10",
      summary: "Основание закупки",
      department: "Отдел",
      case_id: "case",
    },
    {
      id: "foreign",
      owner_id: "other",
      title: "Закупка материалов",
      number: "ПР-200",
      type: "Письмо",
      status: "revision",
      due: "2027-02-20",
      summary: "Чужая карточка",
    },
  ];
  const versions: RecordData[] = [
    {
      id: "old",
      document_id: "own",
      number: 1,
      filename: "Смета_насосов.txt",
      text: "Старый регламент. Уникальный зебровый пакет. Ёмкость 18 м³.",
      extraction_error: null,
      object_key: "secret-object-key",
    },
    {
      id: "latest",
      document_id: "own",
      number: 2,
      filename: "Материалы.csv",
      text: "Новый регламент. Объём 23 м³.",
      extraction_error: null,
    },
    {
      id: "hidden",
      document_id: "foreign",
      number: 1,
      filename: "Смета_насосов.txt",
      text: "Уникальный зебровый пакет. Чужой секретный фрагмент.",
    },
  ];
  const readVersions: string[] = [];
  const store = {
    list: async (kind: string, id?: string): Promise<RecordData[]> => {
      if (kind === "document") return documents;
      if (kind === "account")
        return [
          { id: "author", name: "Автор" },
          { id: "other", name: "Другой" },
        ];
      if (kind === "version") {
        readVersions.push(id || "all");
        return versions.filter((v) => v.document_id === id);
      }
      return [];
    },
    setting: async (key: string): Promise<RecordData> =>
      key === "directory"
        ? { cases: [{ id: "case", code: "К-01", title: "Переписка" }] }
        : { own: true },
  };
  return { documents, versions, readVersions, store };
}
describe("file search contract", () => {
  test("literal queries, dates, modes and inclusive bounds are validated", () => {
    expect(searchOptions({ q: "  ЁМКОСТЬ    пакет " }).terms).toEqual([
      "емкость",
      "пакет",
    ]);
    expect(searchOptions({ q: "" }).terms).toEqual([]);
    expect(
      searchOptions({ q: "a".repeat(200), limit: "100", from: "2028-02-29" })
        .limit,
    ).toBe(100);
    for (const value of [
      { q: "a".repeat(201) },
      {
        q: Array(11)
          .fill(0)
          .map((_, i) => `w${i}`)
          .join(" "),
      },
      { q: [] },
      { q: null },
      { scope: "semantic" },
      { history: "unknown" },
      { status: "unknown" },
      { type: "unknown" },
      { from: "2026-02-30" },
      { from: "2027-01-02", to: "2027-01-01" },
      { limit: "0" },
      { limit: "101" },
      { limit: "1.5" },
      { q: ["first", "second"] },
      { unknown: "x" },
    ])
      expect(() => searchOptions(value)).toThrow();
  });
  test("finds original filenames, old text, metadata and exact versions without returning originals", async () => {
    const { store } = fixture();
    const text = await searchDocuments(
      store,
      author,
      searchOptions({ q: "зебровый пакет", scope: "text" }),
    );
    expect(text.total).toBe(1);
    expect(text.items[0]?.matches[0]?.version_id).toBe("old");
    expect(text.items[0]?.matches[0]?.is_latest).toBe(false);
    expect(text.items[0]?.matches[0]?.snippet).toContain(
      "Уникальный зебровый пакет",
    );
    expect(JSON.stringify(text)).not.toContain("object_key");
    expect(
      (
        await searchDocuments(
          store,
          author,
          searchOptions({ q: "СМЕТА_НАСОСОВ", scope: "filename" }),
        )
      ).items[0]?.matches[0]?.filename,
    ).toBe("Смета_насосов.txt");
    expect(
      (
        await searchDocuments(
          store,
          author,
          searchOptions({ q: "емкость", scope: "text" }),
        )
      ).total,
    ).toBe(1);
    expect(
      (
        await searchDocuments(
          store,
          author,
          searchOptions({ q: "К-01", scope: "metadata" }),
        )
      ).items[0]?.matches[0]?.source,
    ).toBe("metadata");
    expect(
      (
        await searchDocuments(
          store,
          author,
          searchOptions({ q: "ПР-100 зебровый" }),
        )
      ).total,
    ).toBe(1);
    expect(
      (
        await searchDocuments(
          store,
          author,
          searchOptions({ q: "ПР-100 зебровый", scope: "text" }),
        )
      ).total,
    ).toBe(0);
  });
  test("ACL precedes version reads and restricts snippets and unavailable counts", async () => {
    const { store, readVersions } = fixture();
    const result = await searchDocuments(
      store,
      author,
      searchOptions({ q: "пакет" }),
    );
    expect(readVersions).toEqual(["own"]);
    expect(result.total).toBe(1);
    expect(JSON.stringify(result)).not.toContain("Чужой");
    expect(JSON.stringify(result)).not.toContain("hidden");
    expect(
      (
        await searchDocuments(
          store,
          { ...author, role: "curator" },
          searchOptions({ q: "пакет" }),
        )
      ).total,
    ).toBe(2);
  });
  test("all terms must match one version; filters, current-only, empty and zero results are exact", async () => {
    const { store } = fixture();
    for (const values of [
      { q: "старый новый" },
      { q: "зебровый", history: "latest" },
      { q: "зебровый", scope: "filename" },
      { q: "%_'[" },
      { q: "пакет", from: "2027-01-11" },
      { q: "пакет", status: "done" },
      { q: "пакет", type: "Протокол" },
    ])
      expect(
        (await searchDocuments(store, author, searchOptions(values))).total,
      ).toBe(0);
    expect(
      (
        await searchDocuments(
          store,
          author,
          searchOptions({
            q: "пакет",
            from: "2027-01-10",
            to: "2027-01-10",
            folder: "favorites",
          }),
        )
      ).total,
    ).toBe(1);
    expect(
      (
        await searchDocuments(store, author, searchOptions({ q: "" }))
      ).items.map((i) => i.document_id),
    ).toEqual(["own"]);
  });
  test("limited document and version results are explicit; large scans fail rather than return false zero", async () => {
    const { store, documents, versions } = fixture();
    const limited = await searchDocuments(
      store,
      { ...author, role: "curator" },
      searchOptions({ q: "пакет", limit: "1" }),
    );
    expect(limited.total).toBe(2);
    expect(limited.items.length).toBe(1);
    expect(limited.truncated).toBe(true);
    versions.push(
      ...[3, 4, 5].map((n) => ({
        id: `v${n}`,
        document_id: "own",
        number: n,
        filename: "file.txt",
        text: "регламент",
      })),
    );
    const versionLimit = await searchDocuments(
      store,
      author,
      searchOptions({ q: "регламент" }),
    );
    expect(versionLimit.items[0]?.match_count).toBe(5);
    expect(versionLimit.items[0]?.matches.length).toBe(3);
    documents.push(
      ...Array.from({ length: 1000 }, (_, n) => ({
        ...documents[0],
        id: `wide-${n}`,
      })),
    );
    await expect(
      searchDocuments(store, author, searchOptions({ q: "пакет" })),
    ).rejects.toThrow("Слишком широкий поиск");
  });
  test("unavailable and not-extracted text is visible, filenames still match, HTML is plain text", async () => {
    const { store, versions } = fixture();
    versions[0]!.text = null;
    versions[0]!.extraction_error = "Нужен OCR";
    versions[1]!.text = null;
    const result = await searchDocuments(
      store,
      author,
      searchOptions({ q: "смета" }),
    );
    expect(result.pending_files).toBe(1);
    expect(result.unavailable_files).toBe(1);
    expect(result.items[0]?.matches[0]?.text_state).toBe("unavailable");
    expect(
      (
        await searchDocuments(
          store,
          author,
          searchOptions({ q: "зебровый", scope: "text" }),
        )
      ).total,
    ).toBe(0);
    versions[1]!.text = "<script>window.injected=true</script> уникальный HTML";
    expect(
      (
        await searchDocuments(
          store,
          author,
          searchOptions({ q: "HTML", scope: "text" }),
        )
      ).items[0]?.matches[0]?.snippet,
    ).toContain("<script>");
  });
  test("independent text extraction keeps explicit unsupported/empty/encoding/size states", async () => {
    expect(
      await searchableText("plan.md", Buffer.from("План: ёмкость")),
    ).toEqual({
      text: "План: ёмкость",
      extraction_error: null,
    });
    expect(
      (await searchableText("plan.txt", Buffer.from("a".repeat(45000)))).text
        ?.length,
    ).toBe(45000);
    for (const [name, bytes] of [
      ["plan.txt", Buffer.from("a".repeat(45001))],
      ["plan.txt", new Uint8Array(180001)],
      ["plan.docx", Buffer.from("opaque")],
      ["plan.csv", new Uint8Array([255, 255])],
      ["empty.txt", Buffer.from(" \n")],
    ] as const) {
      const result = await searchableText(name, bytes);
      expect(result.text).toBeNull();
      expect(result.extraction_error).toBeTruthy();
    }
  });
});

Bun.env.INTELLIGENCE_WORKER_ENABLED = "0";
const integration = Bun.env.RUN_INTEGRATION === "1" ? test : test.skip;
integration(
  "search API uses authenticated ownership and uploaded text even with no AI rules",
  async () => {
    const { SQL } = await import("bun");
    const { connect, migrate, Store } = await import("../src/server/store");
    const { createApp } = await import("../src/server/app");
    const database = `eosdo_search_test_${crypto.randomUUID().replaceAll("-", "")}`;
    const original = Bun.env.DATABASE_URL!;
    const admin = new SQL(original);
    await admin.unsafe(`CREATE DATABASE ${database}`);
    const target = new URL(original);
    target.pathname = `/${database}`;
    Bun.env.DATABASE_URL = target.toString();
    const services = await connect();
    Bun.env.DATABASE_URL = original;
    await migrate(services.sql);
    const app = await createApp(services),
      store = new Store(services.db);
    try {
      expect(
        (await app.inject({ url: "/api/search?q=secret" })).statusCode,
      ).toBe(401);
      async function register(email: string) {
        const response = await app.inject({
          method: "POST",
          url: "/api/auth/register",
          payload: {
            email,
            password: "test-search-password-123",
            name: email,
            department: "Тестовый отдел",
            organization: "Тестовый поиск",
          },
        });
        expect(response.statusCode).toBe(200);
        return {
          cookie: String(response.headers["set-cookie"]).split(";")[0]!,
        };
      }
      const curator = await register("curator@example.test"),
        owner = await register("author@example.test"),
        other = await register("other@example.test");
      const created = await app.inject({
        method: "POST",
        url: "/api/documents",
        headers: owner,
        payload: {
          title: "Тестовый план",
          type: "План мероприятий",
          due: "2027-01-31",
          priority: "normal",
          summary: "Карточка без слова из файла",
        },
      });
      expect(created.statusCode).toBe(200);
      const id = created.json().id as string;
      async function upload(
        filename: string,
        content: Uint8Array,
        parent: string | null,
      ) {
        const response = await app.inject({
          method: "POST",
          url: `/api/documents/${id}/versions`,
          headers: owner,
          payload: {
            filename,
            content: Buffer.from(content).toString("base64"),
            message: "Учебная редакция",
            parent_id: parent,
          },
        });
        expect(response.statusCode).toBe(200);
        return response.json() as { id: string; check_id: string };
      }
      const first = await upload(
        "Смета_насосов.txt",
        Buffer.from("Архивный гелиотропный клапан: объём 18 м³."),
        null,
      );
      expect((await store.get(first.check_id, "check"))?.status).toBe("error"); // No rules: text search must still work.
      const query = (q: string, headers = owner) =>
        app.inject({ url: `/api/search?${q}`, headers });
      const result = (await query("q=гелиотропный&scope=text")).json();
      expect(result.total).toBe(1);
      expect(result.items[0].matches[0].version_id).toBe(first.id);
      const latest = await upload(
        "План.md",
        Buffer.from("Новая редакция: берилловый контур."),
        first.id,
      );
      expect((await query("q=гелиотропный&history=latest")).json().total).toBe(
        0,
      );
      expect(
        (await query("q=гелиотропный")).json().items[0].matches[0].is_latest,
      ).toBe(false);
      const unauthorized = (await query("q=гелиотропный", other)).json();
      expect(unauthorized.total).toBe(0);
      expect(unauthorized.pending_files).toBe(0);
      expect(JSON.stringify(unauthorized)).not.toContain("Архивный");
      expect((await query("q=гелиотропный", curator)).json().total).toBe(1);
      expect((await query("q=x&from=2026-02-30")).statusCode).toBe(400);
      expect((await query("q=first&q=second")).statusCode).toBe(400);
      const bytes = Buffer.from("x".repeat(45001));
      const large = await upload("Большой.txt", bytes, latest.id);
      expect(
        (await store.get(large.id, "version"))?.extraction_error,
      ).toBeTruthy();
      const downloaded = await app.inject({
        url: `/api/versions/${large.id}/file`,
        headers: owner,
      });
      expect(downloaded.statusCode).toBe(200);
      expect(downloaded.rawPayload.equals(bytes)).toBe(true);
      expect((await query("q=Большой&scope=filename")).json().total).toBe(1);
    } finally {
      await app.close();
      for (const version of await store.list("version"))
        if (typeof version.object_key === "string")
          await services.s3.delete(version.object_key);
      services.redis.close();
      await services.sql.close();
      await admin.unsafe(`DROP DATABASE ${database} WITH (FORCE)`);
      await admin.close();
    }
  },
  30000,
);
