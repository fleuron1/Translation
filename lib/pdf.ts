"use client";

import { dropRunningHeads, joinPages, toLines, toParagraphs, type Line, type RawItem } from "./pdf-text";

/**
 * PDF loading, in the browser.
 *
 * It runs client-side on purpose: book PDFs routinely run past Vercel's 4.5MB
 * request body limit, and there is no reason for the file to leave the machine
 * when only the passage you are working on ever goes to the model.
 *
 * The reconstruction of prose from glyph positions lives in ./pdf-text.
 */

export type PdfProgress = { page: number; total: number };

export type PdfExtraction = {
  /** Paragraphs separated by blank lines, which is what segment() expects. */
  text: string;
  pageCount: number;
  from: number;
  to: number;
  title?: string;
  author?: string;
};

export class NoTextLayerError extends Error {
  constructor() {
    super(
      "This PDF has no text in it — it is page images, probably a scan. Running it through OCR first would make it work.",
    );
    this.name = "NoTextLayerError";
  }
}

async function loadPdfjs() {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();
  return pdfjs;
}

function readInfo(meta: { info?: unknown }) {
  const info = meta.info as { Title?: string; Author?: string } | undefined;
  return {
    title: info?.Title?.trim() || undefined,
    author: info?.Author?.trim() || undefined,
  };
}

/** Cheap first pass: how long is it, and what does it call itself? */
export async function readPdfInfo(
  file: File,
): Promise<{ pageCount: number; title?: string; author?: string }> {
  const pdfjs = await loadPdfjs();
  const data = new Uint8Array(await file.arrayBuffer());
  const task = pdfjs.getDocument({ data });
  const doc = await task.promise;

  let title: string | undefined;
  let author: string | undefined;
  try {
    ({ title, author } = readInfo(await doc.getMetadata()));
  } catch {
    // metadata is optional
  }

  const pageCount = doc.numPages;
  await task.destroy();
  return { pageCount, title, author };
}

export async function extractPdf(
  file: File,
  options: { from?: number; to?: number; onProgress?: (progress: PdfProgress) => void } = {},
): Promise<PdfExtraction> {
  const pdfjs = await loadPdfjs();
  const data = new Uint8Array(await file.arrayBuffer());
  const task = pdfjs.getDocument({ data });
  const doc = await task.promise;

  const pageCount = doc.numPages;
  const from = Math.max(1, Math.min(pageCount, options.from ?? 1));
  const to = Math.max(from, Math.min(pageCount, options.to ?? pageCount));

  const pages: Line[][] = [];
  for (let number = from; number <= to; number++) {
    const page = await doc.getPage(number);
    const content = await page.getTextContent();
    pages.push(toLines(content.items as unknown as RawItem[]));
    page.cleanup();
    options.onProgress?.({ page: number - from + 1, total: to - from + 1 });
  }

  const withText = pages.filter((lines) => lines.length > 0).length;
  if (withText === 0 || withText < pages.length * 0.15) {
    await task.destroy();
    throw new NoTextLayerError();
  }

  const paragraphs = joinPages(dropRunningHeads(pages).map(toParagraphs));

  let title: string | undefined;
  let author: string | undefined;
  try {
    ({ title, author } = readInfo(await doc.getMetadata()));
  } catch {
    // metadata is optional
  }

  await task.destroy();

  return { text: paragraphs.join("\n\n"), pageCount, from, to, title, author };
}
