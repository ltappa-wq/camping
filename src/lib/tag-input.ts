// Pure helpers for the TagInput component. Live separate from the
// React component so they can be unit-tested without a DOM testing
// runtime (no @testing-library/react dependency).

const SEPARATOR = /[,\n\t]+/;

export type CommitOptions = {
  /** Optional cap. Tags beyond this are ignored. */
  maxTags?: number;
  /** When true, only allow values that already appear in `suggestions`. */
  readOnly?: boolean;
  suggestions?: ReadonlyArray<string>;
};

/**
 * Compute the next tag list after committing free-text input.
 *
 * - Splits on commas, newlines, and tabs.
 * - Trims each part; drops empties.
 * - Drops duplicates (vs. existing tags AND vs. earlier parts in the
 *   same input).
 * - Honors `maxTags` — stops once the cap is reached, doesn't error.
 * - In `readOnly` mode, drops parts that aren't in `suggestions`.
 *
 * Returns the same array reference when nothing would change, so the
 * component can skip an onChange call.
 */
export function commitTags(
  current: ReadonlyArray<string>,
  raw: string,
  opts: CommitOptions = {},
): string[] {
  const parts = raw
    .split(SEPARATOR)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (parts.length === 0) return current.slice();

  const next = current.slice();
  const seen = new Set(current);
  const suggestionSet =
    opts.readOnly && opts.suggestions
      ? new Set(opts.suggestions)
      : null;

  for (const p of parts) {
    if (seen.has(p)) continue;
    if (opts.maxTags != null && next.length >= opts.maxTags) break;
    if (suggestionSet && !suggestionSet.has(p)) continue;
    next.push(p);
    seen.add(p);
  }

  return next;
}

/**
 * Remove the tag at `index`. Out-of-range indices return the input
 * unchanged so the caller can be careless with bounds.
 */
export function removeTagAt(
  current: ReadonlyArray<string>,
  index: number,
): string[] {
  if (index < 0 || index >= current.length) return current.slice();
  return current.filter((_, i) => i !== index);
}

/**
 * Filter a suggestion pool against the current tag set + a typing
 * draft. Already-selected suggestions drop out; case-insensitive
 * substring match against the draft. Returns up to `limit` results.
 */
export function filterSuggestions(
  suggestions: ReadonlyArray<string>,
  current: ReadonlyArray<string>,
  draft: string,
  limit = 50,
): string[] {
  const currentSet = new Set(current);
  const draftLower = draft.trim().toLowerCase();
  const out: string[] = [];
  for (const s of suggestions) {
    if (currentSet.has(s)) continue;
    if (draftLower && !s.toLowerCase().includes(draftLower)) continue;
    out.push(s);
    if (out.length >= limit) break;
  }
  return out;
}
