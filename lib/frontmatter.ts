/**
 * Finding where a book actually begins.
 *
 * Real editions open with pages nobody wants to translate: a title page, the
 * transcriber's credits, a copyright notice, a table of contents, a
 * dedication, a prologue. The language detector in ./language only catches
 * apparatus written in *English*, so a Spanish edition's Spanish front matter
 * goes straight through. This finds the first real chapter instead.
 *
 * The bias throughout is against cutting: over-trimming silently eats the
 * opening of the book, which is far worse than leaving a prologue in.
 */

export type Chapter = { title: string; index: number };

export type BodyStart = { index: number; startedAt?: string };

const FRONT_MATTER_HEADING =
  /^(=?\s*)(pr[óo]logo|prologo|prefacio|pre[áa]mbulo|introducci[óo]n|dedicatoria|tasa|fe de erratas|testimonio de las erratas|erratas|privilegio|aprobaci[óo]n|[íi]ndice|indice|contenido|sumario|tabla de|agradecimientos|advertencia|al lector|notas? (preliminar|del|de la|de los)|notas del transcriptor|portada|cr[ée]ditos|copyright|colof[óo]n|ap[ée]ndice|bibliograf[íi]a|glosario|vocabulario|abreviaturas|contents|table of contents|preface|foreword|introduction|dedication|acknowledgements?|index|glossary|appendix|bibliography|errata|title page|avant-propos|pr[ée]face|vorwort|einleitung|prefazione|introduzione)\b/i;

const ORDINALS: Record<string, number> = {
  primero: 1, primera: 1, primer: 1, uno: 1, una: 1,
  segundo: 2, segunda: 2, dos: 2,
  tercero: 3, tercera: 3, tercer: 3, tres: 3,
  cuarto: 4, cuarta: 4, cuatro: 4,
  quinto: 5, quinta: 5, cinco: 5,
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5,
};

function romanValue(text: string): number | null {
  if (!/^[IVXLCDM]+$/i.test(text)) return null;
  const digits: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };
  const chars = text.toLowerCase().split("");
  let total = 0;
  for (let i = 0; i < chars.length; i++) {
    const value = digits[chars[i]];
    const next = digits[chars[i + 1]];
    total += next && value < next ? -value : value;
  }
  return total;
}

/**
 * Which chapter number a heading claims, if any. Used only to notice that a
 * candidate is chapter *two* — which means chapter one was missed, and the
 * whole detection should be distrusted rather than used to cut it away.
 */
export function headingNumber(title: string): number | null {
  const cleaned = title.trim().replace(/[.:—–-]+$/, "");

  const bare = cleaned.match(/^(\d{1,3}|[IVXLCDM]{1,7})$/i)?.[1];
  if (bare) return /^\d+$/.test(bare) ? Number(bare) : romanValue(bare);

  const after = cleaned.match(
    /^=?\s*(?:cap[íi]tulo|capitulo|chapter|kapitel|chapitre|capitolo|libro|tomo|volumen|acto|escena|jornada|canto|cuadro|parte)\s+(\S+)/i,
  )?.[1];
  if (!after) return null;

  const word = after.toLowerCase().replace(/[.,:;]+$/, "");
  if (ORDINALS[word] != null) return ORDINALS[word];
  if (/^\d+$/.test(word)) return Number(word);
  return romanValue(word);
}

/** Credits, copyright pages, dedications, and tables of contents. */
export function looksLikeApparatus(passage: string): boolean {
  if (
    /project gutenberg|produced by|transcriber|proofread|e-?text prepared|this e-?book is for the use|distributed proofreading/i.test(
      passage,
    )
  ) {
    return true;
  }
  // The same notes, written in the language of the edition rather than English.
  if (
    /transcripci[óo]n|transcriptor|digitalizaci[óo]n|versi[óo]n de texto|texto sin formatear|est[áa] (indicado|representado|encerrado) (con|por|entre)|entre guiones bajos|(en|con) (letra )?cursiva|entre signos de igual/i.test(
      passage,
    )
  ) {
    return true;
  }
  // Title pages and dedications shout: mostly capitals, and short.
  const letters = passage.replace(/[^\p{L}]/gu, "");
  if (letters.length > 12 && passage.length < 500) {
    const capitals = passage.replace(/[^\p{Lu}]/gu, "").length;
    if (capitals / letters.length > 0.5) return true;
  }
  if (
    /^\s*(copyright|©|\(c\)\s|derechos reservados|todos los derechos|isbn|dep[óo]sito legal|printed in|impreso en|primera edici[óo]n|edici[óo]n digital|all rights reserved)/i.test(
      passage,
    )
  ) {
    return true;
  }

  // A contents page: most lines ending in a page number, or dot leaders.
  const lines = passage.split("\n").filter((line) => line.trim().length > 0);
  if (lines.length >= 3) {
    const listy = lines.filter(
      (line) => /\d{1,4}\s*$/.test(line.trim()) || /\.{3,}\s*\d/.test(line),
    ).length;
    if (listy >= Math.ceil(lines.length * 0.6)) return true;
  }

  // The same thing after the line breaks are lost: titles and page numbers
  // run together, so look at how heavily numbered the prose is instead.
  if (/\b_?p[áa]gs?\._?\b/i.test(passage)) return true;
  const words = passage.split(/\s+/).filter(Boolean);
  const numbers = words.filter((word) => /^\d{1,4}[.,]?$/.test(word)).length;
  if (numbers >= 4 && words.length < 150 && numbers / words.length > 0.07) return true;

  return false;
}

/** Is there real prose here, rather than more apparatus or a contents list? */
function proseFollows(passages: string[], chapters: Chapter[], from: number): boolean {
  const following = passages.slice(from, from + 5);
  if (following.length < 3) return false;

  const averageLength = following.reduce((sum, p) => sum + p.length, 0) / following.length;
  if (averageLength < 120) return false;
  if (following.some(looksLikeApparatus)) return false;

  // Headings packed close together are a table of contents, not the book.
  const crowded = chapters.filter((c) => c.index >= from && c.index < from + 4).length;
  return crowded < 3;
}

/**
 * The body of a book announces itself as a *series* of numbered headings —
 * I, II, III or Capítulo primero, Capítulo II. Front matter never does. Keying
 * off the series rather than off any single heading is what keeps a prologue
 * from passing as chapter one.
 */
export function findBodyStart(passages: string[], chapters: Chapter[]): BodyStart | null {
  if (passages.length < 20) return null;

  // Front matter is never half the book; refuse to cut further than this.
  const limit = Math.max(1, Math.floor(passages.length * 0.35));

  const numbered = chapters
    .map((chapter, at) => ({ ...chapter, at, number: headingNumber(chapter.title) }))
    .filter((chapter) => chapter.number != null);

  const accept = (index: number, title?: string): BodyStart | null =>
    index > 0 && index <= limit && proseFollows(passages, chapters, index)
      ? { index, startedAt: title }
      : null;

  // 1. A heading numbered one, confirmed by a two not far behind it.
  for (let i = 0; i < numbered.length; i++) {
    const chapter = numbered[i];
    if (chapter.index > limit) break;
    if (chapter.number !== 1) continue;
    if (FRONT_MATTER_HEADING.test(chapter.title.trim())) continue;
    if (!numbered.slice(i + 1, i + 4).some((c) => c.number === 2)) continue;

    // Already at chapter one: there is nothing in front to cut.
    if (chapter.index === 0) return null;
    const found = accept(chapter.index, chapter.title.trim());
    if (found) return found;
  }

  // 2. A series that starts at two means chapter one carries some other title
  //    — the book's name, usually — and is the heading just before it.
  for (let i = 0; i < numbered.length; i++) {
    const chapter = numbered[i];
    if (chapter.index > limit) break;
    if (chapter.number !== 2) continue;
    if (!numbered.slice(i + 1, i + 3).some((c) => c.number === 3)) continue;

    const previous = chapters[chapter.at - 1];
    if (previous && !FRONT_MATTER_HEADING.test(previous.title.trim())) {
      if (previous.index === 0) return null;
      const found = accept(previous.index, previous.title.trim());
      if (found) return found;
    }
    break;
  }

  // 3. Nothing numbered at all: begin after the last front-matter section.
  let lastFront = -1;
  for (let i = 0; i < chapters.length; i++) {
    if (chapters[i].index > limit) break;
    if (FRONT_MATTER_HEADING.test(chapters[i].title.trim())) lastFront = i;
  }
  // Walk forward past anything that turns out to be a contents list rather
  // than the book, instead of trusting the very next heading.
  for (let i = lastFront + 1; lastFront >= 0 && i < chapters.length; i++) {
    if (chapters[i].index > limit) break;
    const found = accept(chapters[i].index, chapters[i].title.trim());
    if (found) return found;
  }

  // 4. Last resort: drop a leading run of credits.
  let last = -1;
  let gap = 0;
  for (let i = 0; i < limit; i++) {
    if (looksLikeApparatus(passages[i])) {
      last = i;
      gap = 0;
    } else if (++gap > 3) {
      break;
    }
  }

  return last >= 0 && last + 1 < passages.length ? { index: last + 1 } : null;
}
