import type { Direction } from "./types";

/**
 * Hand-checked shelves so the library is not empty on first run. All of these
 * are public-domain texts on Project Gutenberg; only the catalogue numbers
 * live here, and the text is fetched when you open one.
 *
 * The Spanish shelf is for reading Spanish and writing English. The English
 * shelf is the other way round: you read English and write it in the language
 * you are learning, which is production practice rather than comprehension.
 */

export type Starter = {
  gutenbergId: number;
  title: string;
  author: string;
  /** The language of the TEXT, not the language being learned. */
  lang: string;
  direction: Direction;
  level: "gentle" | "moderate" | "steep";
  blurb: string;
};

export const STARTERS: Starter[] = [
  // --- Read Spanish, write English -------------------------------------
  {
    gutenbergId: 28002,
    title: "Electra",
    author: "Benito Pérez Galdós",
    lang: "es",
    direction: "into-english",
    level: "gentle",
    blurb: "A play, so it is nearly all dialogue — short lines, plain speech, easy to get a footing.",
  },
  {
    gutenbergId: 10825,
    title: "La Navidad en las Montañas",
    author: "Ignacio Manuel Altamirano",
    lang: "es",
    direction: "into-english",
    level: "gentle",
    blurb: "A short, warm Mexican novella. Descriptive but unhurried, and it ends before it tires you.",
  },
  {
    gutenbergId: 29506,
    title: "El sombrero de tres picos",
    author: "Pedro Antonio de Alarcón",
    lang: "es",
    direction: "into-english",
    level: "moderate",
    blurb: "A brisk comic novella of mistaken beds and wounded pride. The usual first real novel.",
  },
  {
    gutenbergId: 29731,
    title: "El Capitán Veneno",
    author: "Pedro Antonio de Alarcón",
    lang: "es",
    direction: "into-english",
    level: "moderate",
    blurb: "A gruff soldier, a stubborn nurse, and a lot of sharp dialogue. Short chapters.",
  },
  {
    gutenbergId: 75613,
    title: "Cuentos de Fray Mocho",
    author: "José S. Álvarez",
    lang: "es",
    direction: "into-english",
    level: "moderate",
    blurb: "Argentine sketches in a chatty, slangy register — good if you want spoken rhythms.",
  },
  {
    gutenbergId: 17073,
    title: "La Regenta",
    author: "Leopoldo Alas",
    lang: "es",
    direction: "into-english",
    level: "steep",
    blurb: "The great Spanish realist novel. Long sentences, dense irony, and 700 pages of it.",
  },
  {
    gutenbergId: 2000,
    title: "Don Quijote",
    author: "Miguel de Cervantes",
    lang: "es",
    direction: "into-english",
    level: "steep",
    blurb: "Early-1600s Spanish. Expect archaisms and sentences that run half a page. Rewarding, slow.",
  },

  // --- Read English, write the language you are learning ----------------
  {
    gutenbergId: 21,
    title: "Aesop's Fables",
    author: "Aesop",
    lang: "en",
    direction: "into-target",
    level: "gentle",
    blurb: "A few lines each, plain past tense, a moral at the end. The easiest place to start writing.",
  },
  {
    gutenbergId: 2591,
    title: "Grimms' Fairy Tales",
    author: "Jacob and Wilhelm Grimm",
    lang: "en",
    direction: "into-target",
    level: "gentle",
    blurb: "Short tales in simple narrative past. Repetitive by design, which is ideal for drilling.",
  },
  {
    gutenbergId: 55,
    title: "The Wonderful Wizard of Oz",
    author: "L. Frank Baum",
    lang: "en",
    direction: "into-target",
    level: "gentle",
    blurb: "Written for children, so the sentences stay short and the vocabulary concrete.",
  },
  {
    gutenbergId: 11,
    title: "Alice's Adventures in Wonderland",
    author: "Lewis Carroll",
    lang: "en",
    direction: "into-target",
    level: "moderate",
    blurb: "Simple on the surface, but the wordplay and idiom will make you think about register.",
  },
  {
    gutenbergId: 1661,
    title: "The Adventures of Sherlock Holmes",
    author: "Arthur Conan Doyle",
    lang: "en",
    direction: "into-target",
    level: "moderate",
    blurb: "Clean Victorian prose with a lot of dialogue — good practice for past tenses.",
  },
  {
    gutenbergId: 46,
    title: "A Christmas Carol",
    author: "Charles Dickens",
    lang: "en",
    direction: "into-target",
    level: "moderate",
    blurb: "Richer vocabulary and long descriptive runs. Dickens makes you work for the adjectives.",
  },
  {
    gutenbergId: 1342,
    title: "Pride and Prejudice",
    author: "Jane Austen",
    lang: "en",
    direction: "into-target",
    level: "steep",
    blurb: "Subordinate clauses stacked three deep, and irony that is hard to carry across intact.",
  },
];

export const LEVEL_LABEL: Record<Starter["level"], string> = {
  gentle: "Gentle",
  moderate: "Moderate",
  steep: "Steep",
};
