"use client";

import { useCallback, useEffect, useState } from "react";
import Library from "@/components/Library";
import Reader from "@/components/Reader";
import SettingsPanel from "@/components/SettingsPanel";
import VocabList from "@/components/VocabList";
import { books as bookStore, progress as progressStore, vocab as vocabStore, vocabKey } from "@/lib/db";
import { loadSettings, saveSettings } from "@/lib/settings";
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
    refresh().finally(() => setReady(true));
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
    await refresh();
    setCurrentId(book.id);
    setView("read");
  }

  async function removeBook(id: string) {
    await Promise.all([bookStore.remove(id), progressStore.remove(id)]);
    if (currentId === id) setCurrentId(null);
    await refresh();
  }

  async function updateProgress(next: Progress) {
    setProgressById((current) => ({ ...current, [next.bookId]: next }));
    await progressStore.put(next);
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
    setVocab(await vocabStore.all());
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
          onOpen={(id) => {
            setCurrentId(id);
            setView("read");
          }}
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
