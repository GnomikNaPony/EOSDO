import { useApp } from "../app-store";
import { For } from "solid-js";
import { type Profile } from "../types";
import { RouteEditor } from "./RouteEditor";
export function ProfileFields(p: { value?: Partial<Profile> }) {
  const { data, modal } = useApp();
  return (
    <div class="search-fields">
      <label class="field">
        <span>Краткое содержание *</span>
        <input
          name="title"
          value={p.value?.title || ""}
          required
          maxlength="300"
        />
      </label>
      <label class="field">
        <span>Вид документа</span>
        <select
          name="type"
          value={p.value?.type || data()?.document_types[0] || ""}
        >
          <For each={data()?.document_types}>{(t) => <option>{t}</option>}</For>
        </select>
      </label>
      <label class="field">
        <span>Исполнитель</span>
        <select name="owner_id" value={p.value?.owner_id || data()?.user?.id}>
          <For each={data()?.users}>
            {(u) => <option value={u.id}>{u.name}</option>}
          </For>
        </select>
      </label>
      <label class="field">
        <span>Срок исполнения *</span>
        <input
          type="date"
          name="due"
          required={modal() !== "template"}
          value={p.value?.due || ""}
        />
      </label>
      <label class="field">
        <span>Приоритет</span>
        <select name="priority" value={p.value?.priority || "normal"}>
          <option value="normal">Обычный</option>
          <option value="high">Высокий</option>
          <option value="low">Низкий</option>
        </select>
      </label>
      <label class="field">
        <span>Дело · номенклатура</span>
        <select name="case_id" value={p.value?.case_id || ""}>
          <option value="">Не выбрано</option>
          <For each={data()?.cases}>
            {(c) => (
              <option value={c.id}>
                {c.code} · {c.title}
              </option>
            )}
          </For>
        </select>
      </label>
      <label class="field col-span-full">
        <span>Поручение / пояснение</span>
        <textarea
          name="summary"
          rows="4"
          maxlength="5000"
          value={p.value?.summary || ""}
        />
      </label>
      <label class="field">
        <span>Адресаты (Cmd/Ctrl для нескольких)</span>
        <select multiple name="recipients">
          <For each={data()?.users}>
            {(u) => (
              <option
                value={u.id}
                selected={p.value?.recipients?.includes(u.id)}
              >
                {u.name} · {u.department}
              </option>
            )}
          </For>
        </select>
      </label>
      <RouteEditor initial={p.value?.route || []} />
    </div>
  );
}
