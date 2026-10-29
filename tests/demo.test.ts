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
      expect(a.users).toHaveLength(2);
      expect(b.users).toHaveLength(2);
      expect(
        a.users.find((u: { role: string }) => u.role === "author").id,
      ).toBe(first.json().user.id);
      expect(
        b.users.find((u: { role: string }) => u.role === "author").id,
      ).toBe(second.json().user.id);
      expect(
        a.users.find((u: { role: string }) => u.role === "curator").name,
      ).toBe("Илья Морозов");
      expect(
        a.users
          .map((u: { id: string }) => u.id)
          .some((id: string) =>
            b.users.some((u: { id: string }) => u.id === id),
          ),
      ).toBe(false);
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
      const expectedCounts: Record<string, number> = {
        "Запуск электронного архива обращений": 3,
        "Итоги встреч с региональными командами": 2,
        "План подготовки клиентского семинара": 2,
      };
      const statuses: string[] = [];
      for (const entry of a.documents) {
        const detailResponse = await app.inject({
          url: `/api/documents/${entry.id}`,
          headers: headers(first),
        });
        expect(detailResponse.statusCode).toBe(200);
        const detail = detailResponse.json();
        expect(detail.versions).toHaveLength(expectedCounts[detail.title]!);
        const ordered = [...detail.versions].reverse();
        for (const [index, version] of ordered.entries()) {
          expect(version.number).toBe(index + 1);
          expect(version.parent_id).toBe(index ? ordered[index - 1].id : null);
          const original = await app.inject({
            url: `/api/versions/${version.id}/file`,
            headers: headers(first),
          });
          expect(original.statusCode).toBe(200);
          expect(original.rawPayload.toString()).toBe(version.text);
          expect(original.rawPayload.length).toBe(version.size);
          expect(
            new Bun.CryptoHasher("sha256")
              .update(original.rawPayload)
              .digest("hex"),
          ).toBe(version.sha256);
          expect(version.author_id).toBe(first.json().user.id);
          if (index)
            expect(Date.parse(version.created)).toBeGreaterThan(
              Date.parse(ordered[index - 1].created),
            );
        }
        const compared = (
          await app.inject({
            url: `/api/versions/${detail.versions[0].id}/diff`,
            headers: headers(first),
          })
        ).json();
        expect(compared.state).toBe("ready");
        expect(compared.added).toBeGreaterThan(0);
        expect(compared.removed).toBeGreaterThan(0);
        expect(
          compared.lines.some((l: { kind: string }) => l.kind === "equal"),
        ).toBe(true);
        expect(detail.comments).toHaveLength(1);
        const remark = detail.comments[0];
        statuses.push(remark.status);
        const source = ordered.find(
          (v: { id: string }) => v.id === remark.version_id,
        );
        expect(source.text.split("\n")[remark.anchor_line - 1]).toBe(
          remark.anchor,
        );
        expect(remark.author_id).toBe(detail.curator_id);
        expect(remark.replies).toHaveLength(1);
        expect(remark.replies[0].author_id).toBe(first.json().user.id);
        expect(remark.events[0].from_status).toBeNull();
        expect(remark.events[0].status).toBe("open");
        expect(remark.events.at(-1).status).toBe(remark.status);
        for (const [index, event] of remark.events.entries()) {
          const version = ordered.find(
            (v: { id: string }) => v.id === event.version_id,
          );
          expect(Date.parse(event.created)).toBeGreaterThanOrEqual(
            Date.parse(version.created),
          );
          if (index) {
            expect(event.from_status).toBe(remark.events[index - 1].status);
            expect(Date.parse(event.created)).toBeGreaterThan(
              Date.parse(remark.events[index - 1].created),
            );
          }
          expect(event.author_id).toBe(
            event.status === "addressed" ? detail.owner_id : detail.curator_id,
          );
        }
        if (remark.status === "open")
          expect(remark.resolved_version).toBeNull();
        else expect(remark.resolved_version).toBe(ordered[1].id);
        if (detail.title === "Запуск электронного архива обращений") {
          const fromFirst = (
            await app.inject({
              url: `/api/versions/${ordered[2].id}/diff?base=${ordered[0].id}`,
              headers: headers(first),
            })
          ).json();
          expect(fromFirst.diff).toContain("-Срок пилота пока не определён.");
          expect(fromFirst.diff).toContain(
            "+Срок пилота: 2–13 ноября 2026 года.",
          );
          expect(fromFirst.diff).toContain(
            "+Критерий успеха: поиск обращения занимает не больше 2 минут.",
          );
          expect(fromFirst.diff).toContain("доступы для восьми сотрудников");
          expect(
            remark.events.map((e: { status: string }) => e.status),
          ).toEqual(["open", "addressed", "closed"]);
        }
        if (detail.type === "Отчёт") {
          expect(compared.diff).toContain("-Трудозатраты: не оценены.");
          expect(compared.diff).toContain(
            "+Трудозатраты: шаблон — 8 ч, справочник — 12 ч, инструкция — 6 ч.",
          );
        }
        if (detail.type === "План мероприятий") {
          expect(compared.diff).toContain("Ожидаем до 25 участников.");
          expect(compared.diff).toContain("Ожидаем до 40 участников.");
        }
      }
      expect(statuses.sort()).toEqual(["addressed", "closed", "open"]);
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
      writes = 0;
      removed.length = 0;
      failedServices.s3.write = (async () => {
        if (++writes === 6) throw new Error("Late S3 failure");
        return 0;
      }) as typeof services.s3.write;
      await expect(createDemo(failedServices)).rejects.toThrow(
        "Late S3 failure",
      );
      expect(removed).toHaveLength(6);
      const afterLate =
        await services.sql`SELECT count(*)::int AS count FROM eosdo_records`;
      expect(afterLate[0].count).toBe(before[0].count);
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
