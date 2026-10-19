"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Feedback from "./Feedback";
import WordText from "./WordText";
import { prefetch } from "@/lib/glossary";
import { langName } from "@/lib/types";
import type { Book, Gloss, Grade, Progress, Settings } from "@/lib/types";

type HintCard = { level: number; text: string; kind: string };

type Props = {
  book: Book;
  progress: Progress;
  settings: Settings;
  onProgress: (progress: Progress) => void;
  onSaveVocab: (items: { term: string; english: string; note?: string }[], index: number) => void;
  onExit: () => void;
  onOpenSettings: () => void;
};

const HINT_LABELS = {
  "into-english": ["Nudge me", "A vaguer idea is fine", "Just the hard words"],
  "into-target": ["Nudge me", "Which grammar is this?", "Just the words I need"],
};

export default function Reader({
  book,
  progress,
  settings,
  onProgress,
  onSaveVocab,
  onExit,
  onOpenSettings,
}: Props) {
  const index = Math.max(0, Math.min(book.passages.length - 1, progress.index));
  const passage = book.passages[index];
  const previous = index > 0 ? book.passages[index - 1] : null;
  const existing = progress.attempts[index];
  const producing = (book.direction ?? "into-english") === "into-target";
  const target = langName(book.lang);

  const [draft, setDraft] = useState("");
  const [hints, setHints] = useState<HintCard[]>([]);
  const [grade, setGrade] = useState<Grade | null>(null);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "grading" | "hinting" | "revealing">(null);
  const [error, setError] = useState<string | null>(null);
  const [showPrevious, setShowPrevious] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);

  // Moving between passages resets the workspace, or restores an earlier try.
  useEffect(() => {
    const attempt = progress.attempts[index];
    setDraft(attempt?.userText ?? "");
    setGrade(attempt?.grade ?? null);
    setHints([]);
    setRevealed(null);
    setError(null);
    setShowPrevious(false);
  }, [index, book.id, progress.attempts]);

  // Gloss the whole passage in the background the moment it appears, so a
  // click on any word is answered from memory. The next passage is swept
  // after it, which makes moving on instant too.
  useEffect(() => {
    if (!passage) return;
    const way = book.direction ?? "into-english";
    let live = true;
    void prefetch(passage, book.lang, way, settings.model).then(() => {
      const next = book.passages[index + 1];
      if (live && next) void prefetch(next, book.lang, way, settings.model);
    });
    return () => {
      live = false;
    };
  }, [passage, index, book.lang, book.direction, book.passages, settings.model]);

  const stats = useMemo(() => {
    const attempts = Object.values(progress.attempts);
    const scores = attempts.map((a) => a.grade.score);
    const recent = scores.slice(-20);
    return {
      done: attempts.length,
      average: recent.length ? Math.round(recent.reduce((a, b) => a + b, 0) / recent.length) : null,
    };
  }, [progress.attempts]);

  const chapter = useMemo(() => {
    let found: string | null = null;
    for (const c of book.chapters) {
      if (c.index <= index) found = c.title;
      else break;
    }
    return found;
  }, [book.chapters, index]);

  function go(to: number) {
    const next = Math.max(0, Math.min(book.passages.length - 1, to));
    onProgress({ ...progress, index: next, updatedAt: Date.now() });
  }

  async function check() {
    if (!draft.trim() || busy) return;
    setBusy("grading");
    setError(null);
    try {
      const response = await fetch("/api/grade", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          source: passage,
          userText: draft,
          lang: book.lang,
          direction: book.direction ?? "into-english",
          model: settings.model,
          title: book.title,
          author: book.author,
          previous: settings.showContext ? previous : null,
          hintsUsed: hints.length,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Grading failed.");

      const result = data as Grade;
      setGrade(result);
      onProgress({
        ...progress,
        attempts: {
          ...progress.attempts,
          [index]: {
            index,
            userText: draft,
            grade: result,
            hintsUsed: hints.length,
            at: Date.now(),
          },
        },
        updatedAt: Date.now(),
      });
      if (result.vocab.length) onSaveVocab(result.vocab, index);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Grading failed.");
    } finally {
      setBusy(null);
    }
  }

  async function askHint() {
    if (busy || hints.length >= 3) return;
    setBusy("hinting");
    setError(null);
    try {
      const level = hints.length;
      const response = await fetch("/api/hint", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          source: passage,
          lang: book.lang,
          level,
          model: settings.model,
          direction: book.direction ?? "into-english",
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not get a hint.");
      setHints((current) => [...current, data as HintCard]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not get a hint.");
    } finally {
      setBusy(null);
    }
  }

  async function reveal() {
    if (busy) return;
    setBusy("revealing");
    setError(null);
    try {
      const response = await fetch("/api/hint", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          source: passage,
          lang: book.lang,
          level: 3,
          model: settings.model,
          direction: book.direction ?? "into-english",
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not fetch the translation.");
      setRevealed((data as HintCard).text);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not fetch the translation.");
    } finally {
      setBusy(null);
    }
  }

  function saveGlossWord(gloss: Gloss) {
    onSaveVocab([{ term: gloss.term, english: gloss.here, note: gloss.note }], index);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      if (grade) go(index + 1);
      else void check();
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 pb-24 pt-6">
      <header className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-rule pb-4">
        <button
          type="button"
          onClick={onExit}
          className="text-sm text-muted hover:text-ink"
          title="Back to your shelf"
        >
          ← shelf
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold">{book.title}</h1>
          <p className="truncate text-xs text-muted">
            {chapter ?? book.author}
            {" · "}
            passage {index + 1} of {book.passages.length}
            {stats.average !== null && ` · ${stats.average}% avg over last ${Math.min(stats.done, 20)}`}
          </p>
        </div>
        <button type="button" onClick={onOpenSettings} className="text-sm text-muted hover:text-ink">
          settings
        </button>
      </header>

      <div className="mb-4 h-1 overflow-hidden rounded-full bg-rule">
        <div
          className="h-full rounded-full bg-accent transition-all"
          style={{ width: `${((index + 1) / book.passages.length) * 100}%` }}
        />
      </div>

      {index === 0 && (book.skipped?.frontMatter ?? 0) > 0 && (
        <p className="mb-4 rounded-lg border border-rule bg-card/60 p-3 text-xs text-muted">
          Started you at{" "}
          <span className="text-ink">{book.skipped?.startedAt ?? "the first chapter"}</span>, past{" "}
          {book.skipped?.frontMatter} passages of title page, credits and prologue.
        </p>
      )}

      {previous && settings.showContext && (
        <div className="mb-4">
          {showPrevious ? (
            <div className="rounded-lg border border-rule bg-card/60 p-3">
              <p className="mb-1 text-xs font-semibold tracking-wide text-faint uppercase">
                Just before this
              </p>
              <p className="reading text-base text-muted">{previous}</p>
              {progress.attempts[index - 1] && (
                <p className="mt-2 border-t border-rule pt-2 text-sm text-muted">
                  You had: {progress.attempts[index - 1].userText}
                </p>
              )}
              <button
                type="button"
                className="mt-2 text-xs text-faint hover:text-ink"
                onClick={() => setShowPrevious(false)}
              >
                hide
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="text-xs text-faint hover:text-ink"
              onClick={() => setShowPrevious(true)}
            >
              ↑ what came before
            </button>
          )}
        </div>
      )}

      <section className="rounded-xl border border-rule bg-card p-5 shadow-sm">
        <WordText
          text={passage}
          lang={book.lang}
          model={settings.model}
          direction={book.direction ?? "into-english"}
          onSaveWord={saveGlossWord}
        />
        <p className="mt-3 text-xs text-faint">
          {producing
            ? `Click any word to see how to say it in ${target}.`
            : "Click any word for a gloss."}
        </p>
      </section>

      {hints.length > 0 && (
        <ul className="mt-4 space-y-2">
          {hints.map((hint, i) => (
            <li
              key={i}
              className="rise rounded-lg border border-dashed border-rule bg-paper p-3 text-sm"
            >
              <span className="text-xs tracking-wide text-faint uppercase">{hint.kind}</span>
              <p className="mt-1 whitespace-pre-wrap text-ink">{hint.text}</p>
            </li>
          ))}
        </ul>
      )}

      <section className="mt-5">
        <label htmlFor="answer" className="text-sm font-medium">
          {producing ? `Write it in ${target}` : "What does it say?"}
        </label>
        <p className="mb-2 text-xs text-muted">
          {producing
            ? `Simple and correct beats ambitious and wrong. Both the meaning and your ${target} are marked.`
            : "Your own words are fine. Say the ideas; nobody is grading your prose."}
        </p>
        <textarea
          id="answer"
          ref={box}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          rows={5}
          spellCheck
          placeholder={
            producing
              ? `Write the passage in ${target}…`
              : "He is making an excuse, and it is obviously not the real reason…"
          }
          className="w-full resize-y rounded-lg border border-rule bg-card p-3 text-base leading-relaxed"
        />
      </section>

      {error && (
        <p className="mt-3 rounded-lg border border-bad/40 bg-bad/5 p-3 text-sm text-bad">{error}</p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {!grade ? (
          <>
            <button
              type="button"
              onClick={check}
              disabled={!draft.trim() || busy !== null}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-paper disabled:opacity-40"
            >
              {busy === "grading"
                ? "reading yours…"
                : producing
                  ? `Check my ${target}`
                  : "Check my understanding"}
            </button>
            <button
              type="button"
              onClick={askHint}
              disabled={busy !== null || hints.length >= 3}
              className="rounded-lg border border-rule px-3 py-2 text-sm text-muted hover:text-ink disabled:opacity-40"
            >
              {busy === "hinting"
                ? "thinking…"
                : hints.length >= 3
                  ? "no hints left"
                  : HINT_LABELS[producing ? "into-target" : "into-english"][hints.length]}
            </button>
            <button
              type="button"
              onClick={reveal}
              disabled={busy !== null}
              className="text-sm text-faint hover:text-ink disabled:opacity-40"
            >
              {busy === "revealing" ? "…" : "give up"}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => go(index + 1)}
              disabled={index >= book.passages.length - 1}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-paper disabled:opacity-40"
            >
              Next passage →
            </button>
            <button
              type="button"
              onClick={() => {
                setGrade(null);
                box.current?.focus();
              }}
              className="rounded-lg border border-rule px-3 py-2 text-sm text-muted hover:text-ink"
            >
              Try this one again
            </button>
          </>
        )}
        <span className="ml-auto text-xs text-faint">⌘/Ctrl + Enter</span>
      </div>

      {revealed && !grade && (
        <div className="rise mt-5 rounded-xl border border-rule bg-card p-5">
          <h3 className="text-xs font-semibold tracking-wide text-faint uppercase">
            What it says
          </h3>
          <p className="mt-2 text-sm text-ink">{revealed}</p>
          <button
            type="button"
            onClick={() => go(index + 1)}
            className="mt-4 rounded-lg border border-rule px-3 py-2 text-sm text-muted hover:text-ink"
          >
            Move on →
          </button>
        </div>
      )}

      {grade && (
        <div className="mt-5">
          <Feedback grade={grade} savedVocab={grade.vocab.length > 0} />
        </div>
      )}

      <nav className="mt-8 flex items-center justify-between border-t border-rule pt-4 text-sm">
        <button
          type="button"
          onClick={() => go(index - 1)}
          disabled={index === 0}
          className="text-muted hover:text-ink disabled:opacity-30"
        >
          ← previous
        </button>

        {book.chapters.length > 0 && (
          <select
            value={book.chapters.findLast((c) => c.index <= index)?.index ?? ""}
            onChange={(event) => go(Number(event.target.value))}
            className="max-w-[55%] rounded border border-rule bg-card px-2 py-1 text-xs text-muted"
            aria-label="Jump to a chapter"
          >
            {book.chapters.map((c) => (
              <option key={c.index} value={c.index}>
                {c.title}
              </option>
            ))}
          </select>
        )}

        <button
          type="button"
          onClick={() => go(index + 1)}
          disabled={index >= book.passages.length - 1}
          className="text-muted hover:text-ink disabled:opacity-30"
        >
          next →
        </button>
      </nav>

      {existing && !grade && (
        <p className="mt-4 text-xs text-faint">
          You scored {existing.grade.score} here before. Your old answer is in the box.
        </p>
      )}
    </div>
  );
}
