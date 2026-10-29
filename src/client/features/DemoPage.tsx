import { createSignal, For } from "solid-js";
import qrcode from "qrcode-generator";

export function DemoPage() {
  const target = new URL("/", location.origin).href;
  const qr = qrcode(0, "M");
  qr.addData(target);
  qr.make();
  const count = qr.getModuleCount();
  const cells = Array.from({ length: count * count }, (_, index) => ({
    x: index % count,
    y: Math.floor(index / count),
  })).filter(({ x, y }) => qr.isDark(y, x));
  const [message, setMessage] = createSignal("");
  async function copy() {
    try {
      await navigator.clipboard.writeText(target);
      setMessage("Ссылка скопирована");
    } catch {
      setMessage("Выделите и скопируйте ссылку ниже");
    }
  }
  return (
    <main class="demo-page">
      <header class="demo-page-header">
        <a class="demo-wordmark" href="/">
          ЕОСОД<span>Работа с документами</span>
        </a>
        <a href="/login">Вход в аккаунт</a>
      </header>
      <section class="demo-invite">
        <div class="demo-invite-copy">
          <p class="demo-eyebrow">Демонстрационное пространство</p>
          <h1>
            Документы под рукой.
            <br />
            Даже на телефоне.
          </h1>
          <p class="demo-description">
            Наведите камеру на QR-код и попробуйте ЕОСОД: откройте документ,
            изучите версии или создайте свой.
          </p>
          <p class="demo-private-note">
            При каждом открытии — новый личный профиль с вымышленными рабочими
            документами. Ваши изменения доступны только в этой демосессии.
          </p>
          <a class="demo-primary-link" href="/">
            Открыть демо <span aria-hidden="true">↗</span>
          </a>
        </div>
        <div class="demo-qr-card">
          <p class="demo-qr-caption">Откройте камеру телефона</p>
          <svg
            class="demo-qr"
            viewBox={`0 0 ${count + 8} ${count + 8}`}
            role="img"
            aria-label={`QR-код: ${target}`}
            shape-rendering="crispEdges"
          >
            <rect width={count + 8} height={count + 8} fill="#fff" />
            <For each={cells}>
              {({ x, y }) => (
                <rect x={x + 4} y={y + 4} width="1" height="1" fill="#132c42" />
              )}
            </For>
          </svg>
          <a class="demo-domain" href={target}>
            {location.host}
          </a>
          <label class="demo-link-label">
            Ссылка на демо
            <input
              aria-label="Ссылка на демо"
              readonly
              value={target}
              onFocus={(event) => event.currentTarget.select()}
            />
          </label>
          <button class="demo-copy-button" onClick={() => void copy()}>
            Скопировать ссылку
          </button>
          <p class="demo-copy-status" role="status">
            {message()}
          </p>
        </div>
      </section>
      <footer class="demo-page-footer">
        ЕОСОД · Реестр, версии и согласование документов
      </footer>
    </main>
  );
}
