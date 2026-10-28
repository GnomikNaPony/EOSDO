import type { FastifyRequest, FastifyReply } from "fastify";
import type { Services } from "./store";
import { Store } from "./store";
import { Problem, uid } from "./domain";
import type { RecordData } from "./schema";
export interface User {
  id: string;
  name: string;
  department: string;
  role: string;
  email: string;
}
export interface Workspace {
  organization: string;
}
export async function workspace(store: Store): Promise<Workspace | null> {
  const value = await store.setting("workspace", {});
  return typeof value.organization === "string"
    ? { organization: value.organization }
    : null;
}
export function publicUser(account: RecordData): User {
  return {
    id: String(account.id),
    name: String(account.name),
    department: String(account.department),
    role: String(account.role),
    email: String(account.email),
  };
}
export function sessionToken(request: FastifyRequest) {
  return (
    request.headers.cookie?.match(
      /(?:^|;\s*)eosdo_session=([a-zA-Z0-9-]+)/,
    )?.[1] ?? ""
  );
}
export function cookie(reply: FastifyReply, token: string, maxAge = 86400) {
  reply.header(
    "set-cookie",
    `eosdo_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${Bun.env.NODE_ENV === "production" ? "; Secure" : ""}`,
  );
}
export async function createSession(
  services: Services,
  reply: FastifyReply,
  user: User,
) {
  const token = uid();
  await services.redis.set(`eosdo:session:${token}`, user.id);
  await services.redis.expire(`eosdo:session:${token}`, 86400);
  cookie(reply, token);
  return token;
}
export async function currentUser(
  services: Services,
  store: Store,
  request: FastifyRequest,
) {
  const token = sessionToken(request);
  const id = token ? await services.redis.get(`eosdo:session:${token}`) : null;
  const account = id ? await store.get(id, "account") : undefined;
  if (!account) return null;
  return publicUser(account);
}
export function sessionFor(services: Services, store: Store) {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    const user = await currentUser(services, store, request);
    if (!user) throw new Problem(401, "Войдите в свой профиль");
    const token = sessionToken(request);
    await services.redis.expire(`eosdo:session:${token}`, 86400);
    return { user, token };
  };
}
export type Context = {
  services: Services;
  store: Store;
  session: ReturnType<typeof sessionFor>;
};
export async function directory(store: Store) {
  const settings = await store.setting("directory", {});
  return {
    users: (await store.list("account")).map(publicUser),
    cases: Array.isArray(settings.cases)
      ? settings.cases.filter(
          (item): item is RecordData =>
            !!item && typeof item === "object" && !Array.isArray(item),
        )
      : [],
  };
}
