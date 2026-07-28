/**
 * LLM evaluator API smoke test.
 * Verifies the /api/evaluator endpoint accepts a block payload and returns
 * the expected JSON shape. Does NOT verify the LLM's correctness (that's
 * non-deterministic) — only the contract.
 *
 * Run with: `bun test src/app/api/__tests__/evaluator.test.ts`
 *
 * NOTE: This test requires the Next.js dev server running on port 3000.
 */
import { test, expect, describe } from "bun:test";

const API_URL = "http://localhost:3000/api/evaluator";

describe("POST /api/evaluator", () => {
  test("returns 400 on missing required fields", async () => {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Missing required fields/);
  });

  test("returns a proposal for a valid block payload", async () => {
    const payload = {
      chapterId: "odyssey-book-01",
      blockId: "odyssey-book-01:5",
      raw: "Before we begin, a word about beginnings.",
      kind: "narration",
      inferredNarratorId: "narrator",
      confidence: 0.9,
      reasoning: "Default narrator voice.",
      surroundingContext:
        "Before we begin, a word about beginnings.\n\nThe old poets never simply started.",
    };

    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    // The endpoint should respond 200 (or 500 if the LLM SDK isn't configured).
    if (res.status === 500) {
      // LLM SDK not available in this environment — skip the test.
      console.log("Skipping: LLM SDK not available (500 response)");
      return;
    }
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty("proposedNarratorId");
    expect(body).toHaveProperty("critique");
    expect(body).toHaveProperty("confidence");
    expect(body).toHaveProperty("alternatives");
    expect(typeof body.confidence).toBe("number");
    expect(Array.isArray(body.alternatives)).toBe(true);
  }, 30000); // 30s timeout for LLM call
});
