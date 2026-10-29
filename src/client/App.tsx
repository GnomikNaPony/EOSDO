import { Match, Show, Switch } from "solid-js";
import { AppProvider, useApp } from "./app-store";
import { Button } from "./components/ui";
import { Feedback } from "./components/Feedback";
import { WorkspaceShell } from "./layout/WorkspaceShell";
import { Registry } from "./features/Registry";
import { Detail } from "./features/Detail";
import { DocumentModal } from "./features/DocumentModal";
import { Templates } from "./features/Templates";
import { Auth } from "./features/Auth";
import { Rules } from "./features/Rules";
import { Notifications } from "./features/Notifications";
import { Kanban } from "./features/Kanban";
import { Knowledge } from "./features/Knowledge";
import { DemoPage } from "./features/DemoPage";
import "./demo.css";
function Workspace() {
  const {
    data,
    doc,
    section,
    error,
    run,
    refresh,
    ready,
    initialize,
    busy,
    demoMode,
  } = useApp();
  return (
    <Show
      when={ready()}
      fallback={
        <main class="demo-start" aria-busy={busy()}>
          <div class="demo-start-card">
            <p class="demo-eyebrow">ЕОСОД</p>
            <h1>
              {demoMode
                ? "Готовим ваше рабочее пространство"
                : "Подключение к рабочему пространству"}
            </h1>
            <Show when={error()} fallback={<p>Это займёт несколько секунд…</p>}>
              <p role="alert">{error()}</p>
              <Button
                primary
                disabled={busy()}
                onClick={() => void initialize()}
              >
                Повторить подключение
              </Button>
            </Show>
            <a href="/login">Войти в свой аккаунт</a>
          </div>
        </main>
      }
    >
      <Show
        when={!data()?.auth_required && !data()?.setup_required}
        fallback={<Auth />}
      >
        <WorkspaceShell>
          <Show when={error()}>
            <div
              role="alert"
              class="bg-red-50 text-red-800 border border-red-200 p-4 m-4"
            >
              {error()}{" "}
              <Button onClick={() => void run(refresh)}>Повторить</Button>
            </div>
          </Show>
          <Show
            when={data()}
            fallback={<p class="p-5">Подключение к серверу…</p>}
          >
            <Switch>
              <Match when={doc()}>
                <Detail />
              </Match>
              <Match when={section() === "knowledge"}>
                <Knowledge />
              </Match>
              <Match when={section() === "templates"}>
                <Templates />
              </Match>
              <Match when={section() === "rules"}>
                <Rules />
              </Match>
              <Match when={section() === "notifications"}>
                <Notifications />
              </Match>
              <Match when={section() === "kanban"}>
                <Kanban />
              </Match>
              <Match when={true}>
                <Registry />
              </Match>
            </Switch>
          </Show>
        </WorkspaceShell>
        <DocumentModal />
        <Feedback />
      </Show>
    </Show>
  );
}
export function App() {
  if (location.pathname === "/demo" || location.pathname === "/demo/")
    return <DemoPage />;
  return (
    <AppProvider>
      <Workspace />
    </AppProvider>
  );
}
