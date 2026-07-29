/**
 * Contextual speaker injection for folded narration.
 * -----------------------------------------------
 * When a dialogue block was resolved via pronoun attribution ("he said")
 * using context from a preceding narration block, and that narration block
 * is folded/hidden, the reader loses the speaker reference. This module
 * injects "(SpeakerName)" after the attribution verb so the dialogue
 * remains comprehensible.
 */

import type { Block } from "./types";

/**
 * Check if a dialogue block's context-providing narration is folded.
 * Returns true if the block is context-dependent AND the immediately
 * preceding foldable block (narration) belongs to a hidden narrator.
 */
export function isContextFolded(
  block: Block,
  blocks: Block[],
  resolvedNarratorIds: Map<string, string>,
  visibility: Record<string, boolean>,
): boolean {
  if (!block.contextDependent) return false;
  // Find the preceding block (skip structural blocks like scene_break, header)
  for (let i = block.index - 1; i >= 0; i--) {
    const prev = blocks[i];
    if (!prev) break;
    // Skip structural blocks
    if (prev.kind === "scene_break" || prev.kind === "header" || prev.kind === "notes_section_header") continue;
    // The first content block before this dialogue is the context provider
    const prevNarratorId = resolvedNarratorIds.get(prev.id) ?? prev.inferredNarratorId;
    const isHidden = visibility[prevNarratorId] === false;
    // Only inject if the preceding block is from a DIFFERENT narrator type
    // (if it's the same speaker's dialogue, no injection needed)
    const blockNarratorId = resolvedNarratorIds.get(block.id) ?? block.inferredNarratorId;
    if (prevNarratorId !== blockNarratorId && isHidden) {
      return true;
    }
    // If the preceding block is visible, or it's the same narrator, no injection
    return false;
  }
  return false;
}

/**
 * Inject the speaker name in parentheses after the attribution verb.
 * Works for both English and Spanish attribution patterns:
 *   "Foo," he said. → "Foo," he said (Zeus).
 *   "Foo," dijo. → "Foo," dijo (Zeus).
 *
 * Returns the modified raw text, or the original if no injection point found.
 */
export function injectContextSpeaker(raw: string, speakerName: string): string {
  // Patterns to match (after a closing quote + optional comma + attribution verb):
  // English: "..." ,? (he|she|they) (said|cried|asked|...)
  // Spanish: "..." ,? (dijo|gritó|preguntó|...)
  // We insert " (SpeakerName)" right after the verb.

  // English pattern: "..." [he/she/they] [said/cried/asked/...]
  const enPattern = /([""'].*[""']\s*[,\-—]?\s*(?:he|she|they)\s+(?:said|cried|asked|answered|replied|whispered|shouted|began|continued|added|remarked|observed))\b/i;
  const enMatch = raw.match(enPattern);
  if (enMatch) {
    return raw.replace(enMatch[0], `${enMatch[0]} (${speakerName})`);
  }

  // Spanish pattern: "..." [dijo/gritó/preguntó/...]
  const esPattern = /([""'].*[""']\s*[,\-—]?\s*(?:dijo|gritó|grito|preguntó|pregunto|respondió|respondio|replicó|replico|susurró|susurro|exclamó|exclamo|comenzó|comenzo|continuó|continuo|añadió|anadio|observó|observo))\b/i;
  const esMatch = raw.match(esPattern);
  if (esMatch) {
    return raw.replace(esMatch[0], `${esMatch[0]} (${speakerName})`);
  }

  // Fallback: if no attribution verb found, prepend the speaker name
  // before the opening quote: (Zeus) "Foo..."
  return `(${speakerName}) ${raw}`;
}

/**
 * Check if a block needs context injection and return the modified content.
 * Returns { needsInjection, modifiedRaw } where modifiedRaw includes the
 * injected speaker name if needed.
 */
export function getContextInjectedRaw(
  block: Block,
  blocks: Block[],
  resolvedNarratorIds: Map<string, string>,
  visibility: Record<string, boolean>,
): { needsInjection: boolean; modifiedRaw: string; speakerName: string } {
  if (!isContextFolded(block, blocks, resolvedNarratorIds, visibility)) {
    return { needsInjection: false, modifiedRaw: block.raw, speakerName: "" };
  }
  const speakerName = block.contextSpeaker ?? "";
  if (!speakerName) {
    return { needsInjection: false, modifiedRaw: block.raw, speakerName: "" };
  }
  return {
    needsInjection: true,
    modifiedRaw: injectContextSpeaker(block.raw, speakerName),
    speakerName,
  };
}
