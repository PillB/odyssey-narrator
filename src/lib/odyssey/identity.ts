/**
 * Cross-Chapter Identity Resolution (Phase 4-5)
 * ---------------------------------------------
 * Narrators appear in multiple chapters: Athena speaks in Book 1, returns in
 * Book 5, etc. This module walks the entire book and produces a globally
 * consistent narrator registry. It also resolves user-initiated merges
 * (e.g. "speaker:athena" → merge with "speaker:grey-eyed-goddess").
 *
 * The algorithm:
 *   1. Collect every distinct narrator id from every chapter.
 *   2. Canonicalize speaker ids using the KNOWN_SPEAKERS table.
 *   3. Apply user merges (chain-walked to a fixed point).
 *   4. Assign stable colors from the Art Nouveau palette.
 */

import type { Block, Chapter, Narrator, NarratorMerge } from "./types";
import { speakerToId, canonicalizeSpeakerName } from "./narrator-engine-canon";

/** Art Nouveau-inspired palette. Earthy, jewel-toned, harmonious.
 *  Each color is paired with a complementary accent. */
const PALETTE: Array<{ color: string; accent: string }> = [
  // Primary narrators (reserved)
  { color: "#8b6f47", accent: "#c9a875" }, // warm bronze — the guide
  { color: "#3a5a78", accent: "#7fb3d5" }, // deep sea — Odysseus
  { color: "#7d4f8a", accent: "#c8a2c8" }, // royal amethyst — invocation
  { color: "#5c5c5c", accent: "#a0a0a0" }, // slate — footnotes
  { color: "#708090", accent: "#b0c4de" }, // muted steel — unknown
  // Character speakers
  { color: "#a83232", accent: "#e57373" }, // crimson
  { color: "#2d6e4a", accent: "#66bb6a" }, // forest
  { color: "#c97b1f", accent: "#ffb74d" }, // amber
  { color: "#1f5f8b", accent: "#4fc3f7" }, // ocean blue
  { color: "#8b3a62", accent: "#e91e63" }, // rose
  { color: "#5d4e75", accent: "#9575cd" }, // dusty purple
  { color: "#7a5c2e", accent: "#d4a85a" }, // ochre
  { color: "#1a6b6b", accent: "#26a69a" }, // teal
  { color: "#8b2a2a", accent: "#ef5350" }, // dark red
  { color: "#3a5f3a", accent: "#81c784" }, // moss
  { color: "#6b4f1a", accent: "#d4b46a" }, // antique gold
  { color: "#4a3b5c", accent: "#7e57c2" }, // midnight
  { color: "#7a4b3b", accent: "#bcaaa4" }, // terracotta
  { color: "#1f3a5f", accent: "#5c8db8" }, // navy
  { color: "#5c1f1f", accent: "#a55a5a" }, // oxblood
  { color: "#2a5c47", accent: "#4db6ac" }, // emerald
  { color: "#735538", accent: "#a1887f" }, // bronze-brown
  { color: "#4c5d3a", accent: "#9ccc65" }, // olive
  { color: "#6b3a5c", accent: "#ad6589" }, // plum
];

/** Reserved colors for the four built-in narrators. */
const BUILTIN_COLORS: Record<string, { color: string; accent: string; name: string; description: string }> = {
  narrator: {
    color: "#8b6f47",
    accent: "#c9a875",
    name: "The Guide",
    description: "The primary narrator — a Tolkien-style avuncular voice that addresses the reader directly as 'you' and explains as he goes.",
  },
  odysseus: {
    color: "#3a5a78",
    accent: "#7fb3d5",
    name: "Odysseus",
    description: "Inner first-person narration in Books 9–12, after the ceremonial handover at the top of Book Nine. No quotation marks; the prose is his.",
  },
  invocation: {
    color: "#7d4f8a",
    accent: "#c8a2c8",
    name: "The Invocation",
    description: "The Muse voice that opens each book — italic, formal, distinct from prose narration.",
  },
  footnote: {
    color: "#5c5c5c",
    accent: "#a0a0a0",
    name: "Footnotes",
    description: "Explanatory notes below the line. Always the guide's voice, even when attached to Odysseus's prose.",
  },
  unknown: {
    color: "#708090",
    accent: "#b0c4de",
    name: "Uncertain",
    description: "Block where the engine could not confidently assign a narrator. Open the editor to set one.",
  },
};

/** Build the initial narrator registry from the four built-ins. */
function builtinNarrators(): Narrator[] {
  return Object.entries(BUILTIN_COLORS).map(([id, meta]) => ({
    id,
    name: meta.name,
    builtin: true,
    isCharacter: false,
    color: meta.color,
    accent: meta.accent,
    description: meta.description,
  }));
}

/** Resolve a narrator id by walking the user's merge chain to its root. */
export function resolveMergeChain(
  narratorId: string,
  merges: NarratorMerge[],
): string {
  const chain = new Set<string>();
  let current = narratorId;
  while (true) {
    if (chain.has(current)) break; // cycle guard
    chain.add(current);
    const next = merges.find((m) => m.fromId === current);
    if (!next) break;
    current = next.toId;
  }
  return current;
}

/**
 * Build a globally-consistent narrator registry across the entire book.
 *
 * @param chapters   Fully-analyzed chapters (post-pipeline).
 * @param merges     User-initiated merges to apply.
 */
export function buildNarratorRegistry(
  chapters: Chapter[],
  merges: NarratorMerge[] = [],
): Narrator[] {
  const registry = new Map<string, Narrator>();
  // Seed with built-ins.
  for (const n of builtinNarrators()) registry.set(n.id, n);

  // Collect every distinct raw narrator id from every block.
  const rawIds = new Set<string>();
  for (const ch of chapters) {
    for (const b of ch.blocks) {
      rawIds.add(b.inferredNarratorId);
    }
  }

  // Apply merge chains to canonicalize ids, then register non-builtin narrators.
  // Start paletteIndex at 5 to skip the reserved built-in colors at indices 0-4.
  let paletteIndex = 5;
  for (const rawId of rawIds) {
    const canonicalId = resolveMergeChain(rawId, merges);
    if (registry.has(canonicalId)) continue;

    // For speaker:... ids, derive a friendly display name.
    let name = canonicalId;
    let isCharacter = false;
    if (canonicalId.startsWith("speaker:")) {
      const rawName = canonicalId.slice("speaker:".length).replace(/-/g, " ");
      name = canonicalizeSpeakerName(rawName);
      isCharacter = true;
    }

    const palette = PALETTE[paletteIndex % PALETTE.length];
    paletteIndex++;
    registry.set(canonicalId, {
      id: canonicalId,
      name,
      builtin: false,
      isCharacter,
      color: palette.color,
      accent: palette.accent,
      description: isCharacter
        ? `Quoted speech attributed to ${name}.`
        : "User-defined narrator.",
    });
  }

  return Array.from(registry.values());
}

/** Final per-block narrator id, after merge chains + user corrections. */
export function resolveBlockNarrator(
  block: Block,
  merges: NarratorMerge[],
  blockCorrections: Record<string, string>,
): string {
  // User corrections win outright.
  if (blockCorrections[block.id]) {
    return resolveMergeChain(blockCorrections[block.id], merges);
  }
  return resolveMergeChain(block.inferredNarratorId, merges);
}

/** Statistics about a narrator's appearance across the book. */
export interface NarratorStats {
  narratorId: string;
  blockCount: number;
  wordCount: number;
  chapterIds: string[];
  firstAppearance: { chapterId: string; blockIndex: number } | null;
  lastAppearance: { chapterId: string; blockIndex: number } | null;
}

/** Compute per-narrator statistics across all chapters. */
export function computeNarratorStats(
  chapters: Chapter[],
  merges: NarratorMerge[],
  blockCorrections: Record<string, string>,
): Map<string, NarratorStats> {
  const stats = new Map<string, NarratorStats>();
  for (const ch of chapters) {
    for (const b of ch.blocks) {
      const narratorId = resolveBlockNarrator(b, merges, blockCorrections);
      let s = stats.get(narratorId);
      if (!s) {
        s = {
          narratorId,
          blockCount: 0,
          wordCount: 0,
          chapterIds: [],
          firstAppearance: null,
          lastAppearance: null,
        };
        stats.set(narratorId, s);
      }
      s.blockCount++;
      s.wordCount += b.text.split(/\s+/).filter(Boolean).length;
      if (!s.chapterIds.includes(ch.id)) s.chapterIds.push(ch.id);
      const appearance = { chapterId: ch.id, blockIndex: b.index };
      if (!s.firstAppearance) s.firstAppearance = appearance;
      s.lastAppearance = appearance;
    }
  }
  return stats;
}
