// API routes were removed for static export (GitHub Pages).
// Export logic is now client-side (src/lib/odyssey/export-utils.ts).
// LLM evaluator degrades gracefully when the API is not available.
import { test, expect, describe } from "bun:test";

describe("API routes (removed for static export)", () => {
  test("export-utils provides client-side export", async () => {
    const { generateMarkdownExport, generateJsonExport } = await import("@/lib/odyssey/export-utils");
    const md = generateMarkdownExport({ bookmarks: ["test:0"], annotations: {} });
    expect(md).toContain("# The AI Odyssey — Reader Export");
    const json = generateJsonExport({ bookmarks: ["test:0"], annotations: {} });
    expect(JSON.parse(json).bookmarks).toEqual(["test:0"]);
  });
});
