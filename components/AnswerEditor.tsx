"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { splitAnswer } from "@/lib/answer";
import type { Direction } from "@/lib/types";

/**
 * The answer box, with mistakes marked in the text itself.
 *
 * A textarea cannot style its own contents, so the text is drawn twice: a
 * mirror underneath carries the marks, and the real textarea sits on top with
 * transparent text and a visible caret. Every native editing behaviour —
 * selection, undo, autocorrect, the mobile keyboard — keeps working, because
 * the thing you are typing into is still a textarea.
 *
 * The two layers must agree on every property that affects where a glyph
 * lands, so the typography and padding below are shared between them rather
 * than written twice.
 *
 * Hovering works by hit-testing the pointer against the marks' own rectangles
 * rather than by putting them above the textarea, which would swallow clicks
 * meant for the caret.
 */

type Fault = { text: string; instead: string; why: string };
type Verdict = { state: "ok" | "warn" | "bad"; faults: Fault[] };
type Mark = { start: number; end: number; state: "warn" | "bad"; fault: Fault };

const PAUSE = 650;

/** Keyed on the exact clause, so re-typing one clause never re-checks the rest. */
const cache = new Map<string, Verdict>();
const keyFor = (lang: string, direction: Direction, source: string, clause: string) =>
  `${lang}:${direction}:${source.slice(0, 40)}:${clause}`;

/**
 * Shared so the mirror and the textarea lay text out identically. Note the
 * absence of a font class: globals.css forces `font-family: inherit` on
 * textareas, so naming a family here would apply to the mirror only, and two
 * different fonts means two different glyph widths and every mark landing in
 * the wrong place. Both layers inherit from the page instead.
 */
const TYPOGRAPHY =
  "w-full rounded-lg border border-rule p-3 text-base leading-relaxed whitespace-pre-wrap break-words";

const LOOK = {
  bad: "underline decoration-wavy decoration-2 underline-offset-4 decoration-[var(--bad)] bg-bad/10 rounded-sm",
  warn: "underline decoration-wavy decoration-2 underline-offset-4 decoration-[var(--warn)] bg-warn/10 rounded-sm",
};

function marksFor(answer: string, source: string, lang: string, direction: Direction): Mark[] {
  const marks: Mark[] = [];
  for (const span of splitAnswer(answer)) {
    const clause = answer.slice(span.start, span.end);
    const verdict = cache.get(keyFor(lang, direction, source, clause));
    if (!verdict || verdict.state === "ok") continue;

    for (const fault of verdict.faults) {
      const at = clause.indexOf(fault.text);
      if (at < 0) continue; // the clause has moved on since it was checked
      marks.push({
        start: span.start + at,
        end: span.start + at + fault.text.length,
        state: verdict.state,
        fault,
      });
    }
  }

  // Overlapping marks would nest spans and break the offsets; keep the first.
  marks.sort((a, b) => a.start - b.start || b.end - a.end);
  const kept: Mark[] = [];
  for (const mark of marks) {
    if (kept.length && mark.start < kept[kept.length - 1].end) continue;
    kept.push(mark);
  }
  return kept;
}

type Props = {
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (event: React.KeyboardEvent) => void;
  placeholder?: string;
  source: string;
  lang: string;
  direction: Direction;
  model: string;
  enabled: boolean;
};

export default function AnswerEditor({
  value,
  onChange,
  onKeyDown,
  placeholder,
  source,
  lang,
  direction,
  model,
  enabled,
}: Props) {
  const box = useRef<HTMLTextAreaElement>(null);
  const mirror = useRef<HTMLDivElement>(null);
  const run = useRef(0);

  const [marks, setMarks] = useState<Mark[]>([]);
  const [busy, setBusy] = useState(false);
  const [hover, setHover] = useState<{ mark: Mark; x: number; y: number } | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);

  const refresh = useCallback(() => {
    setMarks(enabled ? marksFor(value, source, lang, direction) : []);
  }, [value, source, lang, direction, enabled]);

  useEffect(refresh, [refresh]);

  // Check on a pause. Everything is judged, including the clause being typed,
  // and re-judged whenever its text changes — the cache key is the clause
  // itself, so an unchanged clause is never paid for twice.
  useEffect(() => {
    if (!enabled || !source.trim() || !value.trim()) return;

    const timer = setTimeout(async () => {
      const ticket = ++run.current;
      const spans = splitAnswer(value);
      const pending = spans
        .map((span, index) => ({ index, text: value.slice(span.start, span.end) }))
        .filter((clause) => !cache.has(keyFor(lang, direction, source, clause.text)));
      if (!pending.length) return;

      setBusy(true);
      try {
        const response = await fetch("/api/check", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ source, clauses: pending, lang, direction, model }),
        });
        const data = await response.json();
        if (ticket !== run.current) return;
        if (response.ok) {
          for (const verdict of data.verdicts ?? []) {
            const clause = pending.find((p) => p.index === verdict.index);
            if (!clause) continue;
            cache.set(keyFor(lang, direction, source, clause.text), {
              state: verdict.state,
              faults: verdict.faults ?? [],
            });
          }
          refresh();
        }
      } catch {
        // A failed check just leaves the text unmarked.
      } finally {
        if (ticket === run.current) setBusy(false);
      }
    }, PAUSE);

    return () => clearTimeout(timer);
  }, [value, source, lang, direction, model, enabled, refresh]);

  const hitTest = (clientX: number, clientY: number) => {
    const nodes = mirror.current?.querySelectorAll<HTMLElement>("[data-mark]") ?? [];
    for (const node of nodes) {
      // getClientRects, not getBoundingClientRect: a mark that wraps across
      // two lines is two rectangles, and the gap between them is not part of it.
      for (const rect of node.getClientRects()) {
        if (
          clientX >= rect.left &&
          clientX <= rect.right &&
          clientY >= rect.top &&
          clientY <= rect.bottom
        ) {
          const index = Number(node.dataset.mark);
          return { mark: marks[index], x: rect.left, y: rect.bottom };
        }
      }
    }
    return null;
  };

  const shown = pinned !== null ? { mark: marks[pinned], x: hover?.x ?? 0, y: hover?.y ?? 0 } : hover;

  const pieces: React.ReactNode[] = [];
  let cursor = 0;
  marks.forEach((mark, index) => {
    if (mark.start > cursor) pieces.push(<span key={`t${index}`}>{value.slice(cursor, mark.start)}</span>);
    pieces.push(
      <span key={`m${index}`} data-mark={index} className={LOOK[mark.state]}>
        {value.slice(mark.start, mark.end)}
      </span>,
    );
    cursor = mark.end;
  });
  // The zero-width space keeps the mirror's last line present when the answer
  // ends in a newline, so the two layers stay the same height.
  pieces.push(<span key="tail">{value.slice(cursor)}&#8203;</span>);

  return (
    <div className="relative">
      <div
        ref={mirror}
        aria-hidden
        className={`${TYPOGRAPHY} pointer-events-none absolute inset-0 overflow-hidden border-transparent text-ink`}
      >
        {pieces}
      </div>

      <textarea
        ref={box}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        onScroll={(event) => {
          if (!mirror.current) return;
          mirror.current.scrollTop = event.currentTarget.scrollTop;
          mirror.current.scrollLeft = event.currentTarget.scrollLeft;
        }}
        onMouseMove={(event) => {
          if (pinned !== null) return;
          setHover(hitTest(event.clientX, event.clientY));
        }}
        onMouseLeave={() => pinned === null && setHover(null)}
        onClick={(event) => {
          const hit = hitTest(event.clientX, event.clientY);
          setHover(hit);
          setPinned(hit ? marks.indexOf(hit.mark) : null);
        }}
        rows={5}
        spellCheck
        placeholder={placeholder}
        className={`${TYPOGRAPHY} relative resize-y bg-card text-transparent caret-[var(--ink)] placeholder:text-faint`}
      />

      {enabled && (
        <p className="mt-1 h-4 text-xs text-faint">
          {busy
            ? "checking…"
            : marks.length > 0
              ? `${marks.length} to look at — hover one, or tap it`
              : value.trim()
                ? "nothing wrong so far"
                : ""}
        </p>
      )}

      {shown?.mark && (
        <div
          className="rise fixed z-30 w-64 rounded-lg border border-rule bg-card p-3 shadow-xl"
          style={{
            left: Math.max(8, Math.min(shown.x, window.innerWidth - 272)),
            top: Math.min(shown.y + 6, window.innerHeight - 140),
          }}
        >
          <p className="reading text-base text-bad line-through decoration-bad/50">
            {shown.mark.fault.text}
          </p>
          <p className="reading mt-1 text-base text-ink">{shown.mark.fault.instead}</p>
          <p className="mt-1 text-xs text-muted">{shown.mark.fault.why}</p>
          {pinned !== null && (
            <button
              type="button"
              onClick={() => {
                setPinned(null);
                setHover(null);
              }}
              className="mt-2 text-xs text-faint hover:text-ink"
            >
              close
            </button>
          )}
        </div>
      )}
    </div>
  );
}
