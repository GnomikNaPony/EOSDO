import { expect, test } from "bun:test";
import { lineDiff } from "../src/shared/version-diff";

test("line diff preserves context and locates additions/removals", () => {
  expect(lineDiff("А\nБ\nВ", "А\nГ\nВ")).toEqual({
    limited: false,
    lines: [
      { kind: "equal", text: "А", before: 1, after: 1 },
      { kind: "remove", text: "Б", before: 2, after: null },
      { kind: "add", text: "Г", before: null, after: 2 },
      { kind: "equal", text: "В", before: 3, after: 3 },
    ],
  });
  expect(lineDiff("", "Первая").lines).toEqual([
    { kind: "add", text: "Первая", before: null, after: 1 },
  ]);
  expect(
    lineDiff("А\r\nБ", "А\nБ").lines.every((l) => l.kind === "equal"),
  ).toBe(true);
  expect(lineDiff("А", "А\n").lines.at(-1)).toEqual({
    kind: "add",
    text: "",
    before: null,
    after: 2,
  });
  expect(lineDiff("", "").lines).toEqual([]);
});

test("diff reconstructs both inputs with repeated and reordered lines", () => {
  for (const [before, after] of [
    ["а\nб\nа\nв", "а\nв\nа\nб"],
    ["х", ""],
    ["\n", "\n\n"],
    ["а\nб", "б\nа"],
  ]) {
    const result = lineDiff(before!, after!);
    expect(result.limited).toBe(false);
    expect(
      result.lines
        .filter((l) => l.kind !== "add")
        .map((l) => l.text)
        .join("\n"),
    ).toBe(before!);
    expect(
      result.lines
        .filter((l) => l.kind !== "remove")
        .map((l) => l.text)
        .join("\n"),
    ).toBe(after!);
  }
});

test("large comparisons refuse explicitly without partial output", () => {
  expect(lineDiff("a".repeat(500001), "")).toEqual({
    lines: [],
    limited: true,
  });
  expect(
    lineDiff(Array(2001).fill("a").join("\n"), Array(2001).fill("b").join("\n"))
      .limited,
  ).toBe(true);
  expect(lineDiff("\n".repeat(10001), "").limited).toBe(true);
});
