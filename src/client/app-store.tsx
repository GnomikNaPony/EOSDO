import {
  createContext,
  useContext,
  createSignal,
  createMemo,
  createEffect,
  onMount,
  onCleanup,
  type ParentProps,
} from "solid-js";
import { api } from "./api";
import type { Bootstrap, Document, Template, FileSearchResults } from "./types";
import { labels } from "./domain";
function createAppStore() {
  const [data, setData] = createSignal<Bootstrap>();
  const [ready, setReady] = createSignal(false);
  const demoMode =
    location.pathname !== "/login" && location.pathname !== "/login/";
  const [doc, setDoc] = createSignal<Document>();
  const [section, setSection] = createSignal("all");
  const [tab, setTab] = createSignal("general");
  const [query, setQuery] = createSignal("");
  const [type, setType] = createSignal("");
  const [status, setStatus] = createSignal("");
  const [from, setFrom] = createSignal("");
  const [to, setTo] = createSignal("");
  const [collapsed, setCollapsed] = createSignal(false);
  const [mobile, setMobile] = createSignal(false);
  const [error, setError] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [toast, setToast] = createSignal("");
  const [modal, setModal] = createSignal<"create" | "template" | null>(null);
  const [versionId, setVersionId] = createSignal("");
  const [diff, setDiff] = createSignal<string>();
  const [selected, setSelected] = createSignal<string[]>([]);
  const [page, setPage] = createSignal(1);
  const [template, setTemplate] = createSignal<Template>();
  const [searchScope, setSearchScope] = createSignal("all");
  const [searchHistory, setSearchHistory] = createSignal("all");
  const [searchResults, setSearchResults] = createSignal<FileSearchResults>();
  const [searchLoading, setSearchLoading] = createSignal(false);
  const [searchError, setSearchError] = createSignal("");
  const [searchNonce, setSearchNonce] = createSignal(0);
  let searchRequest = 0;
  let toastTimer: ReturnType<typeof setTimeout>;
  const notify = (text: string) => {
    setToast(text);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => setToast(""), 5000);
  };
  const person = (id: string) =>
    data()?.users.find((x) => x.id === id)?.name || id;
  async function refresh() {
    const documentId = doc()?.id;
    const bootstrap = await api<Bootstrap>("/api/bootstrap");
    setData(bootstrap);
    if (bootstrap.auth_required || bootstrap.setup_required) {
      setDoc(undefined);
      return;
    }
    if (documentId && doc()?.id === documentId) {
      const updated = await api<Document>("/api/documents/" + documentId);
      if (doc()?.id === documentId) setDoc(updated);
    }
  }
  async function run(action: () => Promise<void>) {
    setError("");
    setBusy(true);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  let navigation = 0;
  createEffect(() => {
    query();
    type();
    status();
    from();
    to();
    section();
    searchScope();
    searchHistory();
    setPage(1);
  });
  createEffect(() => {
    const bootstrap = data();
    const folder = section();
    const text = query().trim();
    const params = new URLSearchParams({
      q: text,
      type: type(),
      status: status(),
      from: from(),
      to: to(),
      scope: searchScope(),
      history: searchHistory(),
      folder,
    });
    searchNonce();
    const active =
      !doc() &&
      [
        "all",
        "mine",
        "active",
        "review",
        "revision",
        "done",
        "favorites",
        "search",
      ].includes(folder);
    const request = ++searchRequest;
    setSearchResults(undefined);
    setSearchError("");
    setSearchLoading(false);
    if (!text || !active || !bootstrap?.user || bootstrap.auth_required) return;
    setSearchLoading(true);
    const timer = setTimeout(async () => {
      try {
        const response = await api<FileSearchResults>(`/api/search?${params}`);
        if (request !== searchRequest) return;
        setSearchResults(response);
      } catch (error) {
        if (request === searchRequest)
          setSearchError(
            error instanceof TypeError
              ? "Нет соединения с сервером. Повторите поиск."
              : error instanceof Error
                ? error.message
                : "Поиск недоступен",
          );
      } finally {
        if (request === searchRequest) setSearchLoading(false);
      }
    }, 250);
    onCleanup(() => {
      clearTimeout(timer);
      searchRequest++;
    });
  });
  async function route() {
    const request = ++navigation;
    const hash = location.hash.slice(2);
    if (hash.startsWith("doc/")) {
      const [id, params] = hash.slice(4).split("?");
      const next = await api<Document>(
        "/api/documents/" + encodeURIComponent(decodeURIComponent(id || "")),
      );
      if (request !== navigation || location.hash.slice(2) !== hash) return;
      const search = new URLSearchParams(params);
      const requestedVersion = search.get("version") || "";
      if (
        requestedVersion &&
        !next.versions.some((v) => v.id === requestedVersion)
      )
        throw new Error("Указанная версия документа не найдена");
      setDoc(next);
      setVersionId(requestedVersion);
      setTab(search.get("tab") || "general");
    } else {
      setDoc(undefined);
      setSection(hash || "all");
    }
    setMobile(false);
  }
  async function initialize() {
    setReady(false);
    await run(async () => {
      if (demoMode) {
        await api("/api/auth/demo", {});
        history.replaceState(
          null,
          "",
          location.pathname + location.search + "#/all",
        );
      }
      await refresh();
      if (!demoMode && data()?.user?.demo_id) {
        await api("/api/auth/logout", {});
        await refresh();
      }
      if (!data()?.setup_required && !data()?.auth_required) await route();
      setReady(true);
    });
  }
  onMount(() => {
    void initialize();
    const handler = () => void run(route);
    window.addEventListener("hashchange", handler);
    onCleanup(() => window.removeEventListener("hashchange", handler));
    onCleanup(() => clearTimeout(toastTimer));
  });
  const heading = () =>
    ({
      all: "Все документы",
      mine: "Созданные мной",
      active: "Задачи/уведомления",
      review: "Рассмотрение",
      revision: "Доработка / исправление",
      done: "Обработанные",
      favorites: "Избранные",
      notifications: "Уведомления",
      templates: "Мои шаблоны",
      rules: "Правила ИИ-проверки",
      kanban: "Канбан куратора",
    })[section()] || "Поиск";
  const rows = createMemo(
    () =>
      data()?.documents.filter(
        (d) =>
          (!query().trim() ||
            searchResults()?.items.some((item) => item.document_id === d.id)) &&
          (!type() || d.type === type()) &&
          (!status() || d.status === status()) &&
          (!from() || d.due >= from()) &&
          (!to() || d.due <= to()) &&
          (section() !== "favorites" || d.favorite) &&
          (section() !== "mine" || d.owner_id === data()?.user?.id) &&
          (!["review", "revision", "done"].includes(section()) ||
            d.status === section()) &&
          (section() !== "active" || !["approved", "done"].includes(d.status)),
      ) || [],
  );
  const version = () =>
    doc()?.versions.find((v) => v.id === versionId()) || doc()?.versions[0];
  function exportList() {
    const csv =
      "\uFEFF" +
      [
        ["Номер", "Наименование", "Статус", "Срок"],
        ...rows().map((d) => [
          d.number,
          d.title,
          labels[d.status] || d.status,
          d.due,
        ]),
      ]
        .map((row) =>
          row.map((s) => '"' + s.replaceAll('"', '""') + '"').join(";"),
        )
        .join("\r\n");
    download(csv, "Реестр.csv", "text/csv;charset=utf-8");
  }
  function download(content: string, name: string, mime = "application/json") {
    const url = URL.createObjectURL(new Blob([content], { type: mime }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const action = async (path: string, body: unknown) => {
    await api(path, body);
    await refresh();
    notify("Изменения сохранены");
  };
  const changeTab = (value: string) => {
    setTab(value);
    history.replaceState(
      null,
      "",
      `#/doc/${encodeURIComponent(doc()!.id)}?tab=${value}${versionId() ? `&version=${encodeURIComponent(versionId())}` : ""}`,
    );
  };

  return {
    ready,
    initialize,
    demoMode,
    data,
    setData,
    doc,
    setDoc,
    section,
    setSection,
    tab,
    setTab,
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
    collapsed,
    setCollapsed,
    mobile,
    setMobile,
    error,
    setError,
    busy,
    setBusy,
    toast,
    setToast,
    modal,
    setModal,
    versionId,
    setVersionId: (value: string) => {
      setVersionId(value);
      if (doc())
        history.replaceState(
          null,
          "",
          `#/doc/${encodeURIComponent(doc()!.id)}?tab=${tab()}&version=${encodeURIComponent(value)}`,
        );
    },
    diff,
    setDiff,
    selected,
    setSelected,
    page,
    setPage,
    template,
    setTemplate,
    searchScope,
    setSearchScope,
    searchHistory,
    setSearchHistory,
    searchResults,
    searchLoading,
    searchError,
    searchNow: () => setSearchNonce((value) => value + 1),
    notify,
    person,
    refresh,
    run,
    route,
    heading,
    rows,
    version,
    exportList,
    download,
    action,
    changeTab,
  };
}
export type AppStore = ReturnType<typeof createAppStore>;
const AppContext = createContext<AppStore>();
export function AppProvider(props: ParentProps) {
  const store = createAppStore();
  return (
    <AppContext.Provider value={store}>{props.children}</AppContext.Provider>
  );
}
export function useApp() {
  const store = useContext(AppContext);
  if (!store) throw new Error("AppProvider is required");
  return store;
}
