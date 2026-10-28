import { useApp } from "../../app-store";
import { For } from "solid-js";
import { Show } from "solid-js";
import { labels } from "../../domain";
import { Button } from "../../components/ui";
export function DocumentApproval() {
  const { doc, tab, busy, person, run, action } = useApp();
  return (
    <Show when={tab() === "approval"}>
      <section class="card-section">
        <h2>Согласование и подписание</h2>
        <p>
          Решение относится к актуальной версии. Обязательные замечания должны
          быть закрыты.
        </p>
        <For each={doc()?.route}>
          {(step) => (
            <p>
              {step.kind === "sign" ? "Подписание" : "Согласование"} ·{" "}
              {person(step.user_id)} · {step.days} дн.
            </p>
          )}
        </For>
        <form
          class="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void run(() =>
              action(`/api/documents/${doc()!.id}/status`, {
                status: f.get("status"),
                version_id: doc()?.versions[0]?.id || null,
                manual_review: f.has("manual_review"),
              }),
            );
          }}
        >
          <label class="field">
            <span>Статус</span>
            <select name="status" value={doc()?.status}>
              <For each={Object.entries(labels).filter(([s]) => s !== "ai")}>
                {([key, label]) => <option value={key}>{label}</option>}
              </For>
            </select>
          </label>
          <label class="block">
            <input type="checkbox" name="manual_review" /> Я выполнил ручную
            проверку актуальной версии
          </label>
          <Button type="submit" primary disabled={busy()}>
            Сохранить решение
          </Button>
        </form>
      </section>
    </Show>
  );
}
