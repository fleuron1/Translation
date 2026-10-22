import { NextResponse } from "next/server";
import { askJson, errorResponse } from "@/lib/gemini";
import { langName } from "@/lib/types";
import type { Direction } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 90;

/**
 * Original practice text, written to order.
 *
 * Project Gutenberg is wildly uneven by language: French has over four
 * thousand titles and Lithuanian has one. For the thin catalogues there is
 * nothing to read, and for a beginner even the rich ones open at a level
 * that is far too hard. This writes something new instead — an original
 * piece at a stated level, on a theme, which then behaves like any other
 * book in the app.
 */

const LEVELS: Record<string, string> = {
  beginner:
    "Present tense almost throughout, with the commonest thousand words or so. Short sentences, one clause each. Concrete things a learner can picture: food, weather, a room, a journey, a conversation. No idioms, no subjunctive, no literary inversion.",
  easy: "Past and present, mostly short sentences but some joined with and, but, because. Everyday vocabulary with a few less common words that the surrounding sentence makes guessable. The occasional common idiom.",
  intermediate:
    "The full range of ordinary tenses, including the past and the conditional, and the subjunctive where the language genuinely requires it. Sentences of varied length, some subordination. Idioms used naturally. Vocabulary beyond the everyday where the subject calls for it.",
  advanced:
    "Write as a good contemporary author would, with no concessions. Long sentences where they serve the piece, subordination, irony, figurative language, and precise uncommon vocabulary.",
};

const SCHEMA = {
  type: "OBJECT",
  properties: {
    title: { type: "STRING", description: "A short title, in the language of the piece." },
    text: {
      type: "STRING",
      description:
        "The piece itself, as plain prose in paragraphs separated by a blank line. No heading, no translation, no notes, no markdown.",
    },
    note: {
      type: "STRING",
      description: "One sentence in English on what the piece is about, for the shelf.",
    },
  },
  required: ["title", "text", "note"],
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      lang?: string;
      direction?: Direction;
      level?: string;
      theme?: string;
      words?: number;
      model?: string;
    };

    const direction: Direction = body.direction === "into-target" ? "into-target" : "into-english";
    // Reverse mode means the learner reads English and writes the language.
    const writtenIn = direction === "into-target" ? "English" : langName(body.lang ?? "es");
    const level = LEVELS[body.level ?? "easy"] ?? LEVELS.easy;
    const words = Math.max(120, Math.min(900, body.words ?? 400));
    const theme = body.theme?.trim();

    const { title, text, note } = await askJson<{ title: string; text: string; note: string }>({
      model: body.model,
      system: `You write original short prose in ${writtenIn} for people learning to read it.

Everything you write must be your own invention. Never reproduce, translate, adapt or closely paraphrase any existing book, story, song, poem, film or article, and never use characters or plots from one. If a theme suggests a known work, write something entirely your own that merely shares the subject.

Write a whole small thing with a beginning and an end — a scene, an episode, a short story — not an extract that stops in the middle. It should be worth reading in its own right: a learner who understands it should feel they got something, not just decoded an exercise. Avoid the flat textbook register of invented dialogues.

Write only in ${writtenIn}. No translation, no glossary, no notes, no title inside the text itself.`,
      prompt:
        `Write roughly ${words} words.\n\nLEVEL:\n${level}\n\n` +
        (theme
          ? `SUBJECT: ${theme}\n\nTreat that as a starting point and invent freely from it.`
          : `SUBJECT: your choice. Pick something concrete and human — a small incident, a journey, a misunderstanding, a piece of work, a meal, a departure. Avoid the obvious language-textbook topics.`),
      schema: SCHEMA,
      temperature: 0.9,
    });

    if (!text?.trim()) {
      return NextResponse.json({ error: "Nothing came back. Try again." }, { status: 502 });
    }

    return NextResponse.json({ title: title?.trim() || "Untitled", text: text.trim(), note });
  } catch (error) {
    const { status, body } = errorResponse(error);
    return NextResponse.json(body, { status });
  }
}
