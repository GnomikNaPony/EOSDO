import { describe, expect, test } from "bun:test";
import {
  accessibleIntelligence,
  chunkText,
  cosine,
  embedTexts,
  extractMetadata,
  intelligenceGroups,
  intelligenceReport,
  semanticSearch,
  validateMetadata,
  validateVectors,
} from "../src/server/intelligence";
import type { RecordData } from "../src/server/schema";
import type { User } from "../src/server/workspace";

const user: User = {
  id: "author",
  name: "Автор",
  email: "author@example.test",
  department: "Отдел",
  role: "author",
};
const config = {
  url: "http://model.test",
  model: "facts",
  embeddingModel: "vectors",
};
const hash = (text: string) =>
  new Bun.CryptoHasher("sha256").update(text).digest("hex");
function fixture() {
  const documents: RecordData[] = [
    { id: "own", owner_id: user.id },
    { id: "reply", owner_id: user.id },
    { id: "foreign", owner_id: "other" },
  ];
  const versions: RecordData[] = documents.map((doc, i) => ({
    id: `v${i}`,
    document_id: doc.id,
    number: 1,
    filename: `${doc.id}.txt`,
    text: "Проект: Север-2026.",
    sha256: `file${i}`,
    created: `2026-10-2${i + 1}`,
  }));
  const indexes: RecordData[] = versions.map((v) => ({
    id: `intelligence:${v.id}`,
    version_id: v.id,
    document_id: v.document_id,
    file_sha256: v.sha256,
    text_sha256: hash(String(v.text)),
    status: "ready",
    metadata_status: "ready",
    embedding_status: "ready",
    embedding_model: "vectors",
    metadata: {
      facts: [
        { kind: "project", value: "Север-2026", quote: "Проект: Север-2026." },
      ],
    },
    chunks: [
      { start: 0, end: String(v.text).length, text: v.text, vector: [1, 0] },
    ],
  }));
  const calls: string[] = [];
  const store = {
    async list(kind: string, id?: string) {
      calls.push(`${kind}:${id ?? ""}`);
      return (
        kind === "document"
          ? documents
          : kind === "version"
            ? versions
            : indexes
      ).filter((v) => !id || v.document_id === id);
    },
  };
  return { store, versions, indexes, calls };
}
const vectors = async () =>
  Response.json({ model: "vectors", embeddings: [[1, 0]] });

describe("document intelligence contracts", () => {
  test("facts require source quotes, deduplicate and retain decision negation", () => {
    const text = "Решение: замечание не принято. Проект: Север-2026.";
    const fact = {
      kind: "project",
      value: "Север-2026",
      quote: "Проект: Север-2026.",
    };
    const result = validateMetadata(
      {
        facts: [
          fact,
          fact,
          { kind: "decision", value: "принято", quote: "принято" },
        ],
      },
      text,
    );
    expect(result.facts).toHaveLength(2);
    expect(result.facts[1]?.value).toBe("Решение: замечание не принято.");
    expect(() =>
      validateMetadata(
        { facts: [{ ...fact, quote: "Несуществующая цитата" }] },
        text,
      ),
    ).toThrow();
    expect(() =>
      validateMetadata({ facts: [{ ...fact, value: "Юг" }] }, text),
    ).toThrow();
    expect(validateMetadata({ facts: [] }, text).summary).toBe("");
  });
  test("chunk boundaries cover full source and vectors reject incompatible data", () => {
    const text = "a".repeat(45000),
      chunks = chunkText(text);
    expect(chunks[0]?.start).toBe(0);
    expect(chunks.at(-1)?.end).toBe(text.length);
    for (const chunk of chunks)
      expect(chunk.text).toBe(
        text.slice(Number(chunk.start), Number(chunk.end)),
      );
    expect(() => chunkText(" ")).toThrow();
    expect(() => chunkText(text + "a")).toThrow();
    for (const value of [
      [[0, 0]],
      [[NaN, 1]],
      [[Infinity, 1]],
      [
        [1, 0],
        [1, 0, 0],
      ],
    ])
      expect(() => validateVectors(value, value.length)).toThrow();
    expect(cosine([1, 0], [0, 1])).toBe(0);
    expect(cosine([1, 0], [-1, 0])).toBe(-1);
  });
  test("model failures and wrong model identities cannot produce validated output", async () => {
    await expect(
      embedTexts(["text"], config, undefined, async () =>
        Response.json({ model: "other", embeddings: [[1, 0]] }),
      ),
    ).rejects.toThrow();
    await expect(
      extractMetadata(
        "text",
        config,
        undefined,
        async () => new Response(null, { status: 503 }),
      ),
    ).rejects.toThrow("503");
    await expect(
      extractMetadata("text", config, undefined, async () =>
        Response.json({ done: false, message: { content: '{"facts":[]}' } }),
      ),
    ).rejects.toThrow();
  });
  test("ACL filters before loading foreign versions, grouping and semantic ranking", async () => {
    const { store, calls } = fixture();
    const entries = await accessibleIntelligence(store, user);
    expect(entries).toHaveLength(2);
    expect(calls).not.toContain("version:foreign");
    expect(calls).not.toContain("intelligence:foreign");
    const groups = intelligenceGroups(entries);
    expect(groups[0]?.document_ids).toEqual(["own", "reply"]);
    const report = await intelligenceReport(store, user, groups[0]!.key);
    expect(report.sources.map((s) => s.version_id)).toEqual(["v0", "v1"]);
    expect(report.notice).toContain("не меняют");
    const results = await semanticSearch(
      store,
      user,
      "исправление кабеля",
      config,
      vectors,
    );
    expect(results.items.map((i) => i.document_id)).toEqual(["own", "reply"]);
    expect(JSON.stringify(results)).not.toContain("foreign");
    expect(
      await accessibleIntelligence(store, { ...user, role: "curator" }),
    ).toHaveLength(3);
  });
  test("changed source hashes invalidate results and historical versions retain identity", async () => {
    const { store, versions, indexes } = fixture();
    versions.push({
      ...versions[0],
      id: "v-new",
      number: 2,
      text: "Новый проект",
      sha256: "new",
    });
    let entries = await accessibleIntelligence(store, user);
    expect(entries.find((e) => e.version.id === "v0")?.is_latest).toBe(false);
    expect(
      entries.find((e) => e.version.id === "v-new")?.index,
    ).toBeUndefined();
    indexes[0]!.text_sha256 = hash("подменённый текст");
    entries = await accessibleIntelligence(store, user);
    expect(entries.find((e) => e.version.id === "v0")?.index).toBeUndefined();
    expect(intelligenceGroups(entries)[0]?.document_ids).toEqual(["reply"]);
  });
  test("semantic search exposes unavailable models and corrupt indexes without fallback", async () => {
    const { store, indexes } = fixture();
    await expect(
      semanticSearch(store, user, "проект", config, async () => {
        throw new TypeError("offline");
      }),
    ).rejects.toThrow("Модель недоступна");
    indexes[0]!.chunks = [{ start: 0, end: 1, text: "forged", vector: [1, 0] }];
    await expect(
      semanticSearch(store, user, "проект", config, vectors),
    ).rejects.toThrow("не соответствует");
    await expect(
      semanticSearch(store, user, " ", config, vectors),
    ).rejects.toThrow();
  });
});

Bun.env.INTELLIGENCE_WORKER_ENABLED = "0";
const integration = Bun.env.RUN_INTEGRATION === "1" ? test : test.skip;
integration(
  "worker persists version-bound facts, independent failures and explicit retries",
  async () => {
    const { SQL } = await import("bun");
    const { connect, migrate, Store } = await import("../src/server/store");
    const { processVersion, queueIntelligence } =
      await import("../src/server/intelligence");
    const originalUrl = Bun.env.DATABASE_URL!;
    const previousModelUrl = Bun.env.OLLAMA_URL;
    const previousEmbeddingModel = Bun.env.OLLAMA_EMBED_MODEL;
    const database = `eosdo_intelligence_test_${crypto.randomUUID().replaceAll("-", "")}`;
    const admin = new SQL(originalUrl);
    await admin.unsafe(`CREATE DATABASE "${database}"`);
    const target = new URL(originalUrl);
    target.pathname = `/${database}`;
    Bun.env.DATABASE_URL = target.toString();
    const services = await connect();
    Bun.env.DATABASE_URL = originalUrl;
    await migrate(services.sql);
    const store = new Store(services.db);
    let failEmbeddings = false,
      requests = 0;
    const model = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      async fetch(request) {
        requests++;
        if (new URL(request.url).pathname === "/api/chat")
          return Response.json({
            done: true,
            message: {
              content: JSON.stringify({
                facts: [
                  {
                    kind: "project",
                    value: "Север-2026",
                    quote: "Проект: Север-2026.",
                  },
                ],
              }),
            },
          });
        if (failEmbeddings) return new Response(null, { status: 503 });
        const payload = (await request.json()) as { input: string[] };
        return Response.json({
          model: "vectors",
          embeddings: payload.input.map(() => [1, 0]),
        });
      },
    });
    Bun.env.OLLAMA_URL = model.url.origin;
    Bun.env.OLLAMA_EMBED_MODEL = "vectors";
    try {
      await store.put("document", {
        id: "doc",
        owner_id: user.id,
        status: "review",
        approved_version: null,
      });
      const text = "Проект: Север-2026.";
      const version = {
        id: "old",
        document_id: "doc",
        number: 1,
        filename: "letter.txt",
        text,
        sha256: hash(text),
      };
      await store.put("version", version, "doc");
      const ready = await processVersion(services, "old");
      expect(ready.status).toBe("ready");
      expect(ready.version_id).toBe("old");
      expect((await store.get(ready.id, "intelligence"))?.metadata).toEqual(
        ready.metadata,
      );
      const before = requests;
      await processVersion(services, "old");
      expect(requests).toBe(before);
      await store.put("version", { ...version, id: "new", number: 2 }, "doc");
      failEmbeddings = true;
      const partial = await processVersion(services, "new");
      expect(partial.status).toBe("partial");
      expect(partial.metadata_status).toBe("ready");
      expect(partial.embedding_status).toBe("error");
      expect(partial.chunks).toEqual([]);
      expect(
        (await store.get("intelligence:old", "intelligence"))?.status,
      ).toBe("ready");
      expect((await store.get("doc", "document"))?.status).toBe("review");
      expect((await store.get("doc", "document"))?.approved_version).toBeNull();
      expect(await queueIntelligence(services, "new")).toEqual({
        accepted: true,
        queued: 1,
      });
      failEmbeddings = false;
      const retried = await processVersion(services, "new");
      expect(retried.status).toBe("ready");
      expect(retried.run_id).not.toBe(partial.run_id);
      expect(await store.get("old", "version")).toEqual(version);
      await expect(queueIntelligence(services, "missing")).rejects.toThrow(
        "Версия не найдена",
      );
    } finally {
      model.stop(true);
      if (previousModelUrl === undefined) delete Bun.env.OLLAMA_URL;
      else Bun.env.OLLAMA_URL = previousModelUrl;
      if (previousEmbeddingModel === undefined)
        delete Bun.env.OLLAMA_EMBED_MODEL;
      else Bun.env.OLLAMA_EMBED_MODEL = previousEmbeddingModel;
      services.redis.close();
      await services.sql.close();
      await admin.unsafe(`DROP DATABASE "${database}" WITH (FORCE)`);
      await admin.close();
    }
  },
  30000,
);
