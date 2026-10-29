import { Show } from "solid-js";
import { useApp } from "../app-store";
import { DocumentDiff } from "../features/document/DocumentDiff";
export function Feedback() {
  const { toast, diff } = useApp();
  return (
    <>
      <Show when={toast()}>
        <div
          class="fixed bottom-10 left-1/2 -translate-x-1/2 z-[60] bg-blue-950 text-white px-5 py-3 shadow-lg max-w-[90vw] break-words"
          role="status"
        >
          {toast()}
        </div>
      </Show>
      <Show when={diff() !== undefined}>
        <DocumentDiff />
      </Show>
    </>
  );
}
