/**
 * Dead-key accents, per language.
 *
 * A chord arms a mark and the next letter wears it, the way word processors
 * have always done it. Each language is given only the marks it actually
 * uses: a Finnish learner has no business being offered a cedilla, and
 * offering every mark to everyone turns a short list of useful chords into a
 * table nobody reads.
 */

export type Dead =
  | "acute"
  | "grave"
  | "circumflex"
  | "diaeresis"
  | "tilde"
  | "cedilla"
  | "macron"
  | "doubleacute"
  | "ring"
  | "stroke"
  | "breve";

/** The key that arms each mark, pressed with Ctrl. */
export const CHORD: Record<Dead, string> = {
  acute: "'",
  grave: "`",
  circumflex: "6",
  diaeresis: ";",
  tilde: "~",
  cedilla: ",",
  macron: "-",
  doubleacute: '"',
  ring: "0",
  stroke: "/",
  breve: "8",
};

/** Keys that arm a mark, including the shifted spellings of the same key. */
const ARMS: Record<string, Dead> = {
  "'": "acute",
  "`": "grave",
  "6": "circumflex",
  "^": "circumflex",
  ";": "diaeresis",
  ":": "diaeresis",
  "~": "tilde",
  ",": "cedilla",
  "-": "macron",
  '"': "doubleacute",
  "0": "ring",
  "/": "stroke",
  "8": "breve",
};

const LOWER: Record<Dead, Record<string, string>> = {
  acute: { a: "á", e: "é", i: "í", o: "ó", u: "ú", y: "ý" },
  grave: { a: "à", e: "è", i: "ì", o: "ò", u: "ù" },
  circumflex: { a: "â", e: "ê", i: "î", o: "ô", u: "û", c: "ĉ", g: "ĝ", h: "ĥ", j: "ĵ", s: "ŝ" },
  diaeresis: { a: "ä", e: "ë", i: "ï", o: "ö", u: "ü", y: "ÿ" },
  tilde: { a: "ã", n: "ñ", o: "õ" },
  cedilla: { c: "ç" },
  macron: { a: "ā", e: "ē", i: "ī", o: "ō", u: "ū" },
  doubleacute: { o: "ő", u: "ű" },
  ring: { a: "å" },
  stroke: { o: "ø" },
  breve: { u: "ŭ", g: "ğ" },
};

/** Both cases, derived rather than written twice. */
export const COMPOSE: Record<Dead, Record<string, string>> = Object.fromEntries(
  Object.entries(LOWER).map(([mark, pairs]) => [
    mark,
    Object.fromEntries(
      Object.entries(pairs).flatMap(([letter, accented]) => [
        [letter, accented],
        [letter.toUpperCase(), accented.toUpperCase()],
      ]),
    ),
  ]),
) as Record<Dead, Record<string, string>>;

export const MARK_NAME: Record<Dead, string> = {
  acute: "´ acute",
  grave: "` grave",
  circumflex: "^ circumflex",
  diaeresis: "¨ diaeresis",
  tilde: "~ tilde",
  cedilla: "¸ cedilla",
  macron: "¯ macron",
  doubleacute: "˝ double acute",
  ring: "˚ ring",
  stroke: "/ stroke",
  breve: "˘ breve",
};

type Scheme = {
  /** The marks this language actually uses, commonest first. */
  dead: Dead[];
  /** Single letters with no composing mark, inserted by Ctrl plus the key. */
  direct?: Record<string, string>;
  /** Spanish opens questions and exclamations with these. */
  inverted?: boolean;
};

const SCHEMES: Record<string, Scheme> = {
  es: { dead: ["acute", "tilde", "diaeresis"], inverted: true },
  fr: { dead: ["acute", "grave", "circumflex", "diaeresis", "cedilla"], direct: { o: "œ" } },
  de: { dead: ["diaeresis"], direct: { s: "ß" } },
  it: { dead: ["grave", "acute"] },
  pt: { dead: ["acute", "tilde", "circumflex", "cedilla", "grave"] },
  nl: { dead: ["diaeresis", "acute"] },
  la: { dead: ["macron"] },
  fi: { dead: ["diaeresis"] },
  hu: { dead: ["acute", "doubleacute", "diaeresis"] },
  sv: { dead: ["ring", "diaeresis"] },
  eo: { dead: ["circumflex", "breve"] },
  ca: { dead: ["acute", "grave", "diaeresis", "cedilla"], direct: { ".": "·" } },
  da: { dead: ["ring", "stroke"], direct: { e: "æ" } },
  nb: { dead: ["ring", "stroke"], direct: { e: "æ" } },
};

/**
 * The letter worth showing as the example. Without this the help offers the
 * first entry in the table, so Spanish would advertise its tilde with "ã"
 * when the only reason a Spanish learner wants it is ñ.
 */
const SAMPLE: Record<string, Partial<Record<Dead, string>>> = {
  es: { tilde: "ñ", diaeresis: "ü" },
  fr: { acute: "é", diaeresis: "ë" },
  de: { diaeresis: "ö" },
  it: { acute: "é" },
  pt: { acute: "á", diaeresis: "ü" },
  nl: { diaeresis: "ë", acute: "é" },
  hu: { diaeresis: "ö", doubleacute: "ő" },
  sv: { diaeresis: "ö" },
  eo: { circumflex: "ĉ" },
  ca: { diaeresis: "ï", acute: "é" },
};

export function schemeFor(lang: string): Scheme | null {
  return SCHEMES[lang] ?? null;
}

/** Which mark a key arms, but only if this language uses it. */
export function markFor(lang: string, key: string): Dead | null {
  const scheme = SCHEMES[lang];
  const mark = ARMS[key];
  return scheme && mark && scheme.dead.includes(mark) ? mark : null;
}

export function directFor(lang: string, key: string): string | null {
  return SCHEMES[lang]?.direct?.[key.toLowerCase()] ?? null;
}

export function usesInverted(lang: string): boolean {
  return Boolean(SCHEMES[lang]?.inverted);
}

/** One line of help, listing only what this language needs. */
export function accentHelp(lang: string): string | null {
  const scheme = SCHEMES[lang];
  if (!scheme) return null;

  const parts = scheme.dead.map((mark) => {
    const sample = SAMPLE[lang]?.[mark] ?? Object.values(LOWER[mark])[0];
    return `Ctrl + ${CHORD[mark]} then a letter for ${sample}`;
  });
  for (const [key, char] of Object.entries(scheme.direct ?? {})) {
    parts.push(`Ctrl + ${key} for ${char}`);
  }
  if (scheme.inverted) parts.push("Ctrl + Alt + ? and ! for ¿ ¡");
  return parts.join(" · ");
}
