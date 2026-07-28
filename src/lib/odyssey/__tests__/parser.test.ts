/**
 * Parser tests — verify markdown → Block[] classification.
 * Run with: `bun test src/lib/odyssey/__tests__/parser.test.ts`
 */
import { test, expect, describe } from "bun:test";
import { parseChapter, stripMarkdown } from "../parser";

describe("stripMarkdown", () => {
  test("strips bold markers", () => {
    expect(stripMarkdown("**bold** text")).toBe("bold text");
  });
  test("strips italic markers", () => {
    expect(stripMarkdown("*italic* text")).toBe("italic text");
  });
  test("strips footnote refs", () => {
    expect(stripMarkdown("see note[^3]")).toBe("see note(3)");
  });
  test("strips links", () => {
    expect(stripMarkdown("[text](http://x)")).toBe("text");
  });
  test("collapses whitespace", () => {
    expect(stripMarkdown("foo    bar\n\n  baz")).toBe("foo bar baz");
  });
});

describe("parseChapter — structural classification", () => {
  const sampleMarkdown = `# THE ODYSSEY
### Retold in English, with Explanations

---

## BOOK ONE
### In Which the Gods Hold a Meeting

---

Before we begin, a word about beginnings.

The old poets never simply *started*.

"Father," said Athena. "Aegisthus got what was coming to him."

---

## NOTES TO BOOK ONE

[^1]: **Muses.** Some note text here.

[^2]: **Greeks.** Another note.
`;

  const chapter = parseChapter("odyssey-book-01", 1, sampleMarkdown);

  test("captures title and subtitle from headers", () => {
    expect(chapter.title).toBe("BOOK ONE");
    expect(chapter.subtitle).toBe("In Which the Gods Hold a Meeting");
  });

  test("classifies headers by level", () => {
    const h1 = chapter.blocks.find((b) => b.headingLevel === 1);
    const h2 = chapter.blocks.find((b) => b.headingLevel === 2);
    const h3 = chapter.blocks.find((b) => b.headingLevel === 3);
    expect(h1).toBeDefined();
    expect(h2).toBeDefined();
    expect(h3).toBeDefined();
    expect(h2!.text).toBe("BOOK ONE");
  });

  test("classifies scene breaks", () => {
    const sceneBreaks = chapter.blocks.filter((b) => b.kind === "scene_break");
    expect(sceneBreaks.length).toBeGreaterThanOrEqual(2);
  });

  test("classifies narration blocks", () => {
    const narration = chapter.blocks.filter((b) => b.kind === "narration");
    expect(narration.length).toBeGreaterThanOrEqual(2);
    expect(narration[0].text).toContain("Before we begin");
  });

  test("classifies dialogue blocks (paragraphs starting with quote)", () => {
    const dialogue = chapter.blocks.filter((b) => b.kind === "dialogue");
    expect(dialogue.length).toBeGreaterThanOrEqual(1);
    expect(dialogue[0].raw).toContain('"Father," said Athena');
  });

  test("classifies notes section header", () => {
    const notesHeader = chapter.blocks.find((b) => b.kind === "notes_section_header");
    expect(notesHeader).toBeDefined();
    expect(notesHeader!.text).toMatch(/NOTES TO BOOK/i);
  });

  test("classifies footnote definitions", () => {
    const footnotes = chapter.blocks.filter((b) => b.kind === "footnote");
    expect(footnotes.length).toBe(2);
    expect(footnotes[0].footnoteNumber).toBe(1);
    expect(footnotes[1].footnoteNumber).toBe(2);
  });

  test("assigns stable block IDs", () => {
    expect(chapter.blocks[0].id).toBe("odyssey-book-01:0");
    expect(chapter.blocks[1].id).toBe("odyssey-book-01:1");
  });

  test("computes word count from block text", () => {
    expect(chapter.wordCount).toBeGreaterThan(20);
  });

  test("preserves raw markdown", () => {
    expect(chapter.raw).toContain("## BOOK ONE");
    expect(chapter.raw).toContain('"Father," said Athena');
  });
});

describe("parseChapter — edge cases", () => {
  test("handles empty input gracefully", () => {
    const ch = parseChapter("empty", 1, "");
    expect(ch.blocks.length).toBe(0);
    expect(ch.wordCount).toBe(0);
  });

  test("handles italic-only paragraph as invocation", () => {
    const md = "*Tell me about the man of many turnings.*";
    const ch = parseChapter("test", 1, md);
    const inv = ch.blocks.find((b) => b.kind === "invocation");
    expect(inv).toBeDefined();
  });

  test("does not classify mid-paragraph italic as invocation", () => {
    const md = "The old poets never simply *started* their tales.";
    const ch = parseChapter("test", 1, md);
    const inv = ch.blocks.find((b) => b.kind === "invocation");
    expect(inv).toBeUndefined();
    const narration = ch.blocks.find((b) => b.kind === "narration");
    expect(narration).toBeDefined();
  });

  test("treats paragraphs starting with curly quotes as dialogue", () => {
    const md = '"Foo," she said.';
    const ch = parseChapter("test", 1, md);
    const dialogue = ch.blocks.find((b) => b.kind === "dialogue");
    expect(dialogue).toBeDefined();
  });

  test("treats paragraphs starting with straight quotes as dialogue", () => {
    const md = '"Foo," she said.';
    const ch = parseChapter("test", 1, md);
    const dialogue = ch.blocks.find((b) => b.kind === "dialogue");
    expect(dialogue).toBeDefined();
  });
});
