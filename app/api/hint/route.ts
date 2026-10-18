import { NextResponse } from "next/server";
import { askJson, errorResponse } from "@/lib/gemini";
import { langName } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 45;

const SCHEMA = {
  type: "OBJECT",
  properties: { hint: { type: "STRING" } },
  required: ["hint"],
};

/**
 * Three rungs of help, each one deliberately short of a translation. The whole
 * point of the exercise is that the learner arrives at the meaning themselves,
 * so a hint hands over a shape, then a gist, then only the hardest words.
 */
type Rung = {
  name: string;
  instruction: string;
  /** Overrides the nudging system prompt, which the reveal rung has to escape. */
  system?: (language: string) => string;
};

const RUNGS: Rung[] = [
  {
    name: "shape",
    instruction: `Give the SHAPE of the passage and nothing else: what kind of moment this is and what it is doing in the story. One sentence, under 20 words.
Name no person, place, object or action from the passage. Use no content word that could be matched back to a word in the text.
Good: "Someone is making an excuse for a promise they did not keep." / "A description of a room, lingering on how neglected it is."
Bad: anything that mentions the horse, the letter, the rain — i.e. anything a learner could simply copy.`,
  },
  {
    name: "gist",
    instruction: `Give a VAGUE idea of what happens. One or two sentences, under 35 words.
You may name who is involved and roughly what occurs. You may NOT translate any phrase, and you may not give the English for the hard vocabulary.
Stay one step behind a translation: the learner should still have to work out most of the sentence.
Good: "He turns down the invitation, and the reason he gives is clearly not the real one."`,
  },
  {
    name: "words",
    instruction: `Gloss ONLY the two to four hardest words or phrases in the passage — the ones a learner at this level would most likely be stuck on.
Format each as: term — short English meaning here.
Separate them with a newline. Gloss nothing else, and do not translate any full clause or sentence.`,
  },
  {
    name: "reveal",
    instruction: `Translate the passage into plain, natural English. Output the translation and nothing else — no preamble, no notes, no advice on how to approach it.`,
    // The nudging rules above would otherwise talk this one out of answering.
    system: (language: string) =>
      `You are translating a passage of ${language} for a learner who has given up on it and asked to be shown what it says. Give a faithful, plain English translation: nothing added, nothing left out, no literary polish, no commentary.`,
  },
];

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      source?: string;
      lang?: string;
      level?: number;
      model?: string;
    };

    const source = body.source?.trim();
    if (!source) return NextResponse.json({ error: "No passage to hint at." }, { status: 400 });

    const level = Math.max(0, Math.min(RUNGS.length - 1, body.level ?? 0));
    const rung = RUNGS[level];
    const language = langName(body.lang ?? "es");

    const { hint } = await askJson<{ hint: string }>({
      model: body.model,
      system:
        rung.system?.(language) ??
        `You help a learner who is reading a book in ${language} and working out, in English, what a passage means. You give nudges, never answers. Withholding the translation is the entire value of your reply, so never let one slip in, and never add commentary about the hint itself.`,
      prompt: `PASSAGE IN ${language.toUpperCase()}:\n"""\n${source}\n"""\n\nHINT TYPE: ${rung.name}\n${rung.instruction}`,
      schema: SCHEMA,
      temperature: 0.4,
      fast: level < 2,
    });

    return NextResponse.json({ level, text: hint, kind: rung.name });
  } catch (error) {
    const { status, body } = errorResponse(error);
    return NextResponse.json(body, { status });
  }
}
