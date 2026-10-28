import { useApp } from "../../app-store";
import { For } from "solid-js";
import { Show } from "solid-js";
import { Button } from "../../components/ui";
export function DocumentComments() {
  const { data, doc, tab, busy, person, run, action } = useApp();
  return (
    <Show when={tab() === "comments"}>
      <section class="card-section">
        <h2>Замечания к версиям</h2>
        <form
          class="space-y-3 py-4"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            void run(async () => {
              const f = new FormData(form);
              await action("/api/comments", {
                document_id: doc()?.id,
                version_id: f.get("version_id"),
                text: f.get("text"),
                anchor: f.get("anchor"),
                severity: f.has("blocking") ? "blocking" : "normal",
              });
              form.reset();
            });
          }}
        >
          <label class="field">
            <span>Версия</span>
            <select name="version_id" required>
              <For each={doc()?.versions}>
                {(v) => (
                  <option value={v.id}>
                    v{v.number} · {v.filename}
                  </option>
                )}
              </For>
            </select>
          </label>
          <label class="field">
            <span>Цитата из документа</span>
            <input name="anchor" maxlength="2000" />
          </label>
          <label class="field">
            <span>Замечание *</span>
            <textarea name="text" required rows="3" maxlength="5000" />
          </label>
          <label>
            <input type="checkbox" name="blocking" /> Обязательное замечание
          </label>
          <div>
            <Button
              type="submit"
              primary
              disabled={busy() || !doc()?.versions.length}
            >
              Добавить замечание
            </Button>
          </div>
        </form>
        <For each={doc()?.comments}>
          {(c) => (
            <article class="comment border-t border-slate-200 py-4">
              <div class="flex justify-between">
                <b>{person(c.author_id)}</b>
                <span>
                  {c.status === "closed"
                    ? "Закрыто"
                    : c.status === "addressed"
                      ? "Исправлено"
                      : "Открыто"}{" "}
                  {c.severity === "blocking" ? "· Обязательное" : ""}
                </span>
              </div>
              <Show when={c.anchor}>
                <blockquote class="border-l-2 border-blue-200 pl-3 my-2">
                  {c.anchor}
                </blockquote>
              </Show>
              <p class="whitespace-pre-wrap">{c.text}</p>
              <For each={c.replies}>
                {(r) => (
                  <p>
                    <b>{person(r.author_id)}: </b>
                    {r.text}
                  </p>
                )}
              </For>
              <form
                class="flex gap-2 my-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  void run(async () => {
                    await action(`/api/comments/${c.id}/reply`, {
                      text: new FormData(form).get("text"),
                    });
                    form.reset();
                  });
                }}
              >
                <input
                  name="text"
                  required
                  placeholder="Ответ на замечание"
                  class="flex-1"
                />
                <Button type="submit">Ответить</Button>
              </form>
              <div class="flex gap-2">
                <For
                  each={
                    data()?.user?.role === "curator"
                      ? ["open", "closed"]
                      : ["addressed"]
                  }
                >
                  {(s) => (
                    <Button
                      onClick={() =>
                        void run(() =>
                          action(`/api/comments/${c.id}/status`, {
                            status: s,
                            version_id: doc()?.versions[0]?.id,
                          }),
                        )
                      }
                    >
                      {s === "closed"
                        ? "Подтвердить устранение"
                        : s === "addressed"
                          ? "Отметить исправление"
                          : "Открыть повторно"}
                    </Button>
                  )}
                </For>
              </div>
            </article>
          )}
        </For>
      </section>
    </Show>
  );
}
