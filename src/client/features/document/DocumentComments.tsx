import { useApp } from "../../app-store";
import { For, Show, createSignal, createEffect, on } from "solid-js";
import { Button } from "../../components/ui";
import { date } from "../../domain";
const statusLabel = (status: string) =>
  ({
    open: "Открыто",
    addressed: "Исправлено · ожидает проверки",
    closed: "Устранение подтверждено",
  })[status] ?? status;
export function DocumentComments() {
  const {
    data,
    doc,
    tab,
    busy,
    person,
    run,
    action,
    version,
    commentDraft,
    setCommentDraft,
    setVersionId,
    changeTab,
  } = useApp();
  const [filter, setFilter] = createSignal("all");
  const [selectedVersion, setSelectedVersion] = createSignal("");
  const [anchor, setAnchor] = createSignal("");
  const [anchorLine, setAnchorLine] = createSignal<number>();
  createEffect(
    on(
      [() => doc()?.id, tab, commentDraft, () => version()?.id] as const,
      ([documentId, currentTab, draft, versionId]) => {
        if (currentTab !== "comments") return;
        const selected =
          draft && draft.document_id === documentId ? draft : undefined;
        setSelectedVersion(selected?.version_id ?? versionId ?? "");
        setAnchor(selected?.anchor ?? "");
        setAnchorLine(selected?.anchor_line);
        setFilter(selected?.version_id ?? "all");
      },
    ),
  );
  const versionLabel = (id: string | null | undefined) => {
    const v = doc()?.versions.find((v) => v.id === id);
    return v ? `v${v.number}` : "версия недоступна";
  };
  return (
    <Show when={tab() === "comments"}>
      <section class="card-section">
        <h2>Замечания к версиям</h2>
        <form
          class="space-y-3 py-4"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget,
              documentId = doc()!.id;
            const f = new FormData(form);
            void run(async () => {
              await action("/api/comments", {
                document_id: documentId,
                version_id: f.get("version_id"),
                text: f.get("text"),
                anchor: f.get("anchor"),
                anchor_line: anchorLine() ?? null,
                severity: f.has("blocking") ? "blocking" : "normal",
              });
              if (doc()?.id === documentId) {
                form.reset();
                setAnchor("");
                setCommentDraft(undefined);
              }
            });
          }}
        >
          <label class="field">
            <span>Версия замечания</span>
            <select
              name="version_id"
              required
              value={selectedVersion()}
              onChange={(e) => {
                setSelectedVersion(e.currentTarget.value);
                setAnchor("");
                setAnchorLine(undefined);
              }}
            >
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
            <textarea
              name="anchor"
              maxlength="1000"
              rows="2"
              value={anchor()}
              onInput={(e) => {
                setAnchor(e.currentTarget.value);
                setAnchorLine(undefined);
              }}
            />
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
        <label class="field mb-4">
          <span>Показать замечания</span>
          <select
            aria-label="Фильтр замечаний по версии"
            value={filter()}
            onChange={(e) => setFilter(e.currentTarget.value)}
          >
            <option value="all">Все версии</option>
            <For each={doc()?.versions}>
              {(v) => <option value={v.id}>v{v.number}</option>}
            </For>
          </select>
        </label>
        <p class="text-sm mb-3">
          Новая версия не закрывает замечания автоматически. Исполнитель
          отмечает исправление, куратор подтверждает его после проверки.
        </p>
        <Show
          when={
            doc()?.comments.filter(
              (c) => filter() === "all" || c.version_id === filter(),
            ).length
          }
          fallback={<p class="py-4">Замечаний к выбранным версиям нет.</p>}
        >
          <For
            each={doc()?.comments.filter(
              (c) => filter() === "all" || c.version_id === filter(),
            )}
          >
            {(c) => (
              <article class="comment border-t border-slate-200 py-4">
                <div class="flex flex-wrap justify-between gap-2">
                  <b>
                    {person(c.author_id)} · {versionLabel(c.version_id)}
                  </b>
                  <span>
                    {statusLabel(c.status)}
                    {c.severity === "blocking" ? " · Обязательное" : ""}
                  </span>
                </div>
                <small>{date(c.created)}</small>
                <Show when={c.anchor_line}>
                  <small> · Строка {c.anchor_line}</small>
                </Show>
                <Show when={c.anchor}>
                  <blockquote class="border-l-2 border-blue-200 pl-3 my-2 whitespace-pre-wrap">
                    {c.anchor}
                  </blockquote>
                </Show>
                <p class="whitespace-pre-wrap">{c.text}</p>
                <Show when={c.resolved_version}>
                  <p class="my-2">
                    {c.status === "closed"
                      ? "Устранение подтверждено в"
                      : "Исправление заявлено в"}{" "}
                    {versionLabel(c.resolved_version)}
                  </p>
                </Show>
                <div class="flex flex-wrap gap-2 my-2">
                  <Button
                    onClick={() => {
                      setVersionId(c.version_id);
                      changeTab("versions");
                    }}
                  >
                    Открыть исходную версию
                  </Button>
                  <Show when={c.resolved_version}>
                    <Button
                      onClick={() => {
                        setVersionId(c.resolved_version!);
                        changeTab("versions");
                      }}
                    >
                      Открыть исправление
                    </Button>
                  </Show>
                </div>
                <For each={c.replies}>
                  {(r) => (
                    <p class="my-2 whitespace-pre-wrap">
                      <b>{person(r.author_id)}: </b>
                      {r.text} <small>· {date(r.created)}</small>
                    </p>
                  )}
                </For>
                <form
                  class="flex gap-2 my-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const form = e.currentTarget;
                    const commentId = c.id,
                      text = new FormData(form).get("text");
                    void run(async () => {
                      await action(`/api/comments/${commentId}/reply`, {
                        text,
                      });
                      form.reset();
                    });
                  }}
                >
                  <input
                    name="text"
                    required
                    maxlength="5000"
                    placeholder="Ответ на замечание"
                    aria-label="Ответ на замечание"
                    class="flex-1 min-w-0"
                  />
                  <Button type="submit" disabled={busy()}>
                    Ответить
                  </Button>
                </form>
                <div class="flex flex-wrap gap-2">
                  <For
                    each={
                      data()?.user?.role === "curator"
                        ? ["open", "addressed", "closed"]
                        : ["addressed"]
                    }
                  >
                    {(s) => (
                      <Button
                        disabled={
                          busy() ||
                          (s === c.status &&
                            (s === "open" ||
                              c.resolved_version === doc()?.versions[0]?.id))
                        }
                        onClick={() => {
                          const commentId = c.id,
                            latestId = doc()?.versions[0]?.id,
                            expectedStatus = c.status;
                          void run(() =>
                            action(`/api/comments/${commentId}/status`, {
                              status: s,
                              version_id: latestId,
                              expected_status: expectedStatus,
                            }),
                          );
                        }}
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
                <details class="my-3">
                  <summary>История замечания</summary>
                  <p>
                    Создано: {person(c.author_id)} · {date(c.created)} ·{" "}
                    {versionLabel(c.version_id)}
                  </p>
                  <For
                    each={c.events?.filter(
                      (event) => event.from_status !== null,
                    )}
                  >
                    {(event) => (
                      <p>
                        {person(event.author_id)} · {date(event.created)}:{" "}
                        {statusLabel(event.from_status!)} →{" "}
                        {statusLabel(event.status)} ·{" "}
                        {versionLabel(event.version_id)}
                      </p>
                    )}
                  </For>
                  <Show when={!c.events?.length}>
                    <p class="text-sm">
                      Подробная история статусов до включения версионирования не
                      записывалась.
                    </p>
                  </Show>
                </details>
              </article>
            )}
          </For>
        </Show>
      </section>
    </Show>
  );
}
