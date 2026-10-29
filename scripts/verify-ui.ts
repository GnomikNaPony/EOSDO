import { chromium } from "playwright";
import { SQL } from "bun";
import { mkdir } from "node:fs/promises";

Bun.env.INTELLIGENCE_WORKER_ENABLED = "0";

// Own a temporary database; browser fixtures never enter the working registry.
const databaseUrl = Bun.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const admin = new SQL(databaseUrl);
const database = `eosdo_ui_${crypto.randomUUID().replaceAll("-", "")}`;
await admin.unsafe(`CREATE DATABASE "${database}"`);
const url = new URL(databaseUrl);
url.pathname = `/${database}`;
Bun.env.DATABASE_URL = url.toString();
const { connect, migrate } = await import("../src/server/store");
const { createApp } = await import("../src/server/index");
const services = await connect();
await migrate(services.sql);
const app = await createApp(services);
const address = await app.listen({ host: "127.0.0.1", port: 0 });
Bun.env.APP_ORIGIN = address;
let browser;
try {
  browser = await chromium.launch({
    executablePath: Bun.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(address + "/login");
  await page.locator('[name="email"]').fill("browser@example.test");
  await page.locator('[name="password"]').fill("browser-test-password");
  await page.locator('[name="name"]').fill("Оператор проверки");
  await page.locator('[name="organization"]').fill("Организация проверки");
  await page.locator('[name="department"]').fill("Отдел проверки");
  await page
    .getByRole("button", { name: "Зарегистрироваться", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Все документы", exact: true })
    .waitFor();
  if (await page.getByText("Елена Кузнецова", { exact: true }).count())
    throw new Error("Mock account is visible");
  const bootstrap = await page.request.get(address + "/api/bootstrap");
  const initial = (await bootstrap.json()) as {
    documents: unknown[];
    user: { id: string };
  };
  if (initial.documents.length)
    throw new Error("A new workspace contains seeded documents");
  await page
    .getByRole("button", { name: "Создать проект документа", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  const title = "Ручная загрузка из профиля";
  await dialog.locator('[name="title"]').fill(title);
  await dialog.locator('[name="due"]').fill("2027-01-01");
  await dialog.getByRole("button", { name: "Сохранить", exact: true }).click();
  await page.getByText(title, { exact: true }).first().waitFor();
  await page.getByRole("tab", { name: "Файлы и версии", exact: true }).click();
  const source = Bun.file("templates/Служебная записка.md");
  await page.locator('[name="file"]').setInputFiles({
    name: "Служебная записка.md",
    mimeType: "text/markdown",
    buffer: Buffer.from(await source.arrayBuffer()),
  });
  await page.locator('[name="message"]').fill("Загрузка документа-примера");
  await page
    .getByRole("button", { name: "Загрузить новую версию", exact: true })
    .click();
  const download = page.getByRole("link", {
    name: "Скачать оригинал",
    exact: true,
  });
  await download.waitFor();
  const original = await page.request.get(
    address + (await download.getAttribute("href"))!,
  );
  if (!original.ok() || (await original.text()) !== (await source.text()))
    throw new Error("Uploaded original bytes differ");
  const documentId = new URL(page.url()).hash.split("/doc/")[1]?.split("?")[0];
  const detail = (await (
    await page.request.get(address + "/api/documents/" + documentId)
  ).json()) as { versions: { author_id: string }[] };
  if (detail.versions[0]?.author_id !== initial.user.id)
    throw new Error("Upload is not attributed to the signed-in profile");
  const savedUrl = page.url();
  // Independent before/after fixture: only the deadline line changes.
  const oldLine = "- Срок: [календарная дата]";
  const newLine = "- Срок: 31.12.2026";
  await page.locator('[name="file"]').setInputFiles({
    name: "revision.md",
    mimeType: "text/markdown",
    buffer: Buffer.from((await source.text()).replace(oldLine, newLine)),
  });
  await page.locator('[name="message"]').fill("Уточнён срок");
  await page
    .getByRole("button", { name: "Загрузить новую версию", exact: true })
    .click();
  await page.getByRole("button", { name: /v2 · Актуальная/ }).waitFor();
  await page
    .getByRole("button", { name: "Показать до / после", exact: true })
    .click();
  const comparison = page.getByRole("dialog", {
    name: "Сравнение версий",
    exact: true,
  });
  await comparison.waitFor();
  if (
    (
      await comparison.locator(".diff-removed .diff-text").textContent()
    )?.trim() !==
      "− " + oldLine ||
    (
      await comparison.locator(".diff-added .diff-text").textContent()
    )?.trim() !==
      "+ " + newLine
  )
    throw new Error("Before/after does not isolate the changed deadline");
  await mkdir("test-results", { recursive: true });
  await page.screenshot({
    path: "test-results/version-diff-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  if (
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
  )
    throw new Error("Diff dialog overflows mobile viewport");
  await page.screenshot({
    path: "test-results/version-diff-mobile.png",
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await comparison.waitFor({ state: "detached" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page
    .getByRole("button", { name: "Показать до / после", exact: true })
    .click();
  await comparison.locator(".diff-removed .diff-text").click();
  await page
    .getByRole("heading", { name: "Замечания к версиям", exact: true })
    .waitFor();
  if ((await page.locator('[name="anchor"]').inputValue()) !== oldLine)
    throw new Error("The diff anchor was not transferred to the remark");
  const remarkVersion = await page.locator('[name="version_id"]').inputValue();
  const firstVersion = (
    await (
      await page.request.get(address + "/api/documents/" + documentId)
    ).json()
  ).versions.find((v: { number: number }) => v.number === 1).id;
  if (remarkVersion !== firstVersion)
    throw new Error("Remark targets the wrong diff side");
  await page.locator('[name="text"]').fill("Проверить срок до исправления");
  await page.locator('[name="blocking"]').check();
  await page
    .getByRole("button", { name: "Добавить замечание", exact: true })
    .click();
  const remark = page
    .locator("article.comment")
    .filter({ hasText: "Проверить срок до исправления" });
  await remark.waitFor();
  await remark
    .getByRole("button", { name: "Отметить исправление", exact: true })
    .click();
  await remark
    .getByText("Исправление заявлено в v2", { exact: true })
    .waitFor();
  await remark
    .getByRole("button", { name: "Подтвердить устранение", exact: true })
    .click();
  await remark
    .getByText("Устранение подтверждено в v2", { exact: true })
    .waitFor();
  await remark.getByText("История замечания", { exact: true }).click();
  if (
    !(await remark.locator("details").textContent())?.includes(
      "Исправлено · ожидает проверки → Устранение подтверждено",
    )
  )
    throw new Error("The remark status history was not preserved");
  await remark
    .getByRole("button", { name: "Открыть исправление", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Файлы и версии документа", exact: true })
    .waitFor();

  const createdOther = await page.request.post(address + "/api/documents", {
    data: {
      title: "Другая карточка",
      type: "Письмо",
      due: "2027-01-01",
      priority: "normal",
    },
  });
  if (!createdOther.ok()) throw new Error("Cannot create navigation target");
  const otherId = ((await createdOther.json()) as { id: string }).id;
  // A late diff must not open over another document.
  let releaseDiff!: () => void;
  let diffStarted!: () => void;
  const heldDiff = new Promise<void>((resolve) => {
    releaseDiff = resolve;
  });
  const startedDiff = new Promise<void>((resolve) => {
    diffStarted = resolve;
  });
  const diffPattern = "**/api/versions/*/diff*";
  await page.route(diffPattern, async (route) => {
    const response = await route.fetch();
    diffStarted();
    await heldDiff;
    await route.fulfill({ response });
  });
  const diffResponse = page.waitForResponse((response) =>
    response.url().includes("/diff"),
  );
  await page
    .getByRole("button", { name: "Показать до / после", exact: true })
    .click();
  await startedDiff;
  await page.evaluate((id) => {
    location.hash = "/doc/" + id + "?tab=versions";
  }, otherId);
  await page.getByText("Другая карточка", { exact: true }).first().waitFor();
  releaseDiff();
  await diffResponse;
  await page
    .getByRole("button", { name: "Загрузить новую версию", exact: true })
    .waitFor({ state: "visible" });
  await page.waitForFunction(
    () => !document.querySelector('button[type="submit"]:disabled'),
  );
  if (
    await page
      .getByRole("dialog", { name: "Сравнение версий", exact: true })
      .count()
  )
    throw new Error("Late diff opened over another document");
  await page.unroute(diffPattern);
  await page.evaluate((id) => {
    location.hash = "/doc/" + id + "?tab=versions";
  }, documentId!);
  await page
    .getByRole("heading", { name: "Файлы и версии документа", exact: true })
    .waitFor();
  await page.getByRole("button", { name: /v2 · Актуальная/ }).waitFor();

  await page.locator('[name="file"]').setInputFiles({
    name: "race.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Отложенная загрузка"),
  });
  await page
    .locator('[name="message"]')
    .fill("Проверка перехода во время чтения файла");
  await page.evaluate(() => {
    const read = File.prototype.arrayBuffer;
    File.prototype.arrayBuffer = async function () {
      if (this.name === "race.txt")
        await new Promise<void>((resolve) => {
          Reflect.set(window, "releaseUpload", resolve);
        });
      return read.call(this);
    };
  });
  const uploaded = page.waitForResponse(
    (response) =>
      response.url() ===
        address + "/api/documents/" + documentId + "/versions" &&
      response.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Загрузить новую версию", exact: true })
    .click();
  await page.waitForFunction(
    () => typeof Reflect.get(window, "releaseUpload") === "function",
  );
  await page.evaluate((id) => {
    location.hash = "/doc/" + id + "?tab=versions";
  }, otherId);
  await page.getByText("Другая карточка", { exact: true }).first().waitFor();
  await page.evaluate(() => Reflect.get(window, "releaseUpload")());
  if (!(await uploaded).ok())
    throw new Error("Deferred original upload failed");
  const otherDetail = (await (
    await page.request.get(address + "/api/documents/" + otherId)
  ).json()) as { versions: unknown[] };
  const originalDetail = (await (
    await page.request.get(address + "/api/documents/" + documentId)
  ).json()) as { versions: unknown[] };
  if (otherDetail.versions.length || originalDetail.versions.length !== 3)
    throw new Error("Navigation redirected upload to the wrong document");
  // Hold an earlier navigation response and finish a newer registry navigation first.
  let releaseNavigation!: () => void;
  const delayed = new Promise<void>((resolve) => {
    releaseNavigation = resolve;
  });
  let requested!: () => void;
  const requestStarted = new Promise<void>((resolve) => {
    requested = resolve;
  });
  const pattern = "**/api/documents/" + documentId;
  await page.route(pattern, async (request) => {
    const response = await request.fetch();
    requested();
    await delayed;
    await request.fulfill({ response });
  });
  await page.evaluate((id) => {
    location.hash = "/doc/" + id;
  }, documentId);
  await requestStarted;
  await page.evaluate(() => {
    location.hash = "/all";
  });
  await page
    .getByRole("heading", { name: "Все документы", exact: true })
    .waitFor();
  const responseFinished = page.waitForResponse(
    address + "/api/documents/" + documentId,
  );
  releaseNavigation();
  await responseFinished;
  await page
    .getByRole("heading", { name: "Все документы", exact: true })
    .waitFor();
  await page.unroute(pattern);
  await page.goto(savedUrl);
  await download.waitFor();
  await page.getByRole("button", { name: "Выйти", exact: true }).click();
  await page.locator('[name="email"]').fill("browser@example.test");
  await page.locator('[name="password"]').fill("browser-test-password");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await page
    .getByRole("heading", { name: "Все документы", exact: true })
    .waitFor();
  await page.goto(savedUrl);
  await download.waitFor();
  await page.reload();
  await download.waitFor();
  await mkdir("test-results", { recursive: true });
  await page.screenshot({
    path: "test-results/solid-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/solid-mobile.png",
    fullPage: true,
  });
  await page.goto(address + "/login#/knowledge");
  await page
    .getByRole("heading", { name: "Данные из документов", exact: true })
    .waitFor();
  await page
    .getByRole("heading", { name: "Обзор обработки · куратор", exact: true })
    .waitFor();
  await page
    .getByRole("searchbox", { name: "Что нужно найти" })
    .fill("проверка источника");
  const semantic = page.waitForResponse((response) =>
    response.url().includes("/api/intelligence/search?"),
  );
  await page
    .getByRole("button", { name: "Найти по смыслу", exact: true })
    .click();
  if (!(await semantic).ok()) throw new Error("Pending semantic index failed");
  await page
    .getByText("Смысловой индекс ещё не готов.", { exact: false })
    .waitFor();
  await page.screenshot({
    path: "test-results/intelligence-pending-mobile.png",
    fullPage: true,
  });
  // Public demo creates a fresh private identity on every full page load.
  await page.goto(address + "/");
  await page
    .getByRole("heading", { name: "Все документы", exact: true })
    .waitFor();
  const demoFirst = (await (
    await page.request.get(address + "/api/bootstrap")
  ).json()) as {
    user: { id: string };
    documents: { id: string; title: string }[];
    templates: unknown[];
  };
  if (
    !demoFirst.documents.length ||
    !demoFirst.templates.length ||
    demoFirst.user.id === initial.user.id
  )
    throw new Error("Demo is missing private example documents/templates");
  const demoDocument = demoFirst.documents[0]!;
  await page
    .getByRole("link", { name: demoDocument.title, exact: true })
    .first()
    .click();
  await page.getByRole("tab", { name: "Файлы и версии", exact: true }).click();
  await page
    .getByRole("link", { name: "Скачать оригинал", exact: true })
    .first()
    .waitFor();
  await page
    .getByRole("button", { name: "Показать до / после", exact: true })
    .click();
  const demoDiff = page.getByRole("dialog", {
    name: "Сравнение версий",
    exact: true,
  });
  await demoDiff.waitFor();
  await demoDiff.locator(".diff-added").first().waitFor();
  await page.screenshot({
    path: "test-results/demo-versions-diff-mobile.png",
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await demoDiff.waitFor({ state: "detached" });
  await page.getByRole("tab", { name: "Замечания", exact: true }).click();
  await page.locator("article.comment").first().waitFor();
  await page.locator("article.comment details summary").first().click();
  await page.screenshot({
    path: "test-results/demo-version-remark-mobile.png",
    fullPage: true,
  });
  // Show v1 -> v3 and a complete historical resolution without uploading anything.
  const archive = demoFirst.documents.find(
    (d) => d.title === "Запуск электронного архива обращений",
  )!;
  await page.evaluate((id) => {
    location.hash = "/doc/" + id + "?tab=versions";
  }, archive.id);
  await page.getByRole("button", { name: /v3 · Актуальная/ }).waitFor();
  const archiveDetail = await (
    await page.request.get(address + "/api/documents/" + archive.id)
  ).json();
  await page
    .getByRole("combobox", { name: "Базовая версия", exact: true })
    .selectOption(
      archiveDetail.versions.find((v: { number: number }) => v.number === 1).id,
    );
  await page.setViewportSize({ width: 1440, height: 900 });
  await page
    .getByRole("button", { name: "Показать до / после", exact: true })
    .click();
  await demoDiff.waitFor();
  await demoDiff
    .getByText("+ Срок пилота: 2–13 ноября 2026 года.", { exact: true })
    .waitFor();
  await page.screenshot({
    path: "test-results/demo-versions-diff-desktop.png",
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await demoDiff.waitFor({ state: "detached" });
  await page.getByRole("tab", { name: "Замечания", exact: true }).click();
  await page
    .getByText("Устранение подтверждено в v2", { exact: true })
    .waitFor();
  await page.getByText("История замечания", { exact: true }).click();
  await page
    .getByText(/Исправлено · ожидает проверки → Устранение подтверждено/)
    .waitFor();
  await page.screenshot({
    path: "test-results/demo-version-remark-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page
    .getByRole("heading", { name: "Все документы", exact: true })
    .waitFor();
  const demoSecond = (await (
    await page.request.get(address + "/api/bootstrap")
  ).json()) as typeof demoFirst;
  if (
    demoSecond.user.id === demoFirst.user.id ||
    demoSecond.documents.some((document) => document.id === demoDocument.id)
  )
    throw new Error("Reload reused the previous demo identity/documents");
  if (
    (await page.request.get(address + "/api/documents/" + demoDocument.id)).ok()
  )
    throw new Error("New demo can read the previous demo document");
  for (const width of [360, 390]) {
    await page.setViewportSize({ width, height: 844 });
    const assertFits = async () => {
      if (
        await page.evaluate(
          () => document.documentElement.scrollWidth > window.innerWidth + 1,
        )
      )
        throw new Error(`Page overflows at ${width}px: ${page.url()}`);
    };
    await assertFits();
    const menu = page.getByRole("button", {
      name: "Показать / скрыть навигацию",
      exact: true,
    });
    await menu.click();
    await page
      .locator(".sidebar .nav-link")
      .filter({ hasText: "Созданные мной" })
      .click();
    await page
      .getByRole("heading", { name: "Созданные мной", exact: true })
      .waitFor();
    if (
      await page
        .locator(".application")
        .evaluate((element) => element.classList.contains("mobile-open"))
    )
      throw new Error(
        "Mobile navigation stayed open after selecting a section",
      );
    await page
      .getByRole("link", { name: demoSecond.documents[0]!.title, exact: true })
      .first()
      .click();
    await page
      .getByRole("tab", { name: "Основные реквизиты", exact: true })
      .waitFor();
    await assertFits();
    await page
      .getByRole("tab", { name: "Файлы и версии", exact: true })
      .click();
    await page
      .getByRole("link", { name: "Скачать оригинал", exact: true })
      .first()
      .waitFor();
    await assertFits();
    await page.screenshot({
      path: `test-results/demo-mobile-${width}.png`,
      fullPage: true,
    });
    await page.getByRole("link", { name: "К списку", exact: false }).click();
    await page
      .getByRole("button", { name: "Создать проект документа", exact: true })
      .click();
    await page.getByRole("dialog").waitFor();
    await assertFits();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Закрыть", exact: true })
      .click();
  }
  await page
    .getByRole("button", { name: "Показать / скрыть навигацию", exact: true })
    .click();
  await page.getByRole("link", { name: "Свой аккаунт", exact: true }).click();
  await page.locator('[name="email"]').waitFor();
  await page.goto(address + "/");
  await page
    .getByRole("heading", { name: "Все документы", exact: true })
    .waitFor();
  const beforeQr = (
    (await (
      await page.request.get(address + "/api/bootstrap")
    ).json()) as typeof demoFirst
  ).user.id;
  await page.goto(address + "/demo");
  await page
    .getByRole("img", { name: `QR-код: ${address}/`, exact: true })
    .waitFor();
  const target = page.getByRole("textbox", {
    name: "Ссылка на демо",
    exact: true,
  });
  if ((await target.inputValue()) !== address + "/")
    throw new Error("QR destination differs from the site origin");
  if (
    (await (await page.request.get(address + "/api/bootstrap")).json()).user
      .id !== beforeQr
  )
    throw new Error("QR service page created a demo profile");
  await page
    .locator(".demo-qr")
    .screenshot({ path: "test-results/demo-qr-code.png" });
  await page.screenshot({
    path: "test-results/demo-qr-mobile.png",
    fullPage: true,
  });
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(
    "UI passed: before/after diff desktop/mobile, exact-side anchored remark, version-bound resolution and immutable status history, register, empty workspace, create, manual example upload, exact download/profile author, logout/login/reload, desktop/mobile, Knowledge pending-index search, fresh private demo on reload, mobile navigation/cards/modal at 360/390px, public QR page; no page errors.",
  );
} finally {
  for (const context of browser?.contexts() ?? []) {
    for (const entry of await context.cookies()) {
      if (entry.name === "eosdo_session")
        await services.redis.del("eosdo:session:" + entry.value);
    }
  }
  await browser?.close();
  await app.close();
  const originals =
    await services.sql`SELECT data->>'object_key' AS key FROM eosdo_records WHERE kind='version'`;
  for (const row of originals) await services.s3.delete(row.key);
  services.redis.close();
  await services.sql.close();
  await admin.unsafe(`DROP DATABASE "${database}" WITH (FORCE)`);
  await admin.close();
}
