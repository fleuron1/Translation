import { NextResponse } from "next/server";
import { profileId, supabase, syncConfigured } from "@/lib/supabase";

export const runtime = "nodejs";

/**
 * Touches the database on a schedule.
 *
 * Supabase pauses a free project after about a week without activity, and
 * unpausing is a manual trip to their dashboard. For an app whose entire job
 * is remembering where you stopped reading, going away for a fortnight is
 * normal behaviour rather than neglect — so the thing that breaks it would be
 * the thing it is for. A daily query keeps the project awake.
 *
 * Vercel's cron runs this; middleware lets the path through without the
 * site password, so CRON_SECRET is what keeps it from being public.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const offered = request.headers.get("authorization");
    if (offered !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Not authorised." }, { status: 401 });
    }
  }

  if (!syncConfigured()) {
    return NextResponse.json({ ok: false, reason: "sync not configured" });
  }

  try {
    const { error } = await supabase()
      .from("gist_progress")
      .select("book_id")
      .eq("profile", profileId())
      .limit(1);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, awake: true });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Keep-alive failed." },
      { status: 500 },
    );
  }
}
