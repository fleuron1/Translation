/**
 * Which way you are translating.
 * "into-english" is comprehension: read the foreign text, say what it means.
 * "into-target" is production: read English, write it in the language you are learning.
 */
export type Direction = "into-english" | "into-target";

export type Verdict = "nailed" | "close" | "partial" | "off";

export type Grade = {
  score: number;
  verdict: Verdict;
  gist: string;
  captured: string[];
  missed: string[];
  wrong: { yours: string; actually: string; why: string }[];
  vocab: { term: string; english: string; note?: string }[];
  reference: string;
  note: string;
  /** The exact string that was graded, shown back verbatim rather than reflowed. */
  answerText?: string;
  /** Ranges into answerText, so spacing and line breaks survive the round trip. */
  answerSpans?: { start: number; end: number }[];
  /** Kept for attempts graded before spans existed. */
  answerSentences?: string[];
  sentences?: SentenceVerdict[];
  /** Language errors, when you are the one writing the foreign language. */
  corrections?: { yours: string; better: string; why: string }[];
};

export type SentenceIssue = {
  kind: string;
  /** The exact fragment at fault, quoted from the learner. */
  text: string;
  why: string;
};

/** A verdict on one sentence of the learner answer, keyed by its position. */
export type SentenceVerdict = {
  index: number;
  score: number;
  issues: SentenceIssue[];
  note?: string;
};

export type Hint = { level: number; text: string };

export type Gloss = {
  term: string;
  lemma: string;
  pos: string;
  here: string;
  usually?: string;
  note?: string;
};

/** A cached word gloss, so the same word is never looked up twice. */
export type GlossEntry = {
  key: string;
  term: string;
  lemma: string;
  pos: string;
  here: string;
  note?: string;
  at: number;
};

export type Attempt = {
  index: number;
  /** Hash of the passage this graded, so it survives re-segmentation. */
  textHash?: string;
  userText: string;
  grade: Grade;
  hintsUsed: number;
  at: number;
};

export type TrimReport = {
  /** Passages of English apparatus cut from the front and back. */
  apparatusBefore: number;
  apparatusAfter: number;
  /** Title page, credits, contents, dedication, prologue. */
  frontMatter: number;
  /** The heading the book was judged to start at. */
  startedAt?: string;
};

export type Book = {
  id: string;
  title: string;
  author: string;
  lang: string;
  source: "gutenberg" | "paste" | "pdf" | "generated";
  /** Defaults to into-english for books added before reverse mode existed. */
  direction?: Direction;
  gutenbergId?: number;
  passages: string[];
  chapters: { title: string; index: number }[];
  addedAt: number;
  /** Settings the passages were produced with, needed to rebuild elsewhere. */
  maxChars?: number;
  segmenterVersion?: string;
  /** What was cut when the book was loaded, so the reader can say so. */
  skipped?: TrimReport;
};

export type Progress = {
  bookId: string;
  index: number;
  /** Fingerprint of the passage at index, used to relocate after renumbering. */
  anchor?: string;
  segmenterVersion?: string;
  attempts: Record<number, Attempt>;
  updatedAt: number;
};

export type VocabEntry = {
  key: string;
  term: string;
  english: string;
  note?: string;
  bookId: string;
  bookTitle: string;
  passageIndex: number;
  lang: string;
  at: number;
  seen: number;
};

export type SearchResult = {
  id: number;
  title: string;
  author: string;
  downloads: number;
};

export type Settings = {
  /** The language being learned, whichever side of the page it is on. */
  lang: string;
  direction: Direction;
  maxChars: number;
  model: string;
  showContext: boolean;
  /** Check each clause on a typing pause, rather than only on submit. */
  liveCheck: boolean;
};

export const LANGUAGES: { code: string; name: string; gutenberg: string }[] = [
  { code: "es", name: "Spanish", gutenberg: "es" },
  { code: "fr", name: "French", gutenberg: "fr" },
  { code: "de", name: "German", gutenberg: "de" },
  { code: "it", name: "Italian", gutenberg: "it" },
  { code: "pt", name: "Portuguese", gutenberg: "pt" },
  { code: "nl", name: "Dutch", gutenberg: "nl" },
  { code: "la", name: "Latin", gutenberg: "la" },
];

export function langName(code: string): string {
  return LANGUAGES.find((l) => l.code === code)?.name ?? code;
}

export const DEFAULT_SETTINGS: Settings = {
  lang: "es",
  direction: "into-english",
  maxChars: 320,
  model: "",
  showContext: true,
  liveCheck: true,
};
