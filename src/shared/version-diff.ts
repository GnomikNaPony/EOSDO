export interface DiffLine {
  kind: "equal" | "remove" | "add";
  text: string;
  before: number | null;
  after: number | null;
}
export interface VersionDiff {
  document_id: string;
  before: { id: string; number: number; filename: string } | null;
  after: { id: string; number: number; filename: string };
  state: "ready" | "identical" | "unavailable" | "limited";
  message: string;
  lines: DiffLine[];
  added: number;
  removed: number;
  diff: string;
}

/** Bounded exact LCS. No approximate result is presented as an exact diff. */
export function lineDiff(
  before: string,
  after: string,
): {
  lines: DiffLine[];
  limited: boolean;
} {
  if (before.length + after.length > 500_000)
    return { lines: [], limited: true };
  const split = (text: string) =>
    text ? text.replaceAll("\r\n", "\n").split("\n") : [];
  const a = split(before),
    b = split(after);
  if (a.length + b.length > 10_000) return { lines: [], limited: true };
  let start = 0,
    end = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  while (
    end < a.length - start &&
    end < b.length - start &&
    a[a.length - 1 - end] === b[b.length - 1 - end]
  )
    end++;
  const n = a.length - start - end,
    m = b.length - start - end;
  // ponytail: at most 4M cells (~16 MB); a streaming diff is needed above this ceiling.
  if ((n + 1) * (m + 1) > 4_000_000) return { lines: [], limited: true };
  const width = m + 1;
  const lcs = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      lcs[i * width + j] =
        a[start + i] === b[start + j]
          ? 1 + lcs[(i + 1) * width + j + 1]!
          : Math.max(lcs[(i + 1) * width + j]!, lcs[i * width + j + 1]!);
  const lines: DiffLine[] = [];
  const equal = (i: number, j: number) =>
    lines.push({ kind: "equal", text: a[i]!, before: i + 1, after: j + 1 });
  for (let i = 0; i < start; i++) equal(i, i);
  let i = 0,
    j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[start + i] === b[start + j]) {
      equal(start + i++, start + j++);
    } else if (
      i < n &&
      (j === m || lcs[(i + 1) * width + j]! >= lcs[i * width + j + 1]!)
    ) {
      lines.push({
        kind: "remove",
        text: a[start + i]!,
        before: start + ++i,
        after: null,
      });
    } else {
      lines.push({
        kind: "add",
        text: b[start + j]!,
        before: null,
        after: start + ++j,
      });
    }
  }
  for (let k = end; k > 0; k--) equal(a.length - k, b.length - k);
  return { lines, limited: false };
}
