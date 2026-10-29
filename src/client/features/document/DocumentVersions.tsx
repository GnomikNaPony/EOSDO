import { useApp } from "../../app-store";
import { For, createSignal, createEffect, on } from "solid-js";
import type { VersionDiff } from "../../../shared/version-diff";
import { Show } from "solid-js";
import { api } from "../../api";
import { date } from "../../domain";
import { Button } from "../../components/ui";
export function DocumentVersions() {
  const {
    doc,
    tab,
    busy,
    setVersionId,
    setDiff,
    run,
    version,
    action,
    person,
  } = useApp();
  const [baseId, setBaseId] = createSignal("");
  createEffect(
    on(
      () => version()?.id,
      () =>
        setBaseId(
          version()?.parent_id ??
            doc()?.versions.find((v) => v.number < (version()?.number ?? 0))
              ?.id ??
            "",
        ),
    ),
  );
  return (
    <Show when={tab() === "versions"}>
      <section class="card-section">
        <h2>Файлы и версии документа</h2>
        <form
          class="flex flex-wrap items-end gap-3 py-3"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const documentId = doc()!.id;
            const parentId = doc()?.versions[0]?.id || null;
            void run(async () => {
              const f = new FormData(form);
              const file = f.get("file") as File;
              if (file.size > 20 * 1024 * 1024)
                throw new Error("Файл не должен превышать 20 МБ");
              const bytes = new Uint8Array(await file.arrayBuffer());
              let binary = "";
              for (const byte of bytes) binary += String.fromCharCode(byte);
              await action(`/api/documents/${documentId}/versions`, {
                filename: file.name,
                content: btoa(binary),
                message: f.get("message"),
                parent_id: parentId,
              });
              form.reset();
            });
          }}
        >
          <label class="field">
            <span>Новая версия (до 20 МБ)</span>
            <input type="file" name="file" required />
          </label>
          <label class="field">
            <span>Что изменилось *</span>
            <input name="message" required maxlength="1000" />
          </label>
          <Button primary type="submit" disabled={busy()}>
            Загрузить новую версию
          </Button>
        </form>
        <h3>История версий</h3>
        <ol class="version-history" aria-label="История версий">
          <For each={doc()?.versions}>
            {(v) => (
              <li>
                <button
                  type="button"
                  class={`version-history-entry ${version()?.id === v.id ? "selected" : ""}`}
                  aria-current={version()?.id === v.id ? "true" : undefined}
                  onClick={() => setVersionId(v.id)}
                >
                  <b>
                    v{v.number}
                    {doc()?.versions[0]?.id === v.id ? " · Актуальная" : ""}
                  </b>
                  <span>{v.message}</span>
                  <small>
                    {person(v.author_id)} · {date(v.created)} ·{" "}
                    {v.sha256.slice(0, 12)}
                  </small>
                </button>
              </li>
            )}
          </For>
        </ol>
        <label class="field">
          <span>Версия</span>
          <select
            value={version()?.id}
            onChange={(e) => setVersionId(e.currentTarget.value)}
          >
            <For each={doc()?.versions}>
              {(v) => (
                <option value={v.id}>
                  v{v.number} · {v.filename} · {date(v.created)}
                </option>
              )}
            </For>
          </select>
        </label>
        <Show
          when={version()}
          fallback={<p class="p-4">Файлы ещё не загружены</p>}
        >
          {(v) => (
            <>
              <div class="section-toolbar">
                <a
                  class="button"
                  href={`/api/versions/${v().id}/file`}
                  download=""
                >
                  Скачать оригинал
                </a>
                <Show
                  when={doc()?.versions.some(
                    (other) => other.number < v().number,
                  )}
                >
                  <label class="field">
                    <span>Сравнить с</span>
                    <select
                      aria-label="Базовая версия"
                      value={baseId()}
                      onChange={(e) => setBaseId(e.currentTarget.value)}
                    >
                      <For
                        each={doc()?.versions.filter(
                          (other) => other.number < v().number,
                        )}
                      >
                        {(other) => (
                          <option value={other.id}>
                            v{other.number} · {other.filename}
                          </option>
                        )}
                      </For>
                    </select>
                  </label>
                </Show>
                <Button
                  disabled={busy()}
                  onClick={() => {
                    const documentId = doc()!.id,
                      versionId = v().id,
                      base = baseId();
                    void run(async () => {
                      const result = await api<VersionDiff>(
                        `/api/versions/${versionId}/diff${base ? `?base=${encodeURIComponent(base)}` : ""}`,
                      );
                      if (
                        doc()?.id === documentId &&
                        version()?.id === versionId &&
                        tab() === "versions" &&
                        baseId() === base
                      )
                        setDiff(result);
                    });
                  }}
                >
                  Показать до / после
                </Button>
              </div>
              <p>{v().message}</p>
              <pre
                class="whitespace-pre-wrap break-words bg-slate-50 border border-slate-200 p-5 max-h-[50vh] overflow-auto"
                tabindex="0"
              >
                {v().text ||
                  v().extraction_error ||
                  "Текст пока недоступен. Скачайте оригинал."}
              </pre>
              <small class="break-all">SHA-256: {v().sha256}</small>
            </>
          )}
        </Show>
      </section>
    </Show>
  );
}
