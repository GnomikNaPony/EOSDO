import { useApp } from "../../app-store";
import { For } from "solid-js";
import { Show } from "solid-js";
import { api } from "../../api";
import { date } from "../../domain";
import { Button } from "../../components/ui";
export function DocumentVersions() {
  const { doc, tab, busy, setVersionId, setDiff, run, version, action } =
    useApp();
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
                <Button
                  onClick={() =>
                    void run(async () => {
                      const diff = await api<unknown>(
                        `/api/versions/${v().id}/diff`,
                      );
                      setDiff((diff as { diff: string }).diff);
                    })
                  }
                >
                  Сравнить с предыдущей
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
