import { NextResponse } from "next/server";
import { AUTH_COOKIE, SESSION_DAYS, configuredPassword, safeEqual, tokenFor } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const expected = configuredPassword();
  if (!expected) {
    return NextResponse.json(
      { error: "No password is configured on this deployment." },
      { status: 503 },
    );
  }

  let password: unknown;
  try {
    ({ password } = (await request.json()) as { password?: unknown });
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  if (typeof password !== "string" || !safeEqual(password, expected)) {
    // Enough of a pause to make guessing at the URL tedious.
    await new Promise((resolve) => setTimeout(resolve, 600));
    return NextResponse.json({ error: "Wrong password." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(AUTH_COOKIE, await tokenFor(expected), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * SESSION_DAYS,
  });
  return response;
}

/** Sign out. */
export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(AUTH_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}
