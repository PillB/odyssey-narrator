/**
 * Odyssey Narrator Intelligence — Core Types
 * ------------------------------------------
 * Every paragraph in the book is classified into a Block. A Block carries
 * an inferred Narrator (with confidence) plus structured metadata that the
 * rendering, folding, and editor layers consume.
 *
 * The system is designed so that:
 *   1. narrator identification is always treatable as uncertain
 *   2. human corrections override AI inference without code changes
 *   3. the data graph is serializable to localStorage / IndexedDB
 */

/** Block kinds — mutually exclusive structural categories. */
export type BlockKind =
  | "header" // # / ## / ### markdown heading
  | "scene_break" // --- separator
  | "invocation" // italic block that opens a book (Muse invocation)
  | "narration" // primary narrator prose (or Odysseus inner narration in 9-12)
  | "dialogue" // a quoted speech turn
  | "footnote" // [^n] definition body (always narrator voice)
  | "notes_section_header" // ## NOTES TO BOOK X marker
  | "teaser"; // italic closing teaser line at the end of a book

/** Built-in narrator IDs. */
export type BuiltinNarratorId =
  | "narrator" // the primary storyteller (Tolkien-voice)
  | "odysseus" // inner first-person narration in Books 9-12
  | "invocation" // the Muse / poetic invocation voice
  | "footnote" // explanatory notes (always narrator)
  | "unknown"; // explicit uncertainty marker

/** A globally-resolved narrator identity. */
export interface Narrator {
  /** Stable global ID. Built-ins use BuiltinNarratorId; speakers use slug. */
  id: string;
  /** Human-readable display name. */
  name: string;
  /** True for the four built-in narrative voices. */
  builtin: boolean;
  /** True if the narrator is a quoted character (vs. a narrative voice). */
  isCharacter: boolean;
  /** Hex color used for the left border + legend swatch. */
  color: string;
  /** Optional secondary accent color (for hover, ornamental rules). */
  accent: string;
  /** Short description shown in the legend. */
  description?: string;
}

/** A single paragraph-level block of content. */
export interface Block {
  /** Stable ID within a chapter: `${chapterId}:${index}`. */
  id: string;
  /** Source chapter slug, e.g. "odyssey-book-01". */
  chapterId: string;
  /** 0-indexed position within the chapter. */
  index: number;
  /** Structural kind. */
  kind: BlockKind;
  /** Raw markdown source (trimmed). */
  raw: string;
  /** Plain-text rendering (no markdown). */
  text: string;
  /** Inferred narrator ID (post-resolution, pre-correction). */
  inferredNarratorId: string;
  /** Confidence in the inference, 0..1. */
  confidence: number;
  /** Short human-readable reasoning for the inference. */
  reasoning: string;
  /** Footnote number, when kind === "footnote". */
  footnoteNumber?: number;
  /** Speaker name as parsed from surrounding text, when kind === "dialogue". */
  parsedSpeaker?: string;
  /** Heading level (1/2/3), when kind === "header". */
  headingLevel?: 1 | 2 | 3;
}

/** A fully-parsed chapter. */
export interface Chapter {
  id: string; // e.g. "odyssey-book-01"
  slug: string; // filename without .md
  number: number; // 0 = preface, 1..24
  title: string; // "BOOK ONE"
  subtitle: string; // "In Which ..."
  raw: string; // full markdown
  blocks: Block[];
  wordCount: number;
}

/** A user-initiated correction that overrides AI inference. */
export interface NarratorCorrection {
  /** Block ID being overridden. */
  blockId: string;
  /** New narrator ID. */
  narratorId: string;
  /** ISO timestamp of the correction. */
  createdAt: string;
  /** Optional note from the editor. */
  note?: string;
}

/** User-renamed or recolored narrator (overrides built-in metadata). */
export interface NarratorOverride {
  narratorId: string;
  name?: string;
  color?: string;
  accent?: string;
  description?: string;
  hidden?: boolean;
}

/** User-created narrator merge: maps one narrator id → another. */
export interface NarratorMerge {
  fromId: string;
  toId: string;
  createdAt: string;
}

/** Per-block editor overrides + global narrator metadata. */
export interface EditorState {
  /** blockId → corrected narrator id. */
  blockCorrections: Record<string, string>;
  /** narratorId → metadata overrides. */
  narratorOverrides: Record<string, NarratorOverride>;
  /** ordered merges: when resolving a narrator, walk the merge chain. */
  merges: NarratorMerge[];
  /** editor mode on/off. */
  editorMode: boolean;
}

/** Reader-facing display preferences. */
export interface ReaderPreferences {
  theme: "light" | "dark" | "system";
  fontSize: number; // px
  lineHeight: number; // multiplier
  fontFamily: "serif" | "sans" | "wenkai";
  highContrast: boolean;
  reducedMotion: boolean;
  colorBlindMode: "none" | "protanopia" | "deuteranopia" | "tritanopia";
  showFootnotesInline: boolean;
  showNarratorLabels: boolean;
  paragraphSpacing: "compact" | "comfortable" | "spacious";
  /** UI + book language: "en" (English) or "es" (Spanish LATAM). */
  language: "en" | "es";
}

/** Visibility per narrator id (folding system). */
export type NarratorVisibility = Record<string, boolean>;

/** The complete persisted application state. */
export interface PersistedState {
  reader: ReaderPreferences;
  editor: EditorState;
  visibility: NarratorVisibility;
  currentChapterId: string | null;
  scrollProgress: Record<string, number>; // chapterId → 0..1
  bookmarks: string[]; // block IDs
  annotations: Record<string, string>; // blockId → text
}
