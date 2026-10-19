import { NextResponse } from "next/server";
import { askJson, errorResponse } from "@/lib/gemini";
import { langName } from "@/lib/types";
import type { Direction } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 45;

/**
 * Glosses every word in a passage in one call.
 *
 * Looking words up one at a time meant a round trip per click, which is far
 * too slow for the thing you do most while reading. The passage is short, so
 * glossing all of it at once costs barely more than glossing one word, and
 * every click afterwards is instant and still knows which sense applies here
 * — which a bundled dictionary could not tell you.
 */

const SCHEMA = {
  type: "OBJECT",
  properties: {
    terms: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          term: { type: "STRING", description: "The word exactly as it appears in the passage." },
          lemma: { type: "STRING", description: "Dictionary form." },
          pos: { type: "STRING", description: "noun, verb, adj, adv, prep, conj, pron, det..." },
          here: { type: "STRING", description: "Its meaning in THIS sentence. A few words." },
          note: {
            type: "STRING",
            description:
              "At most one short clause, and only when it earns its place: the tense and person of a conjugated verb, a gender, an idiom the words do not add up to, a false friend. Omit otherwise.",
          },
        },
        required: ["term", "lemma", "pos", "here"],
      },
    },
  },
  required: ["terms"],
};

type Glossary = { terms: { term: string; lemma: string; pos: string; here: string; note?: string }[] };

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      passage?: string;
      lang?: string;
      model?: string;
      direction?: Direction;
    };

    const passage = body.passage?.trim();
    if (!passage) return NextResponse.json({ terms: [] });

    const direction: Direction = body.direction === "into-target" ? "into-target" : "into-english";
    const language = langName(body.lang ?? "es");

    const system =
      direction === "into-target"
        ? `You are a fast, terse English-to-${language} glossary for a learner who must write an English passage in ${language}. For each word you are asked about, give the ${language} word that belongs in THIS sentence — gender for nouns, infinitive for verbs. Never translate a whole clause: the learner is writing it themselves.`
        : `You are a fast, terse ${language}-to-English glossary for a learner reading ${language} literature. For each word, give what it means in THIS sentence — not a list of dictionary senses, the one that applies here. Never translate a whole clause: the learner is working it out themselves.`;

    const { terms } = await askJson<Glossary>({
      // A lighter model on purpose: these are short, mechanical glosses, and
      // the sweep only helps if it lands before the reader reaches for a word.
      model: body.model || process.env.GLOSSARY_MODEL || "gemini-flash-lite-latest",
      system,
      prompt:
        `PASSAGE:\n"""\n${passage}\n"""\n\n` +
        `Skip the ordinary function words — articles, basic prepositions, personal pronouns, common conjunctions, and plain auxiliary forms of "to be" and "to have" — they are answered from a local table without you. ` +
        `Gloss every OTHER distinct word: nouns, verbs, adjectives, adverbs, and anything irregular, archaic or idiomatic. ` +
        `Skip proper names used purely as names, and numerals. ` +
        `Give each distinct surface form once, exactly as spelled in the passage, keeping its accents. ` +
        `For an inflected verb, "here" is what that form means in this sentence and "note" says which form it is. ` +
        `Where several words form one idiom, gloss them individually but say so in the note.`,
      schema: SCHEMA,
      temperature: 0.1,
      fast: true,
    });

    return NextResponse.json({ terms: terms ?? [] });
  } catch (error) {
    const { status, body } = errorResponse(error);
    return NextResponse.json({ ...body, terms: [] }, { status });
  }
}
