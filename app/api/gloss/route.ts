import { NextResponse } from "next/server";
import { askJson, errorResponse } from "@/lib/gemini";
import { langName } from "@/lib/types";
import type { Direction, Gloss } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 45;

const SCHEMA = {
  type: "OBJECT",
  properties: {
    term: { type: "STRING", description: "The word as it appears in the passage." },
    lemma: { type: "STRING", description: "Dictionary form." },
    pos: { type: "STRING", description: "Part of speech, abbreviated: noun, verb, adj, adv..." },
    here: { type: "STRING", description: "What it means, or becomes, in THIS passage. A few words." },
    usually: { type: "STRING", description: "Its ordinary sense or rendering, if different." },
    note: {
      type: "STRING",
      description:
        "At most one short clause: gender, irregular form, an archaism, a false friend to avoid. Omit if there is nothing worth saying.",
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
      direction?: Direction;
    };

    const term = body.term?.trim();
    if (!term) return NextResponse.json({ error: "No word to look up." }, { status: 400 });

    const direction: Direction = body.direction === "into-target" ? "into-target" : "into-english";
    const language = langName(body.lang ?? "es");

    // Reading the foreign text, the learner needs it decoded. Writing it, they
    // need the opposite: how this English word is said here. Either way, only
    // the one word — handing over the sentence would be doing the exercise.
    const system =
      direction === "into-target"
        ? `You are a tight English-to-${language} dictionary for a learner who is writing an English passage in ${language}. For the word asked about, give the ${language} word that belongs in THIS sentence — with gender for nouns and the infinitive for verbs. Never translate the surrounding sentence; the learner is writing it themselves and a free answer would spoil the exercise. Be terse.`
        : `You are a tight bilingual dictionary for a learner reading ${language} literature. Define only the word asked about, as used in the sentence given. Never translate the surrounding sentence — the learner is translating it themselves and a free answer would spoil the exercise. Be terse.`;

    const gloss = await askJson<Gloss>({
      model: body.model,
      system,
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
