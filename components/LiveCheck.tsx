"use client";

import { useEffect, useRef, useState } from "react";
import { splitAnswer } from "@/lib/answer";
import type { Direction } from "@/lib/types";

/**
 * Feedback while you are still writing.
 *
 * Three things keep this from being wasteful. It waits for a pause rather
 * than firing on keystrokes; it never checks the clause under the cursor,
 * because judging a half-written thought is noise; and every verdict is
 * cached against the exact text of its clause, so fixing the end of a
 * paragraph re-checks one clause instead of all of them.
 *
 * The full grade on submit is unchanged — this is the cheap pass that tells
 * you where to look while the sentence is still in your head.
 */

type State = "ok" | "warn" | "bad";
type Verdict = { state: State; issue?: string };

const PAUSE = 1100;

/** Survives re-renders and passages: the same clause is never paid for twice. */
const cache = new Map<string, Verdict>();

const keyFor = (lang: string, direction: Direction, source: string, clause: string) =>
  `${lang}:${direction}:${source.slice(0, 40)}:${clause}`;

const STATES: Record<State, { dot: string; text: string; edge: string }> = {
  ok: { dot: "bg-good", text: "text-good", edge: "border-good" },
  warn: { dot: "bg-warn", text: "text-warn", edge: "border-warn" },
  bad: { dot: "bg-bad", text: "text-bad", edge: "border-bad" },
};

type Props = {
  source: string;
  answer: string;
  lang: string;
  direction: Direction;
  model: string;
  enabled: boolean;
};

export default function LiveCheck({ source, answer, lang, direction, model, enabled }: Props) {
  const [clauses, setClauses] = useState<{ text: string; verdict?: Verdict; pending: boolean }[]>([]);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const run = useRef(0);

  useEffect(() => {
    if (!enabled || !source.trim() || !answer.trim()) {
      setClauses([]);
      return;
    }

    const timer = setTimeout(async () => {
      const ticket = ++run.current;

      const spans = splitAnswer(answer);
      const texts = spans.map((span) => answer.slice(span.start, span.end));

      // The last clause is probably still being typed unless it has been
      // closed off. Judging it half-written would only produce noise.
      const complete = texts.map(
        (text, i) => i < texts.length - 1 || /[.!?…;:]["'»”’)\]]*$/.test(text.trim()),
      );

      const settled = texts.map((text, i) => ({
        text,
        verdict: complete[i] ? cache.get(keyFor(lang, direction, source, text)) : undefined,
        pending: complete[i] && !cache.has(keyFor(lang, direction, source, text)),
      }));
      setClauses(settled);

      const missing = settled
        .map((clause, index) => ({ index, text: clause.text }))
        .filter((clause) => settled[clause.index].pending);
      if (!missing.length) return;

      setBusy(true);
      try {
        const response = await fetch("/api/check", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ source, clauses: missing, lang, direction, model }),
        });
        const data = await response.json();
        if (ticket !== run.current) return; // the draft moved on

        if (!response.ok) throw new Error(data.error ?? "check failed");
        setFailed(false);

        for (const verdict of data.verdicts ?? []) {
          const clause = missing.find((m) => m.index === verdict.index);
          if (!clause) continue;
          cache.set(keyFor(lang, direction, source, clause.text), {
            state: verdict.state as State,
            issue: verdict.issue,
          });
        }

        setClauses(
          settled.map((clause, i) => ({
            text: clause.text,
            verdict: complete[i] ? cache.get(keyFor(lang, direction, source, clause.text)) : undefined,
            pending: false,
          })),
        );
      } catch {
        if (ticket === run.current) {
          setFailed(true);
          setClauses(settled.map((clause) => ({ ...clause, pending: false })));
        }
      } finally {
        if (ticket === run.current) setBusy(false);
      }
    }, PAUSE);

    return () => clearTimeout(timer);
  }, [answer, source, lang, direction, model, enabled]);

  if (!enabled || !clauses.length) return null;

  const judged = clauses.filter((clause) => clause.verdict);
  const problems = judged.filter((clause) => clause.verdict?.state !== "ok").length;

  return (
    <div className="mt-3 rounded-lg border border-rule bg-card/60 p-3">
      <p className="mb-2 flex items-center gap-2 text-xs text-faint">
        <span className="tracking-wide uppercase">As you write</span>
        {busy && <span className="text-accent">checking…</span>}
        {!busy && failed && <span className="text-muted">couldn&apos;t check just now</span>}
        {!busy && !failed && judged.length > 0 && (
          <span>{problems === 0 ? "nothing wrong so far" : `${problems} to look at`}</span>
        )}
      </p>

      <ul className="space-y-1.5">
        {clauses.map((clause, index) => {
          const state = clause.verdict?.state;
          const look = state ? STATES[state] : null;
          return (
            <li
              key={index}
              className={`border-l-2 pl-2 ${look ? look.edge : "border-rule"} ${
                clause.pending ? "opacity-50" : ""
              }`}
            >
              <p className="flex items-start gap-2">
                <span
                  className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${look ? look.dot : "bg-rule"}`}
                  aria-hidden
                />
                <span className="reading text-base text-ink">{clause.text}</span>
              </p>
              {clause.verdict?.issue && (
                <p className={`ml-3.5 text-xs ${look?.text ?? "text-muted"}`}>
                  {clause.verdict.issue}
                </p>
              )}
              {!state && !clause.pending && (
                <p className="ml-3.5 text-xs text-faint">still writing…</p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
