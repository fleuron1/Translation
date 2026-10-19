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
          issue: {
            type: "STRING",
            description:
              "What is wrong, in under twelve words, naming the fault. Omit entirely when the state is ok.",
          },
        },
        required: ["index", "state"],
      },
    },
  },
  required: ["verdicts"],
};

type Result = { verdicts: { index: number; state: string; issue?: string }[] };

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

    const system = producing
      ? `You check a learner's ${language} as they write it. They are a native English speaker rendering an English passage in ${language}, and the draft is UNFINISHED — never complain that something is missing or incomplete, only about what is actually written. For each clause: is its ${language} correct, and does it say something the passage supports? Flag agreement, conjugation, mood, prepositions, false friends and invented words. Be extremely terse: a few words naming the fault, no praise, no restating the clause.`
      : `You check a learner's English as they write it. They are working out what a ${language} passage means, and the draft is UNFINISHED — never complain that something is missing or incomplete, only about what is actually written. For each clause: does it match what the ${language} actually says? Flag misreadings, flipped negatives, wrong subjects and invented content. Paraphrase and plain wording are fine. Be extremely terse: a few words naming the fault, no praise, no restating the clause.`;

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

    const allowed = new Set(clauses.map((c) => c.index));
    const clean = (verdicts ?? [])
      .filter((v) => allowed.has(Number(v?.index)))
      .map((v) => ({
        index: Number(v.index),
        state: v.state === "bad" || v.state === "warn" ? v.state : "ok",
        issue: typeof v.issue === "string" && v.issue.trim() ? v.issue.trim() : undefined,
      }));

    return NextResponse.json({ verdicts: clean });
  } catch (error) {
    const { status, body } = errorResponse(error);
    return NextResponse.json({ ...body, verdicts: [] }, { status });
  }
}
