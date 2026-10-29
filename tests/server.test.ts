import { describe, expect, test } from "bun:test";
import { date, days, profile, template } from "../src/server/domain";
describe("document validation", () => {
  test("rejects invalid dates, duplicate recipients, route ordering and ranges", () => {
    expect(() => date("2026-02-30")).toThrow();
    expect(date("2028-02-29")).toBe("2028-02-29");
    expect(() => days(1.5)).toThrow();
    expect(() => template({ type: "Письмо", due_days: 366 })).toThrow();
    const directory = { users: [{ id: "one" }], cases: [] };
    expect(() => profile({ recipients: ["one", "one"] }, directory)).toThrow();
    expect(() =>
      profile(
        {
          route: [
            { user_id: "one", kind: "sign", days: 2 },
            { user_id: "one", kind: "review", days: 2 },
          ],
        },
        directory,
      ),
    ).toThrow();
  });
});
Bun.env.INTELLIGENCE_WORKER_ENABLED = "0";
const integration = Bun.env.RUN_INTEGRATION === "1" ? test : test.skip;
integration(
  "empty workspace and manual file lifecycle with PostgreSQL Redis MinIO",
  async () => {
    const { SQL } = await import("bun");
    const { connect, migrate, Store } = await import("../src/server/store");
    const { createApp } = await import("../src/server/index");
    const database = `eosdo_component_test_${crypto.randomUUID().replaceAll("-", "")}`;
    const originalUrl = Bun.env.DATABASE_URL!;
    const admin = new SQL(originalUrl);
    await admin.unsafe(`CREATE DATABASE ${database}`);
    const target = new URL(originalUrl);
    target.pathname = "/" + database;
    Bun.env.DATABASE_URL = target.toString();
    const services = await connect();
    Bun.env.DATABASE_URL = originalUrl;
    await migrate(services.sql);
    const app = await createApp(services);
    const store = new Store(services.db);
    try {
      const source = Buffer.from("Файл, загруженный пользователем теста");
      const initial = (await app.inject({ url: "/api/bootstrap" })).json();
      expect(initial.setup_required).toBe(true);
      expect(initial.users).toEqual([]);
      expect(initial.documents).toEqual([]);
      expect(initial.rules.items).toEqual([]);
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/api/documents",
            payload: { title: "Недопустимо" },
          })
        ).statusCode,
      ).toBe(401);
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/api/auth/register",
            payload: {
              email: "owner@example.test",
              password: "test-password-123",
              name: "",
              organization: "Организация",
              department: "Подразделение",
            },
          })
        ).statusCode,
      ).toBe(400);
      const setup = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: {
          email: "owner@example.test",
          password: "test-password-123",
          name: "Пользователь интеграционного теста",
          organization: "Организация теста",
          department: "Подразделение",
        },
      });
      expect(setup.statusCode).toBe(200);
      const cookie = String(setup.headers["set-cookie"]).split(";")[0]!;
      const headers = { cookie };
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/api/auth/register",
            payload: {
              email: "OWNER@example.test",
              password: "test-password-123",
              name: "Другой",
              organization: "Организация",
              department: "Подразделение",
            },
          })
        ).statusCode,
      ).toBe(409);
      const boot = (
        await app.inject({ url: "/api/bootstrap", headers })
      ).json();
      expect(boot.users).toHaveLength(1);
      expect(boot.user.name).toBe("Пользователь интеграционного теста");
      expect(boot.documents).toEqual([]);
      expect(boot.cases).toEqual([]);
      expect(boot.auth_required).toBe(false);
      expect(JSON.stringify(boot)).not.toContain("password_hash");
      const invalid = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: "owner@example.test", password: "wrong-password" },
      });
      expect(invalid.statusCode).toBe(401);
      const login = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: "OWNER@example.test", password: "test-password-123" },
      });
      expect(login.statusCode).toBe(200);
      const second = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: {
          email: "author@example.test",
          password: "test-password-123",
          name: "Второй пользователь",
          department: "Другое подразделение",
        },
      });
      expect(second.statusCode).toBe(200);
      expect(second.json().user.role).toBe("author");
      const secondHeaders = {
        cookie: String(second.headers["set-cookie"]).split(";")[0]!,
      };
      const elevated = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: {
          email: "intruder@example.test",
          password: "test-password-123",
          name: "Недопустимая роль",
          department: "Подразделение",
          role: "curator",
        },
      });
      expect(elevated.statusCode).toBe(400);
      const created = await app.inject({
        method: "POST",
        url: "/api/documents",
        headers,
        payload: {
          title: "Документ пользователя",
          type: "Письмо",
          priority: "normal",
          due: "2027-01-01",
        },
      });
      expect(created.statusCode).toBe(200);
      const id = created.json().id;
      expect(
        (
          await app.inject({
            url: `/api/documents/${id}`,
            headers: secondHeaders,
          })
        ).statusCode,
      ).toBe(403);
      expect(
        (
          await app.inject({
            method: "POST",
            url: `/api/documents/${id}/versions`,
            headers: secondHeaders,
            payload: {
              filename: "source.txt",
              content: source.toString("base64"),
              message: "Чужой файл",
            },
          })
        ).statusCode,
      ).toBe(403);
      const own = await app.inject({
        method: "POST",
        url: "/api/documents",
        headers: secondHeaders,
        payload: {
          title: "Документ второго профиля",
          type: "Письмо",
          due: "2027-01-01",
        },
      });
      expect(own.statusCode).toBe(200);
      const ownId = own.json().id;
      const ownUpload = await app.inject({
        method: "POST",
        url: `/api/documents/${ownId}/versions`,
        headers: secondHeaders,
        payload: {
          filename: "source.txt",
          content: source.toString("base64"),
          message: "Собственный файл",
        },
      });
      expect(ownUpload.statusCode).toBe(200);
      const ownDetail = (
        await app.inject({
          url: `/api/documents/${ownId}`,
          headers: secondHeaders,
        })
      ).json();
      expect(ownDetail.owner_id).toBe(second.json().user.id);
      expect(ownDetail.versions[0].author_id).toBe(second.json().user.id);
      expect(ownDetail.curator_id).toBe(boot.user.id);
      const uploaded = await app.inject({
        method: "POST",
        url: `/api/documents/${id}/versions`,
        headers,
        payload: {
          filename: "source.txt",
          content: source.toString("base64"),
          message: "Файл загружен вручную",
          parent_id: null,
        },
      });
      expect(uploaded.statusCode).toBe(200);
      const versionId = uploaded.json().id;
      const detail = (
        await app.inject({ url: `/api/documents/${id}`, headers })
      ).json();
      expect(detail.versions).toHaveLength(1);
      expect(detail.owner_id).toBe(boot.user.id);
      expect(detail.versions[0].author_id).toBe(boot.user.id);
      expect(detail.versions[0].object_key).toBeUndefined();
      const download = await app.inject({
        url: `/api/versions/${versionId}/file`,
        headers,
      });
      expect(Buffer.from(download.rawPayload)).toEqual(source);
      const patch = {
        title: "Изменённое название",
        due: detail.due,
        priority: "normal",
        profile_revision: 1,
      };
      expect(
        (
          await app.inject({
            method: "PATCH",
            url: `/api/documents/${id}`,
            headers,
            payload: patch,
          })
        ).statusCode,
      ).toBe(200);
      expect(
        (
          await app.inject({
            method: "PATCH",
            url: `/api/documents/${id}`,
            headers,
            payload: patch,
          })
        ).statusCode,
      ).toBe(409);
      const comment = await app.inject({
        method: "POST",
        url: "/api/comments",
        headers,
        payload: {
          document_id: id,
          version_id: versionId,
          text: "Проверить обязательное условие",
          severity: "blocking",
        },
      });
      expect(comment.statusCode).toBe(200);
      expect(
        (
          await app.inject({
            method: "POST",
            url: `/api/documents/${id}/status`,
            headers,
            payload: {
              status: "approved",
              version_id: versionId,
              manual_review: true,
            },
          })
        ).statusCode,
      ).toBe(409);
      const saved = await store.get(versionId, "version");
      await store.put("version", { ...saved!, text: "Извлечённый текст" }, id);
      await expect(
        store.put("version", { ...saved!, filename: "overwrite.txt" }, id),
      ).rejects.toThrow();
      await expect(store.remove(versionId)).rejects.toThrow();
      const [row] =
        await services.sql`SELECT jsonb_typeof(data) AS type FROM eosdo_records WHERE id=${versionId}`;
      expect(row.type).toBe("object");
      const personal = await app.inject({
        method: "POST",
        url: "/api/templates",
        headers,
        payload: {
          format: "eosdo-personal-template",
          version: 1,
          name: "Настройки пользователя",
          config: { type: "Письмо", title: "", due_days: 7 },
        },
      });
      expect(personal.statusCode).toBe(200);
      const entry = (await store.get(personal.json().id, "template"))!;
      expect(entry.user_id).toBe(boot.user.id);
      const rateIp = "198.51.100.245";
      await services.redis.del(
        `eosdo:login:${rateIp}:${new Bun.CryptoHasher("sha256").update("missing@example.test").digest("hex")}`,
      );
      for (let attempt = 0; attempt < 9; attempt++)
        expect(
          (
            await app.inject({
              method: "POST",
              url: "/api/auth/login",
              remoteAddress: rateIp,
              payload: {
                email: "missing@example.test",
                password: "wrong-password",
              },
            })
          ).statusCode,
        ).toBe(401);
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/api/auth/login",
            remoteAddress: rateIp,
            payload: {
              email: "owner@example.test",
              password: "test-password-123",
            },
          })
        ).statusCode,
      ).toBe(200);
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/api/auth/login",
            remoteAddress: rateIp,
            payload: {
              email: "missing@example.test",
              password: "wrong-password",
            },
          })
        ).statusCode,
      ).toBe(401);
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/api/auth/login",
            remoteAddress: rateIp,
            payload: {
              email: "missing@example.test",
              password: "wrong-password",
            },
          })
        ).statusCode,
      ).toBe(429);
      await services.redis.del(
        `eosdo:login:${rateIp}:${new Bun.CryptoHasher("sha256").update("missing@example.test").digest("hex")}`,
      );
      const logout = await app.inject({
        method: "POST",
        url: "/api/auth/logout",
        headers: secondHeaders,
      });
      expect(logout.statusCode).toBe(200);
      expect(
        (
          await app.inject({ url: "/api/auth/me", headers: secondHeaders })
        ).json().user,
      ).toBeNull();
      expect(
        (
          await app.inject({
            url: `/api/documents/${ownId}`,
            headers: secondHeaders,
          })
        ).statusCode,
      ).toBe(401);
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/api/demo-session",
            headers,
            payload: { user_id: "other" },
          })
        ).statusCode,
      ).toBe(404);
    } finally {
      await app.close();
      for (const record of await store.list("version"))
        if (record.object_key)
          await services.s3.delete(String(record.object_key));
      services.redis.close();
      await services.sql.close();
      Bun.env.DATABASE_URL = originalUrl;
      await admin.unsafe(`DROP DATABASE ${database}`);
      await admin.close();
    }
  },
  30000,
);
integration(
  "read-only SQLite import preserves profiles, templates, originals and settings",
  async () => {
    const { Database } = await import("bun:sqlite");
    const { SQL } = await import("bun");
    const { mkdtemp, rm } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { connect } = await import("../src/server/store");
    const services = await connect();
    const databaseName = `eosdo_import_test_${crypto.randomUUID().replaceAll("-", "")}`;
    const directory = await mkdtemp(join(tmpdir(), "eosdo-import-"));
    const filename = join(directory, "source.sqlite3");
    const id = crypto.randomUUID();
    const versionId = crypto.randomUUID();
    let imported: InstanceType<typeof SQL> | undefined;
    let created = false;
    try {
      const source = new Database(filename, { create: true });
      source.exec(`CREATE TABLE documents(id TEXT, owner_id TEXT, title TEXT);
CREATE TABLE versions(id TEXT,document_id TEXT,number INTEGER,filename TEXT,content BLOB,sha256 TEXT);
CREATE TABLE document_profiles(document_id TEXT,config TEXT,revision INTEGER);
CREATE TABLE personal_templates(id TEXT,user_id TEXT,name TEXT,config TEXT,revision INTEGER);
CREATE TABLE settings(key TEXT,value TEXT);
CREATE TABLE favorites(user_id TEXT,document_id TEXT);`);
      const content = Buffer.from("Полный оригинал для импорта");
      source
        .query("INSERT INTO documents VALUES (?,?,?)")
        .run(id, "author", "Импортированный документ");
      source
        .query("INSERT INTO versions VALUES (?,?,?,?,?,?)")
        .run(
          versionId,
          id,
          1,
          "original.txt",
          content,
          new Bun.CryptoHasher("sha256").update(content).digest("hex"),
        );
      const config = {
        case_id: "demo-plans",
        recipients: ["curator"],
        route: [{ user_id: "curator", kind: "review", days: 7 }],
      };
      source
        .query("INSERT INTO document_profiles VALUES (?,?,?)")
        .run(id, JSON.stringify(config), 4);
      source
        .query("INSERT INTO personal_templates VALUES (?,?,?,?,?)")
        .run(
          "fixture-template",
          "author",
          "Личный шаблон",
          JSON.stringify({ ...config, due_days: 7, type: "Письмо" }),
          2,
        );
      source
        .query("INSERT INTO settings VALUES (?,?)")
        .run(
          "rules",
          JSON.stringify({ revision: 3, demo: false, items: ["Есть срок"] }),
        );
      source
        .query("INSERT INTO settings VALUES (?,?)")
        .run("notifications:author", JSON.stringify({ ai: false }));
      source.query("INSERT INTO favorites VALUES (?,?)").run("author", id);
      source.close();
      const before = await Bun.file(filename).bytes();
      await services.sql.unsafe(`CREATE DATABASE ${databaseName}`);
      created = true;
      const target = new URL(Bun.env.DATABASE_URL!);
      target.pathname = `/${databaseName}`;
      const child = Bun.spawn(
        [process.execPath, "src/server/import-sqlite.ts", filename],
        {
          env: {
            ...Object.fromEntries(
              Object.entries(Bun.env).filter(
                (entry): entry is [string, string] =>
                  typeof entry[1] === "string",
              ),
            ),
            DATABASE_URL: target.toString(),
          },
          stdout: "pipe",
          stderr: "pipe",
        },
      );
      const exit = await child.exited;
      if (exit !== 0) throw new Error("SQLite import subprocess failed");
      expect(exit).toBe(0);
      imported = new SQL(target.toString());
      const [document] =
        await imported`SELECT data FROM eosdo_records WHERE id=${id}`;
      expect(document.data.profile_revision).toBe(4);
      expect(document.data.route).toEqual(config.route);
      const [personal] =
        await imported`SELECT data FROM eosdo_records WHERE id='fixture-template'`;
      expect(personal.data.config.due_days).toBe(7);
      const [settings] =
        await imported`SELECT data FROM eosdo_settings WHERE key='preferences:author'`;
      expect(settings.data.ai).toBe(false);
      const [favorite] =
        await imported`SELECT data FROM eosdo_settings WHERE key='favorites:author'`;
      expect(favorite.data[id]).toBe(true);
      expect(
        Buffer.from(
          await services.s3.file(`versions/${id}/${versionId}`).arrayBuffer(),
        ).equals(content),
      ).toBe(true);
      expect(
        Buffer.from(await Bun.file(filename).bytes()).equals(
          Buffer.from(before),
        ),
      ).toBe(true);
    } finally {
      await imported?.close();
      if (created)
        await services.sql.unsafe(`DROP DATABASE ${databaseName} WITH (FORCE)`);
      await services.s3.delete(`versions/${id}/${versionId}`);
      services.redis.close();
      await services.sql.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
  30000,
);
