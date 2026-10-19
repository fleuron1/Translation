import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE, configuredPassword, gateRequired, safeEqual, tokenFor } from "@/lib/auth";

export const config = {
  // Everything but Next's own static output; the gate covers pages and API alike.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

const LOCKED_MESSAGE =
  "This deployment has no APP_PASSWORD set, so it is locked rather than left open. Add APP_PASSWORD in your project's environment variables and redeploy.";

function deny(request: NextRequest, status: number, message: string) {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: message }, { status });
  }
  return new NextResponse(message, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // The gate itself has to stay reachable.
  if (pathname === "/login" || pathname === "/api/login") return NextResponse.next();

  const password = configuredPassword();

  if (!password) {
    // No password locally means the author is just running it; no password on a
    // deployment would mean an open proxy to the Gemini key, so refuse instead.
    return gateRequired() ? deny(request, 503, LOCKED_MESSAGE) : NextResponse.next();
  }

  const cookie = request.cookies.get(AUTH_COOKIE)?.value;
  if (cookie && safeEqual(cookie, await tokenFor(password))) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return deny(request, 401, "Not signed in.");
  }

  const login = request.nextUrl.clone();
  login.pathname = "/login";
  login.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(login);
}
