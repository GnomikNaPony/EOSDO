import { For, Show } from "solid-js";
import { useApp } from "../../app-store";
import { Button } from "../../components/ui";

export function DocumentNormocontrol() {
  const { doc, tab, busy, run, action } = useApp();
  return (
    <Show when={tab() === "normocontrol"}>
      <section class="card-section">
        <h2>Нормоконтроль документов</h2>
        <p class="text-slate-600 mb-4">
          Проверка выполняется автоматически при загрузке, без ИИ. Замечания
          относятся к конкретной версии. Решение принимает куратор.
        </p>
        <Show
          when={doc()?.versions.length}
          fallback={<p>Загрузите файл в разделе «Файлы и версии».</p>}
        >
          <For each={doc()?.versions}>
            {(version) => (
              <article class="py-4 border-b border-slate-200">
                <h3>
                  Версия {version.number} · {version.filename}
                </h3>
                <Button
                  disabled={busy()}
                  onClick={() =>
                    void run(() =>
                      action(`/api/versions/${version.id}/normocontrol`, {}),
                    )
                  }
                >
                  {version.normocontrol
                    ? "Повторить нормоконтроль"
                    : "Запустить нормоконтроль"}{" "}
                  · v{version.number}
                </Button>
                <Show
                  when={version.normocontrol}
                  fallback={<p>Эта версия ещё не проверена.</p>}
                >
                  {(report) => (
                    <>
                      <p class="mt-3 font-semibold">
                        {
                          {
                            ready: "Проверка выполнена",
                            limited: "Проверка неполная",
                            unavailable: "Проверка недоступна",
                          }[report().state]
                        }{" "}
                        · замечаний: {report().findings.length}
                      </p>
                      <p class="text-sm text-slate-500">
                        {new Date(report().checked_at).toLocaleString("ru-RU")}
                      </p>
                      <p class="my-3">{report().notice}</p>
                      <Show
                        when={
                          report().state === "ready" &&
                          !report().findings.length
                        }
                      >
                        <p>
                          В пределах выполненных проверок замечаний не найдено.
                        </p>
                      </Show>
                      <For each={report().findings}>
                        {(finding) => (
                          <div class="my-3 p-3 rounded border border-slate-200">
                            <b>{finding.message}</b>
                            <p class="text-sm text-slate-500">
                              {finding.location} ·{" "}
                              {
                                {
                                  low: "Низкая важность",
                                  medium: "Средняя важность",
                                  review: "Проверить вручную",
                                }[finding.severity]
                              }
                            </p>
                            <Show when={finding.quote}>
                              <blockquote class="my-2 border-l-2 border-blue-200 pl-3 whitespace-pre-wrap break-words">
                                {finding.quote}
                              </blockquote>
                            </Show>
                            <p>{finding.suggestion}</p>
                          </div>
                        )}
                      </For>
                    </>
                  )}
                </Show>
              </article>
            )}
          </For>
        </Show>
      </section>
    </Show>
  );
}
