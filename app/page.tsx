"use client";

import { useCallback, useEffect, useState } from "react";
import Library from "@/components/Library";
import Reader from "@/components/Reader";
import SettingsPanel from "@/components/SettingsPanel";
import VocabList from "@/components/VocabList";
import { books as bookStore, progress as progressStore, vocab as vocabStore, vocabKey } from "@/lib/db";
import { loadSettings, saveSettings } from "@/lib/settings";
import {
  pull,
  pullAttempts,
  recordAttempt,
  recordBook,
  recordProgress,
  recordVocab,
  startSync,
  type RemoteBook,
} from "@/lib/sync";
import { DEFAULT_SETTINGS } from "@/lib/types";
import type { Book, Progress, Settings, VocabEntry } from "@/lib/types";

type View = "library" | "read" | "words";

export default function Home() {
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<View>("library");
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [shelf, setShelf] = useState<Book[]>([]);
  const [progressById, setProgressById] = useState<Record<string, Progress>>({});
  const [vocab, setVocab] = useState<VocabEntry[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  /** Books the server knows about that this device has not built yet. */
  const [remoteBooks, setRemoteBooks] = useState<RemoteBook[]>([]);

  const refresh = useCallback(async () => {
    const [allBooks, allProgress, allVocab] = await Promise.all([
      bookStore.all(),
      progressStore.all(),
      vocabStore.all(),
    ]);
    setShelf(allBooks.sort((a, b) => b.addedAt - a.addedAt));
    setProgressById(Object.fromEntries(allProgress.map((p) => [p.bookId, p])));
    setVocab(allVocab);
  }, []);

  useEffect(() => {
    setSettings(loadSettings());
    const stopSync = startSync();

    // Local data first so the shelf paints immediately, then fold in the
    // server's copy and repaint. Reading never waits on the network.
    refresh()
      .then(() => setReady(true))
      .then(() => pull())
      .then(async (elsewhere) => {
        setRemoteBooks(elsewhere);
        await refresh();
      })
      .catch(() => setReady(true));

    return stopSync;
  }, [refresh]);

  function changeSettings(next: Settings) {
    setSettings(next);
    saveSettings(next);
  }

  async function addBook(book: Book) {
    const existing = await progressStore.get(book.id);
    await bookStore.put(book);
    if (!existing) {
      await progressStore.put({ bookId: book.id, index: 0, attempts: {}, updatedAt: Date.now() });
    }
    recordBook(book);
    setRemoteBooks((current) => current.filter((remote) => remote.id !== book.id));
    await refresh();
    await openBook(book.id);
  }

  async function removeBook(id: string) {
    await Promise.all([bookStore.remove(id), progressStore.remove(id)]);
    if (currentId === id) setCurrentId(null);
    await refresh();
  }

  /** Opening a book is when its graded attempts are worth fetching. */
  async function openBook(id: string) {
    setCurrentId(id);
    setView("read");

    const book = (await bookStore.get(id)) ?? null;
    const existing = await progressStore.get(id);
    if (!book || !existing) return;

    const merged = await pullAttempts(book, existing);
    if (merged !== existing) {
      setProgressById((current) => ({ ...current, [id]: merged }));
    }
  }

  async function updateProgress(next: Progress) {
    const previous = progressById[next.bookId];
    setProgressById((current) => ({ ...current, [next.bookId]: next }));
    await progressStore.put(next);

    const book = shelf.find((b) => b.id === next.bookId);
    if (!book) return;

    if (!previous || previous.index !== next.index) recordProgress(book, next);

    // Anything newly graded goes up on its own, keyed to the passage text.
    for (const [key, attempt] of Object.entries(next.attempts)) {
      const before = previous?.attempts[Number(key)];
      if (!before || before.at !== attempt.at) recordAttempt(book, attempt);
    }
  }

  async function saveVocab(
    items: { term: string; english: string; note?: string }[],
    passageIndex: number,
  ) {
    const book = shelf.find((b) => b.id === currentId);
    if (!book) return;

    for (const item of items) {
      const key = vocabKey(book.lang, item.term);
      const existing = await vocabStore.get(key);
      await vocabStore.put({
        key,
        term: item.term,
        english: item.english,
        note: item.note || existing?.note,
        bookId: book.id,
        bookTitle: book.title,
        passageIndex,
        lang: book.lang,
        at: Date.now(),
        seen: (existing?.seen ?? 0) + 1,
      });
    }
    const all = await vocabStore.all();
    setVocab(all);
    recordVocab(all.filter((entry) => items.some((item) => item.term === entry.term)));
  }

  /**
   * A book read on another device. Gutenberg books and pasted text can be
   * rebuilt here from the reference the server kept; a PDF cannot, since its
   * text never left the machine that opened it.
   */
  async function rebuildRemote(remote: RemoteBook) {
    const response = await fetch("/api/book", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        remote.gutenbergId
          ? {
              gutenbergId: remote.gutenbergId,
              title: remote.title,
              author: remote.author,
              lang: remote.lang,
              maxChars: remote.maxChars,
            }
          : {
              text: remote.textContent,
              title: remote.title,
              author: remote.author,
              lang: remote.lang,
              maxChars: remote.maxChars,
            },
      ),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Could not rebuild that book.");

    // Keep the server's id so the progress row already waiting matches up.
    const book = { ...(data.book as Book), id: remote.id };
    await bookStore.put(book);

    const saved = await progressStore.get(remote.id);
    if (saved) {
      // The position was stored before this device had the text to check it
      // against, so settle it now against the passages we just built.
      const { relocate } = await import("@/lib/anchor");
      const { index } = relocate(book.passages, saved.anchor ?? "", saved.index);
      if (index !== saved.index) await progressStore.put({ ...saved, index });
    } else {
      await progressStore.put({ bookId: remote.id, index: 0, attempts: {}, updatedAt: Date.now() });
    }

    setRemoteBooks((current) => current.filter((entry) => entry.id !== remote.id));
    await refresh();
    await openBook(remote.id);
  }

  async function removeVocab(key: string) {
    await vocabStore.remove(key);
    setVocab(await vocabStore.all());
  }

  const currentBook = shelf.find((b) => b.id === currentId) ?? null;
  const currentProgress = currentId
    ? (progressById[currentId] ?? { bookId: currentId, index: 0, attempts: {}, updatedAt: 0 })
    : null;

  if (!ready) {
    return (
      <main className="mx-auto max-w-3xl px-4 pt-20 text-sm text-faint">
        <p>opening your shelf…</p>
      </main>
    );
  }

  return (
    <main>
      {view === "read" && currentBook && currentProgress ? (
        <Reader
          book={currentBook}
          progress={currentProgress}
          settings={settings}
          onProgress={updateProgress}
          onSaveVocab={saveVocab}
          onExit={() => setView("library")}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      ) : view === "words" ? (
        <VocabList entries={vocab} onRemove={removeVocab} onBack={() => setView("library")} />
      ) : (
        <Library
          settings={settings}
          shelf={shelf.map((book) => ({ book, progress: progressById[book.id] }))}
          wordCount={vocab.length}
          remoteBooks={remoteBooks}
          onRebuildRemote={rebuildRemote}
          onOpen={openBook}
          onAdd={addBook}
          onRemove={removeBook}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenWords={() => setView("words")}
        />
      )}

      {settingsOpen && (
        <SettingsPanel
          settings={settings}
          onChange={changeSettings}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </main>
  );
}
