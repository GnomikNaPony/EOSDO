import { useApp } from "../app-store";
import { For } from "solid-js";
import { api } from "../api";
import { Button } from "../components/ui";
export function PersonalTemplates() {
  const { data, setModal, setTemplate, run, download, action } = useApp();
  return (
    <>
      <div class="title-row">
        <h1>Мои шаблоны</h1>
        <Button
          primary
          onClick={() => {
            setTemplate(undefined);
            setModal("template");
          }}
        >
          Новый шаблон
        </Button>
        <label class="button cursor-pointer">
          Импорт настроек
          <input
            class="hidden"
            type="file"
            accept=".json,application/json"
            onChange={(e) => {
              const file = e.currentTarget.files?.[0];
              if (file)
                void run(async () => {
                  if (file.size > 65536)
                    throw new Error("Файл должен быть до 64 КБ");
                  await action("/api/templates", JSON.parse(await file.text()));
                });
            }}
          />
        </label>
      </div>
      <div class="p-5 space-y-3">
        <For
          each={data()?.templates}
          fallback={
            <p>
              Личных шаблонов пока нет. Сохраните типовые реквизиты нового
              документа.
            </p>
          }
        >
          {(t) => (
            <article class="border border-slate-200 p-4">
              <h2>{t.name}</h2>
              <p>
                {t.config.type} · {t.config.title}
              </p>
              <div class="flex flex-wrap gap-2">
                <Button
                  primary
                  onClick={() => {
                    setTemplate(t);
                    setModal("create");
                  }}
                >
                  Создать документ
                </Button>
                <Button
                  onClick={() => {
                    setTemplate(t);
                    setModal("template");
                  }}
                >
                  Изменить
                </Button>
                <Button
                  onClick={() =>
                    void run(async () =>
                      download(
                        JSON.stringify(
                          await api(`/api/templates/${t.id}`),
                          null,
                          2,
                        ),
                        t.name + ".json",
                      ),
                    )
                  }
                >
                  Экспорт JSON
                </Button>
                <Button
                  onClick={() =>
                    void run(() =>
                      action(`/api/templates/${t.id}/delete`, {
                        revision: t.revision,
                      }),
                    )
                  }
                >
                  Удалить
                </Button>
              </div>
            </article>
          )}
        </For>
      </div>
    </>
  );
}
