import { useApp } from "../app-store";
import { For } from "solid-js";
import { labels } from "../domain";
import { date } from "../domain";
import { Button } from "../components/ui";
import { Icon } from "../components/ui";
export function Registry() {
  const {
    data,
    query,
    setQuery,
    type,
    setType,
    status,
    setStatus,
    from,
    setFrom,
    to,
    setTo,
    setModal,
    selected,
    setSelected,
    page,
    setPage,
    setTemplate,
    person,
    refresh,
    run,
    heading,
    rows,
    exportList,
  } = useApp();
  return (
    <>
      <div class="workspace-toolbar">
        <Button primary icon="download" onClick={exportList}>
          Выгрузить список
        </Button>
        <div class="toolbar-right">
          <Button
            icon="plus"
            onClick={() => {
              setTemplate(undefined);
              setModal("create");
            }}
          >
            Создать проект документа
          </Button>
          <Button icon="refresh" onClick={() => void run(refresh)}>
            Обновить
          </Button>
        </div>
      </div>
      <div class="title-row">
        <h1>{heading()}</h1>
        <span class="view-name">Документы системы</span>
      </div>
      <form
        class="filters"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
        }}
      >
        <div class="filter-toggles">
          <span>Мои задачи</span>
          <button
            type="button"
            class="text-button"
            onClick={() => {
              setQuery("");
              setType("");
              setStatus("");
              setFrom("");
              setTo("");
            }}
          >
            Сбросить фильтры
          </button>
        </div>
        <div class="filter-grid">
          <label class="field">
            <span>Содержание / рег. номер</span>
            <input
              type="search"
              value={query()}
              onInput={(e) => {
                setQuery(e.currentTarget.value);
                setPage(1);
              }}
            />
          </label>
          <label class="field">
            <span>Тип документа</span>
            <select
              value={type()}
              onChange={(e) => setType(e.currentTarget.value)}
            >
              <option value="">Все типы</option>
              <For each={data()?.document_types}>
                {(t) => <option>{t}</option>}
              </For>
            </select>
          </label>
          <label class="field">
            <span>Статус</span>
            <select
              value={status()}
              onChange={(e) => setStatus(e.currentTarget.value)}
            >
              <option value="">Все статусы</option>
              <For each={Object.entries(labels)}>
                {([key, value]) => <option value={key}>{value}</option>}
              </For>
            </select>
          </label>
          <label class="field">
            <span>Срок с</span>
            <input
              type="date"
              value={from()}
              onInput={(e) => setFrom(e.currentTarget.value)}
            />
          </label>
          <label class="field">
            <span>Срок по</span>
            <input
              type="date"
              value={to()}
              onInput={(e) => setTo(e.currentTarget.value)}
            />
          </label>
        </div>
        <div class="filter-submit">
          <Button type="submit" icon="search">
            Найти
          </Button>
        </div>
      </form>
      <div class="list-tools">
        <div>
          <Button
            icon="check"
            onClick={() =>
              setSelected(selected().length ? [] : rows().map((d) => d.id))
            }
          >
            Выбрать все
          </Button>
          <span class="selected-count">Выбрано: {selected().length}</span>
        </div>
        <span>
          Записей: <b>{rows().length}</b>
        </span>
      </div>
      <div class="table-scroll">
        <table class="document-table">
          <thead>
            <tr>
              <th class="check-col"></th>
              <th class="file-col"></th>
              <For
                each={[
                  "Задача",
                  "Тип документа",
                  "Срок исполнения",
                  "Дата получения",
                  "Рег. номер / дата",
                  "Статус",
                  "Краткое содержание документа",
                  "Автор",
                ]}
              >
                {(h) => <th>{h}</th>}
              </For>
            </tr>
          </thead>
          <tbody>
            <For
              each={rows().slice((page() - 1) * 20, page() * 20)}
              fallback={
                <tr>
                  <td colspan="10" class="empty-table">
                    Нет записей для отображения
                  </td>
                </tr>
              }
            >
              {(d) => (
                <tr class={selected().includes(d.id) ? "selected" : ""}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Выбрать ${d.number}`}
                      checked={selected().includes(d.id)}
                      onChange={(e) =>
                        setSelected(
                          e.currentTarget.checked
                            ? [...selected(), d.id]
                            : selected().filter((id) => id !== d.id),
                        )
                      }
                    />
                  </td>
                  <td>
                    <Icon name="file" />
                    {d.favorite && "★"}
                  </td>
                  <td>
                    <a href={`#/doc/${encodeURIComponent(d.id)}`}>
                      Рассмотрение
                    </a>
                  </td>
                  <td>{d.type}</td>
                  <td
                    class={
                      d.due < new Date().toISOString().slice(0, 10) &&
                      !["approved", "done"].includes(d.status)
                        ? "overdue"
                        : ""
                    }
                  >
                    {date(d.due)}
                  </td>
                  <td>{date(d.created)}</td>
                  <td>
                    <a href={`#/doc/${encodeURIComponent(d.id)}`}>{d.number}</a>
                    <small>{date(d.created)}</small>
                  </td>
                  <td>{labels[d.status]}</td>
                  <td>
                    <a href={`#/doc/${encodeURIComponent(d.id)}`}>{d.title}</a>{" "}
                    <a
                      href={`#/doc/${encodeURIComponent(d.id)}`}
                      target="_blank"
                      rel="noopener"
                      aria-label="Открыть в новой вкладке"
                    >
                      ↗
                    </a>
                  </td>
                  <td>
                    {person(d.owner_id)}
                    <small>{d.department}</small>
                  </td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
      <div class="table-footer">
        <span>
          Записи {Math.min((page() - 1) * 20 + 1, rows().length)}–
          {Math.min(page() * 20, rows().length)} из {rows().length}
        </span>
        <div class="flex gap-2">
          <Button disabled={page() <= 1} onClick={() => setPage(page() - 1)}>
            Назад
          </Button>
          <span>{page()}</span>
          <Button
            disabled={page() * 20 >= rows().length}
            onClick={() => setPage(page() + 1)}
          >
            Далее
          </Button>
        </div>
      </div>
    </>
  );
}
