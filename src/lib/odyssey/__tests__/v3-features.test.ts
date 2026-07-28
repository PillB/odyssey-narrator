/**
 * Tests for v3 features: multi-paragraph dialogue co-reference + export.
 * API routes were removed for static export; export is now client-side.
 */
import { test, expect, describe } from "bun:test";
import { parseChapter } from "../parser";
import { analyzeChapter } from "../narrator-engine";
import { generateMarkdownExport, generateJsonExport } from "../export-utils";

describe("Multi-paragraph dialogue co-reference", () => {
  test("consecutive unattributed dialogue inherits from preceding attributed dialogue", () => {
    const md = `"It really is extraordinary," Zeus said, "the way they blame us."

"Take Aegisthus. We told him."`;
    const ch = parseChapter("test", 1, md);
    const analyzed = analyzeChapter(ch);
    const dialogues = analyzed.blocks.filter((b) => b.kind === "dialogue");
    expect(dialogues.length).toBe(2);
    expect(dialogues[0].inferredNarratorId).toBe("speaker:zeus");
    expect(dialogues[1].inferredNarratorId).toBe("speaker:zeus");
    expect(dialogues[1].confidence).toBeGreaterThan(0.8);
  });

  test("three-paragraph speech stays with the same speaker", () => {
    const md = `"It really is extraordinary," Zeus said.

"Take Aegisthus. We told him."

"And he did it anyway."`;
    const ch = parseChapter("test", 1, md);
    const analyzed = analyzeChapter(ch);
    const dialogues = analyzed.blocks.filter((b) => b.kind === "dialogue");
    expect(dialogues.length).toBe(3);
    for (const d of dialogues) {
      expect(d.inferredNarratorId).toBe("speaker:zeus");
    }
  });
});

describe("Client-side export (no API needed)", () => {
  test("markdown export generates correct format", () => {
    const md = generateMarkdownExport({
      bookmarks: ["odyssey-book-01:5"],
      annotations: { "odyssey-book-01:5": "Test annotation" },
    });
    expect(md).toContain("# The AI Odyssey — Reader Export");
    expect(md).toContain("## Bookmarks (1)");
    expect(md).toContain("## Annotations (1)");
    expect(md).toContain("Test annotation");
  });

  test("json export returns structured data", () => {
    const json = generateJsonExport({
      bookmarks: ["odyssey-book-01:5"],
      annotations: { "odyssey-book-01:5": "Test annotation" },
    });
    const body = JSON.parse(json);
    expect(body.bookmarks).toEqual(["odyssey-book-01:5"]);
    expect(body.annotations).toEqual({ "odyssey-book-01:5": "Test annotation" });
    expect(body).toHaveProperty("exportedAt");
  });
});
