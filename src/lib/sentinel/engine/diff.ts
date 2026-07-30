// Produce a real unified diff between original and patched source code.
// We compute it ourselves rather than trusting the LLM's diff output, so the
// diff shown to the reviewer always reflects the actual patched code.

export function unifiedDiff(
  original: string,
  patched: string,
  filename = "source.js"
): string {
  const a = original.split("\n");
  const b = patched.split("\n");
  // LCS-based diff.
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array(n + 1).fill(0)
  );
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (a[i] === b[j]) dp[i][j] = dp[i + 1][j + 1] + 1;
      else dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const ops: { type: "context" | "del" | "add"; text: string }[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      ops.push({ type: "context", text: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ type: "del", text: a[i] });
      i++;
    } else {
      ops.push({ type: "add", text: b[j] });
      j++;
    }
  }
  while (i < m) {
    ops.push({ type: "del", text: a[i++] });
  }
  while (j < n) {
    ops.push({ type: "add", text: b[j++] });
  }

  // Group ops into hunks with 3 lines of context.
  const context = 3;
  const hunks: { ops: { type: "context" | "del" | "add"; text: string }[] }[] =
    [];
  let current: { ops: { type: "context" | "del" | "add"; text: string }[] } | null =
    null;
  let aLine = 1;
  let bLine = 1;

  for (let k = 0; k < ops.length; k++) {
    const op = ops[k];
    const isChange = op.type !== "context";
    if (isChange) {
      // include up to `context` preceding context ops
      if (!current) {
        current = { ops: [] };
        const start = Math.max(0, k - context);
        for (let x = start; x < k; x++) {
          current.ops.push(ops[x]);
        }
      }
      current.ops.push(op);
    } else if (current) {
      current.ops.push(op);
      // peek ahead: if next `context` consecutive run exceeds context, close hunk
      let nextChange = -1;
      for (let y = k + 1; y < ops.length; y++) {
        if (ops[y].type !== "context") {
          nextChange = y;
          break;
        }
      }
      if (nextChange === -1 || nextChange - k > context) {
        hunks.push(current);
        current = null;
      }
    }
  }
  if (current) hunks.push(current);

  const out: string[] = [];
  out.push(`--- a/${filename}`);
  out.push(`+++ b/${filename}`);

  let aPos = 1;
  let bPos = 1;
  for (const hunk of hunks) {
    // compute start lines by counting context/del before first change in hunk
    let aStart = aPos;
    let bStart = bPos;
    // advance to first op of hunk
    // We need to recompute positions; track from current aPos/bPos
    const hunkOps = hunk.ops;
    // Find leading context count
    const leadCtx = hunkOps.findIndex((o) => o.type !== "context");
    aStart = aPos + (leadCtx === -1 ? 0 : leadCtx);
    bStart = bPos + (leadCtx === -1 ? 0 : leadCtx);

    const aCount = hunkOps.filter((o) => o.type !== "add").length;
    const bCount = hunkOps.filter((o) => o.type !== "del").length;
    out.push(
      `@@ -${aStart},${aCount} +${bStart},${bCount} @@`
    );
    for (const op of hunkOps) {
      if (op.type === "context") out.push(` ${op.text}`);
      else if (op.type === "del") out.push(`-${op.text}`);
      else out.push(`+${op.text}`);
    }
    aPos += aCount;
    bPos += bCount;
  }

  return out.join("\n");
}
