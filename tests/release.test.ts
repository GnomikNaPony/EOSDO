import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile, chmod, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

let root: string, checkout: string, marker: string;
let env: Record<string, string | undefined>;
const script = resolve(import.meta.dir, "../scripts/release.ts");

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "eosdo-release-"));
  checkout = join(root, "checkout");
  marker = join(root, "deployment-requested");
  const bin = join(root, "bin");
  await mkdir(checkout);
  await mkdir(bin);
  await writeFile(join(checkout, "README.md"), "Checked source fixture\n");
  for (const args of [
    ["init", "-q"],
    ["add", "README.md"],
    [
      "-c",
      "user.name=Gate test",
      "-c",
      "user.email=gate@example.test",
      "commit",
      "-qm",
      "fixture",
    ],
  ]) {
    const result = Bun.spawnSync(["git", ...args], { cwd: checkout });
    if (result.exitCode !== 0) throw new Error("Cannot create release fixture");
  }
  const sha = Bun.spawnSync(["git", "rev-parse", "HEAD"], { cwd: checkout })
    .stdout.toString()
    .trim();
  await writeFile(
    join(bin, "railway"),
    '#!/bin/sh\nprintf "%s\\n" "$@" > "$RELEASE_TEST_MARKER"\nprintf "CI=%s\\n" "$CI" >> "$RELEASE_TEST_MARKER"\nexit "${RELEASE_TEST_EXIT:-0}"\n',
  );
  await chmod(join(bin, "railway"), 0o755);
  env = {
    ...process.env,
    CI: "true",
    PATH: `${bin}:${process.env.PATH}`,
    GITHUB_ACTIONS: "true",
    GITHUB_EVENT_NAME: "push",
    GITHUB_REF: "refs/heads/main",
    GITHUB_SHA: sha,
    CHECK_RESULT: "success",
    RAILWAY_TOKEN: "test-placeholder-not-a-real-token",
    RAILWAY_PROJECT_ID: "test-project",
    RAILWAY_SERVICE_ID: "test-service",
    RAILWAY_ENVIRONMENT_ID: "test-environment",
    RELEASE_TEST_MARKER: marker,
  };
});
afterAll(async () => {
  if (root) await rm(root, { recursive: true, force: true });
});

async function run(overrides: Record<string, string | undefined> = {}) {
  await rm(marker, { force: true });
  const child = Bun.spawn([process.execPath, script], {
    cwd: checkout,
    env: { ...env, ...overrides },
    stdout: "pipe",
    stderr: "pipe",
  });
  const stderr = await new Response(child.stderr).text();
  return {
    code: await child.exited,
    stderr,
    called: await Bun.file(marker).exists(),
  };
}

for (const result of [
  "failure",
  "skipped",
  "cancelled",
  "timed_out",
  "neutral",
  "",
]) {
  test(`release never invokes Railway after ${result || "missing"} check`, async () => {
    const outcome = await run({ CHECK_RESULT: result });
    expect(outcome.code).toBe(1);
    expect(outcome.called).toBe(false);
    expect(outcome.stderr).toContain("successful main push check");
  });
}
test("release blocks PRs, other branches, mismatched SHA and missing credentials", async () => {
  for (const override of [
    { GITHUB_EVENT_NAME: "pull_request" },
    { GITHUB_REF: "refs/heads/feature" },
    { GITHUB_SHA: "a".repeat(40) },
    { RAILWAY_TOKEN: "" },
    { RAILWAY_SERVICE_ID: "" },
  ]) {
    const outcome = await run(override);
    expect(outcome.code).toBe(1);
    expect(outcome.called).toBe(false);
  }
});
test("only the exact checked clean commit reaches the configured target", async () => {
  const outcome = await run();
  expect(outcome.code).toBe(0);
  expect(outcome.called).toBe(true);
  const args = await Bun.file(marker).text();
  expect(args).toContain(`git:${env.GITHUB_SHA}`);
  expect(args).toContain(
    "test-project\n--service\ntest-service\n--environment\ntest-environment",
  );
  expect(args).not.toContain(env.RAILWAY_TOKEN!);
  expect(args).toContain("CI=false");
});
test("deployment process failure is not reported as success", async () => {
  const outcome = await run({ RELEASE_TEST_EXIT: "17" });
  expect(outcome.called).toBe(true);
  expect(outcome.code).toBe(17);
});
test("unchecked local source changes block a release", async () => {
  await writeFile(join(checkout, "unchecked.txt"), "not checked");
  try {
    const outcome = await run();
    expect(outcome.code).toBe(1);
    expect(outcome.called).toBe(false);
    expect(outcome.stderr).toContain("unchecked changes");
  } finally {
    await rm(join(checkout, "unchecked.txt"));
  }
});
