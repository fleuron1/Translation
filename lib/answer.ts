/**
 * Splitting what the learner typed.
 *
 * Deliberately NOT lib/segment.ts's splitSentences(). That one splits typeset
 * book prose, where a full stop only ends a sentence if the next thing looks
 * like the start of one — a capital, an opening quote, an inverted question
 * mark. In a textarea that rule is wrong: someone typing quickly writes "he
 * makes an excuse. it is not the real reason." and every boundary is missed.
 *
 * It also has to stay separate. segment() calls splitSentences(), and moving
 * passage boundaries renumbers every book — which is the whole reason
 * SEGMENTER_VERSION, Progress.anchor and Attempt.textHash exist. Relaxing it
 * in place would send every stored reading position through relocation and
 * silently orphan synced attempts keyed by passage hash.
 *
 * Spans rather than strings, so the answer can be shown back exactly as it
 * was written — the learner's own line breaks and spacing intact — instead of
 * a quietly reflowed copy of it.
 */

export type Span = { start: number; end: number };

/** Multi-letter abbreviations only; a lone initial is not worth the false join. */
const ABBREV =
  /\b(?:Sr|Sra|Srta|Dr|Dra|Dña|Ud|Uds|Vd|Prof|Mr|Mrs|Ms|St|etc|vs|núm|pág|págs|cap|vol|fig|art|approx|no)\.$/i;

const TERMINAL = /[.!?…]/;
const TRAILING = /[.!?…»”"'’)\]]/;

export function splitAnswer(text: string): Span[] {
  const spans: Span[] = [];
  let start = -1;

  const close = (endExclusive: number) => {
    if (start < 0) return;
    let end = endExclusive;
    while (end > start && /\s/.test(text[end - 1])) end--;
    if (end > start) spans.push({ start, end });
    start = -1;
  };

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (start < 0 && !/\s/.test(char)) start = i;

    // A line break is a boundary in a textarea even without punctuation.
    if (char === "\n") {
      close(i);
      continue;
    }

    if (start < 0 || !TERMINAL.test(char)) continue;

    // Swallow runs of terminal punctuation and any closing quotes.
    let end = i;
    while (end + 1 < text.length && TRAILING.test(text[end + 1])) end++;

    const rest = text.slice(end + 1);
    if (rest !== "" && !/^\s/.test(rest)) {
      // No space after a full stop is usually "3.500" or "example.com" — but
      // for a beginner it is just as often a missing space between sentences.
      // Letter-dot-letter is a boundary; digits and addresses are not.
      const before = text[i - 1] ?? "";
      const after = rest[0];
      const joinsWords = /\p{L}/u.test(before) && /\p{L}/u.test(after);
      const addressy = /(?:https?:\/\/|www\.|@)/i.test(text.slice(Math.max(0, start), end + 8));
      if (!joinsWords || addressy) {
        i = end;
        continue;
      }
    }
    if (ABBREV.test(text.slice(start, end + 1))) {
      i = end;
      continue;
    }

    close(end + 1);
    i = end;
  }

  close(text.length);
  return spans;
}
