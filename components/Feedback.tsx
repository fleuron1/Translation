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

const BANDS = [
  { from: 85, label: "solid", tint: "bg-good/15", edge: "border-good", text: "text-good" },
  { from: 60, label: "shaky", tint: "bg-warn/15", edge: "border-warn", text: "text-warn" },
  { from: 0, label: "wrong", tint: "bg-bad/15", edge: "border-bad", text: "text-bad" },
];

const bandFor = (score: number) => BANDS.find((band) => score >= band.from) ?? BANDS[2];

/**
 * The answer, sentence by sentence.
 *
 * Hovering is an enhancement, not the mechanism: a phone has no hover, so a
 * tap pins a sentence open and it stays open until dismissed. Colour is never
 * the only signal either — each sentence carries its score and a word for its
 * band, and detail opens inline below rather than in a popover that has to be
 * caught before it disappears.
 */
function SentenceMap({ grade }: { grade: Grade }) {
  const [pinned, setPinned] = useState<number | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);

  const sentences = grade.answerSentences ?? [];
  const verdicts = new Map((grade.sentences ?? []).map((v) => [v.index, v]));
  if (sentences.length === 0 || verdicts.size === 0) return null;

  const active = pinned ?? hovered;
  const shown = active === null ? null : verdicts.get(active);

  return (
    <section>
      <h3 className="text-xs font-semibold tracking-wide text-faint uppercase">
        Your answer, sentence by sentence
      </h3>
      <p className="mt-1 mb-2 text-xs text-faint">
        Tap a sentence to keep its notes open.
      </p>

      <p className="leading-loose">
        {sentences.map((sentence, index) => {
          const verdict = verdicts.get(index);
          if (!verdict) {
            return (
              <span key={index} className="text-muted">
                {sentence}{" "}
              </span>
            );
          }
          const band = bandFor(verdict.score);
          const isActive = active === index;
          return (
            <button
              key={index}
              type="button"
              aria-expanded={isActive}
              aria-label={`Sentence ${index + 1}, ${verdict.score} out of 100, ${band.label}`}
              onMouseEnter={() => setHovered(index)}
              onMouseLeave={() => setHovered((current) => (current === index ? null : current))}
              onFocus={() => setHovered(index)}
              onBlur={() => setHovered((current) => (current === index ? null : current))}
              onClick={() => setPinned((current) => (current === index ? null : index))}
              className={`${band.tint} ${band.edge} mr-1 cursor-pointer rounded border-b-2 px-1 text-left transition ${
                isActive ? "ring-2 ring-accent" : ""
              }`}
            >
              <span className="reading text-base">{sentence}</span>
              <span className={`ml-1 align-super text-[10px] font-semibold ${band.text}`}>
                {verdict.score}
              </span>
            </button>
          );
        })}
      </p>

      {shown && (
        <div className="rise mt-3 rounded-lg border border-rule bg-paper p-3">
          <p className="flex items-baseline gap-2 text-xs">
            <span className={`font-semibold ${bandFor(shown.score).text}`}>
              {shown.score} · {bandFor(shown.score).label}
            </span>
            {pinned !== null && (
              <button
                type="button"
                onClick={() => setPinned(null)}
                className="ml-auto text-faint hover:text-ink"
              >
                close
              </button>
            )}
          </p>
          {shown.note && <p className="mt-1 text-sm text-ink">{shown.note}</p>}
          {shown.issues.length > 0 ? (
            <ul className="mt-2 space-y-1.5">
              {shown.issues.map((issue, i) => (
                <li key={i} className="text-sm">
                  <span className="rounded bg-rule px-1.5 py-0.5 text-[10px] tracking-wide text-muted uppercase">
                    {issue.kind}
                  </span>{" "}
                  <span className="reading text-base text-ink">{issue.text}</span>
                  <span className="block text-xs text-muted">{issue.why}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-sm text-muted">Nothing wrong with this one.</p>
          )}
        </div>
      )}
    </section>
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

      <SentenceMap grade={grade} />

      {grade.corrections && grade.corrections.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold tracking-wide text-faint uppercase">
            Corrections
          </h3>
          <ul className="space-y-2">
            {grade.corrections.map((item, i) => (
              <li key={i} className="rounded-lg border-l-2 border-warn bg-paper p-3 text-sm">
                <p className="reading text-base text-muted line-through decoration-warn/50">
                  {item.yours}
                </p>
                <p className="reading mt-1 text-base text-ink">{item.better}</p>
                <p className="mt-1 text-xs text-faint">{item.why}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

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
