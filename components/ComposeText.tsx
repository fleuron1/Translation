"use client";

import { useState } from "react";
import { langName } from "@/lib/types";
import type { Book, Settings } from "@/lib/types";

/**
 * Practice text written to order.
 *
 * For most languages Project Gutenberg either has nothing worth reading or
 * opens far above a beginner's head. This asks for an original piece at a
 * chosen level instead, and it then behaves like any other book: segmented,
 * graded, synced.
 */

const LEVELS = [
  { value: "beginner", label: "Beginner", hint: "present tense, commonest words, short sentences" },
  { value: "easy", label: "Easy", hint: "past and present, everyday words, some longer sentences" },
  { value: "intermediate", label: "Intermediate", hint: "full range of tenses, idiom, subordination" },
  { value: "advanced", label: "Advanced", hint: "written as an author would, no concessions" },
];

const LENGTHS = [
  { value: 250, label: "Short" },
  { value: 450, label: "Medium" },
  { value: 750, label: "Long" },
];

export default function ComposeText({
  settings,
  onAdd,
}: {
  settings: Settings;
  onAdd: (book: Book) => void;
}) {
  const [open, setOpen] = useState(false);
  const [level, setLevel] = useState("easy");
  const [words, setWords] = useState(450);
  const [theme, setTheme] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const producing = settings.direction === "into-target";
  const writtenIn = producing ? "English" : langName(settings.lang);

  async function compose() {
    setBusy(true);
    setError(null);
    try {
      const written = await fetch("/api/compose", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          lang: settings.lang,
          direction: settings.direction,
          level,
          words,
          theme,
          model: settings.model,
        }),
      });
      const piece = await written.json();
      if (!written.ok) throw new Error(piece.error ?? "Could not write anything.");

      // Segmented by the same path as pasted text, so it reads identically.
      const cut = await fetch("/api/book", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          text: piece.text,
          title: piece.title,
          author: "Written for you",
          lang: producing ? "en" : settings.lang,
          maxChars: settings.maxChars,
        }),
      });
      const made = await cut.json();
      if (!cut.ok) throw new Error(made.error ?? "Could not split that up.");

      onAdd({
        ...(made.book as Book),
        lang: settings.lang,
        direction: settings.direction,
        source: "generated",
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not write anything.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm text-accent underline decoration-dotted underline-offset-4"
      >
        write me something to translate
      </button>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-faint">
        An original piece in {writtenIn}, at whatever level you want.
      </p>

      <div className="flex flex-wrap gap-2">
        <select
          value={level}
          onChange={(event) => setLevel(event.target.value)}
          className="rounded-lg border border-rule bg-card px-2 py-1.5 text-sm"
          aria-label="Level"
        >
          {LEVELS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          value={words}
          onChange={(event) => setWords(Number(event.target.value))}
          className="rounded-lg border border-rule bg-card px-2 py-1.5 text-sm"
          aria-label="Length"
        >
          {LENGTHS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <p className="text-xs text-faint">{LEVELS.find((l) => l.value === level)?.hint}</p>

      <input
        value={theme}
        onChange={(event) => setTheme(event.target.value)}
        placeholder="About anything in particular? (optional)"
        className="w-full rounded-lg border border-rule bg-card px-3 py-2 text-sm"
      />

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={compose}
          disabled={busy}
          className="rounded-lg border border-rule px-3 py-2 text-sm text-muted hover:text-ink disabled:opacity-40"
        >
          {busy ? "writing…" : "write it"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-faint hover:text-ink"
        >
          never mind
        </button>
      </div>

      {error && <p className="text-sm text-bad">{error}</p>}
      <p className="text-xs text-faint">
        Written by a model, so it is practice material rather than an author&apos;s prose — treat it
        as a sparring partner, not a model of style.
      </p>
    </div>
  );
}
