"use client";

import { fingerprint, passageHash, relocate } from "./anchor";
import { books as bookStore, progress as progressStore, vocab as vocabStore } from "./db";
import type { Attempt, Book, Progress, VocabEntry } from "./types";

/**
 * Keeping your place across devices.
 *
 * IndexedDB stays authoritative for reading: every write lands locally first
 * and the UI never waits on the network, so the app is exactly as fast and as
 * usable offline as it was before. This module mirrors those writes to the
 * server in the background through an outbox that survives a reload, and
 * folds the server's copy back in on load.
 *
 * Positions are stored with a fingerprint of the passage text, never as a
 * bare index — see ./anchor for why.
 */

const OUTBOX_KEY = "gist.outbox";
const PUSH_DELAY = 1200;

type OutboxRow =
  | { kind: "books"; row: Record<string, unknown> }
  | { kind: "progress"; row: Record<string, unknown> }
  | { kind: "attempts"; row: Record<string, unknown> }
  | { kind: "vocab"; row: Record<string, unknown> };

export type SyncStatus = {
  configured: boolean;
  pending: number;
  lastPush?: number;
  lastPull?: number;
  error?: string;
};

let status: SyncStatus = { configured: true, pending: 0 };
const listeners = new Set<(status: SyncStatus) => void>();

export function onSyncStatus(listener: (status: SyncStatus) => void): () => void {
  listeners.add(listener);
  listener(status);
  return () => listeners.delete(listener);
}

function setStatus(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch };
  for (const listener of listeners) listener(status);
}

function readOutbox(): OutboxRow[] {
  try {
    return JSON.parse(window.localStorage.getItem(OUTBOX_KEY) ?? "[]") as OutboxRow[];
  } catch {
    return [];
  }
}

function writeOutbox(rows: OutboxRow[]) {
  try {
    window.localStorage.setItem(OUTBOX_KEY, JSON.stringify(rows));
  } catch {
    // Storage full or blocked: the next push simply starts from empty.
  }
  setStatus({ pending: rows.length });
}

let timer: ReturnType<typeof setTimeout> | null = null;

function queue(rows: OutboxRow[]) {
  if (!rows.length) return;
  writeOutbox([...readOutbox(), ...rows]);
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void flush(), PUSH_DELAY);
}

/** Sends everything waiting. Anything that fails stays queued for next time. */
export async function flush(): Promise<void> {
  const rows = readOutbox();
  if (!rows.length) return;

  const payload: Record<string, Record<string, unknown>[]> = {};
  for (const row of rows) (payload[row.kind] ??= []).push(row.row);

  try {
    const response = await fetch("/api/sync", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error ?? `Sync failed (${response.status})`);

    // Only drop what was actually sent; anything queued meanwhile survives.
    writeOutbox(readOutbox().slice(rows.length));
    setStatus({ lastPush: Date.now(), error: undefined, configured: true });
  } catch (error) {
    setStatus({ error: error instanceof Error ? error.message : "Sync failed." });
  }
}

export function recordBook(book: Book): void {
  queue([
    {
      kind: "books",
      row: {
        book_id: book.id,
        title: book.title,
        author: book.author,
        lang: book.lang,
        source: book.source,
        gutenberg_id: book.gutenbergId ?? null,
        max_chars: book.maxChars ?? 320,
        segmenter_version: book.segmenterVersion ?? null,
        // Only pasted text is worth carrying; PDFs stay on this machine.
        text_content: book.source === "paste" ? book.passages.join("\n\n") : null,
        added_at: new Date(book.addedAt).toISOString(),
        updated_at: new Date().toISOString(),
      },
    },
  ]);
}

export function recordProgress(book: Book, progress: Progress): void {
  queue([
    {
      kind: "progress",
      row: {
        book_id: progress.bookId,
        passage_index: progress.index,
        anchor: fingerprint(book.passages[progress.index] ?? ""),
        segmenter_version: book.segmenterVersion ?? null,
        updated_at: new Date(progress.updatedAt || Date.now()).toISOString(),
      },
    },
  ]);
}

export function recordAttempt(book: Book, attempt: Attempt): void {
  const passage = book.passages[attempt.index];
  if (!passage) return;
  queue([
    {
      kind: "attempts",
      row: {
        book_id: book.id,
        text_hash: attempt.textHash ?? passageHash(passage),
        user_text: attempt.userText,
        grade: attempt.grade,
        hints_used: attempt.hintsUsed,
        at: new Date(attempt.at).toISOString(),
      },
    },
  ]);
}

export function recordVocab(entries: VocabEntry[]): void {
  queue(
    entries.map((entry) => ({
      kind: "vocab" as const,
      row: {
        key: entry.key,
        term: entry.term,
        english: entry.english,
        note: entry.note ?? null,
        book_id: entry.bookId,
        book_title: entry.bookTitle,
        passage_index: entry.passageIndex,
        lang: entry.lang,
        seen: entry.seen,
        at: new Date(entry.at).toISOString(),
      },
    })),
  );
}

/**
 * Everything arriving from the server is treated as untrusted.
 *
 * A row whose passage_index is not a number turns into NaN, and NaN survives
 * IndexedDB — structured clone preserves it — so a single malformed row would
 * store a position the reader can never resolve and break the book on every
 * load until storage is cleared. Rows that do not make sense are skipped.
 */
function finite(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function wholeNumber(value: unknown, fallback = 0): number {
  const n = finite(value);
  return n === null ? fallback : Math.max(0, Math.trunc(n));
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export type RemoteBook = {
  id: string;
  title: string;
  author: string;
  lang: string;
  source: Book["source"];
  gutenbergId?: number;
  maxChars: number;
  textContent?: string;
  passageIndex: number;
};

/**
 * Folds the server's copy into this device. Returns the books the server
 * knows about that are not on this machine, so the shelf can offer them.
 */
export async function pull(): Promise<RemoteBook[]> {
  let data: {
    configured?: boolean;
    books?: Record<string, never>[];
    progress?: Record<string, never>[];
    vocab?: Record<string, never>[];
    error?: string;
  };

  try {
    const response = await fetch("/api/sync");
    data = await response.json();
    if (!response.ok) throw new Error(data.error ?? `Sync unavailable (${response.status})`);
  } catch (error) {
    setStatus({ error: error instanceof Error ? error.message : "Sync unavailable." });
    return [];
  }

  if (data.configured === false) {
    setStatus({ configured: false });
    return [];
  }

  const local = await bookStore.all();
  const byId = new Map(local.map((book) => [book.id, book]));

  // Vocabulary only ever grows; the newer sighting of a word wins.
  for (const row of data.vocab ?? []) {
    const remote = row as unknown as Record<string, unknown>;
    const key = text(remote.key);
    const term = text(remote.term);
    const english = text(remote.english);
    if (!key || !term || !english) continue;

    const at = finite(Date.parse(String(remote.at))) ?? Date.now();
    const existing = await vocabStore.get(key);
    if (existing && existing.at >= at) continue;

    await vocabStore.put({
      key,
      term,
      english,
      note: text(remote.note) ?? undefined,
      bookId: text(remote.book_id) ?? "",
      bookTitle: text(remote.book_title) ?? "",
      passageIndex: wholeNumber(remote.passage_index),
      lang: text(remote.lang) ?? "es",
      at,
      seen: Math.max(1, wholeNumber(remote.seen, 1)),
    });
  }

  for (const row of data.progress ?? []) {
    const remote = row as unknown as Record<string, unknown>;
    const bookId = text(remote.book_id);
    if (!bookId) continue;

    // A position that is not a number is not a position. Skipping the row
    // leaves whatever this device already knows, which is always safer than
    // overwriting it with something unusable.
    const hint = finite(remote.passage_index);
    if (hint === null) continue;

    const updatedAt = finite(Date.parse(String(remote.updated_at))) ?? 0;
    const existing = await progressStore.get(bookId);
    if (existing && existing.updatedAt >= updatedAt) continue;

    const book = byId.get(bookId);
    const anchor = text(remote.anchor) ?? "";
    // Without the book on this device the index cannot be checked yet; it is
    // relocated when the book is rebuilt.
    const resolved = book
      ? relocate(book.passages, anchor, Math.trunc(hint)).index
      : Math.trunc(hint);
    const index = book
      ? Math.max(0, Math.min(book.passages.length - 1, resolved))
      : Math.max(0, resolved);
    if (!Number.isFinite(index)) continue;

    await progressStore.put({
      bookId,
      index,
      anchor,
      segmenterVersion: text(remote.segmenter_version) ?? undefined,
      attempts: existing?.attempts ?? {},
      updatedAt,
    });
  }

  setStatus({ lastPull: Date.now(), error: undefined, configured: true });

  return (data.books ?? [])
    .map((row) => row as unknown as Record<string, string | number | null>)
    .filter((remote) => !byId.has(String(remote.book_id)))
    .map((remote) => ({
      id: String(remote.book_id),
      title: String(remote.title),
      author: String(remote.author ?? "Unknown"),
      lang: String(remote.lang ?? "es"),
      source: String(remote.source) as Book["source"],
      gutenbergId: remote.gutenberg_id ? Number(remote.gutenberg_id) : undefined,
      maxChars: Number(remote.max_chars ?? 320),
      textContent: (remote.text_content as string) ?? undefined,
      passageIndex: 0,
    }));
}

/**
 * Attempts are fetched per book and matched by passage hash, so a grade
 * always reattaches to the sentence it was given for, whatever its index is
 * on this device.
 */
export async function pullAttempts(book: Book, progress: Progress): Promise<Progress> {
  let rows: Record<string, never>[];
  try {
    const response = await fetch(`/api/sync?book=${encodeURIComponent(book.id)}`);
    const data = await response.json();
    if (!response.ok) return progress;
    rows = data.attempts ?? [];
  } catch {
    return progress;
  }
  if (!rows.length) return progress;

  const indexByHash = new Map<string, number>();
  book.passages.forEach((passage, index) => indexByHash.set(passageHash(passage), index));

  const attempts = { ...progress.attempts };
  let added = 0;

  for (const row of rows) {
    const remote = row as unknown as Record<string, string | number | null>;
    const index = indexByHash.get(String(remote.text_hash));
    if (index == null) continue; // that passage no longer exists here
    const at = Date.parse(String(remote.at));
    if (attempts[index] && attempts[index].at >= at) continue;
    attempts[index] = {
      index,
      textHash: String(remote.text_hash),
      userText: String(remote.user_text),
      grade: remote.grade as never,
      hintsUsed: Number(remote.hints_used ?? 0),
      at,
    };
    added++;
  }

  if (!added) return progress;
  const merged = { ...progress, attempts };
  await progressStore.put(merged);
  return merged;
}

/** Retries anything stranded by an offline spell. */
export function startSync(): () => void {
  setStatus({ pending: readOutbox().length });
  void flush();
  const onOnline = () => void flush();
  window.addEventListener("online", onOnline);
  return () => window.removeEventListener("online", onOnline);
}
