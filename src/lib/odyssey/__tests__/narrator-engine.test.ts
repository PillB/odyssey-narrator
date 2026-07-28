/**
 * Narrator engine tests — verify Phase 1-3 inference + Phase 4-5 resolution.
 * Run with: `bun test src/lib/odyssey/__tests__/narrator-engine.test.ts`
 */
import { test, expect, describe } from "bun:test";
import { parseChapter } from "../parser";
import {
  analyzeChapter,
  validateChapter,
  adversarialCheck,
  fullAnalysisPipeline,
} from "../narrator-engine";
import {
  canonicalizeSpeaker,
  canonicalizeKnownSpeaker,
  speakerToId,
} from "../narrator-engine-canon";
import {
  buildNarratorRegistry,
  resolveMergeChain,
  resolveBlockNarrator,
  computeNarratorStats,
} from "../identity";
import type { Chapter } from "../types";

describe("canonicalizeSpeaker — name resolution", () => {
  test("resolves known speakers", () => {
    expect(canonicalizeSpeaker("Athena")).toBe("Athena");
    expect(canonicalizeSpeaker("Zeus")).toBe("Zeus");
    expect(canonicalizeSpeaker("Penelope")).toBe("Penelope");
  });

  test("resolves periphrastic references", () => {
    expect(canonicalizeSpeaker("the goddess")).toBe("Athena");
    expect(canonicalizeSpeaker("the god of the sea")).toBe("Poseidon");
    expect(canonicalizeSpeaker("the swineherd")).toBe("Eumaeus");
    expect(canonicalizeSpeaker("the queen")).toBe("Penelope");
    expect(canonicalizeSpeaker("the stranger")).toBe("Odysseus");
  });

  test("rejects pronouns and articles", () => {
    expect(canonicalizeSpeaker("he")).toBeNull();
    expect(canonicalizeSpeaker("she")).toBeNull();
    expect(canonicalizeSpeaker("they")).toBeNull();
    expect(canonicalizeSpeaker("the")).toBeNull();
    expect(canonicalizeSpeaker("a")).toBeNull();
  });

  test("rejects sentence-initial adverbs that look like proper nouns", () => {
    // These should be accepted by canonicalizeSpeaker (any capitalized word)
    // but rejected by canonicalizeKnownSpeaker.
    expect(canonicalizeSpeaker("Listen")).toBe("Listen"); // accepts as proper noun
    expect(canonicalizeKnownSpeaker("Listen")).toBeNull(); // strict rejects
    expect(canonicalizeKnownSpeaker("Apparently")).toBeNull();
    expect(canonicalizeKnownSpeaker("Take")).toBeNull();
  });

  test("strict canonicalizer still accepts known speakers", () => {
    expect(canonicalizeKnownSpeaker("Athena")).toBe("Athena");
    expect(canonicalizeKnownSpeaker("the goddess")).toBe("Athena");
  });
});

describe("speakerToId", () => {
  test("produces stable lowercase slugs", () => {
    expect(speakerToId("Athena")).toBe("speaker:athena");
    expect(speakerToId("Telemachus")).toBe("speaker:telemachus");
  });

  test("handles multi-word names", () => {
    expect(speakerToId("The Guide")).toBe("speaker:the-guide");
  });
});

describe("analyzeChapter — Phase 1 inference", () => {
  function analyze(md: string, number = 1): Chapter {
    const parsed = parseChapter("test", number, md);
    return analyzeChapter(parsed);
  }

  test("structural blocks get narrator + 1.0 confidence", () => {
    const ch = analyze("## BOOK ONE\n\nSome text.");
    const header = ch.blocks.find((b) => b.kind === "header");
    expect(header!.inferredNarratorId).toBe("narrator");
    expect(header!.confidence).toBe(1.0);
  });

  test("footnotes always get footnote narrator", () => {
    const ch = analyze("## NOTES TO BOOK ONE\n\n[^1]: **Muses.** Some note.");
    const footnote = ch.blocks.find((b) => b.kind === "footnote");
    expect(footnote!.inferredNarratorId).toBe("footnote");
    expect(footnote!.confidence).toBe(1.0);
  });

  test("italic-only paragraphs get invocation narrator", () => {
    const ch = analyze("*Tell me about the man of many turnings.*");
    const inv = ch.blocks.find((b) => b.kind === "invocation");
    expect(inv!.inferredNarratorId).toBe("invocation");
    expect(inv!.confidence).toBe(1.0);
  });

  test("explicitly-attributed dialogue gets the speaker", () => {
    const ch = analyze('"Father," said Athena. "Aegisthus got what was coming."');
    const dialogue = ch.blocks.find((b) => b.kind === "dialogue");
    expect(dialogue!.inferredNarratorId).toBe("speaker:athena");
    expect(dialogue!.confidence).toBe(0.95);
    expect(dialogue!.parsedSpeaker).toBe("Athena");
  });

  test("dialogue with pronoun attribution resolves via last-mentioned character", () => {
    const md = `Zeus was thinking about a murder.

"It really is extraordinary," he said, "the way they blame us."`;
    const ch = analyze(md);
    const dialogue = ch.blocks.find((b) => b.kind === "dialogue");
    expect(dialogue!.inferredNarratorId).toBe("speaker:zeus");
    // Confidence should be high (pronoun resolved via narration context)
    expect(dialogue!.confidence).toBeGreaterThan(0.7);
  });

  test("dialogue with no attribution + no context falls back to unknown", () => {
    const ch = analyze('"A quote with no attribution."');
    const dialogue = ch.blocks.find((b) => b.kind === "dialogue");
    expect(dialogue!.inferredNarratorId).toBe("unknown");
    expect(dialogue!.confidence).toBeLessThan(0.5);
  });

  test("dialogue inherits speaker from previous dialogue turn", () => {
    const md = `"Father," said Athena.

"And my heart is broken over Odysseus."`;
    const ch = analyze(md);
    const dialogues = ch.blocks.filter((b) => b.kind === "dialogue");
    expect(dialogues.length).toBe(2);
    // First dialogue: explicit Athena
    expect(dialogues[0].inferredNarratorId).toBe("speaker:athena");
    // Second dialogue: inherits Athena
    expect(dialogues[1].inferredNarratorId).toBe("speaker:athena");
  });

  test("scene break resets dialogue context", () => {
    const md = `"Father," said Athena.

---

"A fresh scene with no context."`;
    const ch = analyze(md);
    const dialogues = ch.blocks.filter((b) => b.kind === "dialogue");
    expect(dialogues.length).toBe(2);
    // After scene break, no speaker to inherit → unknown
    expect(dialogues[1].inferredNarratorId).toBe("unknown");
  });

  test("narration blocks get narrator voice by default", () => {
    const ch = analyze("The old poets never simply started.");
    const narration = ch.blocks.find((b) => b.kind === "narration");
    expect(narration!.inferredNarratorId).toBe("narrator");
    expect(narration!.confidence).toBe(0.9);
  });
});

describe("analyzeChapter — Books 9-12 inner narration", () => {
  test("narration in Book 9 (after handover) → odysseus", () => {
    const md = `## BOOK NINE

I am Odysseus, and I will tell you my tale. We handed the story over.

We sailed from Troy with a fair wind.`;
    const ch = parseChapter("odyssey-book-09", 9, md);
    const analyzed = analyzeChapter(ch);
    const narrations = analyzed.blocks.filter((b) => b.kind === "narration");
    // At least one narration should be odysseus
    const odysseusNarrations = narrations.filter((b) => b.inferredNarratorId === "odysseus");
    expect(odysseusNarrations.length).toBeGreaterThan(0);
  });

  test("narration in Book 5 (not inner) → narrator", () => {
    const md = `## BOOK FIVE

He was being kept there by a goddess.`;
    const ch = parseChapter("odyssey-book-05", 5, md);
    const analyzed = analyzeChapter(ch);
    const narration = analyzed.blocks.find((b) => b.kind === "narration");
    expect(narration!.inferredNarratorId).toBe("narrator");
  });
});

describe("validateChapter — Phase 2", () => {
  test("runs without disagreement on clean chapter", () => {
    const ch = parseChapter("test", 1, '"Father," said Athena.');
    const analyzed = analyzeChapter(ch);
    const { disagreements } = validateChapter(analyzed);
    expect(disagreements.length).toBe(0);
  });
});

describe("adversarialCheck — Phase 3", () => {
  test("flags low-confidence blocks", () => {
    const ch = parseChapter("test", 1, '"A quote with no attribution."');
    const analyzed = analyzeChapter(ch);
    const validated = validateChapter(analyzed).chapter;
    const { flags } = adversarialCheck(validated);
    expect(flags.length).toBeGreaterThan(0);
  });
});

describe("fullAnalysisPipeline — end-to-end", () => {
  test("produces chapter with all blocks classified", () => {
    const md = `# THE ODYSSEY

## BOOK ONE

Before we begin.

"Father," said Athena.

---

## NOTES TO BOOK ONE

[^1]: **Muses.** A note.`;
    const { chapter, disagreements, flags } = fullAnalysisPipeline("test", 1, md);
    expect(chapter.blocks.length).toBeGreaterThan(0);
    // Every block should have an inferred narrator id
    for (const b of chapter.blocks) {
      expect(b.inferredNarratorId).toBeTruthy();
      expect(b.confidence).toBeGreaterThanOrEqual(0);
      expect(b.confidence).toBeLessThanOrEqual(1);
    }
    expect(Array.isArray(disagreements)).toBe(true);
    expect(Array.isArray(flags)).toBe(true);
  });
});

describe("buildNarratorRegistry — Phase 4-5", () => {
  test("includes built-in narrators", () => {
    const registry = buildNarratorRegistry([]);
    const ids = registry.map((n) => n.id);
    expect(ids).toContain("narrator");
    expect(ids).toContain("odysseus");
    expect(ids).toContain("invocation");
    expect(ids).toContain("footnote");
    expect(ids).toContain("unknown");
  });

  test("registers character speakers with distinct colors", () => {
    const md = `"Father," said Athena.

"My lord," said Zeus.`;
    const ch = parseChapter("test", 1, md);
    const analyzed = analyzeChapter(ch);
    const registry = buildNarratorRegistry([analyzed]);
    const athena = registry.find((n) => n.id === "speaker:athena");
    const zeus = registry.find((n) => n.id === "speaker:zeus");
    expect(athena).toBeDefined();
    expect(zeus).toBeDefined();
    // Colors must be distinct (Art Nouveau palette)
    expect(athena!.color).not.toBe(zeus!.color);
    // Built-in colors (bronze for narrator) must not be reused for characters
    const narrator = registry.find((n) => n.id === "narrator")!;
    expect(athena!.color).not.toBe(narrator.color);
    expect(zeus!.color).not.toBe(narrator.color);
  });

  test("applies user merges", () => {
    const md = `"Father," said Athena.

"My lord," said Zeus.`;
    const ch = parseChapter("test", 1, md);
    const analyzed = analyzeChapter(ch);
    const merges = [
      { fromId: "speaker:zeus", toId: "speaker:athena", createdAt: new Date().toISOString() },
    ];
    const registry = buildNarratorRegistry([analyzed], merges);
    // After merge, only athena should remain
    expect(registry.find((n) => n.id === "speaker:zeus")).toBeUndefined();
    expect(registry.find((n) => n.id === "speaker:athena")).toBeDefined();
  });

  test("merge chain resolves with cycle guard", () => {
    const merges = [
      { fromId: "a", toId: "b", createdAt: "" },
      { fromId: "b", toId: "c", createdAt: "" },
      { fromId: "c", toId: "a", createdAt: "" }, // cycle
    ];
    // Should not infinite-loop; should return some stable id
    const result = resolveMergeChain("a", merges);
    expect(typeof result).toBe("string");
  });
});

describe("resolveBlockNarrator — corrections override inference", () => {
  test("user correction overrides inference", () => {
    const ch = parseChapter("test", 1, '"Father," said Athena.');
    const analyzed = analyzeChapter(ch);
    const block = analyzed.blocks.find((b) => b.kind === "dialogue")!;
    // Inferred: athena
    expect(block.inferredNarratorId).toBe("speaker:athena");
    // Apply correction
    const resolved = resolveBlockNarrator(block, [], {
      [block.id]: "speaker:zeus",
    });
    expect(resolved).toBe("speaker:zeus");
  });

  test("merge chain applied after correction", () => {
    const ch = parseChapter("test", 1, '"Father," said Athena.');
    const analyzed = analyzeChapter(ch);
    const block = analyzed.blocks.find((b) => b.kind === "dialogue")!;
    const merges = [
      { fromId: "speaker:athena", toId: "speaker:zeus", createdAt: "" },
    ];
    const resolved = resolveBlockNarrator(block, merges, {});
    expect(resolved).toBe("speaker:zeus");
  });
});

describe("computeNarratorStats — global stats", () => {
  test("computes per-narrator statistics", () => {
    const md = `"Father," said Athena. "Aegisthus."

"My lord," said Zeus.`;
    const ch = parseChapter("test", 1, md);
    const analyzed = analyzeChapter(ch);
    const stats = computeNarratorStats([analyzed], [], {});
    const athenaStats = stats.get("speaker:athena");
    expect(athenaStats).toBeDefined();
    expect(athenaStats!.blockCount).toBe(1);
    expect(athenaStats!.wordCount).toBeGreaterThan(0);
    expect(athenaStats!.chapterIds).toContain("test");
  });
});

describe("Regression tests — known false positives", () => {
  // These tests guard against bugs we found and fixed during development.
  // See DECISIONS.md DR-004 (palette) and DR-005 (dialogue detection).

  test("does NOT classify 'apparently' / 'listen' / 'take' as speakers", () => {
    // After Pattern 5 was added to catch `"Foo." Name [verb]`, we initially
    // false-positive'd on `"Foo." Listen to them.` etc. The fix was to
    // require Pattern 5 to use the strict canonicalizer.
    const md = `"It really is extraordinary," he said. "Listen to them. Every disaster."

"Take Aegisthus."`;
    const ch = parseChapter("test", 1, md);
    const analyzed = analyzeChapter(ch);
    const narrators = new Set(analyzed.blocks.map((b) => b.inferredNarratorId));
    expect(narrators.has("speaker:apparently")).toBe(false);
    expect(narrators.has("speaker:listen")).toBe(false);
    expect(narrators.has("speaker:take")).toBe(false);
  });

  test("does NOT register 'He' / 'She' / 'The' as speaker narrators", () => {
    // Pronoun-attributed dialogue used to register "He", "She", "The"
    // as distinct narrators before NON_NAME_WORDS was added.
    const md = `"Foo," he said.

"Bar," she said.`;
    const ch = parseChapter("test", 1, md);
    const analyzed = analyzeChapter(ch);
    const registry = buildNarratorRegistry([analyzed]);
    const ids = registry.map((n) => n.id);
    expect(ids).not.toContain("speaker:he");
    expect(ids).not.toContain("speaker:she");
    expect(ids).not.toContain("speaker:the");
  });

  test("character speakers do NOT get the narrator's bronze color", () => {
    // DR-004: paletteIndex must start at 5, not 0, so the first character
    // speaker doesn't get the reserved bronze (#8b6f47).
    const md = `"Father," said Athena.`;
    const ch = parseChapter("test", 1, md);
    const analyzed = analyzeChapter(ch);
    const registry = buildNarratorRegistry([analyzed]);
    const athena = registry.find((n) => n.id === "speaker:athena")!;
    const narrator = registry.find((n) => n.id === "narrator")!;
    expect(athena.color).not.toBe(narrator.color);
    expect(athena.color).not.toBe("#8b6f47"); // bronze
  });
});
