import { directory } from "../workspace";
import type { FastifyInstance } from "fastify";
import type { Context } from "../workspace";
import { Store } from "../store";
import { Problem, required, template, now, uid } from "../domain";
import { body } from "../document-service";
export function templateRoutes(app: FastifyInstance, context: Context) {
  const { services, store, session } = context;
  app.post("/api/templates", async (request, reply) => {
    const { user } = await session(request, reply);
    const b = body(request);
    if (b.format !== "eosdo-personal-template" || b.version !== 1)
      throw new Problem(400, "Неподдерживаемый формат настроек");
    const name = required(b.name, "Название шаблона", 100);
    const config = template(b.config, await directory(store));
    return services.db.transaction(async (tx) => {
      await tx.execute("SELECT pg_advisory_xact_lock(874121)");
      const s = new Store(tx);
      const old = b.id ? await s.get(String(b.id), "template") : undefined;
      if (b.id && (!old || old.user_id !== user.id))
        throw new Problem(404, "Шаблон не найден");
      if (old && old.revision !== b.revision)
        throw new Problem(409, "Шаблон изменён в другой вкладке");
      if (
        !old &&
        (await s.list("template")).filter((t) => t.user_id === user.id)
          .length >= 50
      )
        throw new Problem(400, "Не больше 50 шаблонов");
      const id = old ? String(old.id) : uid();
      await s.put(
        "template",
        {
          id,
          user_id: user.id,
          name,
          config,
          revision: Number(old?.revision ?? 0) + 1,
          updated: now(),
        },
        undefined,
        user.id,
      );
      return { id };
    });
  });
  app.get<{ Params: { id: string } }>(
    "/api/templates/:id",
    async (request, reply) => {
      const { user } = await session(request, reply);
      const t = await store.get(request.params.id, "template");
      if (!t || t.user_id !== user.id)
        throw new Problem(404, "Шаблон не найден");
      return {
        format: "eosdo-personal-template",
        version: 1,
        name: t.name,
        config: t.config,
      };
    },
  );
  app.post<{ Params: { id: string } }>(
    "/api/templates/:id/delete",
    async (request, reply) => {
      const { user } = await session(request, reply);
      const b = body(request);
      return services.db.transaction(async (tx) => {
        await tx.execute("SELECT pg_advisory_xact_lock(874121)");
        const s = new Store(tx);
        const t = await s.get(request.params.id, "template");
        if (!t || t.user_id !== user.id)
          throw new Problem(404, "Шаблон не найден");
        if (t.revision !== b.revision) throw new Problem(409, "Шаблон изменён");
        await s.remove(String(t.id));
        return { ok: true };
      });
    },
  );
}
