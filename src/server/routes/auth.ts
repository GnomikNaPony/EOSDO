import type { FastifyInstance } from "fastify";
import {
  type Context,
  workspace,
  publicUser,
  currentUser,
  createSession,
  sessionToken,
  cookie,
} from "../workspace";
import { Store } from "../store";
import { body } from "../document-service";
import { Problem, required, uid, now } from "../domain";
function email(value: unknown) {
  if (
    typeof value !== "string" ||
    value.length > 254 ||
    !/^\S+@[^\s@]+\.[^\s@]+$/.test(value.trim())
  )
    throw new Problem(400, "Укажите корректный email");
  return value.trim().toLowerCase();
}
function password(value: unknown) {
  if (typeof value !== "string" || value.length < 8 || value.length > 128)
    throw new Problem(400, "Пароль должен содержать от 8 до 128 символов");
  return value;
}
export function authRoutes(app: FastifyInstance, { services, store }: Context) {
  app.post("/api/auth/register", async (request, reply) => {
    const b = body(request);
    if (b.role !== undefined)
      throw new Problem(400, "Роль назначается автоматически");
    const address = email(b.email);
    const secret = password(b.password);
    const name = required(b.name, "Ваше имя", 200);
    const department = required(b.department, "Подразделение", 200);
    const hash = await Bun.password.hash(secret);
    const account = await services.db.transaction(async (tx) => {
      await tx.execute("SELECT pg_advisory_xact_lock(874121)");
      const s = new Store(tx);
      const accounts = await s.list("account");
      if (accounts.some((account) => account.email === address))
        throw new Problem(409, "Этот email уже зарегистрирован");
      const settings = await workspace(s);
      const organization =
        settings?.organization ?? required(b.organization, "Организация", 200);
      const record = {
        id: uid(),
        name,
        department,
        email: address,
        password_hash: hash,
        role: accounts.length ? "author" : "curator",
        created: now(),
      };
      await s.put("account", record);
      if (!settings) await s.set("workspace", { organization });
      return record;
    });
    const user = publicUser(account);
    await createSession(services, reply, user);
    return { user };
  });
  app.post("/api/auth/login", async (request, reply) => {
    const b = body(request);
    const address = email(b.email);
    const secret = password(b.password);
    const accountKey = new Bun.CryptoHasher("sha256")
      .update(address)
      .digest("hex");
    const limiterKey = `eosdo:login:${request.ip}:${accountKey}`;
    const attempts = Number(
      await services.redis.send("EVAL", [
        "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],900) end; return n",
        "1",
        limiterKey,
      ]),
    );
    if (attempts > 10)
      throw new Problem(
        429,
        "Слишком много попыток входа. Повторите через 15 минут",
      );
    const account = (await store.list("account")).find(
      (item) => item.email === address,
    );
    if (
      !account ||
      typeof account.password_hash !== "string" ||
      !(await Bun.password.verify(secret, account.password_hash))
    )
      throw new Problem(401, "Неверный email или пароль");
    await services.redis.del(limiterKey);
    const previous = sessionToken(request);
    if (previous) await services.redis.del(`eosdo:session:${previous}`);
    const user = publicUser(account);
    await createSession(services, reply, user);
    return { user };
  });
  app.post("/api/auth/logout", async (request, reply) => {
    const token = sessionToken(request);
    if (token) await services.redis.del(`eosdo:session:${token}`);
    cookie(reply, "", 0);
    return { ok: true };
  });
  app.get("/api/auth/me", async (request) => ({
    user: await currentUser(services, store, request),
  }));
}
