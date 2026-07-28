/**
 * Markdown Parser — Chapter → Block[]
 * -----------------------------------
 * Pure function. No narrator inference here; this module only identifies
 * structural block kinds. The narrator engine runs in a second pass.
 *
 * Conventions handled (from STYLE-BIBLE.md):
 *   • # / ## / ###       → header (with level)
 *   • --- (alone)        → scene_break
 *   • ## NOTES TO BOOK X → notes_section_header (everything below is footnote)
 *   • [^n]: ...          → footnote definition
 *   • *...* (full block) → invocation or teaser (italic-only paragraph)
 *   • "..." (full block) → dialogue
 *
 * The parser is intentionally permissive: any paragraph that doesn't match
 * a structural rule becomes a plain "narration" block, which the narrator
 * engine then refines.
 */

import type { Block, BlockKind, Chapter } from "./types";

const HEADING_RE = /^(#{1,3})\s+(.*)$/;
const HR_RE = /^---+\s*$/;
const FOOTNOTE_DEF_RE = /^\[\^(\d+)\]:\s*(.*)$/;
const NOTES_HEADER_RE = /^##\s+NOTES\s+TO\s+BOOK/i;
const FULL_ITALIC_RE = /^\*[^*]+(?:\*[^*]+)*\*$/; // paragraph wrapped in single *…*

/** Strip markdown emphasis / footnote refs / heading markers to get plain text. */
export function stripMarkdown(input: string): string {
  return input
    .replace(/^#{1,3}\s+/, "") // leading heading markers
    .replace(/\[\^(\d+)\]/g, "($1)") // [^3] → (3)
    .replace(/\*\*([^*]+)\*\*/g, "$1") // **bold** → bold
    .replace(/\*([^*]+)\*/g, "$1") // *italic* → italic
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // [text](url) → text
    .replace(/\s+/g, " ")
    .trim();
}

/** Split a chapter's raw markdown into paragraph-level chunks.
 *  Splits on blank lines AND on heading boundaries (so that
 *  `# H1\n### H3\n` becomes two separate header chunks). */
function splitParagraphs(raw: string): string[] {
  const normalized = raw.replace(/\r\n/g, "\n");
  // First split on blank lines.
  const rough = normalized
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  // Then split any chunk that contains multiple heading lines into separate
  // heading chunks. e.g. "# H1\n### H3" → ["# H1", "### H3"].
  const out: string[] = [];
  for (const chunk of rough) {
    const lines = chunk.split("\n");
    // If every line starts with #, treat each as its own header chunk.
    const isAllHeadings = lines.every((l) => /^(#{1,3})\s+/.test(l) || /^---+\s*$/.test(l));
    if (isAllHeadings && lines.length > 1) {
      for (const line of lines) {
        if (line.trim()) out.push(line.trim());
      }
    } else {
      out.push(chunk);
    }
  }
  return out;
}

/** Classify a single paragraph chunk into a BlockKind (no narrator inference). */
function classifyKind(
  chunk: string,
  inNotesSection: boolean,
): { kind: BlockKind; footnoteNumber?: number; headingLevel?: 1 | 2 | 3 } {
  if (HEADING_RE.test(chunk)) {
    const m = chunk.match(HEADING_RE)!;
    const level = m[1].length as 1 | 2 | 3;
    if (level === 2 && NOTES_HEADER_RE.test(chunk)) {
      return { kind: "notes_section_header", headingLevel: level };
    }
    return { kind: "header", headingLevel: level };
  }
  if (HR_RE.test(chunk)) {
    return { kind: "scene_break" };
  }
  if (FOOTNOTE_DEF_RE.test(chunk)) {
    const m = chunk.match(FOOTNOTE_DEF_RE)!;
    return { kind: "footnote", footnoteNumber: parseInt(m[1], 10) };
  }
  // Inside the notes section, every non-empty paragraph that isn't a heading
  // or footnote definition is treated as a continuation of the previous note
  // (the style-bible footnotes can be multi-paragraph). We still mark these as
  // footnotes because the entire notes section is by convention narrator voice.
  if (inNotesSection) {
    return { kind: "footnote" };
  }
  // Italic-only paragraph: invocation at the top of a book, or teaser at the end.
  // Strip footnote refs first, since "*...[^1]*" should still count as italic.
  const stripped = chunk.replace(/\[\^(\d+)\]/g, "").trim();
  if (FULL_ITALIC_RE.test(stripped) && stripped.length > 0) {
    return { kind: "invocation" };
  }
  // Dialogue: a paragraph that opens with a quotation mark. We treat any
  // paragraph that starts with " or " as dialogue — the narrator's prose
  // never opens with a quote. Attribution may follow ("…," he said) or
  // precede (rare in this text, handled by the narrator engine).
  if (/^\s*["“']/.test(chunk)) {
    return { kind: "dialogue" };
  }
  // Also catch the "Name said, 'Foo.'" pattern where the quote is at the end.
  if (/^[A-Z][a-zA-Z]+\s+(?:said|cried|asked|answered|replied|whispered|shouted|began|continued),?\s*["“']/.test(chunk)) {
    return { kind: "dialogue" };
  }
  return { kind: "narration" };
}

/** Parse a chapter's raw markdown into a structured Chapter with blocks. */
export function parseChapter(slug: string, number: number, raw: string): Chapter {
  const chunks = splitParagraphs(raw);
  const blocks: Block[] = [];
  let inNotesSection = false;
  let title = "";
  let subtitle = "";

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const { kind, footnoteNumber, headingLevel } = classifyKind(chunk, inNotesSection);

    if (kind === "notes_section_header") {
      inNotesSection = true;
    }

    // Capture the book title + subtitle from headers.
    if (kind === "header" && headingLevel === 2 && /^BOOK\b/i.test(stripMarkdown(chunk))) {
      title = stripMarkdown(chunk);
    }
    if (kind === "header" && headingLevel === 3 && !title) {
      // ## BOOK X  then  ### In Which ...
      subtitle = stripMarkdown(chunk);
    } else if (kind === "header" && headingLevel === 3 && title) {
      subtitle = stripMarkdown(chunk);
    }

    blocks.push({
      id: `${slug}:${i}`,
      chapterId: slug,
      index: i,
      kind,
      raw: chunk,
      text: stripMarkdown(chunk),
      // These are filled in by the narrator engine in a second pass:
      inferredNarratorId: "narrator",
      confidence: 0,
      reasoning: "",
      footnoteNumber,
      headingLevel,
    });
  }

  // If we never picked up a title (e.g. preface), fall back to a heading search.
  if (!title) {
    const firstH1 = blocks.find((b) => b.kind === "header" && b.headingLevel === 1);
    if (firstH1) title = firstH1.text;
  }

  const wordCount = blocks.reduce(
    (sum, b) => sum + (b.text ? b.text.split(/\s+/).filter(Boolean).length : 0),
    0,
  );

  return {
    id: slug,
    slug,
    number,
    title: title || `Book ${number}`,
    subtitle,
    raw,
    blocks,
    wordCount,
  };
}
