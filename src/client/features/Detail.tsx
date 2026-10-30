import { DocumentNormocontrol } from "./document/DocumentNormocontrol";
import { DocumentGeneral } from "./document/DocumentGeneral";
import { DocumentVersions } from "./document/DocumentVersions";
import { DocumentComments } from "./document/DocumentComments";
import { DocumentApproval } from "./document/DocumentApproval";
import { DocumentAi } from "./document/DocumentAi";
import { DocumentHistory } from "./document/DocumentHistory";
import { DocumentLinked } from "./document/DocumentLinked";
import { useApp } from "../app-store";
import { For } from "solid-js";
import { labels } from "../domain";
import { Button } from "../components/ui";
export function Detail() {
  const { doc, tab, refresh, run, action, changeTab } = useApp();
  return (
    <>
      <div class="workspace-toolbar">
        <a class="button" href="#/all">
          ← К списку
        </a>
        <div class="toolbar-right">
          <Button
            icon="star"
            onClick={() =>
              void run(() => action(`/api/documents/${doc()!.id}/favorite`, {}))
            }
          >
            В избранное
          </Button>
          <Button icon="refresh" onClick={() => void run(refresh)}>
            Обновить
          </Button>
        </div>
      </div>
      <div class="title-row">
        <h1>{doc()?.number}</h1>
        <span>{labels[doc()!.status]}</span>
      </div>
      <div class="px-5 pb-4 text-base font-semibold">{doc()?.title}</div>
      <div class="document-tabs" role="tablist" aria-label="Разделы карточки">
        <For
          each={[
            ["general", "Основные реквизиты"],
            ["versions", "Файлы и версии"],
            ["approval", "Согласование и подписание"],
            ["comments", "Замечания"],
            ["normocontrol", "Нормоконтроль"],
            ["ai", "ИИ-проверка"],
            ["linked", "Связанные документы"],
            ["history", "История"],
          ]}
        >
          {([id, label]) => (
            <button
              role="tab"
              aria-selected={tab() === id}
              onClick={() => changeTab(id!)}
            >
              {label}
            </button>
          )}
        </For>
      </div>
      <div class="card-panel">
        <DocumentGeneral />
        <DocumentVersions />
        <DocumentComments />
        <DocumentApproval />
        <DocumentNormocontrol />
        <DocumentAi />
        <DocumentHistory />
        <DocumentLinked />
      </div>
    </>
  );
}
