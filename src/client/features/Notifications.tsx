import { For } from "solid-js";
import { useApp } from "../app-store";
import { Button } from "../components/ui";
import { date } from "../domain";
export function Notifications() {
  const { data, run, action } = useApp();
  return (
    <>
      <div class="title-row">
        <h1>Уведомления</h1>
        <Button
          onClick={() =>
            void run(() => action("/api/notifications/read", { id: "all" }))
          }
        >
          Прочитать все
        </Button>
      </div>
      <div class="p-5">
        <For
          each={data()?.notifications}
          fallback={<p>Уведомлений пока нет.</p>}
        >
          {(n) => (
            <article
              class={`border-b border-slate-200 py-4 ${n.read ? "" : "font-semibold"}`}
            >
              <button
                class="text-button"
                onClick={() =>
                  void run(async () => {
                    await action("/api/notifications/read", { id: n.id });
                    if (n.document_id) location.hash = "/doc/" + n.document_id;
                  })
                }
              >
                {n.title}
              </button>
              <p>{n.body}</p>
              <small>{date(n.created)}</small>
            </article>
          )}
        </For>
      </div>
    </>
  );
}
