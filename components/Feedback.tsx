"use client";

import { useState } from "react";
import type { Grade } from "@/lib/types";

const VERDICTS: Record<Grade["verdict"], { label: string; color: string }> = {
  nailed: { label: "Nailed it", color: "text-good" },
  close: { label: "Nearly there", color: "text-good" },
  partial: { label: "Partly there", color: "text-warn" },
  off: { label: "Misread", color: "text-bad" },
};

function ScoreRing({ score, verdict }: { score: number; verdict: Grade["verdict"] }) {
  const stroke = verdict === "off" ? "var(--bad)" : verdict === "partial" ? "var(--warn)" : "var(--good)";
  const circumference = 2 * Math.PI * 26;
  return (
    <svg width="68" height="68" viewBox="0 0 68 68" className="shrink-0" aria-hidden>
      <circle cx="34" cy="34" r="26" fill="none" stroke="var(--rule)" strokeWidth="6" />
      <circle
        cx="34"
        cy="34"
        r="26"
        fill="none"
        stroke={stroke}
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={`${(score / 100) * circumference} ${circumference}`}
        transform="rotate(-90 34 34)"
      />
      <text
        x="34"
        y="39"
        textAnchor="middle"
        fontSize="18"
        fontWeight="600"
        fill="var(--ink)"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
      >
        {score}
      </text>
    </svg>
  );
}

export default function Feedback({ grade, savedVocab }: { grade: Grade; savedVocab: boolean }) {
  const [showReference, setShowReference] = useState(false);
  const verdict = VERDICTS[grade.verdict] ?? VERDICTS.partial;

  return (
    <div className="rise space-y-5 rounded-xl border border-rule bg-card p-5">
      <div className="flex items-start gap-4">
        <ScoreRing score={grade.score} verdict={grade.verdict} />
        <div className="min-w-0 flex-1">
          <p className={`font-semibold ${verdict.color}`}>{verdict.label}</p>
          <p className="mt-1 text-sm text-ink">{grade.note}</p>
          <p className="mt-2 text-sm text-muted">
            <span className="text-faint">The passage says: </span>
            {grade.gist}
          </p>
        </div>
      </div>

      {grade.wrong.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold tracking-wide text-faint uppercase">Misreadings</h3>
          <ul className="space-y-2">
            {grade.wrong.map((item, i) => (
              <li key={i} className="rounded-lg border-l-2 border-bad bg-paper p-3 text-sm">
                <p className="text-muted line-through decoration-bad/50">{item.yours}</p>
                <p className="mt-1 text-ink">{item.actually}</p>
                <p className="mt-1 text-xs text-faint">{item.why}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {grade.captured.length > 0 && (
          <section>
            <h3 className="text-xs font-semibold tracking-wide text-faint uppercase">Got</h3>
            <ul className="mt-2 space-y-1 text-sm text-muted">
              {grade.captured.map((item, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-good">✓</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        {grade.missed.length > 0 && (
          <section>
            <h3 className="text-xs font-semibold tracking-wide text-faint uppercase">Missed</h3>
            <ul className="mt-2 space-y-1 text-sm text-muted">
              {grade.missed.map((item, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-warn">·</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {grade.vocab.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold tracking-wide text-faint uppercase">
            Words worth keeping{savedVocab && <span className="normal-case"> — saved</span>}
          </h3>
          <ul className="mt-2 flex flex-wrap gap-2">
            {grade.vocab.map((item, i) => (
              <li
                key={i}
                className="rounded-full border border-rule bg-paper px-3 py-1 text-sm"
                title={item.note}
              >
                <span className="reading text-base">{item.term}</span>
                <span className="text-faint"> — </span>
                <span className="text-muted">{item.english}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div>
        {showReference ? (
          <div className="rounded-lg bg-accent-soft p-3">
            <h3 className="text-xs font-semibold tracking-wide text-faint uppercase">
              One faithful translation
            </h3>
            <p className="mt-1 text-sm text-ink">{grade.reference}</p>
            <p className="mt-2 text-xs text-faint">
              Yours does not need to match this — only to mean the same thing.
            </p>
          </div>
        ) : (
          <button
            type="button"
            className="text-sm text-accent underline decoration-dotted underline-offset-4"
            onClick={() => setShowReference(true)}
          >
            Compare with a full translation
          </button>
        )}
      </div>
    </div>
  );
}
