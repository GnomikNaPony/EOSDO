export { createApp } from "./app";
import { createApp } from "./app";
if (import.meta.main) {
  const app = await createApp();
  await app.listen({
    port: Number(Bun.env.PORT ?? 8765),
    host:
      Bun.env.HOST ??
      (Bun.env.RAILWAY_PUBLIC_DOMAIN || Bun.env.RAILWAY_ENVIRONMENT_ID
        ? "0.0.0.0"
        : "127.0.0.1"),
  });
  for (const signal of ["SIGINT", "SIGTERM"] as const)
    process.on(signal, () => void app.close());
}
