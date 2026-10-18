/**
 * A short, hand-checked shelf so the library is not empty on first run.
 * All of these are public-domain texts on Project Gutenberg; only the
 * catalogue numbers live here, and the text is fetched when you open one.
 */

export type Starter = {
  gutenbergId: number;
  title: string;
  author: string;
  lang: string;
  level: "gentle" | "moderate" | "steep";
  blurb: string;
};

export const STARTERS: Starter[] = [
  {
    gutenbergId: 28002,
    title: "Electra",
    author: "Benito Pérez Galdós",
    lang: "es",
    level: "gentle",
    blurb: "A play, so it is nearly all dialogue — short lines, plain speech, easy to get a footing.",
  },
  {
    gutenbergId: 10825,
    title: "La Navidad en las Montañas",
    author: "Ignacio Manuel Altamirano",
    lang: "es",
    level: "gentle",
    blurb: "A short, warm Mexican novella. Descriptive but unhurried, and it ends before it tires you.",
  },
  {
    gutenbergId: 29506,
    title: "El sombrero de tres picos",
    author: "Pedro Antonio de Alarcón",
    lang: "es",
    level: "moderate",
    blurb: "A brisk comic novella of mistaken beds and wounded pride. The usual first real novel.",
  },
  {
    gutenbergId: 29731,
    title: "El Capitán Veneno",
    author: "Pedro Antonio de Alarcón",
    lang: "es",
    level: "moderate",
    blurb: "A gruff soldier, a stubborn nurse, and a lot of sharp dialogue. Short chapters.",
  },
  {
    gutenbergId: 75613,
    title: "Cuentos de Fray Mocho",
    author: "José S. Álvarez",
    lang: "es",
    level: "moderate",
    blurb: "Argentine sketches in a chatty, slangy register — good if you want spoken rhythms.",
  },
  {
    gutenbergId: 17073,
    title: "La Regenta",
    author: "Leopoldo Alas",
    lang: "es",
    level: "steep",
    blurb: "The great Spanish realist novel. Long sentences, dense irony, and 700 pages of it.",
  },
  {
    gutenbergId: 2000,
    title: "Don Quijote",
    author: "Miguel de Cervantes",
    lang: "es",
    level: "steep",
    blurb: "Early-1600s Spanish. Expect archaisms and sentences that run half a page. Rewarding, slow.",
  },
];

export const LEVEL_LABEL: Record<Starter["level"], string> = {
  gentle: "Gentle",
  moderate: "Moderate",
  steep: "Steep",
};
