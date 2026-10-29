import type { FastifyInstance } from "fastify";
import type { Context } from "../workspace";
import { searchDocuments, searchOptions } from "../search";

export function searchRoutes(
  app: FastifyInstance,
  { store, session }: Context,
) {
  app.get("/api/search", { logLevel: "warn" }, async (request, reply) => {
    const { user } = await session(request, reply);
    const options = searchOptions(request.query);
    return searchDocuments(store, user, options);
  });
}
