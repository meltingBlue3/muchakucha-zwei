export interface ChangedLine { kind: 'added' | 'removed'; text: string }

// Beyond this many line pairs a line-by-line comparison is too slow for a confirmation screen.
const MAX_COMPARED_PAIRS = 250_000;

/**
 * The lines an edit removes and adds, in document order, from a longest-common-subsequence walk.
 * Returns null when the texts are too long to compare; callers then show only the size of the change.
 */
export function changedLines(before: string, after: string): ChangedLine[] | null {
  const left = before.split('\n');
  const right = after.split('\n');
  if (left.length * right.length > MAX_COMPARED_PAIRS) return null;
  const width = right.length + 1;
  const common = new Uint32Array((left.length + 1) * width);
  for (let i = left.length - 1; i >= 0; i--) {
    for (let j = right.length - 1; j >= 0; j--) {
      common[i * width + j] = left[i] === right[j] ? common[(i + 1) * width + j + 1]! + 1 : Math.max(common[(i + 1) * width + j]!, common[i * width + j + 1]!);
    }
  }
  const lines: ChangedLine[] = [];
  let i = 0;
  let j = 0;
  while (i < left.length || j < right.length) {
    if (i < left.length && j < right.length && left[i] === right[j]) { i++; j++; }
    else if (j >= right.length || (i < left.length && common[(i + 1) * width + j]! >= common[i * width + j + 1]!)) lines.push({ kind: 'removed', text: left[i++]! });
    else lines.push({ kind: 'added', text: right[j++]! });
  }
  return lines;
}

/** Characters an edit drops when it shrinks a text enough to suggest content was lost by mistake. */
export function suspiciousShrink(before: string, after: string): number | null {
  const lost = before.length - after.length;
  return lost >= 200 && after.length < before.length * 0.7 ? lost : null;
}
