import { useApp } from "../../app-store";
import { Show } from "solid-js";
import { api } from "../../api";
import { Button } from "../../components/ui";
import { ProfileFields } from "../ProfileFields";
import { payload } from "../../form";
export function DocumentGeneral() {
  const { doc, tab, busy, notify, refresh, run } = useApp();
  return (
    <Show when={tab() === "general"}>
      <section class="card-section">
        <h2>Основные реквизиты</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            void run(() =>
              api(
                `/api/documents/${doc()!.id}`,
                {
                  ...payload(form),
                  profile_revision: doc()?.profile_revision,
                },
                "PATCH",
              ).then(async () => {
                await refresh();
                notify("Реквизиты сохранены");
              }),
            );
          }}
        >
          <ProfileFields value={doc()} />
          <div class="section-toolbar">
            <Button type="submit" primary disabled={busy()}>
              Сохранить
            </Button>
          </div>
        </form>
      </section>
    </Show>
  );
}
