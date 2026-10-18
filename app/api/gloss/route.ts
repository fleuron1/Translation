import { NextResponse } from "next/server";
import { askJson, errorResponse } from "@/lib/gemini";
import { langName } from "@/lib/types";
import type { Gloss } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 45;

const SCHEMA = {
  type: "OBJECT",
  properties: {
    term: { type: "STRING", description: "The word as it appears in the passage." },
    lemma: { type: "STRING", description: "Dictionary form." },
    pos: { type: "STRING", description: "Part of speech, abbreviated: noun, verb, adj, adv..." },
    here: { type: "STRING", description: "What it means in THIS passage. A few words." },
    usually: { type: "STRING", description: "Its ordinary meaning, if different from 'here'." },
    note: {
      type: "STRING",
      description:
        "At most one short clause: the conjugation, an archaism, a false friend to avoid. Omit if there is nothing worth saying.",
    },
  },
  required: ["term", "lemma", "pos", "here"],
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      term?: string;
      context?: string;
      lang?: string;
      model?: string;
    };

    const term = body.term?.trim();
    if (!term) return NextResponse.json({ error: "No word to look up." }, { status: 400 });

    const language = langName(body.lang ?? "es");

    const gloss = await askJson<Gloss>({
      model: body.model,
      system: `You are a tight bilingual dictionary for a learner reading ${language} literature. Define only the word asked about, as used in the sentence given. Never translate the surrounding sentence — the learner is translating it themselves and a free answer would spoil the exercise. Be terse.`,
      prompt: `WORD: ${term}\n\nSENTENCE IT APPEARS IN:\n"""\n${body.context ?? ""}\n"""`,
      schema: SCHEMA,
      temperature: 0.1,
      fast: true,
    });

    return NextResponse.json(gloss);
  } catch (error) {
    const { status, body } = errorResponse(error);
    return NextResponse.json(body, { status });
  }
}
