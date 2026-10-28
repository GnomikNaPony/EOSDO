import { resolve } from "node:path";
process.chdir(resolve(import.meta.dir, ".."));
if (Bun.version !== "1.4.4")
  throw new Error(`Требуется Bun 1.4.4, установлен ${Bun.version}`);
for (const command of [
  ["bun", "run", "services:up"],
  ["bun", "run", "db:migrate"],
  ["bun", "run", "build"],
]) {
  const result = Bun.spawnSync(command, {
    stdout: "inherit",
    stderr: "inherit",
  });
  if (result.exitCode !== 0) process.exit(result.exitCode);
}
if (process.argv.includes("--open"))
  Bun.spawn(["open", `http://127.0.0.1:${Bun.env.PORT ?? 8765}`]);
const { createApp } = await import("../src/server/index");
const app = await createApp();
await app.listen({
  port: Number(Bun.env.PORT ?? 8765),
  host: Bun.env.HOST ?? "127.0.0.1",
});
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => void app.close());
