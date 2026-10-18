import { findBookSpan } from "./language";

/**
 * Turns a raw public-domain book file into translation-sized passages.
 *
 * Gutenberg plain text is hard-wrapped at ~70 columns, so lines have to be
 * rejoined into paragraphs before anything else can be trusted. Many editions
 * also bury the book under English front and back matter, which gets trimmed.
 */

export type Segmented = {
  passages: string[];
  chapters: { title: string; index: number }[];
  trimmed: { leading: number; trailing: number } | null;
};

export type SegmentOptions = {
  lang?: string;
  /** Pasted text is taken as-is; downloaded files get their apparatus trimmed. */
  trimApparatus?: boolean;
};

const ABBREV =
  /(?:\b(?:Sr|Sra|Srta|Srs|Dr|Dra|Da|Dña|D|Ud|Uds|Vd|Vds|Excmo|Ilmo|etc|núm|pág|págs|cap|vol|fig|art|Mr|Mrs|Ms|St|M|Mme|Mlle|Hr|Fr)|\b[A-ZÁÉÍÓÚÜÑ])\.$/;

const OPENERS = /[A-ZÁÉÍÓÚÜÑ¿¡«—–"'(\[0-9]/;

export function toParagraphs(raw: string): string[] {
  const lines = raw.replace(/\r\n?/g, "\n").split("\n");
  const paragraphs: string[] = [];
  let buffer: string[] = [];

  const flush = () => {
    if (!buffer.length) return;
    const joined = buffer.join(" ").replace(/\s+/g, " ").trim();
    if (joined) paragraphs.push(joined);
    buffer = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flush();
      continue;
    }
    // A new speech turn starts its own paragraph even without a blank line.
    if (buffer.length && /^[—–]\s*\S/.test(trimmed)) flush();
    buffer.push(trimmed);
  }
  flush();
  return paragraphs;
}

export function isHeading(p: string): boolean {
  // Chapter titles often run on ("Capítulo primero. Que trata de la condición
  // y ejercicio del famoso hidalgo..."), so these get a longer leash.
  const labelled =
    /^(CAP[IÍ]TULO|CAPITULO|LIBRO|PARTE|TOMO|SECCI[OÓ]N|ACTO|ESCENA|PR[OÓ]LOGO|PROLOGO|EP[IÍ]LOGO|INTRODUCCI[OÓ]N|PREFACIO|DEDICATORIA|CHAPTER)\b/i;
  if (p.length <= 200 && labelled.test(p)) return true;

  // A bare numeral on its own line is a section break.
  if (/^[IVXLCDM]+\.?$/.test(p) || /^\d{1,3}\.?$/.test(p)) return true;

  if (p.length > 90) return false;

  // All-caps lines are headings, but a lone shouted word in dialogue is not.
  const letters = p.replace(/[^\p{L}]/gu, "");
  const words = p.split(/\s+/).filter((w) => /\p{L}/u.test(w));
  return letters.length >= 3 && letters === letters.toUpperCase() && words.length >= 2;
}

export function splitSentences(paragraph: string): string[] {
  const out: string[] = [];
  let current = "";

  for (let i = 0; i < paragraph.length; i++) {
    current += paragraph[i];
    if (!/[.!?…]/.test(paragraph[i])) continue;

    // Swallow runs of terminal punctuation and any closing quotes or brackets.
    while (i + 1 < paragraph.length && /[.!?…»”"’)\]]/.test(paragraph[i + 1])) {
      current += paragraph[++i];
    }

    const rest = paragraph.slice(i + 1);
    if (rest === "") break;
    if (!/^\s/.test(rest)) continue; // e.g. 3.500, or a web address
    if (ABBREV.test(current.trim())) continue;

    const nextChar = rest.match(/^\s+(\S)/)?.[1];
    if (nextChar && !OPENERS.test(nextChar)) continue;

    out.push(current.trim());
    current = "";
  }

  if (current.trim()) out.push(current.trim());
  return out;
}

/** Packs pieces into units of at most maxChars, keeping each piece whole. */
function pack(pieces: string[], maxChars: number): string[] {
  const units: string[] = [];
  let current = "";
  for (const piece of pieces) {
    if (!current) current = piece;
    else if (current.length + 1 + piece.length <= maxChars) current += " " + piece;
    else {
      units.push(current);
      current = piece;
    }
  }
  if (current) units.push(current);
  return units;
}

/**
 * Nineteenth-century sentences can run a whole page. Past about 1.4x the
 * target size, break at clause boundaries so a passage stays translatable.
 */
function splitLongSentence(sentence: string, maxChars: number): string[] {
  const ceiling = maxChars * 1.4;
  if (sentence.length <= ceiling) return [sentence];

  let pieces = sentence.split(/(?<=[;:])\s+|\s+(?=[—–]\s*\p{L})/u).filter(Boolean);
  if (pieces.some((p) => p.length > ceiling)) {
    pieces = pieces.flatMap((p) => (p.length > ceiling ? p.split(/(?<=,)\s+/) : [p]));
  }
  return pack(pieces, maxChars);
}

export function segment(
  raw: string,
  maxChars = 320,
  options: SegmentOptions = {},
): Segmented {
  const paragraphs = toParagraphs(raw);
  const passages: string[] = [];
  const chapters: { title: string; index: number }[] = [];

  let pending: string[] = [];
  let pendingLength = 0;

  const flush = () => {
    if (!pending.length) return;
    const text = pending.join("\n");
    pending = [];
    pendingLength = 0;
    // Page numbers and stray marks are not worth a translation attempt.
    if (text.replace(/\s/g, "").length > 24) passages.push(text);
  };

  for (const paragraph of paragraphs) {
    if (isHeading(paragraph)) {
      flush();
      if (!chapters.some((c) => c.index === passages.length)) {
        chapters.push({ title: paragraph, index: passages.length });
      }
      continue;
    }
    const sentences = splitSentences(paragraph).flatMap((s) => splitLongSentence(s, maxChars));
    for (const unit of pack(sentences, maxChars)) {
      if (pendingLength && pendingLength + unit.length + 1 > maxChars) flush();
      pending.push(unit);
      pendingLength += unit.length + 1;
    }
  }
  flush();

  if (options.trimApparatus === false || !options.lang) {
    return { passages, chapters: clampChapters(chapters, passages.length), trimmed: null };
  }

  const span = findBookSpan(passages, options.lang);
  if (!span) {
    return { passages, chapters: clampChapters(chapters, passages.length), trimmed: null };
  }

  const kept = passages.slice(span.start, span.end + 1);
  const rebased = chapters
    .filter((c) => c.index >= span.start && c.index <= span.end)
    .map((c) => ({ title: c.title, index: c.index - span.start }));

  return {
    passages: kept,
    chapters: clampChapters(rebased, kept.length),
    trimmed: {
      leading: span.start,
      trailing: passages.length - 1 - span.end,
    },
  };
}

function clampChapters(chapters: { title: string; index: number }[], total: number) {
  return chapters.filter((c) => c.index < total);
}
