# Gist

Read a real book in another language, a passage at a time, and write down what you think it means.

You are graded on **the ideas you got**, not on your wording. A rough, honest paraphrase — "he's making an excuse and it's obviously not the real reason" — scores better than a careful word-by-word guess that misses the point. Flipped negations, wrong subjects, false friends and invented content cost you; style never does.

## Setup

1. Get a Gemini API key at https://aistudio.google.com/apikey
2. Put it in `.env.local`:
   ```
   GEMINI_API_KEY=your-key-here
   ```
3. Run it:
   ```bash
   npm run dev
   ```
4. Open http://localhost:3000

The key stays on the server — every Gemini call goes through a route handler, never from the browser.

## The loop

- **Pick a book.** Seven hand-checked Spanish starters are on the shelf, from a dialogue-heavy Galdós play up to *Don Quijote*. You can also search Project Gutenberg, open any catalogue number, or paste your own text.
- **Read a passage.** Click any word for a one-word gloss — enough to get unstuck, never the sentence.
- **Say what it means,** in your own English.
- **Get graded.** A score out of 100, what you got, what you missed, any actual misreadings with the original beside them, and — only if you ask — one full translation to compare against.

If you are stuck, three hints escalate on purpose:

1. **the shape** — what kind of moment this is, naming nothing in the text
2. **a vague idea** — roughly what happens, still no vocabulary
3. **the hard words** — two to four glosses, nothing else

`give up` shows the translation and moves you on, without a score.

## Where things are

| Path | What it does |
| --- | --- |
| `app/page.tsx` | View switching, IndexedDB persistence, vocabulary saving |
| `components/Reader.tsx` | The core loop: passage, hints, answer box, grading |
| `components/Feedback.tsx` | Score ring, got / missed / misread, reference translation |
| `app/api/grade/route.ts` | The grading prompt — the heart of the app |
| `app/api/hint/route.ts` | The three hint rungs, plus reveal |
| `lib/segment.ts` | Splits a book into translation-sized passages |
| `lib/language.ts` | Finds where the book actually starts |
| `lib/gutenberg.ts` | Download, search, strip boilerplate |

### Tuning the grader

The whole personality of the app is the system prompt in `app/api/grade/route.ts` — what counts as a real error versus a stylistic difference, and the four scoring bands. If grading feels too harsh or too soft, edit that prompt before anything else.

## Notes

- **Books.** Public-domain texts from Project Gutenberg, downloaded when you open one. Nothing is bundled with this repo.
- **Real editions are messy.** Many Gutenberg files wrap the book in an English introduction, endnotes and a glossary. `lib/language.ts` finds the longest run of actual target-language text and trims the rest — on *El sombrero de tres picos* that drops 77 passages of front matter and 920 of editorial apparatus.
- **Your data is yours.** Books, progress and saved words live in your browser's IndexedDB. The server stores nothing.
- **Cost.** One grade is one Gemini call on a short passage; hints and glosses are smaller. `gemini-flash-latest` is the default, an alias that tracks the current flash model. Settings lists the models your key can actually reach.
- **Other languages.** French, German, Italian, Portuguese, Dutch and Latin are wired up in Settings — search Gutenberg for a book in one. The curated shelf is Spanish only; add to `lib/starters.ts` to extend it.
