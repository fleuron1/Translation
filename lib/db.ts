"use client";

import type { Book, GlossEntry, Progress, VocabEntry } from "./types";

/**
 * Books run to megabytes, which is too much for localStorage, so everything
 * durable lives in IndexedDB. This is a deliberately small wrapper: three
 * stores, promise-shaped get/put/delete/all.
 */

const DB_NAME = "gist";
const DB_VERSION = 2;
const STORES = { books: "id", progress: "bookId", vocab: "key", glossary: "key" } as const;

type StoreName = keyof typeof STORES;

export class StorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageError";
  }
}

let connection: Promise<IDBDatabase> | null = null;

/** Nothing here may hang: a pending promise would leave the app loading forever. */
function open(): Promise<IDBDatabase> {
  if (connection) return connection;

  connection = new Promise<IDBDatabase>((resolve, reject) => {
    let settled = false;
    const once = (act: () => void) => {
      if (settled) return;
      settled = true;
      act();
    };

    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      reject(new StorageError("This browser will not allow local storage, so your shelf cannot be opened."));
      return;
    }

    // Raising the version waits for every other connection to close. Another
    // tab on the old version blocks it, and without this handler the request
    // never fires at all and the app waits for it forever.
    request.onblocked = () =>
      once(() =>
        reject(
          new StorageError(
            "Another tab has this app open on an older version. Close the other tabs and reload.",
          ),
        ),
      );

    // The backstop that actually matters. A blocked upgrade does not always
    // raise "blocked" — when another version request is already outstanding it
    // simply queues, and the request never fires at all. Opening a database
    // takes milliseconds, so anything approaching this long is a hang.
    const timer = setTimeout(
      () =>
        once(() =>
          reject(
            new StorageError(
              "Your shelf would not open. This usually means another tab has the app open — close the others and reload.",
            ),
          ),
        ),
      5000,
    );

    request.onupgradeneeded = () => {
      const db = request.result;
      for (const [name, keyPath] of Object.entries(STORES)) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath });
      }
    };

    request.onsuccess = () => {
      clearTimeout(timer);
      const db = request.result;
      // If a newer tab needs to upgrade, step aside rather than blocking it.
      db.onversionchange = () => {
        db.close();
        connection = null;
      };
      once(() => resolve(db));
    };

    request.onerror = () => {
      clearTimeout(timer);
      once(() => reject(request.error ?? new StorageError("Could not open local storage.")));
    };
  }).catch((error) => {
    // Never cache a failure: a reload, or closing the other tab, should work.
    connection = null;
    throw error;
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

export const glossary = {
  get: (key: string) => run<GlossEntry | undefined>("glossary", "readonly", (s) => s.get(key)),
  put: (entry: GlossEntry) => run<IDBValidKey>("glossary", "readwrite", (s) => s.put(entry)),
  all: () => run<GlossEntry[]>("glossary", "readonly", (s) => s.getAll()),
};

/** Collapses a term to a stable key so the same word is not saved twice. */
export function vocabKey(lang: string, term: string): string {
  return `${lang}:${term.toLocaleLowerCase(lang).replace(/\s+/g, " ").trim()}`;
}
