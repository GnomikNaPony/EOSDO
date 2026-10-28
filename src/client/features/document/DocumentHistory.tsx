import { useApp } from "../../app-store";
import { For } from "solid-js";
import { Show } from "solid-js";
import { date } from "../../domain";
export function DocumentHistory() {
  const { doc, tab, person } = useApp();
  return (
    <Show when={tab() === "history"}>
      <section class="card-section">
        <h2>История работы с документом</h2>
        <table class="simple-table">
          <thead>
            <tr>
              <th>Дата</th>
              <th>Пользователь</th>
              <th>Действие</th>
            </tr>
          </thead>
          <tbody>
            <For each={doc()?.history}>
              {(h) => (
                <tr>
                  <td>{date(h.created)}</td>
                  <td>{person(h.author_id)}</td>
                  <td>{h.action}</td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </section>
    </Show>
  );
}
