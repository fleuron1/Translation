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

export type Attempt = {
  index: number;
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
  source: "gutenberg" | "paste" | "pdf";
  gutenbergId?: number;
  passages: string[];
  chapters: { title: string; index: number }[];
  addedAt: number;
  /** What was cut when the book was loaded, so the reader can say so. */
  skipped?: TrimReport;
};

export type Progress = {
  bookId: string;
  index: number;
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
  lang: string;
  maxChars: number;
  model: string;
  showContext: boolean;
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
  maxChars: 320,
  model: "",
  showContext: true,
};
