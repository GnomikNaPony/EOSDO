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
  await page.goto(address);
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
  if (otherDetail.versions.length || originalDetail.versions.length !== 2)
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
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(
    "UI passed: register, empty workspace, create, manual example upload, exact download/profile author, logout/login/reload, desktop/mobile; no page errors.",
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
