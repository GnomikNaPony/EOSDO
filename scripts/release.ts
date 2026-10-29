// The workflow supplies the result of its dependency, never an inferred status.
export function assertReleaseAllowed(
  env: Record<string, string | undefined>,
  head: string,
  dirty: string,
) {
  if (
    env.GITHUB_ACTIONS !== "true" ||
    env.GITHUB_EVENT_NAME !== "push" ||
    env.GITHUB_REF !== "refs/heads/main" ||
    env.CHECK_RESULT !== "success"
  )
    throw new Error(
      "Release blocked: a successful main push check is required",
    );
  if (!/^[a-f0-9]{40}$/.test(env.GITHUB_SHA ?? "") || head !== env.GITHUB_SHA)
    throw new Error(
      "Release blocked: checkout differs from the checked commit",
    );
  if (dirty.trim())
    throw new Error("Release blocked: working tree contains unchecked changes");
  for (const key of [
    "RAILWAY_TOKEN",
    "RAILWAY_PROJECT_ID",
    "RAILWAY_SERVICE_ID",
    "RAILWAY_ENVIRONMENT_ID",
  ])
    if (!env[key]?.trim())
      throw new Error(`Release blocked: configure ${key} in GitHub production`);
}

if (import.meta.main) {
  try {
    const head = Bun.spawnSync(["git", "rev-parse", "HEAD"]);
    const status = Bun.spawnSync(["git", "status", "--porcelain"]);
    if (head.exitCode !== 0 || status.exitCode !== 0)
      throw new Error("Release blocked: checkout cannot be verified");
    assertReleaseAllowed(
      Bun.env,
      head.stdout.toString().trim(),
      status.stdout.toString(),
    );
    const deployment = Bun.spawn(
      [
        "railway",
        "up",
        "--project",
        Bun.env.RAILWAY_PROJECT_ID!,
        "--service",
        Bun.env.RAILWAY_SERVICE_ID!,
        "--environment",
        Bun.env.RAILWAY_ENVIRONMENT_ID!,
        "--message",
        `git:${Bun.env.GITHUB_SHA}`,
      ],
      {
        stdout: "inherit",
        stderr: "inherit",
        // Railway's CI=true mode exits after build logs; stay attached to deploy.
        env: { ...process.env, CI: "false" },
      },
    );
    process.exit(await deployment.exited);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Release blocked");
    process.exit(1);
  }
}
