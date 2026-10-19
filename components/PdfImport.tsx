"use client";

import { useRef, useState } from "react";
import { segment } from "@/lib/segment";
import { extractPdf, readPdfInfo, type PdfProgress } from "@/lib/pdf";
import type { Book, Settings } from "@/lib/types";

type Props = {
  settings: Settings;
  onAdd: (book: Book) => void;
};

type Chosen = {
  file: File;
  pageCount: number;
  title: string;
  author: string;
};

/**
 * Reads a PDF entirely in the browser — the file is never uploaded, and only
 * the passage being graded ever goes anywhere.
 */
export default function PdfImport({ settings, onAdd }: Props) {
  const [chosen, setChosen] = useState<Chosen | null>(null);
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(1);
  const [progress, setProgress] = useState<PdfProgress | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function pick(file: File) {
    setError(null);
    setBusy(true);
    setChosen(null);
    try {
      const info = await readPdfInfo(file);
      setChosen({
        file,
        pageCount: info.pageCount,
        title: info.title || file.name.replace(/\.pdf$/i, ""),
        author: info.author || "",
      });
      setFrom(1);
      setTo(info.pageCount);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open that PDF.");
    } finally {
      setBusy(false);
    }
  }

  async function run() {
    if (!chosen || busy) return;
    setBusy(true);
    setError(null);
    setProgress(null);
    try {
      const extraction = await extractPdf(chosen.file, {
        from,
        to,
        onProgress: setProgress,
      });

      // Segmenting here as well keeps the whole file on this machine.
      const { passages, chapters } = segment(extraction.text, settings.maxChars, {
        lang: settings.lang,
        trimApparatus: false,
      });

      if (!passages.length) {
        throw new Error("No usable text came out of those pages. Try a wider page range.");
      }

      onAdd({
        id: `pdf-${Date.now().toString(36)}`,
        title: chosen.title.trim() || "Untitled PDF",
        author: chosen.author.trim() || "Unknown",
        lang: settings.lang,
        source: "pdf",
        passages,
        chapters,
        addedAt: Date.now(),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read that PDF.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <div>
      <input
        ref={input}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void pick(file);
          event.target.value = "";
        }}
      />

      {!chosen ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => input.current?.click()}
          className="text-sm text-accent underline decoration-dotted underline-offset-4 disabled:opacity-50"
        >
          {busy ? "opening…" : "open a PDF from your computer"}
        </button>
      ) : (
        <div className="space-y-2">
          <input
            value={chosen.title}
            onChange={(event) => setChosen({ ...chosen, title: event.target.value })}
            placeholder="Title"
            className="w-full rounded-lg border border-rule bg-card px-3 py-2 text-sm"
          />
          <input
            value={chosen.author}
            onChange={(event) => setChosen({ ...chosen, author: event.target.value })}
            placeholder="Author (optional)"
            className="w-full rounded-lg border border-rule bg-card px-3 py-2 text-sm"
          />

          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted">pages</span>
            <input
              type="number"
              min={1}
              max={chosen.pageCount}
              value={from}
              onChange={(event) => setFrom(Number(event.target.value))}
              className="w-16 rounded-lg border border-rule bg-card px-2 py-1 text-sm"
              aria-label="First page"
            />
            <span className="text-muted">to</span>
            <input
              type="number"
              min={1}
              max={chosen.pageCount}
              value={to}
              onChange={(event) => setTo(Number(event.target.value))}
              className="w-16 rounded-lg border border-rule bg-card px-2 py-1 text-sm"
              aria-label="Last page"
            />
            <span className="text-faint">of {chosen.pageCount}</span>
          </div>
          <p className="text-xs text-faint">
            Skip the title page and contents by starting a few pages in.
          </p>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={run}
              disabled={busy}
              className="rounded-lg border border-rule px-3 py-2 text-sm text-muted hover:text-ink disabled:opacity-40"
            >
              {busy ? "reading…" : "use this"}
            </button>
            <button
              type="button"
              onClick={() => {
                setChosen(null);
                setError(null);
              }}
              className="text-xs text-faint hover:text-ink"
            >
              pick another
            </button>
          </div>

          {progress && (
            <div>
              <div className="h-1 overflow-hidden rounded-full bg-rule">
                <div
                  className="h-full bg-accent transition-all"
                  style={{ width: `${(progress.page / progress.total) * 100}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-faint">
                page {progress.page} of {progress.total}
              </p>
            </div>
          )}
        </div>
      )}

      {error && <p className="mt-2 text-sm text-bad">{error}</p>}
    </div>
  );
}
