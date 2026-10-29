import type { FastifyInstance } from "fastify";
import type { Context } from "../workspace";
import { Store } from "../store";
import { Problem, required, optionalText, now, uid } from "../domain";
import { curator, body, document } from "../document-service";
export function reviewRoutes(app: FastifyInstance, context: Context) {
  const { services, session } = context;
  app.post("/api/comments", async (request, reply) => {
    const { user } = await session(request, reply);
    const b = body(request);
    const text = required(b.text, "Замечание", 5000);
    const anchor = optionalText(b.anchor, 1000);
    if (!["normal", "blocking"].includes(String(b.severity ?? "normal")))
      throw new Problem(400, "Неизвестная важность");
    return services.db.transaction(async (tx) => {
      await tx.execute("SELECT pg_advisory_xact_lock(874121)");
      const s = new Store(tx);
      const doc = await document(s, String(b.document_id), user);
      const version = await s.get(String(b.version_id), "version");
      if (!version || version.document_id !== doc.id)
        throw new Problem(400, "Выберите версию документа");
      if (
        anchor &&
        (typeof version.text !== "string" || !version.text.includes(anchor))
      )
        throw new Problem(409, "Цитата не найдена в выбранной версии");
      const anchorLine = b.anchor_line ?? null;
      if (
        anchorLine !== null &&
        (typeof anchorLine !== "number" ||
          !Number.isInteger(anchorLine) ||
          anchorLine < 1 ||
          !anchor ||
          typeof version.text !== "string" ||
          version.text
            .replaceAll("\r\n", "\n")
            .split("\n")
            [anchorLine - 1]?.trim() !== anchor)
      )
        throw new Problem(409, "Строка цитаты не найдена в выбранной версии");
      const id = uid();
      await s.put(
        "comment",
        {
          id,
          document_id: doc.id!,
          version_id: version.id!,
          author_id: user.id,
          text,
          anchor,
          anchor_line: anchorLine,
          severity: b.severity ?? "normal",
          status: "open",
          created: now(),
          resolved_version: null,
        },
        String(doc.id),
      );
      await s.put(
        "comment_event",
        {
          id: uid(),
          comment_id: id,
          author_id: user.id,
          from_status: null,
          status: "open",
          version_id: version.id!,
          created: now(),
        },
        String(doc.id),
      );
      if (
        b.severity === "blocking" &&
        ["approved", "done"].includes(String(doc.status))
      )
        await s.put("document", {
          ...doc,
          status: "review",
          approved_version: null,
          updated: now(),
        });
      await s.log(String(doc.id), user.id, "Добавлено замечание");
      for (const recipient of new Set([
        String(doc.owner_id),
        String(doc.curator_id),
      ]))
        if (recipient !== user.id)
          await s.notify(
            recipient,
            String(doc.id),
            String(version.id),
            "comment",
            "Новое замечание",
            text,
          );
      return { id };
    });
  });
  app.post<{ Params: { id: string; action: string } }>(
    "/api/comments/:id/:action",
    async (request, reply) => {
      const { user } = await session(request, reply);
      const b = body(request);
      return services.db.transaction(async (tx) => {
        await tx.execute("SELECT pg_advisory_xact_lock(874121)");
        const s = new Store(tx);
        const c = await s.get(request.params.id, "comment");
        if (!c) throw new Problem(404, "Замечание не найдено");
        const doc = await document(s, String(c.document_id), user);
        let text: string;
        if (request.params.action === "reply") {
          text = required(b.text, "Ответ");
          await s.put(
            "reply",
            {
              id: uid(),
              comment_id: c.id!,
              author_id: user.id,
              text,
              created: now(),
            },
            String(doc.id),
          );
        } else if (request.params.action === "status") {
          if (!["open", "addressed", "closed"].includes(String(b.status)))
            throw new Problem(400, "Неизвестный статус замечания");
          if (b.status === "closed") curator(user);
          if (b.expected_status !== undefined && b.expected_status !== c.status)
            throw new Problem(
              409,
              "Статус замечания изменился. Обновите карточку.",
            );
          const latest = (await s.list("version", String(doc.id))).sort(
            (a, b) => Number(b.number) - Number(a.number),
          )[0];
          if (!latest || b.version_id !== latest.id)
            throw new Problem(409, "Документ изменился. Обновите версию.");
          if (
            c.status === b.status &&
            (b.status === "open" || c.resolved_version === latest.id)
          )
            return { ok: true };
          await s.put(
            "comment_event",
            {
              id: uid(),
              comment_id: c.id!,
              author_id: user.id,
              from_status: c.status!,
              status: b.status!,
              version_id: latest.id!,
              created: now(),
            },
            String(doc.id),
          );
          await s.put(
            "comment",
            {
              ...c,
              status: b.status!,
              resolved_version: b.status === "open" ? null : latest.id!,
            },
            String(doc.id),
          );
          if (
            b.status !== "closed" &&
            c.severity === "blocking" &&
            ["approved", "done"].includes(String(doc.status))
          )
            await s.put("document", {
              ...doc,
              status: "review",
              approved_version: null,
              updated: now(),
            });
          text = `Статус замечания: ${b.status}`;
          await s.log(String(doc.id), user.id, text);
        } else throw new Problem(404, "Операция не найдена");
        for (const recipient of new Set([
          String(doc.owner_id),
          String(doc.curator_id),
        ]))
          if (recipient !== user.id)
            await s.notify(
              recipient,
              String(doc.id),
              String(c.version_id),
              "comment",
              "Обновлено замечание",
              text,
            );
        return { ok: true };
      });
    },
  );
}
