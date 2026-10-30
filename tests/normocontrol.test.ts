import { expect, test } from "bun:test";
import { normocontrol } from "../src/server/normocontrol";

const bytes = (text: string) => Buffer.from(text);
test("offline rules produce exact version-local text findings without a model", async () => {
  const source = bytes("Текст  документа , готов.\nЧистая строка.");
  const original = Buffer.from(source);
  const result = await normocontrol("example.txt", source);
  expect(result.state).toBe("ready");
  expect(result.findings.map((f) => f.category)).toEqual([
    "spacing",
    "punctuation",
  ]);
  expect(result.findings.every((f) => f.location === "Строка 1")).toBe(true);
  expect(result.findings[0]?.quote).toBe("Текст  документа , готов.");
  expect(source).toEqual(original);
  expect(
    (await normocontrol("clean.md", bytes("Чистый текст."))).findings,
  ).toEqual([]);
});
test("preserves tabular alignment and limits noisy output explicitly", async () => {
  expect(
    (await normocontrol("table.txt", bytes("Поле\tтекст  текста"))).findings,
  ).toEqual([]);
  expect(
    (await normocontrol("table.txt", bytes("а  б  в  г  д"))).findings,
  ).toEqual([]);
  const result = await normocontrol(
    "large.txt",
    bytes("Текст ,\n".repeat(301)),
  );
  expect(result.state).toBe("limited");
  expect(result.findings).toHaveLength(300);
});
test("empty, invalid, unsupported and oversized inputs never pass", async () => {
  for (const [name, input] of [
    ["empty.txt", bytes("")],
    ["bad.docx", bytes("PK broken")],
    ["sheet.xlsx", bytes("data")],
    ["large.txt", bytes("а".repeat(45001))],
  ] as const) {
    const result = await normocontrol(name, input);
    expect(result.state).toBe("unavailable");
    expect(result.findings).toEqual([]);
  }
});

test("long lines show the actual finding rather than their beginning", async () => {
  const report = await normocontrol(
    "long.txt",
    bytes("x".repeat(900) + "  слово"),
  );
  expect(report.findings).toHaveLength(1);
  expect(report.findings[0]?.quote).toContain("  слово");
});
