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
import { canonicalizeSpeaker, canonicalizeKnownSpeaker, speakerToId } from "./narrator-engine-canon";
import { parseChapter } from "./parser";

/**
 * Try to extract a speaker name from a dialogue paragraph.
 * Looks for patterns like:
 *   • "Foo," said Athena.
 *   • "Foo," Athena said.
 *   • "Foo," said the goddess.
 *   • "Foo" — Zeus
 *   • Athena said, "Foo."
 *   • "Foo." Zeus looked genuinely startled.   (mid-paragraph name)
 */
function parseSpeaker(raw: string): string | undefined {
  // Pattern 1: "..." said Name.
  let m = raw.match(/[""'].*[""']\s*[,\-—]?\s*(?:said|cried|asked|answered|replied|whispered|shouted|began|continued|added|remarked|observed)\s+(?:([A-Z][a-zA-Z]+)|([a-z]+))\b/);
  if (m) {
    const name = (m[1] || m[2] || "").trim();
    if (name) {
      const canon = canonicalizeSpeaker(name);
      if (canon) return canon;
    }
  }
  // Pattern 2: "..." Name said.
  m = raw.match(/[""'].*[""']\s*[,\-—]?\s+(?:([A-Z][a-zA-Z]+)|([a-z]+))\s+(?:said|cried|asked|answered|replied|whispered|shouted)/);
  if (m) {
    const name = (m[1] || m[2] || "").trim();
    if (name) {
      const canon = canonicalizeSpeaker(name);
      if (canon) return canon;
    }
  }
  // Pattern 3: Name said, "..."
  m = raw.match(/^([A-Z][a-zA-Z]+)\s+(?:said|cried|asked|answered|replied|whispered|shouted|began),?\s+[""']/);
  if (m) {
    const canon = canonicalizeSpeaker(m[1]);
    if (canon) return canon;
  }
  // Pattern 4: "..." — Zeus  /  "..." (Zeus)
  m = raw.match(/[""'].*[""']\s*[—\-]\s*([A-Z][a-zA-Z]+)/);
  if (m) {
    const canon = canonicalizeSpeaker(m[1]);
    if (canon) return canon;
  }
  // Pattern 5 (NEW): "Foo." Name [any verb] — catches mid-paragraph
  // attribution like `"Child, what a thing to say." Zeus looked genuinely
  // startled. "How could I ever forget Odysseus?"`. After the closing quote,
  // a capitalized proper noun appears before any lowercase word.
  // Uses the strict canonicalizer so we only accept KNOWN speakers —
  // otherwise we'd false-positive on sentence-initial adverbs like
  // "Listen", "Take", "Apparently", etc.
  m = raw.match(/[""']\s*([A-Z][a-zA-Z]{2,})\s+(?:[a-z]+)/);
  if (m) {
    const canon = canonicalizeKnownSpeaker(m[1]);
    if (canon) return canon;
  }
  return undefined;
}

/**
 * Detect pronoun attribution in a dialogue paragraph: `"Foo," he said` etc.
 * Returns the pronoun ("he", "she", "they") or undefined.
 */
function detectPronounAttribution(raw: string): "he" | "she" | "they" | undefined {
  // After a closing quote, look for "he said" / "she said" / "they said" etc.
  const m = raw.match(/[""']\s*[,\-—]?\s*(he|she|they)\s+(?:said|cried|asked|answered|replied|whispered|shouted|began|continued|added|remarked|observed)\b/i);
  if (!m) return undefined;
  return m[1].toLowerCase() as "he" | "she" | "they";
}

/**
 * Scan a narration paragraph for the most-recently-mentioned known character.
 * Used to resolve pronoun-attributed dialogue ("he said" → which "he"?).
 * Returns the canonical name, or undefined if no character is mentioned.
 * Uses the strict canonicalizer so we don't pick up random proper nouns
 * (place names, etc.) as characters.
 */
function findLastMentionedCharacter(text: string): string | undefined {
  const matches = text.match(/\b([A-Z][a-zA-Z]+)\b/g);
  if (!matches) return undefined;
  let last: string | undefined;
  for (const m of matches) {
    const canon = canonicalizeKnownSpeaker(m);
    if (canon) last = canon;
  }
  return last;
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
      // No explicit name attribution. Check for pronoun attribution
      // ("he said", "she said", "they said") and resolve via the
      // last-mentioned character in the preceding narration.
      const pronoun = detectPronounAttribution(block.raw);
      if (pronoun && ctx.lastMentionedCharacter) {
        const mentionedId = speakerToId(ctx.lastMentionedCharacter);
        return {
          narratorId: mentionedId,
          confidence: Math.min(0.85, ctx.lastMentionedConfidence + 0.1),
          reasoning: `Quoted speech with pronoun attribution ("${pronoun} said"); resolved to "${ctx.lastMentionedCharacter}" from the preceding narration.`,
        };
      }
      // Multi-paragraph dialogue co-reference: if the immediately preceding
      // block was a high-confidence dialogue from a specific speaker (not
      // "unknown"), this unattributed block is very likely the same speaker
      // continuing. This is the Zeus 3-paragraph speech pattern.
      if (ctx.lastBlockWasDialogue && ctx.lastDialogueSpeakerId && ctx.lastDialogueSpeakerId !== "unknown") {
        return {
          narratorId: ctx.lastDialogueSpeakerId,
          confidence: 0.88,
          reasoning: `Multi-paragraph dialogue continuation: preceding block was attributed to "${ctx.lastDialogueSpeakerId}", and this block has no attribution — likely the same speaker continuing.`,
        };
      }
      // No pronoun attribution either. Try the last-mentioned character
      // directly (lower confidence — this is a continuation guess).
      if (ctx.lastMentionedCharacter) {
        const mentionedId = speakerToId(ctx.lastMentionedCharacter);
        return {
          narratorId: mentionedId,
          confidence: 0.55,
          reasoning: `Quoted speech with no attribution; guessed "${ctx.lastMentionedCharacter}" from the most-recent narration. Marked low-confidence — please verify.`,
        };
      }
      // Fall back to inheriting from previous dialogue turn.
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
  /** True if the immediately preceding block was dialogue (for multi-paragraph co-reference). */
  lastBlockWasDialogue: boolean;
  /** Last-mentioned canonical character name in narration (used to resolve
   *  pronoun-attributed dialogue like `"Foo," he said`). */
  lastMentionedCharacter: string | null;
  /** Confidence in lastMentionedCharacter: 0.6 if it's just a name mentioned
   *  in passing, 0.85 if the narration was about that character acting. */
  lastMentionedConfidence: number;
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
    lastBlockWasDialogue: false,
    lastMentionedCharacter: null,
    lastMentionedConfidence: 0,
    lastBlockWasSceneBreak: false,
    afterHandover: false,
    afterHandback: false,
  };

  const blocks = chapter.blocks.map((block) => {
    // Detect the handover at the top of Book 9 (heuristic: a narration block
    // that explicitly mentions stepping back / handing over / Odysseus speaks).
    // Permissive: matches "hand", "handed", "hand over", "I am Odysseus",
    // "I shall tell", "I will tell", etc.
    if (chapter.number === 9 && block.kind === "narration" && !ctx.afterHandover) {
      if (/\b(hand\w*|step|step back|gives?\s+way|yields?|withdraws?|takes?\s+up|takes?\s+the\s+floor|begins?\s+to\s+speak)\b/i.test(block.text)
          || /\bI\s+(am|shall|will|must)\s+(?:Odysseus|tell|speak|begin)\b/i.test(block.text)
          || /\bOdysseus\b.*\b(said|told|began|continued|spoke|his\s+tale|his\s+story)\b/i.test(block.text)) {
        ctx.afterHandover = true;
      }
    }

    const { narratorId, confidence, reasoning } = inferNarrator(block, chapter.number, ctx);

    // Update context for the next block.
    if (block.kind === "scene_break") {
      ctx.lastBlockWasSceneBreak = true;
      // Scene breaks reset the dialogue + character context — a new scene
      // may have completely different speakers.
      ctx.lastDialogueSpeakerId = null;
      ctx.lastMentionedCharacter = null;
      ctx.lastMentionedConfidence = 0;
      ctx.lastBlockWasDialogue = false;
    } else {
      ctx.lastBlockWasSceneBreak = false;
    }

    // Track the last-mentioned character from narration blocks. We weight
    // by recency: the most recent narration block's last-mentioned character
    // wins, with confidence proportional to how strongly the narration was
    // "about" that character (proxied by whether the name appears early).
    if (block.kind === "narration") {
      const mentioned = findLastMentionedCharacter(block.text);
      if (mentioned) {
        ctx.lastMentionedCharacter = mentioned;
        const firstMentionIdx = block.text.indexOf(mentioned);
        ctx.lastMentionedConfidence = firstMentionIdx < 200 ? 0.75 : 0.6;
      }
      // Narration breaks the dialogue co-reference chain.
      ctx.lastBlockWasDialogue = false;
    }

    // Track last dialogue speaker (for inheritance + multi-paragraph co-reference).
    if (block.kind === "dialogue" && confidence >= 0.7) {
      ctx.lastDialogueSpeakerId = narratorId;
      ctx.lastBlockWasDialogue = true;
      // Also update lastMentionedCharacter: if the dialogue was attributed
      // to a specific character, that character is now the most salient.
      if (narratorId.startsWith("speaker:")) {
        const name = narratorId.slice("speaker:".length).replace(/-/g, " ");
        ctx.lastMentionedCharacter = name
          .split(/\s+/)
          .map((w) => w[0].toUpperCase() + w.slice(1))
          .join(" ");
        ctx.lastMentionedConfidence = 0.85;
      }
    } else if (block.kind === "dialogue") {
      // Low-confidence dialogue still counts as dialogue for the next block.
      ctx.lastBlockWasDialogue = true;
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
