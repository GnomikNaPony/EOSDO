import { useApp } from "../app-store";
import { For } from "solid-js";
import { Index } from "solid-js";
import { createSignal } from "solid-js";
import { createEffect } from "solid-js";
import { type RouteStep } from "../types";
import { Button } from "../components/ui";
export function RouteEditor(p: { initial: RouteStep[] }) {
  const { data } = useApp();
  const [steps, setSteps] = createSignal<RouteStep[]>(
    p.initial.map((s) => ({ ...s })),
  );
  createEffect(() => setSteps(p.initial.map((s) => ({ ...s }))));
  const update = (i: number, patch: Partial<RouteStep>) =>
    setSteps(steps().map((s, j) => (i === j ? { ...s, ...patch } : s)));
  const move = (i: number, delta: number) => {
    const copy = [...steps()];
    const target = i + delta;
    if (target < 0 || target >= copy.length) return;
    [copy[i], copy[target]] = [copy[target]!, copy[i]!];
    setSteps(copy);
  };
  return (
    <div class="col-span-full">
      <h3>Маршрут согласования и подписания</h3>
      <input
        type="hidden"
        name="route_config"
        value={JSON.stringify(steps())}
      />
      <Index each={steps()}>
        {(s, i) => (
          <div class="flex flex-wrap gap-2 items-center mb-2">
            <span>{i + 1}.</span>
            <select
              aria-label="Участник этапа"
              value={s().user_id}
              onChange={(e) => update(i, { user_id: e.currentTarget.value })}
            >
              <For each={data()?.users}>
                {(u) => <option value={u.id}>{u.name}</option>}
              </For>
            </select>
            <select
              aria-label="Вид этапа"
              value={s().kind}
              onChange={(e) => update(i, { kind: e.currentTarget.value })}
            >
              <option value="review">Согласование</option>
              <option value="sign">Подписание</option>
            </select>
            <label>
              <input
                aria-label="Дней на этап"
                class="w-16"
                type="number"
                min="1"
                max="365"
                value={s().days}
                onInput={(e) =>
                  update(i, { days: Number(e.currentTarget.value) })
                }
              />{" "}
              дн.
            </label>
            <Button onClick={() => move(i, -1)}>↑</Button>
            <Button onClick={() => move(i, 1)}>↓</Button>
            <Button onClick={() => setSteps(steps().filter((_, j) => j !== i))}>
              Удалить
            </Button>
          </div>
        )}
      </Index>
      <Button
        disabled={steps().length >= 20}
        onClick={() =>
          setSteps([
            ...steps(),
            {
              user_id: data()!.users[0]!.id,
              kind: steps().some((s) => s.kind === "sign") ? "sign" : "review",
              days: 1,
            },
          ])
        }
      >
        Добавить этап
      </Button>
    </div>
  );
}
