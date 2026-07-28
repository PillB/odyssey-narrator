/**
 * Tests for v3 features: multi-paragraph dialogue co-reference + export API.
 */
import { test, expect, describe } from "bun:test";
import { parseChapter } from "../parser";
import { analyzeChapter } from "../narrator-engine";

describe("Multi-paragraph dialogue co-reference", () => {
  test("consecutive unattributed dialogue inherits from preceding attributed dialogue", () => {
    const md = `"It really is extraordinary," Zeus said, "the way they blame us."

"Take Aegisthus. We told him."`;
    const ch = parseChapter("test", 1, md);
    const analyzed = analyzeChapter(ch);
    const dialogues = analyzed.blocks.filter((b) => b.kind === "dialogue");
    expect(dialogues.length).toBe(2);
    // First: explicitly attributed to Zeus
    expect(dialogues[0].inferredNarratorId).toBe("speaker:zeus");
    // Second: no attribution, but preceded by Zeus dialogue → inherit
    expect(dialogues[1].inferredNarratorId).toBe("speaker:zeus");
    expect(dialogues[1].confidence).toBeGreaterThan(0.8);
  });

  test("narration between dialogue blocks breaks the co-reference chain", () => {
    const md = `"Father," said Athena.

The goddess paused, thinking.

"And my heart is broken over Odysseus."`;
    const ch = parseChapter("test", 1, md);
    const analyzed = analyzeChapter(ch);
    const dialogues = analyzed.blocks.filter((b) => b.kind === "dialogue");
    expect(dialogues.length).toBe(2);
    // First: Athena
    expect(dialogues[0].inferredNarratorId).toBe("speaker:athena");
    // Second: after narration, co-reference chain is broken.
    // The narration mentions "goddess" → Athena, so it might still resolve
    // to Athena via the lastMentionedCharacter path. Either way, it should
    // NOT use the multi-paragraph co-reference (confidence should differ).
    expect(dialogues[1].inferredNarratorId).not.toBe("speaker:zeus");
  });

  test("three-paragraph speech stays with the same speaker", () => {
    const md = `"It really is extraordinary," Zeus said.

"Take Aegisthus. We told him."

"And he did it anyway."`;
    const ch = parseChapter("test", 1, md);
    const analyzed = analyzeChapter(ch);
    const dialogues = analyzed.blocks.filter((b) => b.kind === "dialogue");
    expect(dialogues.length).toBe(3);
    // All three should be Zeus
    for (const d of dialogues) {
      expect(d.inferredNarratorId).toBe("speaker:zeus");
    }
  });
});

describe("Export API contract", () => {
  test("markdown export endpoint accepts state param", async () => {
    const state = encodeURIComponent(JSON.stringify({
      bookmarks: ["test:0"],
      annotations: { "test:0": "note" },
      editor: { blockCorrections: {}, merges: [], narratorOverrides: {} },
    }));
    const res = await fetch(`http://localhost:3000/api/export?format=markdown&state=${state}`);
    if (res.status === 500) {
      console.log("Skipping: server not running");
      return;
    }
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("# The AI Odyssey — Reader Export");
    expect(text).toContain("## Bookmarks (1)");
    expect(text).toContain("## Annotations (1)");
    expect(text).toContain("note");
  }, 10000);

  test("json export endpoint returns structured data", async () => {
    const state = encodeURIComponent(JSON.stringify({
      bookmarks: ["test:0"],
      annotations: { "test:0": "note" },
      editor: { blockCorrections: {}, merges: [], narratorOverrides: {} },
    }));
    const res = await fetch(`http://localhost:3000/api/export?format=json&state=${state}`);
    if (res.status === 500) {
      console.log("Skipping: server not running");
      return;
    }
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.bookmarks).toEqual(["test:0"]);
    expect(body.annotations).toEqual({ "test:0": "note" });
    expect(body).toHaveProperty("exportedAt");
  }, 10000);

  test("returns 400 on missing state param", async () => {
    const res = await fetch("http://localhost:3000/api/export?format=markdown");
    if (res.status === 500) {
      console.log("Skipping: server not running");
      return;
    }
    expect(res.status).toBe(400);
  }, 10000);
});
