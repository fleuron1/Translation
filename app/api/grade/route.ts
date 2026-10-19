import { NextResponse } from "next/server";
import { askJson, errorResponse } from "@/lib/gemini";
import { splitSentences } from "@/lib/segment";
import { langName } from "@/lib/types";
import type { Direction, Grade, SentenceVerdict } from "@/lib/types";

/**
 * The server splits the answer and hands the model NUMBERED sentences, then
 * takes back judgements keyed by those numbers. Quoting text back would mean
 * fuzzy-matching the model's version of the answer against the real one; an
 * index cannot drift, and the exact segments go back to the UI so what gets
 * tinted is precisely what was judged.
 */
function sentencesOf(answer: string): string[] {
  return answer
    .split("\n")
    .flatMap((line) => splitSentences(line.trim()))
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

export const runtime = "nodejs";
export const maxDuration = 60;

const WRONG_ITEM = {
  type: "OBJECT",
  properties: {
    yours: { type: "STRING", description: "What the learner wrote." },
    actually: { type: "STRING", description: "What the original says." },
    why: { type: "STRING", description: "One short clause on the cause of the slip." },
  },
  required: ["yours", "actually", "why"],
};

const CORRECTION_ITEM = {
  type: "OBJECT",
  properties: {
    yours: { type: "STRING", description: "The learner's phrase, exactly as written." },
    better: { type: "STRING", description: "The corrected phrase, changing as little as possible." },
    why: { type: "STRING", description: "The rule, in one short clause." },
  },
  required: ["yours", "better", "why"],
};

function schemaFor(direction: Direction) {
  const properties: Record<string, unknown> = {
    score: { type: "INTEGER", description: "0-100" },
    verdict: { type: "STRING", enum: ["nailed", "close", "partial", "off"] },
    gist: { type: "STRING", description: "One plain sentence: what the passage actually says." },
    captured: {
      type: "ARRAY",
      description: "Ideas the learner did convey. Short phrases.",
      items: { type: "STRING" },
    },
    missed: {
      type: "ARRAY",
      description: "Ideas present in the original that are absent.",
      items: { type: "STRING" },
    },
    wrong: {
      type: "ARRAY",
      description: "Actual misreadings of meaning, not style. Empty if none.",
      items: WRONG_ITEM,
    },
    vocab: {
      type: "ARRAY",
      description:
        direction === "into-target"
          ? "At most 5 words or phrases worth learning to say this well next time."
          : "At most 5 words or phrases the learner evidently did not know.",
      items: {
        type: "OBJECT",
        properties: {
          term: { type: "STRING" },
          english: { type: "STRING" },
          note: { type: "STRING" },
        },
        required: ["term", "english"],
      },
    },
    reference: { type: "STRING", description: "A faithful, natural translation of the passage." },
    note: { type: "STRING", description: "One honest sentence to the learner." },
    sentences: {
      type: "ARRAY",
      description:
        "One verdict for each NUMBERED sentence of the learner's answer. Use the numbers given, cover every one of them, and never invent a sentence that was not listed.",
      items: {
        type: "OBJECT",
        properties: {
          index: { type: "INTEGER", description: "The number this sentence was given." },
          score: { type: "INTEGER", description: "0-100 for this sentence alone." },
          issues: {
            type: "ARRAY",
            description: "What is wrong with this sentence. Empty when it is fine.",
            items: {
              type: "OBJECT",
              properties: {
                kind: {
                  type: "STRING",
                  enum: ["missed", "misread", "added", "grammar", "word-choice", "awkward"],
                },
                text: {
                  type: "STRING",
                  description: "The exact fragment at fault, quoted from the learner.",
                },
                why: { type: "STRING", description: "One short clause." },
              },
              required: ["kind", "text", "why"],
            },
          },
          note: {
            type: "STRING",
            description: "At most one short clause on the sentence overall. Omit if nothing to add.",
          },
        },
        required: ["index", "score", "issues"],
      },
    },
  };

  const required = [
    "score",
    "verdict",
    "gist",
    "captured",
    "missed",
    "wrong",
    "vocab",
    "reference",
    "note",
    "sentences",
  ];

  if (direction === "into-target") {
    properties.corrections = {
      type: "ARRAY",
      description:
        "Every language error, in order of seriousness: agreement, conjugation, mood, prepositions, word order, invented words. Empty only if the writing is genuinely clean.",
      items: CORRECTION_ITEM,
    };
    required.push("corrections");
  }

  return { type: "OBJECT", properties, required };
}

function comprehensionSystem(language: string): string {
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
- tense, mood or aspect that changes what happened
- false friends and look-alike guesses
- inventing content that is not in the passage
- a figurative expression read literally, or the reverse

Archaic and regional usage counts as what it means in this passage, not its modern dictionary sense.

Scoring bands:
95-100 "nailed": every idea is there and nothing is invented.
75-94 "close": all the main ideas; a secondary detail or nuance is off.
45-74 "partial": the thrust is right but something that matters is missing or garbled.
0-44 "off": the passage was misread.

Be concrete and brief. Quote the ${language} you are discussing. No vague praise. If the learner left the box nearly empty or wrote something unrelated, score it low and say so plainly.`;
}

function productionSystem(language: string): string {
  return `You are a patient, exacting ${language} tutor. Your learner is a native English speaker learning ${language}. They are given a passage of English from a real book and must write it in ${language}. This is production practice: they are composing in a language they do not yet command.

You are judging two things at once, and you must keep them apart:
1. MEANING — did everything in the English survive into their ${language}?
2. LANGUAGE — is the ${language} they wrote actually correct?

A sentence can carry the full meaning and still be full of errors, and it can be flawless ${language} that quietly drops half the passage. Say which is happening.

Do NOT deduct for:
- simpler constructions than the original, as long as they are correct and carry the sense
- plainer vocabulary than a native author would choose
- a different but valid word order
- splitting one ornate English sentence into two clean ${language} ones
- regional variation that is genuinely standard somewhere

DO correct, every time, in "corrections":
- gender and number agreement, including adjectives and past participles
- verb conjugation, and the wrong tense, aspect or mood — above all a missing subjunctive where the language requires it
- ser versus estar, por versus para, and the equivalent traps in other languages
- preposition errors, and verbs that demand a particular preposition
- pronoun placement, clitics, and missing or spurious personal "a"
- anglicisms: English idiom translated word for word, false friends, English word order
- invented words, or a real word that does not mean what they think
- missing or wrong accents, when they change the word or the tense

Correct by changing as little as possible — do not rewrite their sentence into yours. Quote their exact phrase in "yours". If a phrase is correct but a native would never say it, you may note it, but mark clearly that it is naturalness rather than error.

Scoring bands — meaning first, then how much the errors cost:
95-100 "nailed": the whole meaning, in ${language} that is correct and idiomatic. A stray accent does not stop a 95.
75-94 "close": meaning intact and the ${language} is understandable throughout; a handful of real errors that a native would notice but not stumble over.
45-74 "partial": something meaningful was lost or the errors are dense enough to slow a reader down, including errors that change who did what.
0-44 "off": the meaning did not survive, or the ${language} is too broken to follow, or they answered in English.

If they wrote in English instead of ${language}, score it 0-10 and say what the exercise is.

Be specific and brief. Never offer vague praise. The learner wants to be corrected.`;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      source?: string;
      userText?: string;
      lang?: string;
      direction?: Direction;
      model?: string;
      title?: string;
      author?: string;
      previous?: string;
      hintsUsed?: number;
    };

    const source = body.source?.trim();
    const userText = body.userText?.trim();
    if (!source) return NextResponse.json({ error: "No passage to grade." }, { status: 400 });
    if (!userText) return NextResponse.json({ error: "Nothing to grade." }, { status: 400 });

    const direction: Direction = body.direction === "into-target" ? "into-target" : "into-english";
    const language = langName(body.lang ?? "es");
    const producing = direction === "into-target";

    const parts = [`BOOK: ${body.title ?? "unknown"}${body.author ? ` — ${body.author}` : ""}`];
    if (body.previous) {
      parts.push(`WHAT CAME JUST BEFORE (context only — do not grade this):\n"""\n${body.previous}\n"""`);
    }
    parts.push(
      producing
        ? `ENGLISH PASSAGE THE LEARNER MUST RENDER IN ${language.toUpperCase()}:\n"""\n${source}\n"""`
        : `PASSAGE IN ${language.toUpperCase()}:\n"""\n${source}\n"""`,
    );
    parts.push(
      producing
        ? `THE LEARNER'S ${language.toUpperCase()}:\n"""\n${userText}\n"""`
        : `WHAT THE LEARNER UNDERSTOOD, IN ENGLISH:\n"""\n${userText}\n"""`,
    );
    const answerSentences = sentencesOf(userText);
    parts.push(
      `THE SAME ANSWER, SPLIT INTO NUMBERED SENTENCES. Judge each one on its own and return a verdict for every number, using these numbers exactly:\n` +
        answerSentences.map((sentence, i) => `[${i}] ${sentence}`).join("\n"),
    );
    parts.push(
      producing
        ? `A sentence's score is how much of its share of the meaning survived AND how correct its ${language} is. Quote the exact fragment at fault in each issue.`
        : `A sentence's score is how much of its share of the passage it got right. Quote the exact fragment at fault in each issue.`,
    );

    if (body.hintsUsed) {
      parts.push(`The learner used ${body.hintsUsed} hint(s). Mention it only if it matters.`);
    }

    const grade = await askJson<Grade>({
      model: body.model,
      system: producing ? productionSystem(language) : comprehensionSystem(language),
      prompt: parts.join("\n\n"),
      schema: schemaFor(direction),
      temperature: 0.15,
    });

    grade.score = Math.max(0, Math.min(100, Math.round(grade.score)));
    grade.captured ??= [];
    grade.missed ??= [];
    grade.wrong ??= [];
    grade.vocab ??= [];
    if (producing) grade.corrections ??= [];

    // Nothing from the model is trusted to index into the learner's text. An
    // index that does not exist, or a second verdict for one already judged,
    // would otherwise tint the wrong sentence or throw.
    const seen = new Set<number>();
    const verdicts: SentenceVerdict[] = [];
    for (const verdict of grade.sentences ?? []) {
      const index = Number(verdict?.index);
      if (!Number.isInteger(index) || index < 0 || index >= answerSentences.length) continue;
      if (seen.has(index)) continue;
      seen.add(index);
      verdicts.push({
        index,
        score: Math.max(0, Math.min(100, Math.round(Number(verdict.score) || 0))),
        issues: Array.isArray(verdict.issues) ? verdict.issues : [],
        note: verdict.note,
      });
    }

    grade.answerSentences = answerSentences;
    grade.sentences = verdicts.sort((a, b) => a.index - b.index);

    return NextResponse.json(grade);
  } catch (error) {
    const { status, body } = errorResponse(error);
    return NextResponse.json(body, { status });
  }
}
