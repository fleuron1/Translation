/**
 * Reconstructing prose from PDF glyph positions.
 *
 * A PDF has no notion of a paragraph — only characters at coordinates — so
 * this rebuilds lines from those coordinates, drops the furniture that repeats
 * on every page, rejoins words broken across a line, and infers where one
 * paragraph ends and the next begins.
 *
 * Kept free of pdf.js imports so it can be tested on its own.
 */

export type Line = { text: string; x: number; y: number; height: number; endX: number };

export type RawItem = { str: string; width: number; height: number; transform: number[] };

/** pdf.js splits a line into runs; rebuild whole lines from the coordinates. */
export function toLines(items: RawItem[]): Line[] {
  const entries = items
    .filter((item) => typeof item.str === "string" && item.str.trim().length > 0)
    .map((item) => ({
      x: item.transform[4],
      y: item.transform[5],
      w: item.width || 0,
      h: item.height || 10,
      s: item.str,
    }))
    .sort((a, b) => b.y - a.y || a.x - b.x);

  const lines: Line[] = [];
  for (const entry of entries) {
    const last = lines[lines.length - 1];
    const sameLine = last && Math.abs(last.y - entry.y) <= Math.max(2, entry.h * 0.5);

    if (sameLine) {
      // A gap wider than a fraction of the type size is a real space; anything
      // narrower is just kerning inside a word.
      const gap = entry.x - last.endX;
      const needsSpace = gap > Math.max(1, entry.h * 0.2) && !/\s$/.test(last.text);
      last.text += (needsSpace ? " " : "") + entry.s;
      last.endX = Math.max(last.endX, entry.x + entry.w);
      last.height = Math.max(last.height, entry.h);
    } else {
      lines.push({
        text: entry.s,
        x: entry.x,
        y: entry.y,
        height: entry.h,
        endX: entry.x + entry.w,
      });
    }
  }

  return lines
    .map((line) => ({ ...line, text: line.text.replace(/\s+/g, " ").trim() }))
    .filter((line) => line.text.length > 0);
}

const isPageNumber = (text: string) => /^[\divxlcdm]{1,7}$/i.test(text.replace(/[.\s—–-]/g, ""));

/**
 * Strips the title and page number repeating at the top or bottom of every
 * page, which would otherwise be spliced into the prose as sentences.
 */
export function dropRunningHeads(pages: Line[][]): Line[][] {
  const normalise = (text: string) =>
    text.replace(/\d+/g, "#").replace(/\s+/g, " ").trim().toLowerCase();

  const counts = new Map<string, number>();
  for (const lines of pages) {
    for (const line of [lines[0], lines[lines.length - 1]]) {
      if (!line) continue;
      const key = normalise(line.text);
      if (key.length >= 2) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  const threshold = Math.max(3, pages.length * 0.35);
  const repeated = new Set(
    [...counts.entries()].filter(([, count]) => count >= threshold).map(([key]) => key),
  );

  return pages.map((lines) => {
    const trimmed = [...lines];
    for (const edge of ["first", "last"] as const) {
      const line = edge === "first" ? trimmed[0] : trimmed[trimmed.length - 1];
      if (!line) continue;
      if (repeated.has(normalise(line.text)) || isPageNumber(line.text)) {
        if (edge === "first") trimmed.shift();
        else trimmed.pop();
      }
    }
    return trimmed;
  });
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/** Joins a line onto a paragraph, repairing words split across the break. */
export function appendLine(paragraph: string, line: string): string {
  if (!paragraph) return line;
  // Soft hyphen, hyphen or non-breaking hyphen before a lowercase continuation.
  if (/[­‐-]$/.test(paragraph) && /^[\p{Ll}]/u.test(line)) {
    return paragraph.replace(/[­‐-]$/, "") + line;
  }
  return `${paragraph} ${line}`;
}

/**
 * Turns one page's lines into paragraphs. Without markup the clues are a
 * wider than usual vertical gap, an indented first line, and a short line
 * that closes a sentence.
 */
export function toParagraphs(lines: Line[]): string[] {
  if (!lines.length) return [];

  const gaps: number[] = [];
  for (let i = 1; i < lines.length; i++) gaps.push(Math.abs(lines[i - 1].y - lines[i].y));
  const typicalGap = median(gaps) || median(lines.map((l) => l.height)) || 12;

  // A low percentile rather than the median: an indent is always to the right
  // of the body margin, so a page with many paragraph openings would drag a
  // median rightwards and hide every indent after it.
  const lefts = lines.map((line) => Math.round(line.x)).sort((a, b) => a - b);
  const bodyLeft = lefts[Math.floor(lefts.length * 0.15)];
  const indent = Math.max(4, median(lines.map((l) => l.height)) * 0.6);
  const fullWidth = median(lines.map((line) => line.endX - line.x));

  const paragraphs: string[] = [];
  let current = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let breakHere = false;

    if (i > 0) {
      const previous = lines[i - 1];
      const gap = Math.abs(previous.y - line.y);
      const previousWasShort = previous.endX - previous.x < fullWidth * 0.82;

      if (gap > typicalGap * 1.55) breakHere = true;
      else if (line.x > bodyLeft + indent) breakHere = true;
      // A speech turn opens its own paragraph. In a dialogue-heavy novel every
      // line is a paragraph, so there is no indent to measure against.
      else if (/^[—–«]/.test(line.text)) breakHere = true;
      else if (previousWasShort && /[.!?…»"']$/.test(previous.text)) breakHere = true;
    }

    if (breakHere && current) {
      paragraphs.push(current);
      current = "";
    }
    current = appendLine(current, line.text);
  }

  if (current) paragraphs.push(current);
  return paragraphs;
}

/** Stitches pages together, rejoining a paragraph interrupted by a page break. */
export function joinPages(pageParagraphs: string[][]): string[] {
  const all: string[] = [];
  for (const paragraphs of pageParagraphs) {
    for (const paragraph of paragraphs) {
      const previous = all[all.length - 1];
      if (previous && !/[.!?…:»"']$/.test(previous) && /^[\p{Ll}]/u.test(paragraph)) {
        all[all.length - 1] = appendLine(previous, paragraph);
      } else {
        all.push(paragraph);
      }
    }
  }
  return all;
}
