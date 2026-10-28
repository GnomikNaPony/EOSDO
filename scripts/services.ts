for (const command of [
  ["docker", "compose", "up", "-d", "--wait", "postgres", "redis", "minio"],
  ["docker", "compose", "run", "--rm", "minio-init"],
]) {
  const result = Bun.spawnSync(command, {
    stdout: "inherit",
    stderr: "inherit",
  });
  if (result.exitCode !== 0) process.exit(result.exitCode);
}
