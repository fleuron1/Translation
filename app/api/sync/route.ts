import { NextResponse } from "next/server";
import { profileId, supabase, syncConfigured, SyncNotConfiguredError } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Progress sync.
 *
 * The browser stays the source of truth for reading — IndexedDB is written
 * first and the UI never waits on the network — and this is the copy that
 * survives a cleared browser or a second device. Merging is last-write-wins
 * per record on updated_at, except attempts and vocabulary, which are only
 * ever added to.
 *
 * Everything here is already behind the site's password gate; middleware
 * rejects an unauthenticated call before it arrives.
 */

type Payload = {
  books?: Record<string, unknown>[];
  progress?: Record<string, unknown>[];
  attempts?: Record<string, unknown>[];
  vocab?: Record<string, unknown>[];
};

/** Pasted text is carried only when it is small enough not to be a nuisance. */
const MAX_INLINE_TEXT = 300_000;

export async function GET(request: Request) {
  if (!syncConfigured()) {
    return NextResponse.json({ configured: false, books: [], progress: [], vocab: [] });
  }

  try {
    const db = supabase();
    const profile = profileId();
    const bookId = new URL(request.url).searchParams.get("book");

    // Attempts are fetched per book so the first load stays small.
    if (bookId) {
      const { data, error } = await db
        .from("gist_attempts")
        .select("book_id, text_hash, user_text, grade, hints_used, at")
        .eq("profile", profile)
        .eq("book_id", bookId);
      if (error) throw new Error(error.message);
      return NextResponse.json({ configured: true, attempts: data ?? [] });
    }

    const [books, progress, vocab] = await Promise.all([
      db.from("gist_books").select("*").eq("profile", profile),
      db.from("gist_progress").select("*").eq("profile", profile),
      db.from("gist_vocab").select("*").eq("profile", profile),
    ]);

    for (const result of [books, progress, vocab]) {
      if (result.error) throw new Error(result.error.message);
    }

    return NextResponse.json({
      configured: true,
      books: books.data ?? [],
      progress: progress.data ?? [],
      vocab: vocab.data ?? [],
    });
  } catch (error) {
    return NextResponse.json({ error: message(error) }, { status: status(error) });
  }
}

export async function POST(request: Request) {
  if (!syncConfigured()) {
    return NextResponse.json({ error: new SyncNotConfiguredError().message }, { status: 503 });
  }

  try {
    const body = (await request.json()) as Payload;
    const db = supabase();
    const profile = profileId();
    const written: Record<string, number> = {};

    if (body.books?.length) {
      const rows = body.books.map((book) => {
        const text = typeof book.text_content === "string" ? book.text_content : null;
        return {
          ...book,
          profile,
          text_content: text && text.length <= MAX_INLINE_TEXT ? text : null,
        };
      });
      const { error } = await db.from("gist_books").upsert(rows, { onConflict: "profile,book_id" });
      if (error) throw new Error(error.message);
      written.books = rows.length;
    }

    if (body.progress?.length) {
      const rows = body.progress.map((row) => ({ ...row, profile }));
      const { error } = await db
        .from("gist_progress")
        .upsert(rows, { onConflict: "profile,book_id" });
      if (error) throw new Error(error.message);
      written.progress = rows.length;
    }

    if (body.attempts?.length) {
      const rows = body.attempts.map((row) => ({ ...row, profile }));
      const { error } = await db
        .from("gist_attempts")
        .upsert(rows, { onConflict: "profile,book_id,text_hash" });
      if (error) throw new Error(error.message);
      written.attempts = rows.length;
    }

    if (body.vocab?.length) {
      const rows = body.vocab.map((row) => ({ ...row, profile }));
      const { error } = await db.from("gist_vocab").upsert(rows, { onConflict: "profile,key" });
      if (error) throw new Error(error.message);
      written.vocab = rows.length;
    }

    return NextResponse.json({ ok: true, written });
  } catch (error) {
    return NextResponse.json({ error: message(error) }, { status: status(error) });
  }
}

function message(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  if (/relation .* does not exist/i.test(text)) {
    return "The sync tables are missing. Run supabase/schema.sql in the Supabase SQL editor.";
  }
  return text;
}

function status(error: unknown): number {
  return error instanceof SyncNotConfiguredError ? 503 : 500;
}
