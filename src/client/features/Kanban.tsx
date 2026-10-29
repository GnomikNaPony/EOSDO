import { For } from "solid-js";
import { useApp } from "../app-store";
import { date, labels } from "../domain";
export function Kanban() {
  const { data, person } = useApp();
  return (
    <>
      <div class="title-row">
        <h1>Канбан документов</h1>
      </div>
      <div class="kanban-board">
        <For each={Object.entries(labels)}>
          {([key, label]) => (
            <section class="kanban-column">
              <h2>{label}</h2>
              <For
                each={data()?.documents.filter((d) => d.status === key)}
                fallback={<p class="text-slate-500">Нет документов</p>}
              >
                {(d) => (
                  <a class="kanban-card" href={`#/doc/${d.id}?tab=approval`}>
                    <small>{d.number}</small>
                    <p class="my-2">{d.title}</p>
                    <small>
                      {date(d.due)} · {person(d.owner_id)}
                    </small>
                  </a>
                )}
              </For>
            </section>
          )}
        </For>
      </div>
    </>
  );
}
