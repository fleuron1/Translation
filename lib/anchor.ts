/**
 * Stable addresses for passages.
 *
 * A passage index is not a durable address. The segmenter changes — the
 * front-matter work alone moved Don Quijote's first passage by 147 — and
 * maxChars is a user-facing setting, so the same book segments differently on
 * two devices. Progress stored as a bare integer silently points at the wrong
 * sentence, with nothing to signal that it happened.
 *
 * So progress travels with a fingerprint of the text it refers to, and
 * attempts are keyed by a hash of the passage they graded. Both survive
 * renumbering: the index is only ever a hint about where to start looking.
 */

/** Collapses the cosmetic differences between two segmentations of one text. */
function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’“”«»]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The opening of a passage, enough to recognise it again. */
export function fingerprint(passage: string): string {
  return normalise(passage).slice(0, 120);
}

/** FNV-1a, for keying an attempt to the exact passage it graded. */
export function passageHash(passage: string): string {
  const text = normalise(passage);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0") + ":" + text.length.toString(36);
}

export type Relocation = {
  index: number;
  /** How the index was arrived at, so the reader can admit to moving you. */
  how: "exact" | "moved" | "approximate" | "hint";
};

/**
 * Finds where a remembered passage lives in this device's segmentation.
 * Searches outward from the stored index first, since any drift is usually
 * small, then falls back to the whole book and finally to a prefix match.
 */
export function relocate(passages: string[], anchor: string, hint: number): Relocation {
  const clamp = (n: number) => Math.max(0, Math.min(passages.length - 1, n));
  if (!passages.length) return { index: 0, how: "hint" };
  if (!anchor) return { index: clamp(hint), how: "hint" };

  const start = clamp(hint);
  if (fingerprint(passages[start]) === anchor) return { index: start, how: "exact" };

  // Drift is nearly always local, so widen outward rather than scanning.
  for (let distance = 1; distance <= passages.length; distance++) {
    const before = start - distance;
    const after = start + distance;
    if (before < 0 && after >= passages.length) break;
    if (after < passages.length && fingerprint(passages[after]) === anchor) {
      return { index: after, how: "moved" };
    }
    if (before >= 0 && fingerprint(passages[before]) === anchor) {
      return { index: before, how: "moved" };
    }
  }

  // Re-segmentation splits and merges passages, so the remembered opening is
  // usually somewhere INSIDE a passage now rather than at its start — at a
  // larger passage size it is simply swallowed by a bigger one. The question
  // to ask is which passage currently contains that text, not which one
  // begins with it.
  const head = anchor.slice(0, 50);
  if (head.length >= 16) {
    let best = -1;
    let bestDistance = Infinity;
    for (let i = 0; i < passages.length; i++) {
      if (!normalise(passages[i]).includes(head)) continue;
      // A short opening can recur; prefer the occurrence nearest where the
      // position was last seen.
      const distance = Math.abs(i - start);
      if (distance < bestDistance) {
        best = i;
        bestDistance = distance;
      }
    }
    if (best >= 0) return { index: best, how: "approximate" };
  }

  return { index: start, how: "hint" };
}
