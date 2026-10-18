import { NextResponse } from "next/server";
import { askJson, errorResponse } from "@/lib/gemini";
import { langName } from "@/lib/types";
import type { Grade } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const SCHEMA = {
  type: "OBJECT",
  properties: {
    score: { type: "INTEGER", description: "0-100, how much of the meaning the learner got" },
    verdict: { type: "STRING", enum: ["nailed", "close", "partial", "off"] },
    gist: { type: "STRING", description: "One plain sentence: what the passage actually says." },
    captured: {
      type: "ARRAY",
      description: "Ideas from the passage the learner did convey. Short phrases.",
      items: { type: "STRING" },
    },
    missed: {
      type: "ARRAY",
      description: "Ideas present in the original that are absent from the translation.",
      items: { type: "STRING" },
    },
    wrong: {
      type: "ARRAY",
      description: "Actual misreadings, not stylistic differences. Empty if there are none.",
      items: {
        type: "OBJECT",
        properties: {
          yours: { type: "STRING", description: "What the learner wrote." },
          actually: { type: "STRING", description: "What the original says." },
          why: { type: "STRING", description: "One short clause on the cause of the slip." },
        },
        required: ["yours", "actually", "why"],
      },
    },
    vocab: {
      type: "ARRAY",
      description: "At most 5 words or phrases the learner evidently did not know.",
      items: {
        type: "OBJECT",
        properties: {
          term: { type: "STRING", description: "The word or phrase as it appears in the passage." },
          english: { type: "STRING", description: "Its meaning here, a few words." },
          note: { type: "STRING", description: "Optional: dictionary form, or why it is tricky." },
        },
        required: ["term", "english"],
      },
    },
    reference: {
      type: "STRING",
      description: "A faithful, plain-English translation of the whole passage.",
    },
    note: { type: "STRING", description: "One honest sentence to the learner." },
  },
  required: ["score", "verdict", "gist", "captured", "missed", "wrong", "vocab", "reference", "note"],
};

function system(language: string): string {
  return `You are a patient, exacting reading tutor. Your learner is reading a real book in ${language} and writing out, in English, what they understood. They are not producing a literary translation and they are not being tested on English style. You are measuring one thing: did they actually understand the ${language}?

Grade the ideas, not the words.

Do NOT deduct for any of this:
- different wording, paraphrase, contractions, plainer or more modern register
- clauses reordered, sentences merged or split
- dropped rhetorical flourishes, as long as the content survives
- a name, place or title left untranslated
- a reasonable guess from context that lands on the right meaning

DO deduct for:
- a whole clause or idea left out
- a flipped negation, or the wrong person doing the action
- tense, mood or aspect that changes what happened (a conditional read as a fact, a subjunctive wish read as an event)
- false friends and look-alike guesses (actual, pretender, sensible, librería, embarazada, éxito...)
- inventing content that is not in the passage
- a figurative expression read literally, or the reverse

Archaic and regional usage counts as what it means in this passage, not its modern dictionary sense.

Scoring bands:
95-100 "nailed": every idea is there and nothing is invented.
75-94 "close": all the main ideas; a secondary detail or nuance is off.
45-74 "partial": the thrust is right but something that matters is missing or garbled.
0-44 "off": the passage was misread.

Be concrete and brief. Quote the ${language} you are discussing. No vague praise. "captured" and "missed" are short phrases, not sentences. If the learner left the box nearly empty or wrote something unrelated, score it low and say so plainly.`;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      source?: string;
      userText?: string;
      lang?: string;
      model?: string;
      title?: string;
      author?: string;
      previous?: string;
      hintsUsed?: number;
    };

    const source = body.source?.trim();
    const userText = body.userText?.trim();
    if (!source) return NextResponse.json({ error: "No passage to grade." }, { status: 400 });
    if (!userText) return NextResponse.json({ error: "No translation to grade." }, { status: 400 });

    const language = langName(body.lang ?? "es");
    const parts = [
      `BOOK: ${body.title ?? "unknown"}${body.author ? ` — ${body.author}` : ""}`,
    ];
    if (body.previous) {
      parts.push(
        `WHAT CAME JUST BEFORE (context only — do not grade this part):\n"""\n${body.previous}\n"""`,
      );
    }
    parts.push(`PASSAGE IN ${language.toUpperCase()}:\n"""\n${source}\n"""`);
    parts.push(`WHAT THE LEARNER UNDERSTOOD, IN ENGLISH:\n"""\n${userText}\n"""`);
    if (body.hintsUsed) {
      parts.push(
        `The learner used ${body.hintsUsed} hint(s) before answering. Mention it only if it matters.`,
      );
    }

    const grade = await askJson<Grade>({
      model: body.model,
      system: system(language),
      prompt: parts.join("\n\n"),
      schema: SCHEMA,
      temperature: 0.15,
    });

    grade.score = Math.max(0, Math.min(100, Math.round(grade.score)));
    grade.captured ??= [];
    grade.missed ??= [];
    grade.wrong ??= [];
    grade.vocab ??= [];

    return NextResponse.json(grade);
  } catch (error) {
    const { status, body } = errorResponse(error);
    return NextResponse.json(body, { status });
  }
}
