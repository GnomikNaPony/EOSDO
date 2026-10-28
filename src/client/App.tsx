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
function Workspace() {
  const { data, doc, section, error, run, refresh } = useApp();
  return (
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
  );
}
export function App() {
  return (
    <AppProvider>
      <Workspace />
    </AppProvider>
  );
}
