import type { FastifyInstance } from "fastify";
import { type Context, workspace, directory, currentUser } from "../workspace";
import { Store } from "../store";
import { Problem, required, documentTypes } from "../domain";
import { body, list, curator } from "../document-service";
import { aiStatus, model } from "../ai";
export function workspaceRoutes(
  app: FastifyInstance,
  { services, store, session }: Context,
) {
  app.get("/api/health", async () => {
    await services.sql`SELECT 1`;
    await services.redis.ping();
    await services.s3.list({ maxKeys: 1 });
    return { ok: true };
  });
  app.get("/api/bootstrap", async (request, reply) => {
    const settings = await workspace(store);
    const empty = {
      setup_required: !settings,
      auth_required: true,
      workspace: settings ? { organization: settings.organization } : null,
      user: null,
      users: [],
      documents: [],
      cases: [],
      document_types: documentTypes,
      rules: { revision: 1, demo: false, items: [] },
      notifications: [],
      preferences: {
        upload: true,
        comment: true,
        ai: true,
        status: true,
        deadline: true,
      },
      templates: [],
      model,
    };
    if (!settings || !(await currentUser(services, store, request)))
      return empty;
    const { user } = await session(request, reply);
    const dir = await directory(store);
    return {
      ...empty,
      rules: await store.rules(),
      setup_required: false,
      auth_required: false,
      user,
      users: dir.users,
      cases: dir.cases,
      documents: await list(store, user),
      notifications: (await store.list("notification"))
        .filter((n) => n.user_id === user.id)
        .reverse()
        .slice(0, 200),
      preferences: await store.setting(
        `preferences:${user.id}`,
        empty.preferences,
      ),
      templates: (await store.list("template")).filter(
        (t) => t.user_id === user.id,
      ),
    };
  });
  app.get("/api/ai-status", aiStatus);
  app.post("/api/preferences", async (request, reply) => {
    const { user } = await session(request, reply);
    const b = body(request);
    await store.set(
      `preferences:${user.id}`,
      Object.fromEntries(
        ["upload", "comment", "ai", "status", "deadline"].map((key) => [
          key,
          b[key] !== false,
        ]),
      ),
    );
    return { ok: true };
  });
  app.post("/api/notifications/read", async (request, reply) => {
    const { user } = await session(request, reply);
    const b = body(request);
    for (const n of await store.list("notification"))
      if (n.user_id === user.id && (b.id === "all" || n.id === b.id))
        await store.put(
          "notification",
          { ...n, read: true },
          String(n.document_id),
          user.id,
        );
    return { ok: true };
  });
  app.post("/api/rules", async (request, reply) => {
    const { user } = await session(request, reply);
    curator(user);
    const b = body(request);
    if (!Array.isArray(b.items) || b.items.length > 20)
      throw new Problem(400, "Не больше 20 правил");
    const items = b.items.map((item) => required(item, "Правило", 500));
    return services.db.transaction(async (tx) => {
      await tx.execute("SELECT pg_advisory_xact_lock(874121)");
      const s = new Store(tx);
      const current = await s.rules();
      if (b.revision !== current.revision)
        throw new Problem(409, "Правила уже изменены. Обновите страницу.");
      const rules = {
        revision: Number(current.revision) + 1,
        demo: false,
        items,
      };
      await s.set("rules", rules);
      for (const doc of await s.list("document"))
        if (["approved", "done"].includes(String(doc.status)))
          await s.put("document", {
            ...doc,
            status: "review",
            approved_version: null,
          });
      return rules;
    });
  });
}
