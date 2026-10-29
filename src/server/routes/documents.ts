import { lineDiff, type VersionDiff } from "../../shared/version-diff";
import { directory } from "../workspace";
import type { FastifyInstance } from "fastify";
import type { Context } from "../workspace";
import { Store } from "../store";
import {
  Problem,
  required,
  date,
  priority,
  profile,
  optionalText,
  now,
  uid,
} from "../domain";
import { queue } from "../ai";
import { searchableText } from "../search";
import { curator, body, document, detail } from "../document-service";
async function checkingStatus(store: Store) {
  const rules = await store.rules();
  return Array.isArray(rules.items) && rules.items.length ? "ai" : "review";
}
export function documentRoutes(app: FastifyInstance, context: Context) {
  const { services, store, session } = context;
  app.post("/api/documents", async (request, reply) => {
    const { user } = await session(request, reply);
    const b = body(request);
    const { users } = await directory(store);
    const owner = users.find((u) => u.id === (b.owner_id ?? user.id));
    if (!owner || (user.role === "author" && owner.id !== user.id))
      throw new Problem(403, "Недопустимый исполнитель");
    const values = {
      title: required(b.title, "Наименование", 300),
      type: required(b.type, "Вид документа", 100),
      due: date(b.due),
      priority: priority(b.priority ?? "normal"),
      summary: optionalText(b.summary, 5000),
      ...profile(b, await directory(store)),
    };
    return services.db.transaction(async (tx) => {
      await tx.execute("SELECT pg_advisory_xact_lock(874121)");
      const s = new Store(tx);
      const id = uid();
      const count = (await s.list("document")).length + 1;
      await s.put(
        "document",
        {
          ...values,
          id,
          number: `ПР-${String(count).padStart(4, "0")}/${new Date().getFullYear() % 100}`,
          department: owner.department,
          owner_id: owner.id,
          curator_id:
            users.find((account) => account.role === "curator")?.id ?? user.id,
          status: "new",
          approved_version: null,
          profile_revision: 1,
          created: now(),
          updated: now(),
        },
        undefined,
        owner.id,
      );
      await s.log(id, user.id, "Создана карточка документа");
      return { id };
    });
  });
  app.get<{ Params: { id: string } }>(
    "/api/documents/:id",
    async (request, reply) => {
      const { user } = await session(request, reply);
      return detail(store, request.params.id, user);
    },
  );
  app.patch<{ Params: { id: string } }>(
    "/api/documents/:id",
    async (request, reply) => {
      const { user } = await session(request, reply);
      const b = body(request);
      return services.db.transaction(async (tx) => {
        await tx.execute("SELECT pg_advisory_xact_lock(874121)");
        const s = new Store(tx);
        const doc = await document(s, request.params.id, user);
        if (["approved", "done"].includes(String(doc.status)))
          throw new Problem(409, "Сначала верните документ на рассмотрение");
        if (
          !Number.isInteger(b.profile_revision) ||
          b.profile_revision !== doc.profile_revision
        )
          throw new Problem(
            409,
            "Реквизиты изменены в другой вкладке. Обновите карточку.",
          );
        await s.put("document", {
          ...doc,
          ...profile({ ...doc, ...b }, await directory(s)),
          title: required(b.title, "Наименование", 300),
          due: date(b.due),
          priority: priority(b.priority),
          summary: optionalText(b.summary, 5000),
          profile_revision: Number(doc.profile_revision) + 1,
          updated: now(),
        });
        await s.log(String(doc.id), user.id, "Изменены реквизиты карточки");
        return { ok: true };
      });
    },
  );
  app.post<{ Params: { id: string } }>(
    "/api/documents/:id/favorite",
    async (request, reply) => {
      const { user } = await session(request, reply);
      await document(store, request.params.id, user);
      return services.db.transaction(async (tx) => {
        await tx.execute("SELECT pg_advisory_xact_lock(874121)");
        const s = new Store(tx);
        const favorites = await s.setting(`favorites:${user.id}`, {});
        favorites[request.params.id] = !favorites[request.params.id];
        await s.set(`favorites:${user.id}`, favorites);
        return { ok: true };
      });
    },
  );
  app.post<{ Params: { id: string } }>(
    "/api/documents/:id/links",
    async (request, reply) => {
      const { user } = await session(request, reply);
      const b = body(request);
      await document(store, request.params.id, user);
      const target = await document(store, String(b.target_id), user);
      if (target.id === request.params.id)
        throw new Problem(400, "Нельзя связать документ с самим собой");
      await store.put(
        "link",
        {
          id: `${request.params.id}:${target.id}`,
          document_id: request.params.id,
          target_id: target.id!,
        },
        request.params.id,
      );
      return { ok: true };
    },
  );
  app.post<{ Params: { id: string } }>(
    "/api/documents/:id/versions",
    async (request, reply) => {
      const { user } = await session(request, reply);
      const b = body(request);
      await document(store, request.params.id, user);
      const filename = required(b.filename, "Имя файла", 200);
      const message = required(b.message, "Описание изменений", 1000);
      if (!/\.(txt|md|csv|pdf|docx|xlsx)$/i.test(filename))
        throw new Problem(400, "Поддерживаются PDF, DOCX, XLSX, TXT, MD и CSV");
      if (
        typeof b.content !== "string" ||
        !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
          b.content,
        )
      )
        throw new Problem(400, "Повреждённое содержимое файла");
      const bytes = Buffer.from(b.content, "base64");
      if (!bytes.length || bytes.length > 20 * 1024 * 1024)
        throw new Problem(413, "Файл должен быть непустым и не больше 20 МБ");
      const sha256 = new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
      const indexed = await searchableText(filename, bytes);
      const id = uid();
      const key = `versions/${request.params.id}/${id}`;
      await services.s3.write(key, bytes, { type: "application/octet-stream" });
      try {
        return await services.db.transaction(async (tx) => {
          await tx.execute("SELECT pg_advisory_xact_lock(874121)");
          const s = new Store(tx);
          const doc = await document(s, request.params.id, user);
          const latest = (await s.list("version", request.params.id)).sort(
            (a, b) => Number(b.number) - Number(a.number),
          )[0];
          if ((b.parent_id ?? null) !== (latest?.id ?? null))
            throw new Problem(
              409,
              "Уже загружена новая версия. Обновите историю.",
            );
          if (latest?.sha256 === sha256)
            throw new Problem(409, "Файл совпадает с последней версией");
          await s.put(
            "version",
            {
              id,
              document_id: request.params.id,
              number: Number(latest?.number ?? 0) + 1,
              parent_id: latest?.id ?? null,
              filename,
              object_key: key,
              sha256,
              size: bytes.length,
              author_id: user.id,
              message,
              created: now(),
              ...indexed,
            },
            request.params.id,
          );
          const checkId = await queue(s, id);
          await s.put("document", {
            ...doc,
            status: await checkingStatus(s),
            approved_version: null,
            updated: now(),
          });
          await s.log(
            request.params.id,
            user.id,
            `Загружена версия: ${message}`,
          );
          await s.notify(
            String(doc.curator_id),
            request.params.id,
            id,
            "upload",
            "Загружена новая версия",
            filename,
          );
          return { id, check_id: checkId };
        });
      } catch (error) {
        await services.s3.delete(key);
        throw error;
      }
    },
  );
  app.post<{ Params: { id: string } }>(
    "/api/documents/:id/status",
    async (request, reply) => {
      const { user } = await session(request, reply);
      curator(user);
      const b = body(request);
      if (
        !["new", "review", "revision", "approved", "done"].includes(
          String(b.status),
        )
      )
        throw new Problem(400, "Недопустимый статус");
      return services.db.transaction(async (tx) => {
        await tx.execute("SELECT pg_advisory_xact_lock(874121)");
        const s = new Store(tx);
        const doc = await document(s, request.params.id, user);
        const latest = (await s.list("version", request.params.id)).sort(
          (a, b) => Number(b.number) - Number(a.number),
        )[0];
        if ((b.version_id ?? null) !== (latest?.id ?? null))
          throw new Problem(409, "Версия изменилась. Обновите карточку.");
        if (["approved", "done"].includes(String(b.status))) {
          if (!latest)
            throw new Problem(409, "Нельзя согласовать документ без файла");
          if (
            (await s.list("comment", request.params.id)).some(
              (c) => c.severity === "blocking" && c.status !== "closed",
            )
          )
            throw new Problem(
              409,
              "Сначала устраните обязательные замечания ко всем версиям",
            );
          const check = (await s.list("check", request.params.id))
            .filter((c) => c.version_id === latest.id)
            .at(-1);
          const rules = await s.rules();
          const result = check?.result;
          const items =
            result && typeof result === "object" && !Array.isArray(result)
              ? result.items
              : null;
          const passed =
            check?.status === "done" &&
            check.rules_revision === rules.revision &&
            Array.isArray(items) &&
            items.length > 0 &&
            items.every(
              (i) =>
                i &&
                typeof i === "object" &&
                !Array.isArray(i) &&
                i.status === "met",
            );
          if (!passed && b.manual_review !== true)
            throw new Problem(
              409,
              "Нет актуального положительного отчёта. Подтвердите ручную проверку.",
            );
          if (
            b.status === "done" &&
            (doc.status !== "approved" || doc.approved_version !== latest.id)
          )
            throw new Problem(409, "Сначала согласуйте актуальную версию");
        }
        await s.put("document", {
          ...doc,
          status: b.status!,
          approved_version: ["approved", "done"].includes(String(b.status))
            ? latest!.id!
            : null,
          updated: now(),
        });
        await s.log(
          request.params.id,
          user.id,
          `Статус: ${b.status}${b.manual_review === true ? " · ручная проверка куратора" : ""}`,
        );
        if (doc.owner_id !== user.id)
          await s.notify(
            String(doc.owner_id),
            request.params.id,
            latest ? String(latest.id) : null,
            "status",
            "Изменён статус документа",
            String(b.status),
          );
        return { ok: true };
      });
    },
  );
  app.get<{ Params: { id: string }; Querystring: { inline?: string } }>(
    "/api/versions/:id/file",
    async (request, reply) => {
      const { user } = await session(request, reply);
      const version = await store.get(request.params.id, "version");
      if (!version) throw new Problem(404, "Версия не найдена");
      await document(store, String(version.document_id), user);
      const inline =
        request.query.inline === "1" &&
        /\.pdf$/i.test(String(version.filename));
      reply.type(inline ? "application/pdf" : "application/octet-stream");
      reply.header(
        "content-disposition",
        `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(String(version.filename))}`,
      );
      return reply.send(
        Buffer.from(
          await services.s3.file(String(version.object_key)).arrayBuffer(),
        ),
      );
    },
  );
  app.post<{ Params: { id: string } }>(
    "/api/versions/:id/check",
    async (request, reply) => {
      const { user } = await session(request, reply);
      return services.db.transaction(async (tx) => {
        await tx.execute("SELECT pg_advisory_xact_lock(874121)");
        const s = new Store(tx);
        const version = await s.get(request.params.id, "version");
        if (!version) throw new Problem(404, "Версия не найдена");
        const doc = await document(s, String(version.document_id), user);
        const id = await queue(s, request.params.id);
        const latest = (await s.list("version", String(doc.id))).sort(
          (a, b) => Number(b.number) - Number(a.number),
        )[0];
        if (latest?.id === version.id)
          await s.put("document", {
            ...doc,
            status: await checkingStatus(s),
            approved_version: null,
            updated: now(),
          });
        return { id };
      });
    },
  );
  app.get<{ Params: { id: string }; Querystring: { base?: string } }>(
    "/api/versions/:id/diff",
    async (request, reply) => {
      const { user } = await session(request, reply);
      const version = await store.get(request.params.id, "version");
      if (!version) throw new Problem(404, "Версия не найдена");
      await document(store, String(version.document_id), user);
      const previous =
        !version.parent_id &&
        request.query.base === undefined &&
        Number(version.number) > 1
          ? (await store.list("version", String(version.document_id)))
              .filter((v) => Number(v.number) < Number(version.number))
              .sort((a, b) => Number(b.number) - Number(a.number))[0]
          : undefined;
      const base = request.query.base ?? version.parent_id ?? previous?.id;
      if (
        base !== undefined &&
        base !== null &&
        (typeof base !== "string" || !base)
      )
        throw new Problem(400, "Выберите предыдущую версию");
      const parent = base
        ? await store.get(String(base), "version")
        : undefined;
      if (
        base &&
        (!parent ||
          parent.document_id !== version.document_id ||
          Number(parent.number) >= Number(version.number))
      )
        throw new Problem(
          400,
          "Сравнение доступно с предыдущими версиями этого документа",
        );
      const publicVersion = (v: typeof version) => ({
        id: String(v.id),
        number: Number(v.number),
        filename: String(v.filename),
      });
      const result: VersionDiff = {
        document_id: String(version.document_id),
        before: parent ? publicVersion(parent) : null,
        after: publicVersion(version),
        state: "ready",
        message: "",
        lines: [],
        added: 0,
        removed: 0,
        diff: "",
      };
      if (
        typeof version.text !== "string" ||
        (parent && typeof parent.text !== "string")
      ) {
        result.state = "unavailable";
        result.message =
          "Сравнение недоступно: текст одной из версий не извлечён. Скачайте оригиналы.";
      } else {
        const compared = lineDiff(
          parent ? String(parent.text) : "",
          version.text,
        );
        result.lines = compared.lines;
        result.added = compared.lines.filter((l) => l.kind === "add").length;
        result.removed = compared.lines.filter(
          (l) => l.kind === "remove",
        ).length;
        if (compared.limited) {
          result.state = "limited";
          result.message =
            "Тексты слишком велики для построчного сравнения. Скачайте оригиналы.";
        } else if (!result.added && !result.removed) {
          result.state = "identical";
          result.message =
            "Извлечённый текст одинаков. Файлы могут отличаться оформлением или переводами строк.";
        } else if (!parent)
          result.message =
            Number(version.number) === 1
              ? "Первая версия: весь текст добавлен."
              : "Предыдущая версия отсутствует: показан весь текст.";
      }
      result.diff = result.lines.length
        ? [
            `--- ${parent ? `v${parent.number}` : "пустой документ"}`,
            `+++ v${version.number}`,
            ...result.lines.map(
              (l) =>
                `${l.kind === "add" ? "+" : l.kind === "remove" ? "-" : " "}${l.text}`,
            ),
          ].join("\n")
        : result.message;
      return result;
    },
  );
}
