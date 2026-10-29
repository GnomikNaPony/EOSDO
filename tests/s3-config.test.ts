import { expect, test } from "bun:test";
import { S3Client } from "bun";
import { s3Options } from "../src/server/s3-config";

const credentials = {
  S3_ACCESS_KEY_ID: "fixture-key",
  S3_SECRET_ACCESS_KEY: "fixture-not-a-real-secret",
  S3_BUCKET: "fixture-files-123",
};
function signedLocation(env: Record<string, string>) {
  const options = s3Options({ ...credentials, ...env });
  return {
    options,
    url: new URL(new S3Client(options).presign("version.txt")),
  };
}
test("local MinIO keeps a path-style bucket with the configured region", () => {
  const { options, url } = signedLocation({
    S3_ENDPOINT: "http://127.0.0.1:59000/",
    S3_REGION: "us-east-1",
  });
  expect(url.origin).toBe("http://127.0.0.1:59000");
  expect(url.pathname).toBe("/fixture-files-123/version.txt");
  expect(options.region).toBe("us-east-1");
});
test("Railway bucket uses its own hostname and retains region auto", () => {
  const { options, url } = signedLocation({
    S3_ENDPOINT: "https://t3.storageapi.dev",
    S3_URL_STYLE: "virtual",
    S3_REGION: "auto",
  });
  expect(url.origin).toBe("https://fixture-files-123.t3.storageapi.dev");
  expect(url.pathname).toBe("/version.txt");
  expect(options.region).toBe("auto");
  expect(url.searchParams.get("X-Amz-Credential")).toContain(
    "/auto/s3/aws4_request",
  );
});
test("already expanded virtual hostname is not prefixed twice", () => {
  const { url } = signedLocation({
    S3_ENDPOINT: "https://fixture-files-123.t3.storageapi.dev",
    S3_URL_STYLE: "virtual",
  });
  expect(url.hostname).toBe("fixture-files-123.t3.storageapi.dev");
});
test("bad endpoint origins and URL styles fail before any request", () => {
  for (const endpoint of [
    "file:///tmp/storage",
    "https://user:password@example.test",
    "https://example.test/path",
    "https://example.test?credential=unsafe",
    "https://example.test#fragment",
  ])
    expect(() => s3Options({ S3_ENDPOINT: endpoint })).toThrow();
  expect(() => s3Options({ S3_URL_STYLE: "guess" })).toThrow();
  expect(() =>
    s3Options({ S3_URL_STYLE: "virtual", S3_BUCKET: "not a hostname" }),
  ).toThrow();
});
