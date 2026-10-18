import { NextResponse } from "next/server";
import { searchBooks } from "@/lib/gutenberg";

export const runtime = "nodejs";
export const maxDuration = 45;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim();
  const lang = searchParams.get("lang")?.trim() || undefined;

  if (!query) return NextResponse.json({ results: [] });

  try {
    const results = await searchBooks(query, lang);
    return NextResponse.json({ results: results.slice(0, 24) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Search failed.", results: [] },
      { status: 502 },
    );
  }
}
