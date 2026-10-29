import { authRoutes } from "./routes/auth";
import Fastify from "fastify";
import { connect, Store, type Services } from "./store";
import { Problem } from "./domain";
import { startWorker } from "./ai";
import { sessionFor } from "./workspace";
import { workspaceRoutes } from "./routes/workspace";
import { templateRoutes } from "./routes/templates";
import { documentRoutes } from "./routes/documents";
import { reviewRoutes } from "./routes/review";
import { staticRoutes } from "./routes/static";
import { searchRoutes } from "./routes/search";
import { intelligenceRoutes } from "./routes/intelligence";
import { startIntelligenceWorker } from "./intelligence";
export async function createApp(existing?: Services) {
  const services = existing ?? (await connect());
  const store = new Store(services.db);
  const app = Fastify({ logger: true, bodyLimit: 29 * 1024 * 1024 });
  app.setErrorHandler((error, _request, reply) => {
    const code =
      error && typeof error === "object" && "statusCode" in error
        ? Number(error.statusCode)
        : 500;
    const status =
      error instanceof Problem
        ? error.statusCode
        : code >= 400 && code < 500
          ? code
          : 500;
    if (status === 500)
      app.log.error(
        { errorType: error instanceof Error ? error.name : "UnknownError" },
        "Server request failed",
      );
    return reply.code(status).send({
      error:
        status === 500
          ? "Ошибка сервера. Проверьте доступность сервисов."
          : error instanceof Error
            ? error.message
            : "Ошибка запроса",
    });
  });
  app.addHook("onRequest", async (request, reply) => {
    if (!request.url.startsWith("/api/")) return;
    const origin = request.headers.origin;
    const configured =
      Bun.env.APP_ORIGIN ??
      (Bun.env.RAILWAY_PUBLIC_DOMAIN
        ? `https://${Bun.env.RAILWAY_PUBLIC_DOMAIN}`
        : `http://127.0.0.1:${Bun.env.PORT ?? 8765}`);
    const allowed = new Set([configured]);
    if (Bun.env.NODE_ENV !== "production" && !Bun.env.RAILWAY_PUBLIC_DOMAIN) {
      for (const host of ["localhost", "127.0.0.1"])
        for (const port of [5173, Number(Bun.env.PORT ?? 8765)])
          allowed.add(`http://${host}:${port}`);
    }
    if (origin && !allowed.has(origin))
      throw new Problem(403, "Недопустимый Origin");
    reply.header("cache-control", "no-store");
    reply.header("x-content-type-options", "nosniff");
  });

  const context = { services, store, session: sessionFor(services, store) };
  authRoutes(app, context);
  workspaceRoutes(app, context);
  templateRoutes(app, context);
  documentRoutes(app, context);
  reviewRoutes(app, context);
  searchRoutes(app, context);
  intelligenceRoutes(app, context);
  staticRoutes(app);
  const stopWorker = startWorker(services);
  const stopIntelligence = startIntelligenceWorker(services);
  app.addHook("onClose", async () => {
    stopWorker();
    await stopIntelligence();
    if (!existing) {
      services.redis.close();
      await services.sql.close();
    }
  });
  return app;
}
