import type { FastifyInstance } from "fastify";
import type { Context } from "../workspace";
import { curator, body } from "../document-service";
import { Problem } from "../domain";
import {
  intelligenceOverview,
  intelligenceReport,
  semanticSearch,
  queueIntelligence,
} from "../intelligence";

export function intelligenceRoutes(
  app: FastifyInstance,
  { services, store, session }: Context,
) {
  app.get("/api/intelligence", { logLevel: "warn" }, async (request, reply) => {
    const { user } = await session(request, reply);
    curator(user);
    return intelligenceOverview(store, user);
  });
  app.post("/api/intelligence/reindex", async (request, reply) => {
    const { user } = await session(request, reply);
    curator(user);
    const value = body(request);
    if (Object.keys(value).some((key) => key !== "version_id"))
      throw new Problem(400, "Неизвестный параметр обработки");
    if (
      value.version_id !== undefined &&
      (typeof value.version_id !== "string" ||
        !value.version_id ||
        value.version_id.length > 100)
    )
      throw new Problem(400, "Недопустимая версия");
    return queueIntelligence(services, value.version_id as string | undefined);
  });
  app.get(
    "/api/intelligence/search",
    { logLevel: "warn" },
    async (request, reply) => {
      const { user } = await session(request, reply);
      const values = request.query as Record<string, unknown>;
      if (
        Object.keys(values).some((key) => key !== "q") ||
        typeof values.q !== "string"
      )
        throw new Problem(400, "Укажите строку поиска");
      return semanticSearch(store, user, values.q);
    },
  );
  app.get(
    "/api/intelligence/report",
    { logLevel: "warn" },
    async (request, reply) => {
      const { user } = await session(request, reply);
      curator(user);
      const values = request.query as Record<string, unknown>;
      if (
        Object.keys(values).some((key) => key !== "key") ||
        typeof values.key !== "string"
      )
        throw new Problem(400, "Укажите ключ группы");
      return intelligenceReport(store, user, values.key);
    },
  );
}
