import { NextResponse } from "next/server";
import { fetchBookText, readHeader, stripBoilerplate } from "@/lib/gutenberg";
import { SEGMENTER_VERSION, segment } from "@/lib/segment";
import type { Book } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Downloads a Project Gutenberg text (public domain) or accepts pasted text,
 * then cuts it into translation-sized passages. The passages are returned to
 * the browser, which keeps them in IndexedDB — the server stores nothing.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      gutenbergId?: number;
      text?: string;
      title?: string;
      author?: string;
      lang?: string;
      maxChars?: number;
    };

    const maxChars = Math.max(80, Math.min(2000, body.maxChars ?? 320));
    const lang = body.lang ?? "es";

    if (body.gutenbergId) {
      const raw = await fetchBookText(body.gutenbergId);
      const header = readHeader(raw);
      const { passages, chapters, trimmed } = segment(stripBoilerplate(raw), maxChars, {
        lang,
        trimApparatus: true,
        trimFrontMatter: true,
      });

      if (!passages.length) {
        return NextResponse.json(
          { error: "That file came through empty after cleanup. Try another edition." },
          { status: 422 },
        );
      }

      const book: Book = {
        id: `pg${body.gutenbergId}`,
        title: body.title || header.title || `Project Gutenberg #${body.gutenbergId}`,
        author: body.author || header.author || "Unknown",
        lang,
        source: "gutenberg",
        gutenbergId: body.gutenbergId,
        passages,
        chapters,
        addedAt: Date.now(),
        maxChars,
        segmenterVersion: SEGMENTER_VERSION,
        skipped: trimmed ?? undefined,
      };
      return NextResponse.json({ book, detectedLanguage: header.language ?? null, trimmed });
    }

    const pasted = body.text?.trim();
    if (!pasted) {
      return NextResponse.json(
        { error: "Give me a Project Gutenberg number or some text to work with." },
        { status: 400 },
      );
    }

    const { passages, chapters } = segment(pasted, maxChars, { lang, trimApparatus: false });
    if (!passages.length) {
      return NextResponse.json({ error: "That text was too short to split up." }, { status: 422 });
    }

    const book: Book = {
      id: `paste-${Date.now().toString(36)}`,
      title: body.title?.trim() || "Pasted text",
      author: body.author?.trim() || "Unknown",
      lang,
      source: "paste",
      passages,
      chapters,
      addedAt: Date.now(),
      maxChars,
      segmenterVersion: SEGMENTER_VERSION,
    };
    return NextResponse.json({ book, detectedLanguage: null });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load that book." },
      { status: 502 },
    );
  }
}
