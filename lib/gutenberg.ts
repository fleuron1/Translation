import type { SearchResult } from "./types";

const UA = "gist-language-practice/0.1 (personal reading tool)";

function get(url: string): Promise<Response> {
  return fetch(url, { headers: { "user-agent": UA }, cache: "no-store" });
}

/** Project Gutenberg files live under several naming schemes; try them in order. */
export async function fetchBookText(id: number): Promise<string> {
  const candidates = [
    `https://www.gutenberg.org/cache/epub/${id}/pg${id}.txt`,
    `https://www.gutenberg.org/ebooks/${id}.txt.utf-8`,
    `https://www.gutenberg.org/files/${id}/${id}-0.txt`,
    `https://www.gutenberg.org/files/${id}/${id}.txt`,
  ];
  for (const url of candidates) {
    try {
      const res = await get(url);
      if (!res.ok) continue;
      const text = await res.text();
      if (text.length > 1000) return text;
    } catch {
      // fall through to the next naming scheme
    }
  }
  throw new Error(
    `Could not download Project Gutenberg text #${id}. Check the number at gutenberg.org/ebooks/${id}.`,
  );
}

export function readHeader(text: string) {
  const field = (name: string) =>
    text.slice(0, 4000).match(new RegExp(`^${name}:\\s*(.+)$`, "m"))?.[1]?.trim();
  return {
    title: field("Title")?.replace(/\s*\(.*?\)\s*$/, ""),
    author: field("Author"),
    language: field("Language"),
  };
}

export function stripBoilerplate(raw: string): string {
  let text = raw.replace(/\r\n?/g, "\n");

  const start = text.match(
    /\*\*\*\s*START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^\n]*\*\*\*/i,
  );
  if (start?.index != null) text = text.slice(start.index + start[0].length);

  const end = text.match(/\*\*\*\s*END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK/i);
  if (end?.index != null) text = text.slice(0, end.index);

  return text.trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&[a-z]+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Gutendex is frequently offline, so this reads gutenberg.org's own search
 * page, which is a flat list of <li class="booklink"> entries.
 */
export async function searchBooks(query: string, lang?: string): Promise<SearchResult[]> {
  const q = lang ? `${query} l.${lang}` : query;
  const url = `https://www.gutenberg.org/ebooks/search/?query=${encodeURIComponent(q)}&submit_search=Go%21`;
  const res = await get(url);
  if (!res.ok) throw new Error(`Project Gutenberg search returned ${res.status}`);
  const html = await res.text();

  const results: SearchResult[] = [];
  for (const entry of html.split('class="booklink"').slice(1)) {
    const id = Number(entry.match(/href="\/ebooks\/(\d+)"/)?.[1]);
    const title = entry.match(/class="title">([\s\S]*?)<\/span>/)?.[1];
    if (!id || !title) continue;
    const author = entry.match(/class="subtitle">([\s\S]*?)<\/span>/)?.[1];
    const downloads = entry.match(/class="extra">\s*([\d,]+)/)?.[1];
    results.push({
      id,
      title: decodeEntities(title),
      author: author ? decodeEntities(author) : "Unknown",
      downloads: Number(downloads?.replace(/,/g, "") ?? 0),
    });
  }
  return results;
}

export function parseBookRef(input: string): number | null {
  const trimmed = input.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  const fromUrl = trimmed.match(/gutenberg\.org\/(?:ebooks|files|cache\/epub)\/(\d+)/i)?.[1];
  return fromUrl ? Number(fromUrl) : null;
}
