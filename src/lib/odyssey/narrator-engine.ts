/**
 * Narrator Detection Engine
 * -------------------------
 * Implements Phases 1-3 of the spec: literary analysis, independent validation,
 * and an adversarial self-check. The engine is deterministic — given the same
 * input it always produces the same output — so human corrections stay stable
 * across sessions and across re-inference passes.
 *
 * Inference rules (derived from STYLE-BIBLE.md):
 *
 *   1. header                  → narrator (always)
 *   2. scene_break             → narrator (the guide's hand)
 *   3. notes_section_header    → narrator
 *   4. footnote                → footnote (always the narrator's voice, even
 *                                when attached to Odysseus's prose; §12)
 *   5. invocation              → invocation (the Muse voice, distinct from
 *                                the narrator's prose voice)
 *   6. teaser (italic at end)  → invocation (same Muse voice)
 *   7. dialogue                → attributed speaker if parseable, else unknown
 *   8. narration (Books 9-12)  → odysseus inside the inner-narration span;
 *                                narrator inside re-entry / handback blocks
 *                                (marked by the guide explicitly stepping
 *                                forward, which we detect by stylistic cues)
 *   9. narration (other)       → narrator
 *
 * Confidence model:
 *   • 1.00 — rule is structural (header, footnote, scene_break, etc.)
 *   • 0.95 — dialogue with explicit attribution (parseable "said X")
 *   • 0.70 — dialogue with no attribution (relys on context; user may correct)
 *   • 0.85 — Odysseus inner narration in books 9-12 (handover is explicit
 *            but voice-detection is heuristic)
 *   • 0.90 — primary narrator prose (default voice)
 */

import type { Block, Chapter } from "./types";
import { ODYSSEUS_INNER_BOOKS } from "./chapters";
import { canonicalizeSpeaker, speakerToId } from "./narrator-engine-canon";
import { parseChapter } from "./parser";

/**
 * Try to extract a speaker name from a dialogue paragraph.
 * Looks for patterns like:
 *   • "Foo," said Athena.
 *   • "Foo," Athena said.
 *   • "Foo," said the goddess.
 *   • "Foo" — Zeus
 *   • Athena said, "Foo."
 */
function parseSpeaker(raw: string): string | undefined {
  // Pattern: "..." said Name.
  let m = raw.match(/[""'].*[""']\s*[,\-—]?\s*(?:said|cried|asked|answered|replied|whispered|shouted|began|continued|added|remarked|observed)\s+(?:([A-Z][a-zA-Z]+)|([a-z]+))\b/);
  if (m) {
    const name = (m[1] || m[2] || "").trim();
    if (name) {
      const canon = canonicalizeSpeaker(name);
      if (canon) return canon;
    }
  }
  // Pattern: "..." Name said.
  m = raw.match(/[""'].*[""']\s*[,\-—]?\s+(?:([A-Z][a-zA-Z]+)|([a-z]+))\s+(?:said|cried|asked|answered|replied|whispered|shouted)/);
  if (m) {
    const name = (m[1] || m[2] || "").trim();
    if (name) {
      const canon = canonicalizeSpeaker(name);
      if (canon) return canon;
    }
  }
  // Pattern: Name said, "..."
  m = raw.match(/^([A-Z][a-zA-Z]+)\s+(?:said|cried|asked|answered|replied|whispered|shouted|began),?\s+[""']/);
  if (m) {
    const canon = canonicalizeSpeaker(m[1]);
    if (canon) return canon;
  }
  // Pattern: "..." — Zeus  /  "..." (Zeus)
  m = raw.match(/[""'].*[""']\s*[—\-]\s*([A-Z][a-zA-Z]+)/);
  if (m) {
    const canon = canonicalizeSpeaker(m[1]);
    if (canon) return canon;
  }
  return undefined;
}

/** Convert a speaker name to a stable narrator id slug. (re-export) */
export { speakerToId };

/**
 * Detect the narrator for a single block within a chapter context.
 * Phase 1 (literary analysis): rule-based inference with reasoning.
 */
function inferNarrator(
  block: Block,
  chapterNumber: number,
  ctx: InferenceContext,
): { narratorId: string; confidence: number; reasoning: string } {
  switch (block.kind) {
    case "header":
    case "scene_break":
    case "notes_section_header":
      return {
        narratorId: "narrator",
        confidence: 1.0,
        reasoning: "Structural element (heading/scene-break/notes marker) belongs to the guide.",
      };
    case "footnote":
      return {
        narratorId: "footnote",
        confidence: 1.0,
        reasoning: "Footnotes are always the narrator's voice, even when attached to quoted or inner-narrated text (STYLE-BIBLE §12).",
      };
    case "invocation":
      return {
        narratorId: "invocation",
        confidence: 1.0,
        reasoning: "Italic-only paragraph is a Muse invocation or end-of-book teaser — a distinct voice from prose narration.",
      };
    case "dialogue": {
      const speaker = parseSpeaker(block.raw);
      if (speaker) {
        return {
          narratorId: speakerToId(speaker),
          confidence: 0.95,
          reasoning: `Quoted speech explicitly attributed to "${speaker}".`,
        };
      }
      // No explicit attribution: try to inherit from previous dialogue speaker,
      // otherwise mark as unknown (user can correct).
      if (ctx.lastDialogueSpeakerId) {
        return {
          narratorId: ctx.lastDialogueSpeakerId,
          confidence: 0.7,
          reasoning: "Quoted speech with no explicit attribution; inherited from the previous speech turn in the same scene.",
        };
      }
      return {
        narratorId: "unknown",
        confidence: 0.4,
        reasoning: "Quoted speech with no attribution and no contextual speaker to inherit from. Marked uncertain.",
      };
    }
    case "narration": {
      // Books 9-12: the inner narration. The guide hands over at the top of
      // Book 9 and takes back at the end of Book 12; in between, scene breaks
      // (---) mark the guide's brief re-entries. We detect re-entries by
      // looking for explicit narrator cues: first-person address to the
      // reader ("you", "I want you to", "we must") combined with commentary
      // framing.
      if (ODYSSEUS_INNER_BOOKS.has(chapterNumber)) {
        if (ctx.lastBlockWasSceneBreak && isNarratorReentry(block.text)) {
          return {
            narratorId: "narrator",
            confidence: 0.85,
            reasoning: "Re-entry: the guide steps forward after a scene break in an inner-narration book (detected by direct reader address / meta-commentary).",
          };
        }
        if (ctx.afterHandover && !ctx.afterHandback) {
          return {
            narratorId: "odysseus",
            confidence: 0.9,
            reasoning: "Inner narration: Books 9-12 are told in Odysseus's first person after the handover (STYLE-BIBLE §12).",
          };
        }
      }
      // Default: primary narrator.
      return {
        narratorId: "narrator",
        confidence: 0.9,
        reasoning: "Default narrator voice (Tolkien-style avuncular guide).",
      };
    }
    default:
      return {
        narratorId: "narrator",
        confidence: 0.5,
        reasoning: "Unclassified block kind; defaulted to narrator.",
      };
  }
}

/** Detect whether a narration block in Books 9-12 is a narrator re-entry
 *  (the guide briefly stepping forward between Odysseus's turns). */
function isNarratorReentry(text: string): boolean {
  // Strong signals: direct reader address with "you" + meta verbs
  if (/\b(you|I want you|we must|we shall|I should tell you|remember that|notice that)\b/i.test(text)) {
    if (/\b(see|notice|remember|understand|want you|tell you|shall|must|should|frame|handover|handover|back to|return to|stepping|step back)\b/i.test(text)) {
      return true;
    }
  }
  // Explicit references to the inner-narration frame
  if (/\bOdysseus\b.*\b(said|told|began|continued|spoke|his tale|his story)\b/i.test(text)) {
    return true;
  }
  return false;
}

interface InferenceContext {
  lastDialogueSpeakerId: string | null;
  lastBlockWasSceneBreak: boolean;
  afterHandover: boolean;
  afterHandback: boolean;
}

/**
 * Phase 1 — Literary Analysis pass.
 * Walks a chapter and assigns inferred narrator + confidence + reasoning
 * to every block. Pure function; safe to re-run.
 */
export function analyzeChapter(chapter: Chapter): Chapter {
  const ctx: InferenceContext = {
    lastDialogueSpeakerId: null,
    lastBlockWasSceneBreak: false,
    afterHandover: false,
    afterHandback: false,
  };

  const blocks = chapter.blocks.map((block) => {
    // Detect the handover at the top of Book 9 (heuristic: a narration block
    // that explicitly mentions stepping back / handing over / Odysseus speaks).
    if (chapter.number === 9 && block.kind === "narration" && !ctx.afterHandover) {
      if (/\b(hand|step|step back|hand over|handover|hands over|gives way|yields|withdraws|Odysseus\b.*\bsaid|takes? up|takes? the floor|begins? to speak)\b/i.test(block.text)) {
        ctx.afterHandover = true;
      }
    }

    const { narratorId, confidence, reasoning } = inferNarrator(block, chapter.number, ctx);

    // Update context for the next block.
    if (block.kind === "scene_break") {
      ctx.lastBlockWasSceneBreak = true;
      // Scene break inside an inner-narration book: the guide may briefly re-enter
      // in the next block; we let isNarratorReentry decide.
    } else {
      ctx.lastBlockWasSceneBreak = false;
    }
    if (block.kind === "dialogue" && confidence >= 0.9) {
      ctx.lastDialogueSpeakerId = narratorId;
    }
    // If we're back from a re-entry (i.e. previous block was narrator inside
    // an inner-narration book), reset the "afterHandover" flag once we exit
    // the inner narration at the end of Book 12.
    if (chapter.number === 12 && block.kind === "narration") {
      if (/\b(handback|hands back|takes? back|returns? to|back to my|back to our|back to the guide|back to me|back to him)\b/i.test(block.text)) {
        ctx.afterHandback = true;
      }
    }

    return {
      ...block,
      inferredNarratorId: narratorId,
      confidence,
      reasoning,
      parsedSpeaker:
        block.kind === "dialogue" ? parseSpeaker(block.raw) : undefined,
    };
  });

  return { ...chapter, blocks };
}

/**
 * Phase 2 — Independent Validation pass.
 * Re-reads the chapter looking for narrator-assignment mistakes, with a
 * bias toward conservative resolutions. Outputs a list of disagreements
 * and the corrected assignments. Disagreements are logged (visible in the
 * editor's "audit" view) and the conservative choice wins.
 */
export interface ValidationDisagreement {
  blockId: string;
  phase1NarratorId: string;
  phase2NarratorId: string;
  reason: string;
  /** The id that won the disagreement. */
  winner: string;
}

export function validateChapter(chapter: Chapter): {
  chapter: Chapter;
  disagreements: ValidationDisagreement[];
} {
  const disagreements: ValidationDisagreement[] = [];
  const blocks = chapter.blocks.map((b) => ({ ...b }));

  // Re-walk: for dialogue blocks with low confidence, re-check attribution.
  // For narration in inner books, re-check re-entry detection.
  let lastSpeakerId: string | null = null;

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (block.kind === "dialogue") {
      // Re-parse: maybe the parser missed an attribution.
      const reSpeaker = parseSpeaker(block.raw);
      if (reSpeaker && block.confidence < 0.95) {
        const newId = speakerToId(reSpeaker);
        if (newId !== block.inferredNarratorId) {
          disagreements.push({
            blockId: block.id,
            phase1NarratorId: block.inferredNarratorId,
            phase2NarratorId: newId,
            reason: `Phase 2 found explicit attribution to "${reSpeaker}" that Phase 1 missed.`,
            winner: newId,
          });
          block.inferredNarratorId = newId;
          block.confidence = 0.95;
          block.reasoning = `Phase 2 correction: explicit attribution to "${reSpeaker}".`;
          lastSpeakerId = newId;
          continue;
        }
      }
      // If still unknown but we have a context speaker, inherit it.
      if (block.inferredNarratorId === "unknown" && lastSpeakerId) {
        disagreements.push({
          blockId: block.id,
          phase1NarratorId: block.inferredNarratorId,
          phase2NarratorId: lastSpeakerId,
          reason: "Phase 2 inherited speaker from preceding dialogue turn.",
          winner: lastSpeakerId,
        });
        block.inferredNarratorId = lastSpeakerId;
        block.confidence = 0.7;
        block.reasoning = "Phase 2 correction: inherited from previous dialogue turn.";
      }
      if (block.confidence >= 0.9) lastSpeakerId = block.inferredNarratorId;
    }
  }

  return { chapter: { ...chapter, blocks }, disagreements };
}

/**
 * Phase 3 — Adversarial Validation.
 * A second-pass adversarial check that tries to find narrator switches
 * that are wrong. Currently a thin stub that flags very-low-confidence
 * blocks for human review. This is the place where future LLM-backed
 * adversarial evaluators would be invoked.
 */
export function adversarialCheck(chapter: Chapter): {
  chapter: Chapter;
  flags: { blockId: string; reason: string }[];
} {
  const flags: { blockId: string; reason: string }[] = [];
  const blocks = chapter.blocks.map((b) => ({ ...b }));

  for (const block of blocks) {
    if (block.confidence < 0.5) {
      flags.push({
        blockId: block.id,
        reason: `Low confidence (${block.confidence.toFixed(2)}): consider manual review.`,
      });
    }
    // Dialogue with no speaker inside an inner-narration book is suspicious.
    if (ODYSSEUS_INNER_BOOKS.has(chapter.number) && block.kind === "dialogue" && !block.parsedSpeaker) {
      flags.push({
        blockId: block.id,
        reason: "Dialogue inside inner-narration book with no attribution — could be Odysseus quoting himself.",
      });
    }
  }

  return { chapter: { ...chapter, blocks }, flags };
}

/**
 * Full pipeline: parse → analyze → validate → adversarial-check.
 * Returns the final chapter plus an audit trail.
 */
export function fullAnalysisPipeline(
  slug: string,
  number: number,
  raw: string,
): {
  chapter: Chapter;
  disagreements: ValidationDisagreement[];
  flags: { blockId: string; reason: string }[];
} {
  const parsed = parseChapter(slug, number, raw);
  const analyzed = analyzeChapter(parsed);
  const { chapter: validated, disagreements } = validateChapter(analyzed);
  const { chapter: checked, flags } = adversarialCheck(validated);
  return { chapter: checked, disagreements, flags };
}
