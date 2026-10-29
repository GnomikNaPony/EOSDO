import { createResource, createSignal, For, Show, onCleanup, onMount } from "solid-js";
import { useApp } from "../app-store";
import { api } from "../api";
import { Button } from "../components/ui";

interface Fact { kind: string; value: string; quote: string }
interface IndexedVersion {
  id: string; document_id: string; version_id?: string; version_number: number;
  filename: string; status: string; error?: string | null;
  metadata?: { facts: Fact[]; summary?: string } | null;
  model?: string; embedding_model?: string; chunk_count?: number;
}
interface Overview {
  versions: IndexedVersion[];
  groups: { key: string; label: string; kind: string; document_ids: string[] }[];
  model_status?: { available: boolean; metadata_available: boolean; embedding_available: boolean; model: string; embedding_model: string; message: string };
  notice?: string;
}
interface SearchResult {
  items: { document_id: string; version_id: string; version_number: number; filename: string; snippet: string; score: number }[];
  indexed_versions: number; pending_versions: number; notice?: string;
}
interface Report {
  title?: string; notice?: string;
  sources: { document_id: string; version_id: string; version_number: number; filename: string; facts: Fact[] }[];
}
const kinds: Record<string, string> = {
  project: "Проект", organization: "Организация", sender: "Отправитель",
  recipient: "Получатель", cable: "Позиция кабеля", remark: "Замечание",
  decision: "Решение в тексте", reference: "Ссылка на документ", letter_reference: "Ссылка на письмо", topic: "Тема", cable_position: "Позиция кабеля",
};
const statuses: Record<string, string> = {
  queued: "В очереди", pending: "В очереди", processing: "Обработка", running: "Обработка", ready: "Готово", done: "Готово", partial: "Обработано частично", error: "Ошибка",
};
const versionLink = (documentId: string, versionId: string) =>
  `#/doc/${encodeURIComponent(documentId)}?tab=versions&version=${encodeURIComponent(versionId)}`;
export function Knowledge() {
  const { data } = useApp();
  const curator = () => data()?.user?.role === "curator";
  const [overview, { refetch }] = createResource(curator, () => api<Overview>("/api/intelligence"));
  const reload = async () => { try { await refetch(); } catch { /* The resource exposes its error below. */ } };
  onMount(() => {
    const timer = setInterval(() => {
      if (!overview.loading && !overview.error && overview.latest?.versions.some((v) => ["queued", "running", "pending", "processing"].includes(v.status))) void reload();
    }, 5000);
    onCleanup(() => clearInterval(timer));
  });
  const [query, setQuery] = createSignal("");
  const [result, setResult] = createSignal<SearchResult>();
  const [searching, setSearching] = createSignal(false);
  const [error, setError] = createSignal("");
  const [retrying, setRetrying] = createSignal(false);
  const [report, setReport] = createSignal<Report>();
  const [reportLabel, setReportLabel] = createSignal("");
  const [reportLoading, setReportLoading] = createSignal(false);
  let request = 0, reportRequest = 0, alive = true;
  onCleanup(() => { alive = false; request++; reportRequest++; });
  const name = (id: string) => data()?.documents.find((d) => d.id === id)?.title || "Документ";
  async function search() {
    const text = query().trim();
    const current = ++request;
    setResult(undefined); setError("");
    if (!text) { setSearching(false); return; }
    setSearching(true);
    try {
      const found = await api<SearchResult>(`/api/intelligence/search?${new URLSearchParams({ q: text })}`);
      if (current === request) setResult(found);
    } catch (e) {
      if (current === request) setError(e instanceof Error ? e.message : "Поиск недоступен");
    } finally { if (current === request) setSearching(false); }
  }
  async function retry(versionId?: string) {
    setRetrying(true); setError("");
    try {
      await api("/api/intelligence/reindex", versionId ? { version_id: versionId } : {});
      if (alive) await refetch();
    } catch (e) { if (alive) setError(e instanceof Error ? e.message : "Обработка недоступна"); }
    finally { if (alive) setRetrying(false); }
  }
  async function showReport(key: string, label: string) {
    const current = ++reportRequest;
    setReport(undefined); setReportLabel(label); setReportLoading(true); setError("");
    try {
      const value = await api<Report>(`/api/intelligence/report?${new URLSearchParams({ key })}`);
      if (current === reportRequest) setReport(value);
    } catch (e) { if (current === reportRequest) setError(e instanceof Error ? e.message : "Сводка недоступна"); }
    finally { if (current === reportRequest) setReportLoading(false); }
  }
  return (
    <div class="p-5 space-y-5">
      <div class="title-row"><h1>Данные из документов</h1><span class="view-name">Переписка и смысловой поиск</span></div>
      <p class="text-sm text-slate-600 max-w-4xl">Письма сохраняются в оригинале. Фоновая обработка извлекает данные и фрагменты для поиска по смыслу. Каждый результат ведёт к конкретной версии файла.</p>
      <section class="border border-slate-200 bg-white p-5 space-y-4" aria-label="Смысловой поиск">
        <h2 class="text-lg font-bold">Найти по смыслу</h2>
        <form class="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); void search(); }}>
          <label class="field flex-1 min-w-52"><span>Что нужно найти</span><input type="search" name="semantic-query" maxlength="200" value={query()} onInput={(e) => { setQuery(e.currentTarget.value); request++; setResult(undefined); setSearching(false); }} placeholder="Например: замечания по кабельным позициям проекта" required /></label>
          <Button type="submit" primary disabled={searching()}>Найти по смыслу</Button>
        </form>
        <p class="text-xs text-slate-500">Поиск использует локальную модель векторных представлений. В выдаче могут быть предыдущие версии. Сходство текста не подтверждает актуальность приказа или принятие замечания.</p>
        <Show when={searching()}><p role="status">Поиск по смыслу…</p></Show>
        <Show when={result()}>{(found) => <div aria-live="polite" class="space-y-3">
          <p class="text-sm">Проиндексировано версий: {found().indexed_versions}. Ожидают обработки: {found().pending_versions}.</p>
          <Show when={found().notice}><p class="text-sm text-amber-800">{found().notice}</p></Show>
          <Show when={found().items.length} fallback={<p>Подходящие фрагменты не найдены.</p>}>
            <For each={found().items}>{(item) => <article class="border border-slate-200 p-4 space-y-2">
              <a class="text-blue-700 underline font-bold" href={versionLink(item.document_id, item.version_id)}>{name(item.document_id)}</a>
              <p class="text-xs text-slate-500">v{item.version_number} · {item.filename}</p>
              <blockquote class="whitespace-pre-wrap break-words border-l-2 border-blue-300 pl-3">{item.snippet}</blockquote>
              <a class="text-blue-700 underline text-sm" href={versionLink(item.document_id, item.version_id)}>Открыть версию и проверить источник</a>
            </article>}</For>
          </Show>
        </div>}</Show>
      </section>
      <Show when={error()}><p role="alert" class="bg-red-50 border border-red-200 text-red-800 p-4">{error()}</p></Show>
      <Show when={curator()}>
        <section class="border border-slate-200 bg-white p-5 space-y-4" aria-label="Обзор обработки куратора">
          <div class="flex flex-wrap items-center gap-3"><h2 class="text-lg font-bold mr-auto">Обзор обработки · куратор</h2><Button disabled={overview.loading} onClick={() => void reload()}>Обновить данные</Button><Button disabled={retrying()} onClick={() => void retry()}>Обработать архив заново</Button></div>
          <Show when={overview.loading}><p role="status">Загрузка данных обработки…</p></Show>
          <Show when={overview.error}><p role="alert" class="text-red-700">{overview.error instanceof Error ? overview.error.message : "Обзор недоступен"}</p></Show>
          <Show when={!overview.error && overview()}>{(value) => <>
            <Show when={value().model_status}>{(models) => <p class="text-sm text-slate-600">{models().message} · Извлечение: {models().metadata_available ? "доступно" : "недоступно"} · Векторы: {models().embedding_available ? "доступны" : "недоступны"}</p>}</Show>
            <Show when={value().notice}><p class="text-sm text-amber-800">{value().notice}</p></Show>
            <Show when={value().versions.length} fallback={<p>Версий для обработки пока нет. Создайте документ и загрузите письмо во вкладке «Файлы и версии».</p>}>
              <For each={value().versions}>{(v) => <details class="border border-slate-200 p-4">
                <summary class="cursor-pointer"><strong>{name(v.document_id)}</strong> · v{v.version_number} · {v.filename} <span class="text-blue-800">— {statuses[v.status] || v.status}</span></summary>
                <div class="mt-4 space-y-3">
                  <Show when={v.error}><p class="text-red-700">{v.error}</p></Show>
                  <p class="text-xs text-slate-500">Извлечение: {v.model || "—"} · Векторы: {v.embedding_model || "—"} · Фрагментов: {v.chunk_count ?? 0}</p>
                  <Show when={v.metadata?.facts.length} fallback={<p class="text-sm">Подтверждённые факты пока не извлечены.</p>}>
                    <For each={v.metadata?.facts}>{(fact) => <div class="border-l-2 border-blue-200 pl-3"><p><span class="text-xs text-slate-500">{kinds[fact.kind] || fact.kind}: </span><strong>{fact.value}</strong></p><blockquote class="text-sm whitespace-pre-wrap break-words">«{fact.quote}»</blockquote></div>}</For>
                  </Show>
                  <div class="flex flex-wrap gap-3"><a class="button" href={versionLink(v.document_id, v.version_id || v.id)}>Открыть источник</a><Button disabled={retrying() || v.status === "running" || v.status === "processing"} onClick={() => void retry(v.version_id || v.id)}>Повторить обработку версии</Button></div>
                </div>
              </details>}</For>
            </Show>
            <h3 class="text-lg font-bold">Возможные группы переписки</h3>
            <p class="text-sm text-slate-600">Группы построены по одинаковым извлечённым данным. Это предложения для проверки куратором. Они не меняют ручные связи и согласования.</p>
            <Show when={value().groups.length} fallback={<p>Совпадающих данных для группировки пока нет.</p>}>
              <div class="flex flex-wrap gap-3"><For each={value().groups}>{(group) => <Button onClick={() => void showReport(group.key, group.label)}>{kinds[group.kind] || group.kind}: {group.label} · документов {group.document_ids.length}</Button>}</For></div>
            </Show>
          </>}</Show>
        </section>
        <Show when={reportLoading()}><p role="status">Собираю сводку с источниками…</p></Show>
        <Show when={report()}>{(value) => <section class="border border-slate-200 bg-white p-5 space-y-4" aria-label="Сводка переписки">
          <h2 class="text-lg font-bold">Сводка переписки: {reportLabel()}</h2>
          <p class="text-sm text-slate-600">Факты и цитаты из найденных писем. Наличие ответа и принятие замечания проверяйте по тексту источников.</p>
          <Show when={value().notice}><p class="text-sm text-amber-800">{value().notice}</p></Show>
          <For each={value().sources}>{(source) => <article class="border-l-2 border-blue-300 pl-4 space-y-2"><a class="text-blue-700 underline font-bold" href={versionLink(source.document_id, source.version_id)}>{name(source.document_id)} · v{source.version_number}</a><p class="text-xs text-slate-500">{source.filename}</p><For each={source.facts}>{(fact) => <div><p><strong>{kinds[fact.kind] || fact.kind}: {fact.value}</strong></p><blockquote class="text-sm whitespace-pre-wrap break-words">«{fact.quote}»</blockquote></div>}</For></article>}</For>
        </section>}</Show>
      </Show>
    </div>
  );
}
