/**
 * Chapter Manifest + Loader
 * -------------------------
 * The book is bundled as static markdown under /public/books/. This module
 * knows the canonical ordering and exposes a typed loader.
 */

import type { Chapter } from "./types";

interface ChapterMeta {
  slug: string;
  number: number;
  label: string; // "Preface" | "Book One" | ...
}

/** Canonical chapter order, matching the source repository. */
export const CHAPTER_MANIFEST: ChapterMeta[] = [
  { slug: "odyssey-book-00-preface", number: 0, label: "Preface" },
  { slug: "odyssey-book-01", number: 1, label: "Book One" },
  { slug: "odyssey-book-02", number: 2, label: "Book Two" },
  { slug: "odyssey-book-03", number: 3, label: "Book Three" },
  { slug: "odyssey-book-04", number: 4, label: "Book Four" },
  { slug: "odyssey-book-05", number: 5, label: "Book Five" },
  { slug: "odyssey-book-06", number: 6, label: "Book Six" },
  { slug: "odyssey-book-07", number: 7, label: "Book Seven" },
  { slug: "odyssey-book-08", number: 8, label: "Book Eight" },
  { slug: "odyssey-book-09", number: 9, label: "Book Nine" },
  { slug: "odyssey-book-10", number: 10, label: "Book Ten" },
  { slug: "odyssey-book-11", number: 11, label: "Book Eleven" },
  { slug: "odyssey-book-12", number: 12, label: "Book Twelve" },
  { slug: "odyssey-book-13", number: 13, label: "Book Thirteen" },
  { slug: "odyssey-book-14", number: 14, label: "Book Fourteen" },
  { slug: "odyssey-book-15", number: 15, label: "Book Fifteen" },
  { slug: "odyssey-book-16", number: 16, label: "Book Sixteen" },
  { slug: "odyssey-book-17", number: 17, label: "Book Seventeen" },
  { slug: "odyssey-book-18", number: 18, label: "Book Eighteen" },
  { slug: "odyssey-book-19", number: 19, label: "Book Nineteen" },
  { slug: "odyssey-book-20", number: 20, label: "Book Twenty" },
  { slug: "odyssey-book-21", number: 21, label: "Book Twenty-One" },
  { slug: "odyssey-book-22", number: 22, label: "Book Twenty-Two" },
  { slug: "odyssey-book-23", number: 23, label: "Book Twenty-Three" },
  { slug: "odyssey-book-24", number: 24, label: "Book Twenty-Four" },
];

/** Books 9-12 use Odysseus as inner first-person narrator (see STYLE-BIBLE §12). */
export const ODYSSEUS_INNER_BOOKS = new Set([9, 10, 11, 12]);

const textCache = new Map<string, string>();

/** Fetch raw markdown for a chapter (cached). Browser-only. */
export async function fetchChapterMarkdown(slug: string): Promise<string> {
  const cached = textCache.get(slug);
  if (cached) return cached;
  const res = await fetch(`/books/${slug}.md`, { cache: "force-cache" });
  if (!res.ok) throw new Error(`Failed to load chapter ${slug}: ${res.status}`);
  const text = await res.text();
  textCache.set(slug, text);
  return text;
}

/** Convenience helper: build a Chapter object's metadata without parsing. */
export function chapterMeta(slug: string): ChapterMeta {
  const m = CHAPTER_MANIFEST.find((c) => c.slug === slug);
  if (!m) throw new Error(`Unknown chapter slug: ${slug}`);
  return m;
}

/** Number to English ordinal word, used for "Book One" labels. */
export function bookTitle(n: number): string {
  return CHAPTER_MANIFEST.find((c) => c.number === n)?.label ?? `Book ${n}`;
}

/** Pre-build a skeleton Chapter (no blocks) — caller fills in blocks. */
export function chapterSkeleton(slug: string, raw: string): Pick<Chapter, "id" | "slug" | "number"> {
  const meta = chapterMeta(slug);
  return {
    id: slug,
    slug,
    number: meta.number,
  };
}
