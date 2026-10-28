import { useApp } from "../app-store";
import { Button } from "../components/ui";
export function Rules() {
  const { data, run, action, busy } = useApp();
  return (
    <>
      <div class="title-row">
        <h1>Правила ИИ-проверки</h1>
      </div>
      <form
        class="p-5 space-y-4 max-w-4xl"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          void run(() =>
            action("/api/rules", {
              items: String(f.get("items"))
                .split("\n")
                .map((s) => s.trim())
                .filter(Boolean),
              demo: false,
              revision: data()?.rules.revision,
            }),
          );
        }}
      >
        <p class="text-slate-600">
          Добавьте требования вашей организации. Система не подставляет
          демонстрационные правила.
        </p>
        <label class="field">
          <span>Одно правило на строку (до 20)</span>
          <textarea
            name="items"
            rows="12"
            value={data()?.rules.items.join("\n")}
          />
        </label>
        <Button primary type="submit" disabled={busy()}>
          Сохранить правила
        </Button>
      </form>
    </>
  );
}
