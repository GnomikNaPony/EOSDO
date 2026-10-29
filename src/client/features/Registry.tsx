import { useApp } from "../app-store";
import { For, Show } from "solid-js";
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
    searchScope,
    setSearchScope,
    searchHistory,
    setSearchHistory,
    searchResults,
    searchLoading,
    searchError,
    searchNow,
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
          searchNow();
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
              setSearchScope("all");
              setSearchHistory("all");
            }}
          >
            Сбросить фильтры
          </button>
        </div>
        <div class="filter-grid">
          <label class="field">
            <span>Поиск по файлам и документам</span>
            <input
              type="search"
              maxlength="200"
              placeholder="Слова из файла, имя, номер…"
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
        <div class="flex flex-wrap gap-4 items-end px-5 py-3">
          <label class="field">
            <span>Где искать</span>
            <select
              value={searchScope()}
              onChange={(e) => setSearchScope(e.currentTarget.value)}
            >
              <option value="all">Везде</option>
              <option value="filename">Имена файлов</option>
              <option value="text">Содержимое файлов</option>
              <option value="metadata">Реквизиты карточки</option>
            </select>
          </label>
          <label class="field">
            <span>Версии</span>
            <select
              value={searchHistory()}
              onChange={(e) => setSearchHistory(e.currentTarget.value)}
            >
              <option value="all">Все версии, включая историю</option>
              <option value="latest">Только актуальные версии</option>
            </select>
          </label>
          <p class="text-xs text-slate-500 max-w-xl">
            Все введённые слова, без учёта регистра. Текстовый поиск — по
            извлечённому тексту TXT/MD/CSV; PDF/DOCX/XLSX доступны по имени
            файла и реквизитам.
          </p>
        </div>
        <div class="filter-submit">
          <Button type="submit" icon="search">
            Найти
          </Button>
        </div>
      </form>
      <div aria-live="polite" class="px-5 py-3 text-sm">
        <Show when={searchLoading()}>
          <p role="status">Поиск на сервере…</p>
        </Show>
        <Show when={searchError()}>
          <p role="alert" class="text-red-700">
            {searchError()}{" "}
            <button type="button" class="text-button" onClick={searchNow}>
              Повторить поиск
            </button>
          </p>
        </Show>
        <Show
          when={
            query().trim() &&
            !searchLoading() &&
            !searchError() &&
            searchResults()
          }
        >
          <p>
            Найдено документов: <strong>{searchResults()?.total}</strong>.
            Совпадения привязаны к версии файла.
          </p>
          <Show when={searchResults()?.truncated}>
            <p>
              Показаны первые {searchResults()?.limit}. Уточните запрос или
              фильтры.
            </p>
          </Show>
          <Show
            when={
              searchResults()?.pending_files ||
              searchResults()?.unavailable_files
            }
          >
            <p class="text-amber-800">
              Поиск по содержимому неполный: текст ещё не извлечён —{" "}
              {searchResults()?.pending_files}, текст недоступен —{" "}
              {searchResults()?.unavailable_files}. Такие файлы можно найти по
              имени.
            </p>
          </Show>
        </Show>
      </div>
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
                    {searchLoading()
                      ? "Выполняется поиск…"
                      : searchError()
                        ? "Поиск не выполнен. Повторите запрос."
                        : query().trim()
                          ? "Совпадений не найдено. Измените слова, область поиска или версии."
                          : "Нет записей для отображения"}
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
                  <td data-label="Задача">
                    <a href={`#/doc/${encodeURIComponent(d.id)}`}>
                      Рассмотрение
                    </a>
                  </td>
                  <td data-label="Тип документа">{d.type}</td>
                  <td
                    data-label="Срок исполнения"
                    class={
                      d.due < new Date().toISOString().slice(0, 10) &&
                      !["approved", "done"].includes(d.status)
                        ? "overdue"
                        : ""
                    }
                  >
                    {date(d.due)}
                  </td>
                  <td data-label="Дата получения">{date(d.created)}</td>
                  <td data-label="Рег. номер / дата">
                    <a href={`#/doc/${encodeURIComponent(d.id)}`}>{d.number}</a>
                    <small>{date(d.created)}</small>
                  </td>
                  <td data-label="Статус">
                    <span class={`document-status status-${d.status}`}>
                      {labels[d.status]}
                    </span>
                  </td>
                  <td data-label="Документ" class="document-summary">
                    <a href={`#/doc/${encodeURIComponent(d.id)}`}>{d.title}</a>{" "}
                    <a
                      href={`#/doc/${encodeURIComponent(d.id)}`}
                      target="_blank"
                      rel="noopener"
                      aria-label="Открыть в новой вкладке"
                    >
                      ↗
                    </a>
                    <For
                      each={
                        searchResults()?.items.find(
                          (item) => item.document_id === d.id,
                        )?.matches
                      }
                    >
                      {(match) => (
                        <div
                          class="mt-3 border-l-2 border-sky-500 pl-3 text-sm whitespace-normal"
                          data-search-match
                        >
                          <a
                            href={`#/doc/${encodeURIComponent(d.id)}?tab=${match.version_id ? "versions" : "general"}${match.version_id ? `&version=${encodeURIComponent(match.version_id)}` : ""}`}
                          >
                            {match.version_id
                              ? `v${match.version_number} · ${match.filename} · ${match.is_latest ? "актуальная" : "история"}`
                              : "Реквизиты карточки"}
                          </a>
                          <p class="my-1 text-slate-600 leading-relaxed">
                            {match.snippet}
                          </p>
                          <small>
                            {match.source === "text"
                              ? "Совпадение в содержимом"
                              : match.source === "filename"
                                ? "Совпадение в имени файла"
                                : "Совпадение в реквизитах"}
                            {match.text_state === "pending"
                              ? " · текст ещё не извлечён"
                              : match.text_state === "unavailable"
                                ? " · текст недоступен"
                                : ""}
                          </small>
                        </div>
                      )}
                    </For>
                    <Show
                      when={
                        (searchResults()?.items.find(
                          (item) => item.document_id === d.id,
                        )?.match_count || 0) > 3
                      }
                    >
                      <small>
                        Показаны 3 версии с совпадениями. Остальные — в истории
                        документа.
                      </small>
                    </Show>
                  </td>
                  <td data-label="Автор">
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
