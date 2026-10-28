import { createSignal, Show } from "solid-js";
import { useApp } from "../app-store";
import { api } from "../api";
import { Button } from "../components/ui";
export function Auth() {
  const { data, run, refresh, route, busy, error } = useApp();
  const [mode, setMode] = createSignal<"login" | "register">(
    data()?.setup_required ? "register" : "login",
  );
  const registering = () => mode() === "register";
  return (
    <main class="min-h-dvh bg-slate-100 flex items-center justify-center p-5">
      <section class="bg-white border border-slate-200 shadow-sm w-full max-w-lg p-8">
        <p class="text-blue-800 font-semibold">ЕОСДО</p>
        <h1 class="text-2xl font-semibold mt-3 mb-2">
          {registering()
            ? "Создайте учётную запись"
            : "Войдите в рабочее пространство"}
        </h1>
        <p class="text-slate-600 mb-6">
          {data()?.setup_required
            ? "Начните с ваших данных. Документы и шаблоны появятся после ручной загрузки."
            : "Документы и личные настройки привязаны к вашей учётной записи."}
        </p>
        <form
          class="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const values = Object.fromEntries(new FormData(e.currentTarget));
            void run(async () => {
              await api(
                registering() ? "/api/auth/register" : "/api/auth/login",
                values,
              );
              await refresh();
              await route();
            });
          }}
        >
          <label class="field">
            <span>Электронная почта</span>
            <input
              type="email"
              name="email"
              required
              maxlength="254"
              autocomplete="username"
            />
          </label>
          <label class="field">
            <span>Пароль</span>
            <input
              type="password"
              name="password"
              required
              minlength={registering() ? 8 : undefined}
              maxlength="128"
              autocomplete={registering() ? "new-password" : "current-password"}
            />
          </label>
          <Show when={registering()}>
            <label class="field">
              <span>Ваше имя</span>
              <input name="name" required maxlength="150" autocomplete="name" />
            </label>
            <label class="field">
              <span>Организация</span>
              <input
                name="organization"
                required
                maxlength="200"
                autocomplete="organization"
              />
            </label>
            <label class="field">
              <span>Подразделение</span>
              <input name="department" required maxlength="200" />
            </label>
            <p class="text-xs text-slate-500">
              Используйте пароль от 8 символов. Первый пользователь создаёт
              рабочее пространство и получает права куратора.
            </p>
          </Show>
          <Show when={error()}>
            <p role="alert" class="text-red-700">
              {error()}
            </p>
          </Show>
          <div class="flex flex-wrap items-center justify-between gap-3">
            <Button primary type="submit" disabled={busy()}>
              {registering() ? "Зарегистрироваться" : "Войти"}
            </Button>
            <Button
              onClick={() => setMode(registering() ? "login" : "register")}
            >
              {registering()
                ? "Уже есть учётная запись"
                : "Создать учётную запись"}
            </Button>
          </div>
        </form>
      </section>
    </main>
  );
}
