"use client";

import { useMemo, useState } from "react";
import type { VocabEntry } from "@/lib/types";

type Props = {
  entries: VocabEntry[];
  onRemove: (key: string) => void;
  onBack: () => void;
};

export default function VocabList({ entries, onRemove, onBack }: Props) {
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<"recent" | "alpha" | "frequency">("recent");

  const shown = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    const matched = needle
      ? entries.filter(
          (e) =>
            e.term.toLowerCase().includes(needle) || e.english.toLowerCase().includes(needle),
        )
      : entries.slice();
    if (sort === "alpha") return matched.sort((a, b) => a.term.localeCompare(b.term));
    if (sort === "frequency") return matched.sort((a, b) => b.seen - a.seen || b.at - a.at);
    return matched.sort((a, b) => b.at - a.at);
  }, [entries, filter, sort]);

  function exportTsv() {
    const rows = shown.map((e) =>
      [e.term, e.english, e.note ?? "", e.bookTitle].map((c) => c.replace(/\t|\n/g, " ")).join("\t"),
    );
    const blob = new Blob([rows.join("\n")], { type: "text/tab-separated-values" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "gist-words.tsv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto max-w-3xl px-4 pb-24 pt-10">
      <header className="mb-6 flex flex-wrap items-center gap-3 border-b border-rule pb-4">
        <button type="button" onClick={onBack} className="text-sm text-muted hover:text-ink">
          ← shelf
        </button>
        <h1 className="flex-1 text-lg font-semibold">
          My words <span className="text-sm font-normal text-faint">({entries.length})</span>
        </h1>
        {entries.length > 0 && (
          <button
            type="button"
            onClick={exportTsv}
            className="text-sm text-muted hover:text-ink"
            title="Tab-separated, ready for Anki"
          >
            export
          </button>
        )}
      </header>

      {entries.length === 0 ? (
        <p className="text-muted">
          Nothing yet. Words land here when a passage turns out to hinge on one you did not know, or
          when you save a gloss while reading.
        </p>
      ) : (
        <>
          <div className="mb-4 flex gap-2">
            <input
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="filter"
              className="min-w-0 flex-1 rounded-lg border border-rule bg-card px-3 py-2 text-sm"
            />
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as typeof sort)}
              className="rounded-lg border border-rule bg-card px-2 py-2 text-sm text-muted"
              aria-label="Sort"
            >
              <option value="recent">newest</option>
              <option value="alpha">a–z</option>
              <option value="frequency">most missed</option>
            </select>
          </div>

          <ul className="divide-y divide-rule overflow-hidden rounded-lg border border-rule bg-card">
            {shown.map((entry) => (
              <li key={entry.key} className="flex items-start gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p>
                    <span className="reading text-lg">{entry.term}</span>
                    <span className="text-faint"> — </span>
                    <span className="text-sm text-ink">{entry.english}</span>
                    {entry.seen > 1 && (
                      <span className="ml-2 rounded-full bg-accent-soft px-2 py-0.5 text-[10px] text-accent">
                        missed {entry.seen}×
                      </span>
                    )}
                  </p>
                  {entry.note && <p className="mt-0.5 text-xs text-warn">{entry.note}</p>}
                  <p className="mt-0.5 text-xs text-faint">
                    {entry.bookTitle} · passage {entry.passageIndex + 1}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onRemove(entry.key)}
                  className="text-xs text-faint hover:text-bad"
                >
                  remove
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
