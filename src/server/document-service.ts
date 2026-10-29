import { Store } from "./store";
import { Problem } from "./domain";
import type { FastifyRequest } from "fastify";
import type { RecordData } from "./schema";
import type { User } from "./workspace";
export function curator(user: User) {
  if (user.role !== "curator")
    throw new Problem(403, "Требуется роль куратора");
}
export function body(request: FastifyRequest): RecordData {
  if (
    !request.body ||
    typeof request.body !== "object" ||
    Array.isArray(request.body)
  )
    throw new Problem(400, "Требуется JSON объект");
  return request.body as RecordData;
}
export async function document(store: Store, id: string, user: User) {
  const doc = await store.get(id, "document");
  if (!doc) throw new Problem(404, "Документ не найден");
  if (user.role !== "curator" && doc.owner_id !== user.id)
    throw new Problem(403, "Документ недоступен этой роли");
  return doc;
}
export async function detail(store: Store, id: string, user: User) {
  const doc = await document(store, id, user);
  const versions = (await store.list("version", id)).sort(
    (a, b) => Number(b.number) - Number(a.number),
  );
  const comments = await store.list("comment", id);
  const replies = await store.list("reply", id);
  const events = await store.list("comment_event", id);
  const links = await store.list("link", id);
  return {
    ...doc,
    versions: versions.map((version) => {
      const publicVersion = { ...version };
      delete publicVersion.object_key;
      return publicVersion;
    }),
    comments: comments.map((comment) => ({
      ...comment,
      replies: replies.filter((r) => r.comment_id === comment.id),
      events: events.filter((event) => event.comment_id === comment.id),
    })),
    checks: (await store.list("check", id)).reverse(),
    history: (await store.list("history", id)).reverse(),
    links: (
      await Promise.all(
        links.map((link) => store.get(String(link.target_id), "document")),
      )
    ).filter((d) => d && (user.role === "curator" || d.owner_id === user.id)),
  };
}
export async function list(store: Store, user: User) {
  const docs = (await store.list("document")).filter(
    (doc) => user.role === "curator" || doc.owner_id === user.id,
  );
  const favorites = await store.setting(`favorites:${user.id}`, {});
  return Promise.all(
    docs.reverse().map(async (doc) => {
      const versions = (await store.list("version", String(doc.id))).sort(
        (a, b) => Number(b.number) - Number(a.number),
      );
      const checks = await store.list("check", String(doc.id));
      return {
        ...doc,
        favorite: favorites[String(doc.id)] === true,
        latest: versions[0]
          ? {
              id: versions[0].id,
              number: versions[0].number,
              filename: versions[0].filename,
              created: versions[0].created,
            }
          : null,
        open_comments: (await store.list("comment", String(doc.id))).filter(
          (c) => c.status !== "closed",
        ).length,
        check:
          checks.filter((c) => c.version_id === versions[0]?.id).at(-1) ?? null,
        next_action: (
          {
            new: "Загрузить результат работы",
            ai: "Дождаться локальной проверки",
            review: "Куратору рассмотреть документ",
            revision: "Исполнителю устранить замечания",
            approved: "Завершить работу с документом",
            done: "Работа завершена",
          } as Record<string, string>
        )[String(doc.status)],
      };
    }),
  );
}
