import { NextResponse } from "next/server";
import { askJson, errorResponse } from "@/lib/gemini";
import { langName } from "@/lib/types";
import type { Direction } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Checking a draft while it is being written.
 *
 * Deliberately not the grader. This runs on a typing pause, so it has to be
 * cheap and fast, and it must not moan that the answer is unfinished — half
 * of it has not been written yet. It judges each clause on its own and says
 * the shortest useful thing about the ones that are wrong.
 *
 * The client only ever sends clauses it has not already checked, so editing
 * the end of a paragraph costs one clause, not the whole thing.
 */

const SCHEMA = {
  type: "OBJECT",
  properties: {
    verdicts: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          index: { type: "INTEGER", description: "The number the clause was given." },
          state: {
            type: "STRING",
            enum: ["ok", "warn", "bad"],
            description:
              "ok: right, or near enough. warn: understandable but off. bad: wrong, or says something the passage does not.",
          },
          faults: {
            type: "ARRAY",
            description:
              "The specific fragments at fault. Empty when the state is ok. Prefer the shortest span that is actually wrong — a word or a phrase, not the whole clause.",
            items: {
              type: "OBJECT",
              properties: {
                text: {
                  type: "STRING",
                  description:
                    "The fragment copied EXACTLY from the clause, character for character, so it can be found in it. Never paraphrase it.",
                },
                instead: {
                  type: "STRING",
                  description: "What should be there instead. A few words, not a whole rewrite.",
                },
                why: { type: "STRING", description: "The reason, in under twelve words." },
              },
              required: ["text", "instead", "why"],
            },
          },
        },
        required: ["index", "state", "faults"],
      },
    },
  },
  required: ["verdicts"],
};

type RawFault = { text?: unknown; instead?: unknown; why?: unknown };
type Result = {
  verdicts: { index: number; state: string; faults?: RawFault[] }[];
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      source?: string;
      clauses?: { index: number; text: string }[];
      lang?: string;
      direction?: Direction;
      model?: string;
    };

    const source = body.source?.trim();
    const clauses = (body.clauses ?? []).filter((c) => c?.text?.trim());
    if (!source || !clauses.length) return NextResponse.json({ verdicts: [] });

    const direction: Direction = body.direction === "into-target" ? "into-target" : "into-english";
    const producing = direction === "into-target";
    const language = langName(body.lang ?? "es");

    const common = `A clause may be CUT OFF MID-WORD or mid-thought, because it is being typed right now. Never say a clause is incomplete, unfinished, or missing something — judge only what is actually on the page, and say nothing at all about the rest. Marking a half-typed clause wrong is the one thing that makes this feature unusable.

For every fault, copy the offending fragment out of the clause EXACTLY as it is written, character for character, so it can be found again in the text. Pick the shortest fragment that is genuinely wrong: the word or phrase, not the whole clause. Then say what belongs there instead, and why, in a few words each.`;

    const system = producing
      ? `You check a learner's ${language} as they type it. They are a native English speaker rendering an English passage in ${language}. For each clause: is its ${language} correct, and does it say something the passage supports? Flag agreement, conjugation, mood, prepositions, false friends and invented words.

${common}`
      : `You check a learner's English as they type it. They are working out what a ${language} passage means. For each clause: does it match what the ${language} actually says? Flag misreadings, flipped negatives, wrong subjects and invented content. Paraphrase and plain wording are fine.

${common}`;

    const { verdicts } = await askJson<Result>({
      model: body.model || process.env.CHECK_MODEL || "gemini-flash-lite-latest",
      system,
      prompt:
        `${producing ? "ENGLISH PASSAGE BEING RENDERED IN " + language.toUpperCase() : "PASSAGE IN " + language.toUpperCase()}:\n"""\n${source}\n"""\n\n` +
        `CLAUSES FROM THE DRAFT, numbered. Return a verdict for each number given, and nothing else:\n` +
        clauses.map((c) => `[${c.index}] ${c.text}`).join("\n"),
      schema: SCHEMA,
      temperature: 0.1,
      fast: true,
    });

    const byIndex = new Map(clauses.map((c) => [c.index, c.text]));
    const clean = (verdicts ?? [])
      .filter((v) => byIndex.has(Number(v?.index)))
      .map((v) => {
        const clause = byIndex.get(Number(v.index)) ?? "";
        // A fragment that is not literally in the clause cannot be underlined,
        // so it is dropped rather than guessed at.
        const faults = (Array.isArray(v.faults) ? v.faults : [])
          .map((f) => ({
            text: typeof f?.text === "string" ? f.text.trim() : "",
            instead: typeof f?.instead === "string" ? f.instead.trim() : "",
            why: typeof f?.why === "string" ? f.why.trim() : "",
          }))
          .filter((f) => f.text && clause.includes(f.text));

        const state = v.state === "bad" || v.state === "warn" ? v.state : "ok";
        return {
          index: Number(v.index),
          // Nothing locatable to show means there is nothing to mark.
          state: faults.length === 0 ? "ok" : state,
          faults,
        };
      });

    return NextResponse.json({ verdicts: clean });
  } catch (error) {
    const { status, body } = errorResponse(error);
    return NextResponse.json({ ...body, verdicts: [] }, { status });
  }
}
