import { Show } from "solid-js";
import { useApp } from "../app-store";
import { Button } from "./ui";
export function Feedback() {
  const { toast, diff, setDiff } = useApp();
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
        <div class="fixed inset-0 z-50 bg-slate-950/40 flex items-center justify-center p-4">
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Сравнение версий"
            class="bg-white p-5 max-w-5xl w-full max-h-[90dvh] overflow-auto"
          >
            <div class="flex justify-between">
              <h2>Сравнение извлечённого текста</h2>
              <Button onClick={() => setDiff(undefined)}>Закрыть</Button>
            </div>
            <pre class="whitespace-pre-wrap break-words bg-slate-50 p-4">
              {diff()}
            </pre>
          </section>
        </div>
      </Show>
    </>
  );
}
