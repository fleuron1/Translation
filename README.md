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

## Deploying

Vercel: import the repo, set `GEMINI_API_KEY` and `APP_PASSWORD` as environment variables, deploy.

`APP_PASSWORD` is a shared password protecting the whole site, pages and API alike. It matters because a deployed instance holds your Gemini key server-side — without a gate, anyone who finds the URL is spending your quota.

- **Unset locally:** no gate, so `npm run dev` stays frictionless. Set it in `.env.local` to try the gate on your machine.
- **Unset on a deployment:** the app locks itself and says so, rather than coming up open.
- Signing in sets an HTTP-only cookie for 30 days. The cookie holds an HMAC of the password, not the password.

## The loop

- **Pick a book.** Seven hand-checked Spanish starters are on the shelf, from a dialogue-heavy Galdós play up to *Don Quijote*. You can also search Project Gutenberg, open any catalogue number, paste your own text, or open a PDF from your computer.
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
| `lib/pdf.ts` | Opens a PDF in the browser and walks its pages |
| `lib/pdf-text.ts` | Rebuilds prose from glyph positions (no pdf.js import, so it is testable alone) |
| `lib/language.ts` | Finds where the book actually starts |
| `lib/gutenberg.ts` | Download, search, strip boilerplate |

### Tuning the grader

The whole personality of the app is the system prompt in `app/api/grade/route.ts` — what counts as a real error versus a stylistic difference, and the four scoring bands. If grading feels too harsh or too soft, edit that prompt before anything else.

## Notes

- **Books.** Public-domain texts from Project Gutenberg, downloaded when you open one. Nothing is bundled with this repo.
- **Real editions are messy,** and getting you to the first line of the actual book takes two passes.

  `lib/language.ts` handles the English wrapper some foreign-language editions carry — introduction, footnotes, endnotes, glossary — by keeping the longest run of actual target-language text. Annotated editions interleave blocks of English footnotes with the prose, so short interruptions are bridged rather than treated as the end of the book.

  `lib/frontmatter.ts` then handles the book's *own* front matter, which is in the book's own language and so invisible to the first pass: title pages, transcriber's credits, contents, dedications, prologues. It keys off a numbered *series* of headings (I, II, III or Capítulo primero, Capítulo II) rather than any single heading, since a prologue can look like a chapter but never comes as a numbered run. Guards against over-trimming: it will not cut past 35% of the book, it refuses a candidate numbered above one (which means chapter one was missed), and it checks that real prose rather than a contents list follows. When nothing is confident, it cuts nothing.

  Across the seven starter books this lands on the true first line of each. The reader says what it skipped, so a bad call is visible rather than silent.
- **Your data is yours.** Books, progress and saved words live in your browser's IndexedDB. The server stores nothing.
- **PDFs are read locally.** A PDF you open is parsed in the browser and never uploaded — partly for privacy, partly because book PDFs run well past Vercel's 4.5MB request limit. Only the passage being graded leaves the machine.
- **A PDF has no paragraphs,** only glyphs at coordinates, so `lib/pdf-text.ts` reconstructs them: it strips the running header and page numbers, rejoins words hyphenated across a line break, treats an indent or an opening dash as a new paragraph, and stitches a paragraph back together when it spans a page break. A scanned PDF with no text layer is detected and rejected with a note about OCR, rather than silently yielding nothing.
- **Cost.** One grade is one Gemini call on a short passage; hints and glosses are smaller. `gemini-flash-latest` is the default, an alias that tracks the current flash model. Settings lists the models your key can actually reach.
- **Other languages.** French, German, Italian, Portuguese, Dutch and Latin are wired up in Settings — search Gutenberg for a book in one. The curated shelf is Spanish only; add to `lib/starters.ts` to extend it.
