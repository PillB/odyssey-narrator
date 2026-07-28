/**
 * Tests for contextual speaker injection when narration is folded.
 */
import { test, expect, describe } from "bun:test";
import { parseChapter } from "../parser";
import { analyzeChapter } from "../narrator-engine";
import { injectContextSpeaker, isContextFolded, getContextInjectedRaw } from "../context-injection";
import { resolveBlockNarrator } from "../identity";
import type { Block } from "../types";

describe("Context injection", () => {
  test("injectContextSpeaker: English 'he said' pattern", () => {
    const raw = `"It really is extraordinary," he said, "the way they blame us."`;
    const result = injectContextSpeaker(raw, "Zeus");
    expect(result).toContain("(Zeus)");
    expect(result).toContain("he said (Zeus)");
  });

  test("injectContextSpeaker: Spanish 'dijo' pattern", () => {
    const raw = `"Realmente es extraordinario", dijo, sin dirigirse a nadie en particular, "la forma en que nos culpan."`;
    const result = injectContextSpeaker(raw, "Zeus");
    expect(result).toContain("(Zeus)");
    expect(result).toContain("dijo (Zeus)");
  });

  test("injectContextSpeaker: fallback when no attribution verb", () => {
    const raw = `"A quote with no attribution."`;
    const result = injectContextSpeaker(raw, "Athena");
    expect(result).toContain("(Athena)");
    // Should prepend the speaker name
    expect(result.startsWith("(Athena)")).toBe(true);
  });

  test("contextDependent flag is set on pronoun-resolved dialogue", () => {
    const md = `Zeus was thinking about a murder.

"It really is extraordinary," he said, "the way they blame us."`;
    const ch = parseChapter("test", 1, md);
    const analyzed = analyzeChapter(ch);
    const dialogue = analyzed.blocks.find((b) => b.kind === "dialogue")!;
    expect(dialogue.contextDependent).toBe(true);
    expect(dialogue.contextSpeaker).toBe("Zeus");
  });

  test("contextDependent is NOT set on explicitly-attributed dialogue", () => {
    const md = `"Father," said Athena. "Aegisthus got what was coming to him."`;
    const ch = parseChapter("test", 1, md);
    const analyzed = analyzeChapter(ch);
    const dialogue = analyzed.blocks.find((b) => b.kind === "dialogue")!;
    expect(dialogue.contextDependent).toBeUndefined();
  });

  test("isContextFolded: returns true when preceding narration is hidden", () => {
    const md = `Zeus was thinking about a murder.

"It really is extraordinary," he said, "the way they blame us."`;
    const ch = parseChapter("test", 1, md);
    const analyzed = analyzeChapter(ch);
    const blocks = analyzed.blocks;
    const dialogue = blocks.find((b) => b.kind === "dialogue")!;

    // Build resolved narrator IDs (no corrections/merges)
    const resolvedIds = new Map<string, string>();
    for (const b of blocks) {
      resolvedIds.set(b.id, resolveBlockNarrator(b, [], {}));
    }

    // The narration block is "narrator" type, dialogue is "speaker:zeus"
    // When narrator is hidden, the dialogue's context is folded
    const visibility = { narrator: false }; // Guide/narrator is hidden
    const result = isContextFolded(dialogue, blocks, resolvedIds, visibility);
    expect(result).toBe(true);
  });

  test("isContextFolded: returns false when preceding narration is visible", () => {
    const md = `Zeus was thinking about a murder.

"It really is extraordinary," he said, "the way they blame us."`;
    const ch = parseChapter("test", 1, md);
    const analyzed = analyzeChapter(ch);
    const blocks = analyzed.blocks;
    const dialogue = blocks.find((b) => b.kind === "dialogue")!;

    const resolvedIds = new Map<string, string>();
    for (const b of blocks) {
      resolvedIds.set(b.id, resolveBlockNarrator(b, [], {}));
    }

    // Narrator is visible (not hidden)
    const visibility = {};
    const result = isContextFolded(dialogue, blocks, resolvedIds, visibility);
    expect(result).toBe(false);
  });

  test("getContextInjectedRaw: injects speaker when context is folded", () => {
    const md = `Zeus was thinking about a murder.

"It really is extraordinary," he said, "the way they blame us."`;
    const ch = parseChapter("test", 1, md);
    const analyzed = analyzeChapter(ch);
    const blocks = analyzed.blocks;
    const dialogue = blocks.find((b) => b.kind === "dialogue")!;

    const resolvedIds = new Map<string, string>();
    for (const b of blocks) {
      resolvedIds.set(b.id, resolveBlockNarrator(b, [], {}));
    }

    const visibility = { narrator: false };
    const result = getContextInjectedRaw(dialogue, blocks, resolvedIds, visibility);
    expect(result.needsInjection).toBe(true);
    expect(result.speakerName).toBe("Zeus");
    expect(result.modifiedRaw).toContain("(Zeus)");
  });

  test("getContextInjectedRaw: does not inject when context is visible", () => {
    const md = `Zeus was thinking about a murder.

"It really is extraordinary," he said, "the way they blame us."`;
    const ch = parseChapter("test", 1, md);
    const analyzed = analyzeChapter(ch);
    const blocks = analyzed.blocks;
    const dialogue = blocks.find((b) => b.kind === "dialogue")!;

    const resolvedIds = new Map<string, string>();
    for (const b of blocks) {
      resolvedIds.set(b.id, resolveBlockNarrator(b, [], {}));
    }

    const visibility = {}; // nothing hidden
    const result = getContextInjectedRaw(dialogue, blocks, resolvedIds, visibility);
    expect(result.needsInjection).toBe(false);
    expect(result.modifiedRaw).toBe(dialogue.raw);
  });
});
