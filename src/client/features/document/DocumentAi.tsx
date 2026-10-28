import { useApp } from "../../app-store";
import { For } from "solid-js";
import { Show } from "solid-js";
import { Button } from "../../components/ui";
export function DocumentAi() {
  const { doc, tab, busy, run, action } = useApp();
  return (
    <Show when={tab() === "ai"}>
      <section class="card-section">
        <h2>Локальная ИИ-проверка</h2>
        <Button
          disabled={!doc()?.versions.length || busy()}
          onClick={() =>
            void run(() =>
              action(`/api/versions/${doc()!.versions[0]!.id}/check`, {}),
            )
          }
        >
          Проверить актуальную версию
        </Button>
        <For each={doc()?.checks}>
          {(c) => (
            <article class="py-4 border-b border-slate-200">
              <b>
                {c.model} ·{" "}
                {{
                  queued: "В очереди",
                  running: "Выполняется",
                  done: "Завершена",
                  error: "Ошибка",
                }[c.status] || c.status}
              </b>
              <p>{c.error}</p>
              <Show when={c.result}>
                {(result) => (
                  <>
                    <p>{result().notice}</p>
                    <table class="simple-table">
                      <thead>
                        <tr>
                          <th>Правило</th>
                          <th>Результат</th>
                          <th>Обоснование</th>
                        </tr>
                      </thead>
                      <tbody>
                        <For each={result().items}>
                          {(item) => (
                            <tr>
                              <td>{item.rule}</td>
                              <td>
                                {{
                                  met: "Выполнено",
                                  missing: "Не выполнено",
                                  uncertain: "Требует проверки",
                                }[item.status] || item.status}
                              </td>
                              <td>
                                {item.reason}
                                <Show when={item.quote}>
                                  <blockquote class="mt-2 border-l-2 border-blue-200 pl-3">
                                    {item.quote}
                                  </blockquote>
                                </Show>
                              </td>
                            </tr>
                          )}
                        </For>
                      </tbody>
                    </table>
                  </>
                )}
              </Show>
            </article>
          )}
        </For>
      </section>
    </Show>
  );
}
