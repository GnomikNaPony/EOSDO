import { For, onMount, onCleanup, Show, createMemo } from "solid-js";
import { useApp } from "../../app-store";
import type { DiffLine } from "../../../shared/version-diff";

/** Pair neighboring removals/additions so a replacement reads across the two columns. */
function aligned(lines: DiffLine[]) {
  const rows: { before?: DiffLine; after?: DiffLine }[] = [];
  for (let i = 0; i < lines.length;) {
    if (lines[i]!.kind === "equal") {
      rows.push({ before: lines[i], after: lines[i] });
      i++;
    } else {
      const before: DiffLine[] = [],
        after: DiffLine[] = [];
      while (i < lines.length && lines[i]!.kind !== "equal") {
        const line = lines[i++]!;
        (line.kind === "remove" ? before : after).push(line);
      }
      for (let j = 0; j < Math.max(before.length, after.length); j++)
        rows.push({ before: before[j], after: after[j] });
    }
  }
  return rows;
}

export function DocumentDiff() {
  const { diff, setDiff, commentOnLine } = useApp();
  let dialog!: HTMLDialogElement;
  const previousFocus = document.activeElement;
  onMount(() => dialog.showModal());
  onCleanup(() => {
    if (previousFocus instanceof HTMLElement) previousFocus.focus();
  });
  const rows = createMemo(() => aligned(diff()?.lines ?? []));
  return (
    <dialog
      ref={(element) => {
        dialog = element;
      }}
      class="version-diff-dialog"
      aria-label="Сравнение версий"
      onClose={() => setDiff(undefined)}
    >
      <Show when={diff()}>
        {(comparison) => (
          <>
            <header class="flex justify-between items-start gap-4 mb-3">
              <div>
                <h2>Сравнение версий</h2>
                <p>
                  До:{" "}
                  {comparison().before
                    ? `v${comparison().before!.number}`
                    : "нет файла"}{" "}
                  → После: v{comparison().after.number}
                </p>
              </div>
              <button
                class="button"
                type="button"
                autofocus
                onClick={() => dialog.close()}
              >
                Закрыть
              </button>
            </header>
            <p class="mb-3 text-sm">
              Сравнивается извлечённый текст. Оформление, изображения и
              расположение на странице не сравниваются.
            </p>
            <div class="flex flex-wrap gap-3 mb-3">
              <Show when={comparison().before}>
                {(before) => (
                  <a
                    class="button"
                    href={`/api/versions/${before().id}/file`}
                    download=""
                  >
                    Скачать до · v{before().number}
                  </a>
                )}
              </Show>
              <a
                class="button"
                href={`/api/versions/${comparison().after.id}/file`}
                download=""
              >
                Скачать после · v{comparison().after.number}
              </a>
              <span class="self-center">
                Добавлено: {comparison().added} · Удалено:{" "}
                {comparison().removed}
              </span>
            </div>
            <Show when={comparison().message}>
              <p role="status" class="p-3 bg-slate-50 mb-3">
                {comparison().message}
              </p>
            </Show>
            <Show when={comparison().lines.length}>
              <p class="text-sm mb-2">
                Нажмите строку, чтобы добавить замечание к этой версии.
              </p>
              <div
                class="version-diff-scroll"
                tabindex="0"
                aria-label="Текст до и после"
              >
                <table class="version-diff-table">
                  <thead>
                    <tr>
                      <th scope="col">
                        До{" "}
                        {comparison().before
                          ? `· v${comparison().before!.number}`
                          : "· пустой документ"}
                      </th>
                      <th scope="col">После · v{comparison().after.number}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <For each={rows()}>
                      {(row) => (
                        <tr>
                          <For each={["before", "after"] as const}>
                            {(side) => {
                              const line = row[side];
                              const version =
                                side === "before"
                                  ? comparison().before
                                  : comparison().after;
                              const number =
                                side === "before" ? line?.before : line?.after;
                              return (
                                <td
                                  class={
                                    line?.kind === "remove"
                                      ? "diff-removed"
                                      : line?.kind === "add"
                                        ? "diff-added"
                                        : ""
                                  }
                                >
                                  <Show when={line}>
                                    <div class="diff-line">
                                      <span
                                        class="diff-number"
                                        aria-hidden="true"
                                      >
                                        {number}
                                      </span>
                                      <button
                                        type="button"
                                        class="diff-text"
                                        disabled={
                                          !line!.text.trim() ||
                                          line!.text.length > 1000 ||
                                          !version
                                        }
                                        aria-label={`Замечание: ${side === "before" ? "до" : "после"}, строка ${number}`}
                                        onClick={() =>
                                          commentOnLine(
                                            comparison().document_id,
                                            version!.id,
                                            line!.text,
                                            number!,
                                          )
                                        }
                                      >
                                        <span aria-hidden="true">
                                          {line!.kind === "remove"
                                            ? "− "
                                            : line!.kind === "add"
                                              ? "+ "
                                              : "  "}
                                        </span>
                                        {line!.text || " "}
                                      </button>
                                    </div>
                                  </Show>
                                </td>
                              );
                            }}
                          </For>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </div>
            </Show>
          </>
        )}
      </Show>
    </dialog>
  );
}
