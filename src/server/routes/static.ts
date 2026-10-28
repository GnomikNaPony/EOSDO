import type { FastifyInstance } from "fastify";
import { resolve, sep } from "node:path";
import { Problem } from "../domain";
export function staticRoutes(app: FastifyInstance) {
  app.get("/*", async (request, reply) => {
    const pathname = decodeURIComponent(
      new URL(request.url, "http://localhost").pathname,
    );
    if (pathname.startsWith("/api/"))
      throw new Problem(404, "Операция не найдена");
    const root = resolve("dist");
    const path = resolve(root, `.${pathname}`);
    if (path !== root && !path.startsWith(root + sep))
      throw new Problem(403, "Недопустимый путь");
    const file = Bun.file(path);
    const target =
      pathname !== "/" && (await file.exists())
        ? file
        : Bun.file(resolve(root, "index.html"));
    if (!(await target.exists()))
      throw new Problem(503, "Интерфейс не собран. Выполните bun run build.");
    reply.type(target.type);
    return reply.send(Buffer.from(await target.arrayBuffer()));
  });
}
