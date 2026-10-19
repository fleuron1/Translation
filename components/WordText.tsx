"use client";

import { useCallback, useRef, useState } from "react";
import type { Direction, Gloss } from "@/lib/types";

const TOKENS = /([\p{L}\p{M}’'-]+)/u;
const WORD = /^[\p{L}\p{M}’'-]+$/u;

type Props = {
  text: string;
  lang: string;
  model: string;
  direction?: Direction;
  onSaveWord?: (gloss: Gloss) => void;
};

type Open = { term: string; x: number; y: number };

/**
 * The passage itself. Every word is clickable for a one-word gloss — enough to
 * get unstuck without being handed the sentence.
 */
export default function WordText({ text, lang, model, direction, onSaveWord }: Props) {
  const [open, setOpen] = useState<Open | null>(null);
  const [gloss, setGloss] = useState<Gloss | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const cache = useRef(new Map<string, Gloss>());

  const lookUp = useCallback(
    async (term: string, element: HTMLElement) => {
      const rect = element.getBoundingClientRect();
      setOpen({ term, x: rect.left, y: rect.bottom });
      setError(null);
      setSaved(false);

      const cached = cache.current.get(term.toLowerCase());
      if (cached) {
        setGloss(cached);
        return;
      }

      setGloss(null);
      setLoading(true);
      try {
        const response = await fetch("/api/gloss", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ term, context: text, lang, model, direction }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Lookup failed.");
        cache.current.set(term.toLowerCase(), data as Gloss);
        setGloss(data as Gloss);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Lookup failed.");
      } finally {
        setLoading(false);
      }
    },
    [lang, model, text, direction],
  );

  return (
    <>
      <p className="reading whitespace-pre-wrap">
        {text.split(TOKENS).map((token, i) =>
          WORD.test(token) ? (
            <button
              key={i}
              type="button"
              className="word"
              title={`Look up "${token}"`}
              onClick={(event) => lookUp(token, event.currentTarget)}
            >
              {token}
            </button>
          ) : (
            <span key={i}>{token}</span>
          ),
        )}
      </p>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close"
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setOpen(null)}
          />
          <div
            className="rise fixed z-20 w-72 rounded-lg border border-rule bg-card p-3 shadow-xl"
            style={{
              left: Math.max(8, Math.min(open.x, window.innerWidth - 296)),
              top: Math.min(open.y + 6, window.innerHeight - 180),
            }}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="reading text-lg">{open.term}</span>
              <button
                type="button"
                className="text-xs text-faint hover:text-ink"
                onClick={() => setOpen(null)}
              >
                close
              </button>
            </div>

            {loading && <p className="mt-2 text-sm text-muted">looking it up…</p>}
            {error && <p className="mt-2 text-sm text-bad">{error}</p>}

            {gloss && (
              <div className="mt-2 space-y-1.5 text-sm">
                <p className="text-ink">{gloss.here}</p>
                <p className="text-xs text-muted">
                  {gloss.lemma}
                  {gloss.pos ? ` · ${gloss.pos}` : ""}
                </p>
                {gloss.usually && gloss.usually !== gloss.here && (
                  <p className="text-xs text-muted">usually: {gloss.usually}</p>
                )}
                {gloss.note && <p className="text-xs text-warn">{gloss.note}</p>}
                {onSaveWord && (
                  <button
                    type="button"
                    disabled={saved}
                    className="mt-1 rounded border border-rule px-2 py-1 text-xs text-muted hover:border-accent hover:text-accent disabled:opacity-50"
                    onClick={() => {
                      onSaveWord(gloss);
                      setSaved(true);
                    }}
                  >
                    {saved ? "saved to your words" : "save to my words"}
                  </button>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
