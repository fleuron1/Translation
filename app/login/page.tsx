"use client";

import { useState } from "react";

/** Same-site paths only, so ?next= cannot bounce you to another origin. */
function safeNextPath(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

export default function Login() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "That did not work.");
      // Read the destination here rather than with useSearchParams, which
      // would drag a Suspense boundary into an otherwise static page.
      const next = safeNextPath(new URLSearchParams(window.location.search).get("next"));
      window.location.replace(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That did not work.");
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4">
      <h1 className="text-3xl font-semibold tracking-tight">Gist</h1>
      <p className="mt-2 text-sm text-muted">
        This copy is private — it spends a real Gemini key, so it asks for a password first.
      </p>

      <form onSubmit={submit} className="mt-6">
        <label htmlFor="password" className="text-sm font-medium">
          Password
        </label>
        <input
          id="password"
          type="password"
          autoFocus
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="mt-1 w-full rounded-lg border border-rule bg-card px-3 py-2 text-sm"
        />

        {error && <p className="mt-3 text-sm text-bad">{error}</p>}

        <button
          type="submit"
          disabled={!password || busy}
          className="mt-4 w-full rounded-lg bg-accent px-4 py-2 text-sm font-medium text-paper disabled:opacity-40"
        >
          {busy ? "checking…" : "Let me in"}
        </button>
      </form>

      <p className="mt-6 text-xs text-faint">
        Set by the APP_PASSWORD environment variable. Stays signed in for 30 days.
      </p>
    </main>
  );
}
