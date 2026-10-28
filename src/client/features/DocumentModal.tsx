import { useApp } from "../app-store";
import { For } from "solid-js";
import { Show } from "solid-js";
import { api } from "../api";
import { Button } from "../components/ui";
import { payload } from "../form";
import { ProfileFields } from "./ProfileFields";
export function DocumentModal() {
  const {
    data,
    error,
    busy,
    modal,
    setModal,
    template,
    setTemplate,
    refresh,
    run,
    action,
  } = useApp();
  return (
    <Show when={modal()}>
      <div
        class="fixed inset-0 z-50 bg-slate-950/40 flex items-center justify-center p-4"
        onClick={(e) => {
          if (e.target === e.currentTarget) setModal(null);
        }}
      >
        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
          class="bg-white shadow-xl w-full max-w-3xl max-h-[90dvh] overflow-auto"
        >
          <div class="flex justify-between items-center p-4 border-b border-slate-200">
            <h2 id="modal-title" class="m-0">
              {modal() === "template"
                ? template()
                  ? "Изменить личный шаблон"
                  : "Новый личный шаблон"
                : "Создать проект документа"}
            </h2>
            <Button onClick={() => setModal(null)}>Закрыть</Button>
          </div>
          <form
            class="p-5"
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              void run(async () => {
                const values = payload(form);
                if (modal() === "template") {
                  const f = new FormData(form);
                  await action("/api/templates", {
                    format: "eosdo-personal-template",
                    version: 1,
                    name: f.get("name"),
                    id: template()?.id,
                    revision: template()?.revision,
                    config: {
                      ...values,
                      due_days: Number(f.get("due_days")),
                    },
                  });
                  setModal(null);
                } else {
                  const d = await api<{ id: string }>("/api/documents", values);
                  setModal(null);
                  await refresh();
                  location.hash = "/doc/" + d.id;
                }
              });
            }}
          >
            <Show when={modal() === "template"}>
              <div class="search-fields mb-4">
                <label class="field">
                  <span>Название шаблона *</span>
                  <input
                    name="name"
                    required
                    maxlength="100"
                    value={template()?.name || ""}
                  />
                </label>
                <label class="field">
                  <span>Дней на подготовку</span>
                  <input
                    type="number"
                    name="due_days"
                    min="1"
                    max="365"
                    value={template()?.config.due_days || 7}
                    required
                  />
                </label>
              </div>
            </Show>
            <Show when={data()?.templates.length && modal() === "create"}>
              <label class="field mb-4">
                <span>Личный шаблон</span>
                <select
                  value={template()?.id || ""}
                  onChange={(e) =>
                    setTemplate(
                      data()?.templates.find(
                        (t) => t.id === e.currentTarget.value,
                      ),
                    )
                  }
                >
                  <option value="">Без шаблона</option>
                  <For each={data()?.templates}>
                    {(t) => <option value={t.id}>{t.name}</option>}
                  </For>
                </select>
              </label>
            </Show>
            <Show when={template()} keyed fallback={<ProfileFields />}>
              {(t) => (
                <ProfileFields
                  value={{
                    ...t.config,
                    due: new Date(
                      Date.now() + (t.config.due_days || 7) * 86400000,
                    )
                      .toISOString()
                      .slice(0, 10),
                  }}
                />
              )}
            </Show>
            <div class="section-toolbar">
              <Button primary type="submit" disabled={busy()}>
                Сохранить
              </Button>
            </div>
            <Show when={error()}>
              <p role="alert" class="text-red-700">
                {error()}
              </p>
            </Show>
          </form>
        </section>
      </div>
    </Show>
  );
}
