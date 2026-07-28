/**
 * Phase 3 — LLM-backed adversarial evaluator API.
 * -----------------------------------------------
 * POST /api/evaluator
 *   body: { chapterId: string, blockId: string, raw: string, kind: string,
 *           inferredNarratorId: string, confidence: number, reasoning: string,
 *           surroundingContext: string }
 *   returns: { proposedNarratorId: string, proposedSpeaker?: string,
 *              critique: string, confidence: number, alternatives: string[] }
 *
 * The LLM is given the block, its current narrator assignment, and ~500 chars
 * of surrounding context. It is asked to:
 *   1. Adversarially critique the current assignment
 *   2. Propose a corrected narrator (or confirm the current one)
 *   3. List alternative candidates
 *
 * The user always has the final word — proposals appear as suggestions in
 * the editor panel and are only applied on user acceptance.
 */
import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";

interface EvaluatorRequest {
  chapterId: string;
  blockId: string;
  raw: string;
  kind: string;
  inferredNarratorId: string;
  confidence: number;
  reasoning: string;
  surroundingContext: string;
}

interface EvaluatorResponse {
  proposedNarratorId: string;
  proposedSpeaker?: string;
  critique: string;
  confidence: number;
  alternatives: string[];
}

const SYSTEM_PROMPT = `You are an adversarial literary evaluator for a multi-narrator reading edition of Homer's Odyssey (retold in modern English prose).

Your job is to CRITIQUE the narrator classification assigned to a single paragraph, then propose the most defensible alternative.

The narrator types are:
- "narrator" — the primary Tolkien-style avuncular guide (addresses reader as "you", explains as he goes)
- "odysseus" — inner first-person narration in Books 9-12 (no quotation marks; Odysseus IS the prose)
- "invocation" — italic-only Muse invocations at the start of books
- "footnote" — explanatory notes (always the guide's voice)
- "speaker:<name>" — quoted dialogue attributed to a character (e.g. "speaker:athena", "speaker:zeus")
- "unknown" — explicit uncertainty (the engine could not confidently assign)

Adversarial mindset: try to PROVE the current assignment is wrong. Look for:
- Dialogue that should be narration, or vice versa
- Speaker attribution that the regex missed (pronouns like "he said" — who is "he"?)
- Inner-narration (Book 9-12) prose that should be marked as Odysseus, not narrator
- Footnotes that creep into the main text
- Mismatches between the dialogue's tone and the assigned speaker

Respond with EXACTLY this JSON shape (no markdown fences, no preamble):
{
  "proposedNarratorId": "<one of the narrator types above>",
  "proposedSpeaker": "<canonical character name if proposedNarratorId is speaker:..., else omit>",
  "critique": "<1-3 sentence adversarial critique. If you agree with the current assignment, say so.>",
  "confidence": <0..1 number>,
  "alternatives": ["<narrator id>", "<narrator id>"]
}

Common character names in the Odyssey: Zeus, Athena, Poseidon, Hermes, Apollo, Odysseus, Telemachus, Penelope, Nestor, Menelaus, Helen, Agamemnon, Calypso, Circe, Nausicaa, Alcinous, Arete, Eumaeus, Eurycleia, Antinous, Eurymachus, Polyphemus, Teiresias, Elpenor, Anticleia, Phemius, Medon, Mentor, Theoclymenus, Laertes.`;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as EvaluatorRequest;

    // Validate input.
    if (!body.blockId || !body.raw) {
      return NextResponse.json(
        { error: "Missing required fields: blockId, raw" },
        { status: 400 },
      );
    }

    const userPrompt = `Chapter: ${body.chapterId}
Block ID: ${body.blockId}
Block kind: ${body.kind}
Current narrator: ${body.inferredNarratorId} (confidence ${body.confidence.toFixed(2)})
Engine reasoning: ${body.reasoning}

Surrounding context (the block is the middle paragraph):
"""
${body.surroundingContext.slice(0, 800)}
"""

The block being evaluated:
"""
${body.raw}
"""

Critique the current narrator assignment ("${body.inferredNarratorId}") and propose the most defensible alternative. Respond with the JSON shape only.`;

    const zai = await ZAI.create();
    const response = await zai.chat.completions.create({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.2,
      max_tokens: 500,
      thinking: { type: "disabled" },
    });

    const rawContent = response.choices[0]?.message?.content ?? "";
    // The LLM may wrap JSON in markdown fences despite our instruction.
    // Strip them defensively.
    const jsonText = rawContent
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/i, "")
      .trim();

    let parsed: EvaluatorResponse;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      // If the LLM didn't return parseable JSON, return the raw content
      // as a critique with no proposed change.
      return NextResponse.json({
        proposedNarratorId: body.inferredNarratorId,
        critique: `LLM returned unparseable response: ${rawContent.slice(0, 200)}…`,
        confidence: 0,
        alternatives: [],
        parseError: true,
      });
    }

    // Validate the proposed narrator id shape.
    if (!parsed.proposedNarratorId) {
      parsed.proposedNarratorId = body.inferredNarratorId;
    }
    if (parsed.proposedNarratorId.startsWith("speaker:") && parsed.proposedSpeaker) {
      // Normalize: speaker:<lowercased-slug>
      const slug = parsed.proposedSpeaker
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      parsed.proposedNarratorId = `speaker:${slug}`;
    }
    if (!Array.isArray(parsed.alternatives)) {
      parsed.alternatives = [];
    }
    if (typeof parsed.confidence !== "number") {
      parsed.confidence = 0.5;
    }

    return NextResponse.json(parsed);
  } catch (err) {
    console.error("Evaluator API error:", err);
    return NextResponse.json(
      { error: (err as Error).message ?? "Internal error" },
      { status: 500 },
    );
  }
}
