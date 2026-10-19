import { NextResponse } from "next/server";
import { askJson, errorResponse } from "@/lib/gemini";
import { langName } from "@/lib/types";
import type { Direction } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 45;

const SCHEMA = {
  type: "OBJECT",
  properties: { hint: { type: "STRING" } },
  required: ["hint"],
};

type Rung = {
  name: string;
  instruction: string;
  /** Overrides the nudging system prompt, which the reveal rung has to escape. */
  system?: (language: string) => string;
};

/**
 * Three rungs of help, each deliberately short of the answer, then a reveal.
 * The whole value of a hint is what it withholds.
 */
const COMPREHENSION: Rung[] = [
  {
    name: "shape",
    instruction: `Give the SHAPE of the passage and nothing else: what kind of moment this is and what it is doing in the story. One sentence, under 20 words.
Name no person, place, object or action from the passage. Use no content word that could be matched back to a word in the text.
Good: "Someone is making an excuse for a promise they did not keep."
Bad: anything mentioning the horse, the letter, the rain — anything a learner could simply copy.`,
  },
  {
    name: "gist",
    instruction: `Give a VAGUE idea of what happens. One or two sentences, under 35 words.
You may name who is involved and roughly what occurs. You may NOT translate any phrase or give the English for the hard vocabulary.
Stay one step behind a translation: the learner should still have to work out most of the sentence.`,
  },
  {
    name: "words",
    instruction: `Gloss ONLY the two to four hardest words or phrases in the passage.
Format each as: term — short English meaning here.
Separate them with a newline. Gloss nothing else, and do not translate any full clause.`,
  },
  {
    name: "reveal",
    instruction: `Translate the passage into plain, natural English. Output the translation and nothing else — no preamble, no notes, no advice on how to approach it.`,
    system: (language) =>
      `You are translating a passage of ${language} for a learner who has given up on it and asked to be shown what it says. Give a faithful, plain English translation: nothing added, nothing left out, no literary polish, no commentary.`,
  },
];

const PRODUCTION: Rung[] = [
  {
    name: "shape",
    instruction: `The learner must render this English in TARGET_LANGUAGE. Tell them what SORT of sentence it needs — and nothing they could copy.
One sentence, under 25 words. Talk about structure only: is it a single clause or two, is anything conditional or hypothetical, is it narrating a finished event or describing a scene, is anyone being addressed or commanded.
Give NO vocabulary in either language and quote NO phrase from the English.
Good: "Two clauses, the second hypothetical, so the mood of the second verb is the whole difficulty here."`,
  },
  {
    name: "approach",
    instruction: `Name the grammar this passage turns on, in TARGET_LANGUAGE terms, and the trap most English speakers fall into here.
Two or three sentences. Name tenses, moods, agreement or the preposition at issue — "this is a completed action, so preterite, not imperfect", or "'if' plus a hypothetical takes the imperfect subjunctive, and English hides this".
You may name a grammatical form. You may NOT give the words that fill it, and you may NOT write any clause of the answer.`,
  },
  {
    name: "words",
    instruction: `Give ONLY the two to four words or phrases the learner most likely cannot produce yet, as: english — TARGET_LANGUAGE equivalent (with gender for nouns, infinitive for verbs).
One per line. Nothing else — no sentence, no clause, no word order advice.`,
  },
  {
    name: "reveal",
    instruction: `Render the English passage in TARGET_LANGUAGE: natural, correct, the way a competent writer would actually put it. Output only that — no preamble, no commentary, no alternatives.`,
    system: (language) =>
      `You are showing a learner how a passage of English is properly written in ${language}. They have given up and asked to see it. Give one natural, correct ${language} rendering — faithful to the meaning, idiomatic rather than word-for-word, with no commentary.`,
  },
];

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      source?: string;
      lang?: string;
      level?: number;
      model?: string;
      direction?: Direction;
    };

    const source = body.source?.trim();
    if (!source) return NextResponse.json({ error: "No passage to hint at." }, { status: 400 });

    const direction: Direction = body.direction === "into-target" ? "into-target" : "into-english";
    const producing = direction === "into-target";
    const rungs = producing ? PRODUCTION : COMPREHENSION;

    const level = Math.max(0, Math.min(rungs.length - 1, body.level ?? 0));
    const rung = rungs[level];
    const language = langName(body.lang ?? "es");

    const nudging = producing
      ? `You help a native English speaker who is learning ${language} and must write an English passage in ${language}. You give nudges, never the answer. Withholding the ${language} is the entire value of your reply: never write a clause of the translation, and never add commentary about the hint itself.`
      : `You help a learner who is reading a book in ${language} and working out, in English, what a passage means. You give nudges, never answers. Withholding the translation is the entire value of your reply, so never let one slip in, and never add commentary about the hint itself.`;

    const { hint } = await askJson<{ hint: string }>({
      model: body.model,
      system: rung.system?.(language) ?? nudging,
      prompt:
        `${producing ? "ENGLISH PASSAGE TO BE WRITTEN IN " + language.toUpperCase() : "PASSAGE IN " + language.toUpperCase()}:\n"""\n${source}\n"""\n\n` +
        `HINT TYPE: ${rung.name}\n${rung.instruction.replace(/TARGET_LANGUAGE/g, language)}`,
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
