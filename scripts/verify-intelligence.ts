import { SQL } from "bun";
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { strict as assert } from "node:assert";

// This opt-in boundary check calls the actual local models on synthetic letters.
// It never creates demonstration documents in the user's workspace.
Bun.env.INTELLIGENCE_WORKER_ENABLED = "0";
const databaseUrl = Bun.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const admin = new SQL(databaseUrl);
const database = `eosdo_intelligence_live_${crypto.randomUUID().replaceAll("-", "")}`;
await admin.unsafe(`CREATE DATABASE "${database}"`);
const target = new URL(databaseUrl);
target.pathname = `/${database}`;
Bun.env.DATABASE_URL = target.toString();
const { connect, migrate, Store } = await import("../src/server/store");
const { createApp } = await import("../src/server/app");
const { processVersion } = await import("../src/server/intelligence");
const services = await connect();
Bun.env.DATABASE_URL = databaseUrl;
await migrate(services.sql);
const store = new Store(services.db);
const app = await createApp(services);
const address = await app.listen({ host: "127.0.0.1", port: 0 });
Bun.env.APP_ORIGIN = address;
const cookies: string[] = [];
let browser;
try {
  async function register(email: string) {
    const res = await app.inject({ method: "POST", url: "/api/auth/register", payload: {
      email, password: "synthetic-live-check-password", name: email.split("@")[0],
      department: "Учебный контур", organization: "Синтетические проверки",
    }});
    assert.equal(res.statusCode, 200);
    const cookie = String(res.headers["set-cookie"]).split(";")[0]!;
    cookies.push(cookie);
    return { cookie };
  }
  const curator = await register("curator@example.test");
  const author = await register("author@example.test");
  const other = await register("other@example.test");
  const letters = [
    { title: "Учебное исходящее письмо", text: "Исходящее письмо № 101. Отправитель: АО Северэнергия. Получатель: ООО Проектное бюро. Проект: Север-2026. Кабель: К-42. Замечание: требуется исправить маркировку кабеля К-42. Просим предоставить ответ об устранении замечания.", headers: author },
    { title: "Учебное ответное письмо", text: "Ответ на письмо № 101. Отправитель: ООО Проектное бюро. Получатель: АО Северэнергия. Проект: Север-2026. Кабель: К-42. Решение: замечание по маркировке кабеля К-42 принято и учтено в исправленной документации. Направляем ответ об устранении замечания.", headers: author },
    { title: "Чужой учебный документ", text: "Проект: Столовая-2026. Отправитель: ООО Питание. Получатель: АО Обед. Тема: меню обедов и закупка продуктов. Просим согласовать поставку круп и овощей.", headers: other },
  ];
  const uploaded: { id: string; version: string; text: string }[] = [];
  for (const [i, letter] of letters.entries()) {
    const created = await app.inject({ method: "POST", url: "/api/documents", headers: letter.headers, payload: {
      title: letter.title, type: "Письмо", due: "2027-01-31", priority: "normal",
    }});
    assert.equal(created.statusCode, 200);
    const id = created.json().id as string;
    const upload = await app.inject({ method: "POST", url: `/api/documents/${id}/versions`, headers: letter.headers, payload: {
      filename: `Учебное письмо ${i + 1}.txt`, message: "Синтетическая проверка", parent_id: null,
      content: Buffer.from(letter.text).toString("base64"),
    }});
    assert.equal(upload.statusCode, 200);
    const version = upload.json().id as string;
    await processVersion(services, version);
    const index = await store.get(`intelligence:${version}`, "intelligence");
    assert.equal(index?.status, "ready", `Actual local model did not produce a ready record: ${index?.error}`);
    const metadata = index?.metadata as { facts: {kind: string; value: string; quote: string}[] };
    assert.ok(metadata.facts.length > 0);
    for (const fact of metadata.facts) {
      assert.ok(letter.text.includes(fact.quote), "A model quote is not in the original");
      assert.ok(fact.quote.includes(fact.value), "A model fact is not supported by its quote");
    }
    if (i < 2) assert.ok(metadata.facts.some((f) => f.kind === "project" && f.value.includes("Север-2026")), "The known project was not extracted");
    const original = await app.inject({ url: `/api/versions/${version}/file`, headers: letter.headers });
    assert.ok(original.rawPayload.equals(Buffer.from(letter.text)), "Original bytes changed");
    uploaded.push({ id, version, text: letter.text });
  }
  const overview = await app.inject({ url: "/api/intelligence", headers: curator });
  assert.equal(overview.statusCode, 200);
  const body = overview.json();
  const group = body.groups.find((g: {kind: string; document_ids: string[]}) => g.kind === "project" && uploaded.slice(0, 2).every((v) => g.document_ids.includes(v.id)));
  assert.ok(group, "Two letters with the same project were not grouped");
  const report = await app.inject({ url: `/api/intelligence/report?${new URLSearchParams({key:group.key})}`, headers: curator });
  assert.equal(report.statusCode, 200);
  assert.equal(report.json().sources.length, 2);
  assert.equal((await app.inject({url:"/api/intelligence",headers:author})).statusCode,403);
  assert.equal((await app.inject({url:"/api/intelligence"})).statusCode,401);
  const query = "Как устранили недостатки обозначений кабеля К-42?";
  const search = await app.inject({url:`/api/intelligence/search?${new URLSearchParams({q:query})}`,headers:author});
  assert.equal(search.statusCode,200);
  const results = search.json();
  assert.ok(results.items.length > 0, "Actual embeddings returned no result");
  assert.ok(uploaded.slice(0,2).some((v)=>v.id===results.items[0].document_id),"An unrelated document ranked first");
  assert.ok(results.items.every((v:{document_id:string})=>v.document_id!==uploaded[2]!.id),"A foreign document leaked into semantic search");
  assert.ok(!JSON.stringify(results).includes("Столовая"),"Foreign text leaked");
  browser = await chromium.launch({ executablePath: Bun.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined });
  const context = await browser.newContext({viewport:{width:1440,height:1000}});
  const token = curator.cookie.slice("eosdo_session=".length);
  await context.addCookies([{name:"eosdo_session",value:token,url:address,httpOnly:true,sameSite:"Lax"}]);
  const page = await context.newPage();
  const errors:string[]=[];
  page.on("pageerror",e=>errors.push(e.message));
  await page.goto(address+"/#/knowledge");
  await page.getByRole("heading",{name:"Данные из документов",exact:true}).waitFor();
  await page.getByRole("heading",{name:"Обзор обработки · куратор",exact:true}).waitFor();
  await page.locator("details").filter({hasText:"Учебное исходящее письмо"}).locator("summary").click();
  await page.getByText("Север-2026",{exact:true}).first().waitFor();
  await mkdir("test-results",{recursive:true});
  await page.screenshot({path:"test-results/intelligence-overview.png",fullPage:true});
  await page.getByRole("button",{name:/Проект: Север-2026/}).click();
  await page.getByRole("region",{name:"Сводка переписки"}).waitFor();
  assert.equal(await page.getByRole("region",{name:"Сводка переписки"}).locator("article").count(),2);
  await page.screenshot({path:"test-results/intelligence-report.png",fullPage:true});
  await page.getByRole("searchbox",{name:"Что нужно найти"}).fill(query);
  await page.getByRole("button",{name:"Найти по смыслу",exact:true}).click();
  await page.getByRole("link",{name:"Открыть версию и проверить источник"}).first().waitFor();
  await page.screenshot({path:"test-results/intelligence-search.png",fullPage:true});
  await page.getByRole("link",{name:"Открыть версию и проверить источник"}).first().click();
  await page.getByRole("tab",{name:"Файлы и версии",exact:true}).waitFor();
  await page.getByRole("link",{name:"Скачать оригинал",exact:true}).waitFor();
  assert.ok(new URL(page.url()).hash.includes("version="),"Semantic result lost the version binding");
  assert.deepEqual(errors,[]);
  await Bun.write("test-results/intelligence-live.json",JSON.stringify({
    checked_at:new Date().toISOString(),metadata_model:Bun.env.OLLAMA_MODEL??"qwen3.5:9b",embedding_model:Bun.env.OLLAMA_EMBED_MODEL??"embeddinggemma",
    sources:3,project_sources:report.json().sources.length,search_results:results.items.length,originals_unchanged:true,acl_checked:true,ui_errors:errors,
  },null,2));
  console.log("LIVE INTELLIGENCE PASSED: actual local models, cited metadata, project group/report, semantic ranking/ACL, exact originals, UI source/version links; temporary fixtures only.");
} finally {
  await browser?.close();
  await app.close();
  for (const cookie of cookies) await services.redis.del("eosdo:session:"+cookie.slice("eosdo_session=".length));
  for (const version of await store.list("version")) if(typeof version.object_key==="string") await services.s3.delete(version.object_key);
  services.redis.close(); await services.sql.close();
  await admin.unsafe(`DROP DATABASE "${database}" WITH (FORCE)`); await admin.close();
}
