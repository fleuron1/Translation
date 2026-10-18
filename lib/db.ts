"use client";

import type { Book, Progress, VocabEntry } from "./types";

/**
 * Books run to megabytes, which is too much for localStorage, so everything
 * durable lives in IndexedDB. This is a deliberately small wrapper: three
 * stores, promise-shaped get/put/delete/all.
 */

const DB_NAME = "gist";
const DB_VERSION = 1;
const STORES = { books: "id", progress: "bookId", vocab: "key" } as const;

type StoreName = keyof typeof STORES;

let connection: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (connection) return connection;
  connection = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const [name, keyPath] of Object.entries(STORES)) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return connection;
}

function run<T>(
  store: StoreName,
  mode: IDBTransactionMode,
  action: (s: IDBObjectStore) => IDBRequest,
): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const request = action(tx.objectStore(store));
        request.onsuccess = () => resolve(request.result as T);
        request.onerror = () => reject(request.error);
      }),
  );
}

export const books = {
  get: (id: string) => run<Book | undefined>("books", "readonly", (s) => s.get(id)),
  all: () => run<Book[]>("books", "readonly", (s) => s.getAll()),
  put: (book: Book) => run<IDBValidKey>("books", "readwrite", (s) => s.put(book)),
  remove: (id: string) => run<undefined>("books", "readwrite", (s) => s.delete(id)),
};

export const progress = {
  get: (bookId: string) => run<Progress | undefined>("progress", "readonly", (s) => s.get(bookId)),
  all: () => run<Progress[]>("progress", "readonly", (s) => s.getAll()),
  put: (p: Progress) => run<IDBValidKey>("progress", "readwrite", (s) => s.put(p)),
  remove: (bookId: string) => run<undefined>("progress", "readwrite", (s) => s.delete(bookId)),
};

export const vocab = {
  all: () => run<VocabEntry[]>("vocab", "readonly", (s) => s.getAll()),
  get: (key: string) => run<VocabEntry | undefined>("vocab", "readonly", (s) => s.get(key)),
  put: (entry: VocabEntry) => run<IDBValidKey>("vocab", "readwrite", (s) => s.put(entry)),
  remove: (key: string) => run<undefined>("vocab", "readwrite", (s) => s.delete(key)),
};

/** Collapses a term to a stable key so the same word is not saved twice. */
export function vocabKey(lang: string, term: string): string {
  return `${lang}:${term.toLocaleLowerCase(lang).replace(/\s+/g, " ").trim()}`;
}
