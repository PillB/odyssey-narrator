/**
 * Chapter Manifest + Loader
 * -------------------------
 * The book is bundled as static markdown under /public/books/ (English)
 * and /public/books/es/ (Spanish). This module knows the canonical
 * ordering and exposes a typed loader that supports both languages.
 */

import type { Chapter } from "./types";

/** Supported languages. */
export type Language = "en" | "es";

/** Labels for each language (used in the UI toggle). */
export const LANGUAGE_LABELS: Record<Language, string> = {
  en: "English",
  es: "Español",
};

interface ChapterMeta {
  slug: string;
  number: number;
  label: string; // "Preface" | "Book One" | ...
  /** Spanish label: "Prólogo" | "Libro Uno" | ... */
  labelEs: string;
}

/** Canonical chapter order, matching the source repository. */
export const CHAPTER_MANIFEST: ChapterMeta[] = [
  { slug: "odyssey-book-00-preface", number: 0, label: "Preface", labelEs: "Prólogo" },
  { slug: "odyssey-book-01", number: 1, label: "Book One", labelEs: "Libro Uno" },
  { slug: "odyssey-book-02", number: 2, label: "Book Two", labelEs: "Libro Dos" },
  { slug: "odyssey-book-03", number: 3, label: "Book Three", labelEs: "Libro Tres" },
  { slug: "odyssey-book-04", number: 4, label: "Book Four", labelEs: "Libro Cuatro" },
  { slug: "odyssey-book-05", number: 5, label: "Book Five", labelEs: "Libro Cinco" },
  { slug: "odyssey-book-06", number: 6, label: "Book Six", labelEs: "Libro Seis" },
  { slug: "odyssey-book-07", number: 7, label: "Book Seven", labelEs: "Libro Siete" },
  { slug: "odyssey-book-08", number: 8, label: "Book Eight", labelEs: "Libro Ocho" },
  { slug: "odyssey-book-09", number: 9, label: "Book Nine", labelEs: "Libro Nueve" },
  { slug: "odyssey-book-10", number: 10, label: "Book Ten", labelEs: "Libro Diez" },
  { slug: "odyssey-book-11", number: 11, label: "Book Eleven", labelEs: "Libro Once" },
  { slug: "odyssey-book-12", number: 12, label: "Book Twelve", labelEs: "Libro Doce" },
  { slug: "odyssey-book-13", number: 13, label: "Book Thirteen", labelEs: "Libro Trece" },
  { slug: "odyssey-book-14", number: 14, label: "Book Fourteen", labelEs: "Libro Catorce" },
  { slug: "odyssey-book-15", number: 15, label: "Book Fifteen", labelEs: "Libro Quince" },
  { slug: "odyssey-book-16", number: 16, label: "Book Sixteen", labelEs: "Libro Dieciséis" },
  { slug: "odyssey-book-17", number: 17, label: "Book Seventeen", labelEs: "Libro Diecisiete" },
  { slug: "odyssey-book-18", number: 18, label: "Book Eighteen", labelEs: "Libro Dieciocho" },
  { slug: "odyssey-book-19", number: 19, label: "Book Nineteen", labelEs: "Libro Diecinueve" },
  { slug: "odyssey-book-20", number: 20, label: "Book Twenty", labelEs: "Libro Veinte" },
  { slug: "odyssey-book-21", number: 21, label: "Book Twenty-One", labelEs: "Libro Veintiuno" },
  { slug: "odyssey-book-22", number: 22, label: "Book Twenty-Two", labelEs: "Libro Veintidós" },
  { slug: "odyssey-book-23", number: 23, label: "Book Twenty-Three", labelEs: "Libro Veintitrés" },
  { slug: "odyssey-book-24", number: 24, label: "Book Twenty-Four", labelEs: "Libro Veinticuatro" },
];

/** Books 9-12 use Odysseus as inner first-person narrator (see STYLE-BIBLE §12). */
export const ODYSSEUS_INNER_BOOKS = new Set([9, 10, 11, 12]);

const textCache = new Map<string, string>();

/** Fetch raw markdown for a chapter (cached). Browser-only.
 *  Falls back to English if the requested language is not available. */
export async function fetchChapterMarkdown(slug: string, lang: Language = "en"): Promise<string> {
  const cacheKey = `${lang}:${slug}`;
  const cached = textCache.get(cacheKey);
  if (cached) return cached;
  const langPath = lang === "en" ? "" : `${lang}/`;
  const res = await fetch(`/books/${langPath}${slug}.md`, { cache: "force-cache" });
  if (!res.ok) {
    if (lang !== "en") {
      // Fallback to English
      return fetchChapterMarkdown(slug, "en");
    }
    throw new Error(`Failed to load chapter ${slug}: ${res.status}`);
  }
  const text = await res.text();
  textCache.set(cacheKey, text);
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
