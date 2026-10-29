import { For, type ParentProps } from "solid-js";
import { useApp } from "../app-store";
import { Button, Icon } from "../components/ui";
import { api } from "../api";
import { date, nav } from "../domain";
export function WorkspaceShell(props: ParentProps) {
  const {
    data,
    doc,
    section,
    collapsed,
    setCollapsed,
    mobile,
    setMobile,
    run,
    refresh,
    setDoc,
    setModal,
    setTemplate,
    setDiff,
  } = useApp();
  return (
    <div
      class={`application ${collapsed() ? "nav-collapsed" : ""} ${mobile() ? "mobile-open" : ""}`}
    >
      <header class="topbar">
        <button
          class="icon-button"
          aria-label="Показать / скрыть навигацию"
          onClick={() =>
            window.innerWidth < 800
              ? setMobile(!mobile())
              : setCollapsed(!collapsed())
          }
        >
          <Icon name="menu" />
        </button>
        <a href="#/all" class="brand">
          <Icon name="file" />
          <span>ЕОСДО</span>
        </a>
        <div class="system-name">Рабочее пространство документов</div>
        <div class="topbar-right">
          <a href="#/search" aria-label="Поиск документов">
            <Icon name="search" />
          </a>
          <a href="#/notifications" aria-label="Уведомления">
            <Icon name="bell" />
          </a>
          <span class="top-divider" />
          <Icon name="user" />
          <span>{data()?.user?.name}</span>
          <Button
            onClick={() =>
              void run(async () => {
                await api("/api/auth/logout", {});
                setDoc(undefined);
                setModal(null);
                setTemplate(undefined);
                setDiff(undefined);
                location.hash = "/all";
                await refresh();
              })
            }
          >
            Выйти
          </Button>
        </div>
      </header>
      <aside class="sidebar" aria-label="Разделы системы">
        <div class="organization">
          <Icon name="tree" />
          <span>
            {data()?.workspace?.organization}
            <strong>{data()?.user?.department}</strong>
          </span>
        </div>
        <nav>
          <div class="tree-root">
            <Icon name="down" />
            <Icon name="folder" />
            <span>Рабочее место</span>
          </div>
          <For each={nav}>
            {([, title, children]) => (
              <details class="nav-group" open>
                <summary>
                  <Icon name="folder" />
                  <span>{title}</span>
                </summary>
                <div class="nav-children">
                  <For each={children}>
                    {([id, label]) => (
                      <a
                        href={`#/${id}`}
                        class={`nav-link ${section() === id && !doc() ? "active" : ""}`}
                        aria-current={
                          section() === id && !doc() ? "page" : undefined
                        }
                      >
                        <Icon name="file" />
                        <span>{label}</span>
                      </a>
                    )}
                  </For>
                </div>
              </details>
            )}
          </For>
          <a class="nav-link standalone" href="#/knowledge">
            <Icon name="search" />
            Данные / поиск по смыслу
          </a>
          <a class="nav-link standalone" href="#/search">
            <Icon name="search" />
            Поиск
          </a>
        </nav>
        <div class="sidebar-bottom">
          <span class="connection-dot" />
          ЕОСДО
        </div>
      </aside>
      <button
        class="nav-scrim"
        aria-label="Закрыть навигацию"
        onClick={() => setMobile(false)}
      />
      <main class="workspace" aria-label="Рабочая область">
        {props.children}
      </main>
      <footer class="statusbar">
        <span>
          <Icon name="info" />
          Рабочее пространство
        </span>
        <span>{date(new Date().toISOString())}</span>
      </footer>
    </div>
  );
}
