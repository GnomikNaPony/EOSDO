import type { S3Options } from "bun";

export function s3Options(env: Record<string, string | undefined>): S3Options {
  const style = env.S3_URL_STYLE ?? "path";
  if (style !== "path" && style !== "virtual")
    throw new Error("S3_URL_STYLE must be path or virtual");
  const endpoint = new URL(env.S3_ENDPOINT ?? "http://127.0.0.1:9000");
  if (
    !["http:", "https:"].includes(endpoint.protocol) ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash ||
    endpoint.pathname !== "/"
  )
    throw new Error(
      "S3_ENDPOINT must be an HTTP(S) origin without credentials",
    );
  const bucket = env.S3_BUCKET ?? "eosdo";
  if (style === "virtual") {
    if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket))
      throw new Error("S3_BUCKET must be a DNS-compatible bucket name");
    // Bun treats an explicit virtual endpoint as the complete bucket hostname.
    if (!endpoint.hostname.startsWith(`${bucket}.`))
      endpoint.hostname = `${bucket}.${endpoint.hostname}`;
  }
  return {
    endpoint: endpoint.origin,
    bucket,
    region: env.S3_REGION ?? "us-east-1",
    accessKeyId: env.S3_ACCESS_KEY_ID ?? "eosdo",
    secretAccessKey: env.S3_SECRET_ACCESS_KEY ?? "eosdo-development-secret",
    virtualHostedStyle: style === "virtual",
  };
}
