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
import type { Bootstrap, Document, Template } from "./types";
import { labels } from "./domain";
function createAppStore() {
  const [data, setData] = createSignal<Bootstrap>();
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
    setPage(1);
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
      setDoc(next);
      setTab(new URLSearchParams(params).get("tab") || "general");
    } else {
      setDoc(undefined);
      setSection(hash || "all");
    }
    setMobile(false);
  }
  onMount(() => {
    void run(async () => {
      await refresh();
      if (!data()?.setup_required && !data()?.auth_required) await route();
    });
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
          (!query() ||
            [d.title, d.number, person(d.owner_id), d.summary]
              .join(" ")
              .toLowerCase()
              .includes(query().toLowerCase())) &&
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
      `#/doc/${encodeURIComponent(doc()!.id)}?tab=${value}`,
    );
  };

  return {
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
    setVersionId,
    diff,
    setDiff,
    selected,
    setSelected,
    page,
    setPage,
    template,
    setTemplate,
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
