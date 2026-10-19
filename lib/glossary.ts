"use client";

import { quickGloss } from "./common-words";
import { glossary as store } from "./db";
import type { Direction, GlossEntry } from "./types";

/**
 * Word lookups that are already there when you click.
 *
 * Two layers sit in front of the model. A passage is glossed in one
 * background call as soon as it appears, so by the time you reach for a word
 * it is in memory; and every gloss is kept in IndexedDB, so the common words
 * are instant for good — the second time you meet "sino" there is no network
 * at all.
 *
 * A single-word lookup remains as the fallback for anything the sweep missed.
 */

export type Term = {
  term: string;
  lemma: string;
  pos: string;
  here: string;
  note?: string;
};

const memory = new Map<string, Term>();
const inFlight = new Map<string, Promise<void>>();

/** The language of the words on screen, which is not always the one being learned. */
export function textLanguage(lang: string, direction: Direction): string {
  return direction === "into-target" ? "en" : lang;
}

function keyFor(lang: string, direction: Direction, term: string): string {
  return `${lang}:${direction}:${term.toLocaleLowerCase(lang)}`;
}

/**
 * Instant if we have it, null if the caller should go and ask.
 *
 * A gloss from the sweep wins over the built-in table, because it has read
 * the sentence; the table is what answers before the sweep lands, and what
 * answers function words without any request at all.
 */
export function cached(lang: string, direction: Direction, term: string): Term | null {
  const swept = memory.get(keyFor(lang, direction, term));
  if (swept) return swept;

  const quick = quickGloss(textLanguage(lang, direction), term);
  return quick ? { term, ...quick } : null;
}

/** Checks the durable cache too, which survives a reload. */
export async function lookup(
  lang: string,
  direction: Direction,
  term: string,
): Promise<Term | null> {
  const key = keyFor(lang, direction, term);
  const hit = memory.get(key);
  if (hit) return hit;

  try {
    const saved = await store.get(key);
    if (saved) {
      const entry = { term: saved.term, lemma: saved.lemma, pos: saved.pos, here: saved.here, note: saved.note };
      memory.set(key, entry);
      return entry;
    }
  } catch {
    // IndexedDB unavailable: fall through to asking.
  }
  return null;
}

export async function remember(
  lang: string,
  direction: Direction,
  terms: Term[],
): Promise<void> {
  const at = Date.now();
  for (const term of terms) {
    const key = keyFor(lang, direction, term.term);
    memory.set(key, term);
    try {
      await store.put({ key, at, ...term } as GlossEntry);
    } catch {
      // Not worth failing a lookup over.
    }
  }
}

/**
 * Glosses a whole passage in the background. Safe to call on every passage
 * change: repeat calls for the same text collapse into one request.
 */
export function prefetch(
  passage: string,
  lang: string,
  direction: Direction,
  model: string,
): Promise<void> {
  const key = `${lang}:${direction}:${passage.slice(0, 64)}:${passage.length}`;
  const running = inFlight.get(key);
  if (running) return running;

  const task = (async () => {
    try {
      const response = await fetch("/api/glossary", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ passage, lang, direction, model }),
      });
      const data = await response.json();
      if (response.ok && Array.isArray(data.terms)) {
        await remember(lang, direction, data.terms as Term[]);
      }
    } catch {
      // A failed sweep just means clicks fall back to single lookups.
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, task);
  return task;
}

/** True once the sweep for this passage has finished, successfully or not. */
export function isSweeping(passage: string, lang: string, direction: Direction): boolean {
  return inFlight.has(`${lang}:${direction}:${passage.slice(0, 64)}:${passage.length}`);
}
