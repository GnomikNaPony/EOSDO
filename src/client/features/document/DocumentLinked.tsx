import { useApp } from "../../app-store";
import { For } from "solid-js";
import { Show } from "solid-js";
import { Button } from "../../components/ui";
export function DocumentLinked() {
  const { data, doc, tab, run, action } = useApp();
  return (
    <Show when={tab() === "linked"}>
      <section class="card-section">
        <h2>Связанные документы</h2>
        <For each={doc()?.links}>
          {(d) => (
            <p>
              <a href={`#/doc/${d.id}`}>
                {d.number} · {d.title}
              </a>
            </p>
          )}
        </For>
        <form
          class="flex gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void run(() =>
              action(`/api/documents/${doc()!.id}/links`, {
                target_id: new FormData(e.currentTarget).get("target_id"),
              }),
            );
          }}
        >
          <select name="target_id">
            <For each={data()?.documents.filter((d) => d.id !== doc()?.id)}>
              {(d) => (
                <option value={d.id}>
                  {d.number} · {d.title}
                </option>
              )}
            </For>
          </select>
          <Button type="submit">Добавить связь</Button>
        </form>
      </section>
    </Show>
  );
}
