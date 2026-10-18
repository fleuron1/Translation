"use client";

import { useState } from "react";
import { LEVEL_LABEL, STARTERS } from "@/lib/starters";
import { langName } from "@/lib/types";
import type { Book, Progress, SearchResult, Settings } from "@/lib/types";

type Shelf = { book: Book; progress?: Progress };

type Props = {
  settings: Settings;
  shelf: Shelf[];
  onOpen: (bookId: string) => void;
  onAdd: (book: Book) => void;
  onRemove: (bookId: string) => void;
  onOpenSettings: () => void;
  onOpenWords: () => void;
  wordCount: number;
};

export default function Library({
  settings,
  shelf,
  onOpen,
  onAdd,
  onRemove,
  onOpenSettings,
  onOpenWords,
  wordCount,
}: Props) {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);

  const [reference, setReference] = useState("");
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pasteTitle, setPasteTitle] = useState("");

  async function load(payload: Record<string, unknown>, key: string) {
    setLoading(key);
    setError(null);
    try {
      const response = await fetch("/api/book", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...payload, lang: settings.lang, maxChars: settings.maxChars }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not load that.");
      onAdd(data.book as Book);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load that.");
    } finally {
      setLoading(null);
    }
  }

  async function search(event: React.FormEvent) {
    event.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/search?q=${encodeURIComponent(query)}&lang=${settings.lang}`,
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Search failed.");
      setResults(data.results as SearchResult[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed.");
    } finally {
      setSearching(false);
    }
  }

  const starters = STARTERS.filter((s) => s.lang === settings.lang);

  return (
    <div className="mx-auto max-w-3xl px-4 pb-24 pt-10">
      <header className="mb-10">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Gist</h1>
            <p className="mt-2 max-w-xl text-muted">
              Read a real book in {langName(settings.lang)}, a passage at a time, and write down what
              you think it means. You are graded on the ideas you got, not on your wording — a rough,
              honest paraphrase scores better than a careful guess.
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1 text-sm">
            <button type="button" onClick={onOpenWords} className="text-muted hover:text-ink">
              my words{wordCount ? ` (${wordCount})` : ""}
            </button>
            <button type="button" onClick={onOpenSettings} className="text-muted hover:text-ink">
              settings
            </button>
          </div>
        </div>
      </header>

      {error && (
        <p className="mb-6 rounded-lg border border-bad/40 bg-bad/5 p-3 text-sm text-bad">{error}</p>
      )}

      {shelf.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-3 text-xs font-semibold tracking-wide text-faint uppercase">
            Where you left off
          </h2>
          <ul className="space-y-2">
            {shelf.map(({ book, progress }) => {
              const attempts = Object.values(progress?.attempts ?? {});
              const average = attempts.length
                ? Math.round(attempts.reduce((s, a) => s + a.grade.score, 0) / attempts.length)
                : null;
              const at = (progress?.index ?? 0) + 1;
              return (
                <li
                  key={book.id}
                  className="flex items-center gap-3 rounded-lg border border-rule bg-card p-3"
                >
                  <button
                    type="button"
                    onClick={() => onOpen(book.id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <p className="truncate font-medium">{book.title}</p>
                    <p className="truncate text-xs text-muted">
                      {book.author} · passage {at} of {book.passages.length}
                      {average !== null && ` · ${average}% average`}
                    </p>
                    <div className="mt-2 h-1 overflow-hidden rounded-full bg-rule">
                      <div
                        className="h-full bg-accent"
                        style={{ width: `${(at / book.passages.length) * 100}%` }}
                      />
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemove(book.id)}
                    className="text-xs text-faint hover:text-bad"
                    title="Remove from shelf"
                  >
                    remove
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {starters.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-3 text-xs font-semibold tracking-wide text-faint uppercase">
            Start with one of these
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {starters.map((starter) => (
              <li key={starter.gutenbergId}>
                <button
                  type="button"
                  disabled={loading !== null}
                  onClick={() =>
                    load(
                      {
                        gutenbergId: starter.gutenbergId,
                        title: starter.title,
                        author: starter.author,
                      },
                      `starter-${starter.gutenbergId}`,
                    )
                  }
                  className="h-full w-full rounded-lg border border-rule bg-card p-4 text-left transition hover:border-accent disabled:opacity-50"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="reading text-lg leading-tight">{starter.title}</p>
                    <span className="shrink-0 rounded-full border border-rule px-2 py-0.5 text-[10px] tracking-wide text-faint uppercase">
                      {LEVEL_LABEL[starter.level]}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted">{starter.author}</p>
                  <p className="mt-2 text-sm text-muted">{starter.blurb}</p>
                  {loading === `starter-${starter.gutenbergId}` && (
                    <p className="mt-2 text-xs text-accent">downloading and cutting it up…</p>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mb-10">
        <h2 className="mb-3 text-xs font-semibold tracking-wide text-faint uppercase">
          Or find any public-domain book
        </h2>
        <form onSubmit={search} className="flex gap-2">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Title or author, in ${langName(settings.lang)} or English`}
            className="min-w-0 flex-1 rounded-lg border border-rule bg-card px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={searching || !query.trim()}
            className="rounded-lg border border-rule px-3 py-2 text-sm text-muted hover:text-ink disabled:opacity-40"
          >
            {searching ? "searching…" : "search"}
          </button>
        </form>
        <p className="mt-2 text-xs text-faint">
          Searches Project Gutenberg, restricted to {langName(settings.lang)}.
        </p>

        {results && (
          <ul className="mt-3 divide-y divide-rule overflow-hidden rounded-lg border border-rule bg-card">
            {results.length === 0 && (
              <li className="p-3 text-sm text-muted">Nothing came back for that.</li>
            )}
            {results.map((result) => (
              <li key={result.id}>
                <button
                  type="button"
                  disabled={loading !== null}
                  onClick={() =>
                    load(
                      { gutenbergId: result.id, title: result.title, author: result.author },
                      `result-${result.id}`,
                    )
                  }
                  className="w-full p-3 text-left hover:bg-accent-soft disabled:opacity-50"
                >
                  <p className="text-sm font-medium">{result.title}</p>
                  <p className="text-xs text-muted">
                    {result.author} · #{result.id}
                    {loading === `result-${result.id}` && " · loading…"}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mb-10 grid gap-6 sm:grid-cols-2">
        <div>
          <h2 className="mb-2 text-xs font-semibold tracking-wide text-faint uppercase">
            By catalogue number
          </h2>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const id = Number(reference.trim().match(/\d+/)?.[0]);
              if (id) void load({ gutenbergId: id }, "reference");
            }}
            className="flex gap-2"
          >
            <input
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              placeholder="2000, or a gutenberg.org link"
              className="min-w-0 flex-1 rounded-lg border border-rule bg-card px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={loading !== null}
              className="rounded-lg border border-rule px-3 py-2 text-sm text-muted hover:text-ink disabled:opacity-40"
            >
              {loading === "reference" ? "…" : "open"}
            </button>
          </form>
        </div>

        <div>
          <h2 className="mb-2 text-xs font-semibold tracking-wide text-faint uppercase">
            Your own text
          </h2>
          {pasteOpen ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void load({ text: pasteText, title: pasteTitle }, "paste");
              }}
              className="space-y-2"
            >
              <input
                value={pasteTitle}
                onChange={(event) => setPasteTitle(event.target.value)}
                placeholder="What to call it"
                className="w-full rounded-lg border border-rule bg-card px-3 py-2 text-sm"
              />
              <textarea
                value={pasteText}
                onChange={(event) => setPasteText(event.target.value)}
                rows={4}
                placeholder={`Paste ${langName(settings.lang)} text here`}
                className="w-full rounded-lg border border-rule bg-card p-3 text-sm"
              />
              <button
                type="submit"
                disabled={loading !== null || !pasteText.trim()}
                className="rounded-lg border border-rule px-3 py-2 text-sm text-muted hover:text-ink disabled:opacity-40"
              >
                {loading === "paste" ? "…" : "use this"}
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setPasteOpen(true)}
              className="text-sm text-accent underline decoration-dotted underline-offset-4"
            >
              paste a chapter, an article, anything
            </button>
          )}
        </div>
      </section>

      <footer className="border-t border-rule pt-4 text-xs text-faint">
        Book texts come from Project Gutenberg and are in the public domain. Grading, hints and
        glosses run through the Gemini API with your own key.
      </footer>
    </div>
  );
}
