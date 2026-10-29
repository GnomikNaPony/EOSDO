import { expect, test } from "bun:test";
import { SQL } from "bun";
import {
  connect,
  migrate,
  Store,
  demoScope,
  type Services,
} from "../src/server/store";
import { createApp } from "../src/server/app";
import { createDemo } from "../src/server/demo";

const integration = Bun.env.RUN_INTEGRATION === "1" ? test : test.skip;
integration(
  "demo profiles isolate documents, directories, settings and files from each other and real accounts",
  async () => {
    const originalUrl = Bun.env.DATABASE_URL!;
    const admin = new SQL(originalUrl);
    const database = `eosdo_demo_test_${crypto.randomUUID().replaceAll("-", "")}`;
    await admin.unsafe(`CREATE DATABASE ${database}`);
    const target = new URL(originalUrl);
    target.pathname = `/${database}`;
    Bun.env.DATABASE_URL = target.toString();
    const services = await connect();
    Bun.env.DATABASE_URL = originalUrl;
    await migrate(services.sql);
    const app = await createApp(services);
    try {
      const real = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: {
          email: "real@example.test",
          password: "test-password",
          name: "Real owner",
          organization: "Real organization",
          department: "Real department",
        },
      });
      expect(real.statusCode).toBe(200);
      const headers = (response: typeof real) => ({
        cookie: String(response.headers["set-cookie"]).split(";")[0]!,
      });
      const first = await app.inject({ method: "POST", url: "/api/auth/demo" });
      const second = await app.inject({
        method: "POST",
        url: "/api/auth/demo",
        headers: headers(first),
      });
      expect(first.statusCode).toBe(200);
      expect(second.statusCode).toBe(200);
      expect(first.json().user.id).not.toBe(second.json().user.id);
      const bootstrap = async (response: typeof real) =>
        (
          await app.inject({
            url: "/api/bootstrap",
            headers: headers(response),
          })
        ).json();
      const a = await bootstrap(first),
        b = await bootstrap(second),
        normal = await bootstrap(real);
      expect(a.documents).toHaveLength(3);
      expect(a.templates).toHaveLength(1);
      expect(a.users.map((user: { id: string }) => user.id)).toEqual([
        first.json().user.id,
      ]);
      expect(b.users.map((user: { id: string }) => user.id)).toEqual([
        second.json().user.id,
      ]);
      expect(normal.users).toHaveLength(1);
      expect(normal.documents).toHaveLength(0);
      expect(normal.workspace.organization).toBe("Real organization");
      expect(a.workspace.organization).toContain("Маяк");
      expect(a.rules.items).toEqual([]);
      const concurrent = await Promise.all(
        Array.from({ length: 12 }, (_, index) =>
          bootstrap([first, second, real][index % 3]!),
        ),
      );
      for (const [index, result] of concurrent.entries()) {
        const expected = [a, b, normal][index % 3]!;
        expect(result.user.id).toBe(expected.user.id);
        expect(result.documents.map((item: { id: string }) => item.id)).toEqual(
          expected.documents.map((item: { id: string }) => item.id),
        );
      }
      const doc = a.documents[0];
      for (const visitor of [real, second]) {
        expect(
          (
            await app.inject({
              url: `/api/documents/${doc.id}`,
              headers: headers(visitor),
            })
          ).statusCode,
        ).toBe(404);
        expect(
          (
            await app.inject({
              url: `/api/versions/${doc.latest.id}/file`,
              headers: headers(visitor),
            })
          ).statusCode,
        ).toBe(404);
        expect(
          (
            await app.inject({
              url: `/api/templates/${a.templates[0].id}`,
              headers: headers(visitor),
            })
          ).statusCode,
        ).toBe(404);
      }
      const file = await app.inject({
        url: `/api/versions/${doc.latest.id}/file`,
        headers: headers(first),
      });
      expect(file.statusCode).toBe(200);
      expect(file.body).toContain("Все сведения вымышлены");
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/api/rules",
            headers: headers(first),
            payload: { revision: 1, items: ["change"] },
          })
        ).statusCode,
      ).toBe(403);
      expect(
        (
          await app.inject({
            url: "/api/intelligence",
            headers: headers(first),
          })
        ).statusCode,
      ).toBe(403);
      const search = (
        await app.inject({ url: "/api/search?q=архив", headers: headers(real) })
      ).json();
      expect(JSON.stringify(search)).not.toContain(doc.id);
      const store = new Store(services.db);
      await demoScope.run(first.json().user.id, async () => {
        await store.remove(second.json().user.id);
        await store.put("account", {
          id: second.json().user.id,
          name: "Intruder",
        });
      });
      expect((await bootstrap(second)).user.name).toBe("Анна Соколова");
      let writes = 0;
      const removed: string[] = [];
      const failedServices = {
        ...services,
        s3: {
          write: async () => {
            if (++writes === 2) throw new Error("S3 unavailable");
          },
          delete: async (key: string) => {
            removed.push(key);
          },
        },
      } as unknown as Services;
      const before =
        await services.sql`SELECT count(*)::int AS count FROM eosdo_records`;
      await expect(createDemo(failedServices)).rejects.toThrow(
        "S3 unavailable",
      );
      const after =
        await services.sql`SELECT count(*)::int AS count FROM eosdo_records`;
      expect(after[0].count).toBe(before[0].count);
      expect(removed).toHaveLength(2);
    } finally {
      await app.close();
      const versions =
        await services.sql`SELECT data->>'object_key' AS key FROM eosdo_records WHERE kind='version'`;
      await Promise.all(
        versions.map((row: { key: string }) => services.s3.delete(row.key)),
      );
      services.redis.close();
      await services.sql.close();
      await admin.unsafe(`DROP DATABASE ${database} WITH (FORCE)`);
      await admin.close();
    }
  },
  30000,
);
