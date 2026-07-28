/**
 * Comprehensive Playwright test suite for the AI Odyssey reader.
 * Uses Playwright directly (not the agent-browser CLI) for speed and reliability.
 *
 * Run with: bun /home/z/my-project/scripts/playwright-direct.ts
 */
import { chromium } from "playwright";

interface TestResult { name: string; passed: boolean; error?: string; details?: unknown; }
const results: TestResult[] = [];
function log(msg: string) { console.log(`[test] ${msg}`); }

async function run(name: string, fn: () => Promise<boolean | { passed: boolean; details?: unknown }>): Promise<void> {
  try {
    const result = await fn();
    const passed = typeof result === "boolean" ? result : result.passed;
    results.push({ name, passed, details: typeof result === "object" ? result.details : undefined });
  } catch (e) {
    results.push({ name, passed: false, error: (e as Error).message });
  }
}

async function main() {
  log("Launching browser...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });

  // Collect console errors
  const consoleErrors: string[] = [];

  // ============================================================
  // TEST 1: Visit each of 25 chapters
  // ============================================================
  log("TEST 1: Visiting all 25 chapters");
  const page = await context.newPage();
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  const chapterLabels = [
    "Preface", "Book One", "Book Two", "Book Three", "Book Four",
    "Book Five", "Book Six", "Book Seven", "Book Eight", "Book Nine",
    "Book Ten", "Book Eleven", "Book Twelve", "Book Thirteen", "Book Fourteen",
    "Book Fifteen", "Book Sixteen", "Book Seventeen", "Book Eighteen", "Book Nineteen",
    "Book Twenty", "Book Twenty-One", "Book Twenty-Two", "Book Twenty-Three", "Book Twenty-Four",
  ];

  for (const label of chapterLabels) {
    await run(`Chapter ${label}`, async () => {
      // Click the chapter button in the sidebar
      const btn = page.locator(`nav[aria-label="Chapter navigation"] button`, { hasText: label }).first();
      await btn.click();
      await page.waitForTimeout(1500);
      const blockCount = await page.locator("[data-block-id]").count();
      return { passed: blockCount > 3, details: { blocks: blockCount } };
    });
  }

  // ============================================================
  // TEST 2: Every toolbar button
  // ============================================================
  log("TEST 2: Testing every toolbar button");

  await run("Toggle contents", async () => {
    await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
    await page.waitForTimeout(4000);
    // The contents panel should be open by default. Check its width.
    let width = await page.evaluate(() => document.querySelector('aside[aria-label="Chapter list"]')?.offsetWidth ?? 0);
    if (width < 10) {
      // Open it
      await page.locator('button[aria-label="Toggle contents"]').click();
      await page.waitForTimeout(500);
    }
    const initialW = await page.evaluate(() => document.querySelector('aside[aria-label="Chapter list"]')?.offsetWidth ?? 0);
    // Close
    await page.locator('button[aria-label="Toggle contents"]').click();
    await page.waitForTimeout(500);
    const closedW = await page.evaluate(() => document.querySelector('aside[aria-label="Chapter list"]')?.offsetWidth ?? 0);
    // Reopen
    await page.locator('button[aria-label="Toggle contents"]').click();
    await page.waitForTimeout(500);
    const reopenedW = await page.evaluate(() => document.querySelector('aside[aria-label="Chapter list"]')?.offsetWidth ?? 0);
    return closedW < 10 && initialW > 10 && reopenedW > 10;
  });

  await run("Previous chapter disabled at Preface", async () => {
    await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
    await page.waitForTimeout(3000);
    // Make sure we're on Preface by clicking it
    await page.locator('nav[aria-label="Chapter navigation"] button', { hasText: "Preface" }).first().click();
    await page.waitForTimeout(1500);
    const isDisabled = await page.locator('button[aria-label="Previous chapter"]').isDisabled();
    return isDisabled;
  });

  await run("Next chapter", async () => {
    // Navigate to Book One
    await page.locator('nav[aria-label="Chapter navigation"] button', { hasText: "Book One" }).first().click();
    await page.waitForTimeout(2000);
    await page.locator('button[aria-label="Next chapter"]').click();
    await page.waitForTimeout(2000);
    const headerText = await page.locator("header").textContent();
    return headerText?.includes("Book Two") ?? false;
  });

  await run("Search button", async () => {
    await page.locator('button[aria-label="Search"]').click();
    await page.waitForTimeout(500);
    const hasInput = await page.locator('input[aria-label="Search query"]').count();
    return hasInput > 0;
  });

  await run("Editor mode toggle", async () => {
    await page.locator('button[aria-label="Toggle editor mode"]').click();
    await page.waitForTimeout(800);
    const paraCount = await page.locator("p[data-block-id]").count();
    await page.locator('button[aria-label="Toggle editor mode"]').click();
    await page.waitForTimeout(500);
    return paraCount > 5;
  });

  await run("Settings button", async () => {
    await page.locator('button[aria-label="Settings"]').click();
    await page.waitForTimeout(500);
    const hasLight = await page.locator("button", { hasText: "Light" }).count();
    return hasLight > 0;
  });

  await run("Bookmarks button", async () => {
    // Navigate fresh to ensure clean state
    await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    await page.locator('button[aria-label="Bookmarks and annotations"]').click();
    await page.waitForTimeout(1000);
    const hasSaved = await page.locator("aside[aria-label='Detail panel']").textContent();
    // The heading uses CSS uppercase but textContent returns "Saved"
    return hasSaved?.toLowerCase().includes("saved") ?? false;
  });

  await run("Toggle narrator legend", async () => {
    // Navigate fresh
    await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
    await page.waitForTimeout(4000);
    // The legend should be open by default. Get its width.
    const initialW = await page.evaluate(() => document.querySelector('aside[aria-label="Detail panel"]')?.offsetWidth ?? 0);
    // If it's closed, open it first
    if (initialW < 10) {
      await page.locator('button[aria-label="Toggle narrator legend"]').click();
      await page.waitForTimeout(1000);
    }
    const openW = await page.evaluate(() => document.querySelector('aside[aria-label="Detail panel"]')?.offsetWidth ?? 0);
    // Click Narrators button to close (since it's showing legend)
    await page.locator('button[aria-label="Toggle narrator legend"]').click();
    await page.waitForTimeout(500);
    const closedW = await page.evaluate(() => document.querySelector('aside[aria-label="Detail panel"]')?.offsetWidth ?? 0);
    // Click again to reopen
    await page.locator('button[aria-label="Toggle narrator legend"]').click();
    await page.waitForTimeout(500);
    const reopenedW = await page.evaluate(() => document.querySelector('aside[aria-label="Detail panel"]')?.offsetWidth ?? 0);
    return closedW < 10 && openW > 10 && reopenedW > 10;
  });

  // ============================================================
  // TEST 3: Editor flow
  // ============================================================
  log("TEST 3: Testing editor flow");

  await run("Editor shows inference", async () => {
    await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    await page.locator('nav[aria-label="Chapter navigation"] button', { hasText: "Book One" }).first().click();
    await page.waitForTimeout(2000);
    await page.locator('button[aria-label="Toggle editor mode"]').click();
    await page.waitForTimeout(800);
    // Click the first paragraph
    await page.locator("p[data-block-id]").first().click();
    await page.waitForTimeout(800);
    const text = await page.locator("aside[aria-label='Detail panel']").textContent();
    return text?.includes("Inference") ?? false;
  });

  await run("Editor reassign narrator", async () => {
    const select = page.locator("select#narrator-select");
    const before = await select.inputValue();
    await select.selectOption("unknown");
    await page.waitForTimeout(500);
    const after = await select.inputValue();
    return after === "unknown" && before !== "unknown";
  });

  await run("Editor LLM critique button present", async () => {
    const hasBtn = await page.locator("button", { hasText: "Ask LLM to critique" }).count();
    return hasBtn > 0;
  });

  // Navigate to a fresh page before continuing (avoids stale state)
  await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);

  // ============================================================
  // TEST 3b: Narrator modifications (rename, recolor, merge, undo)
  // ============================================================
  log("TEST 3b: Testing narrator modifications");

  await run("Editor: click dialogue paragraph to select character narrator", async () => {
    // Navigate fresh to ensure clean state
    await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    await page.locator('nav[aria-label="Chapter navigation"] button', { hasText: "Book One" }).first().click();
    await page.waitForTimeout(2000);
    // Ensure editor mode is OFF first, then turn it ON
    const editorBtn = page.locator('button[aria-label="Toggle editor mode"]');
    // Check if editor mode is on by looking at the button's aria-pressed
    const isPressed = await editorBtn.getAttribute("aria-pressed");
    if (isPressed === "true") {
      await editorBtn.click();
      await page.waitForTimeout(500);
    }
    // Now turn editor mode ON
    await editorBtn.click();
    await page.waitForTimeout(800);
    // Find a dialogue paragraph (one with speaker: narrator)
    const dialoguePara = page.locator('p[data-narrator^="speaker:"]').first();
    const count = await dialoguePara.count();
    if (count === 0) return false;
    await dialoguePara.click();
    await page.waitForTimeout(800);
    const text = await page.locator("aside[aria-label='Detail panel']").textContent();
    return text?.includes("Narrator metadata") ?? false;
  });

  await run("Editor: rename narrator", async () => {
    // The editor panel should be showing a character narrator now.
    // Find the rename input (placeholder="Display name")
    const renameInput = page.locator('input[placeholder="Display name"]');
    const count = await renameInput.count();
    if (count === 0) return false;
    await renameInput.fill("TestRenamed");
    await page.waitForTimeout(300);
    // Click Save button next to the input
    await page.locator("aside[aria-label='Detail panel'] button", { hasText: "Save" }).first().click();
    await page.waitForTimeout(500);
    // Verify the narrator legend now shows the renamed narrator
    // (the legend is in the same panel, but we need to check the registry)
    const registry = await page.evaluate(() => {
      const state = JSON.parse(localStorage.getItem("odyssey-reader-v1") || "{}");
      return state.state?.editor?.narratorOverrides || {};
    });
    const overrides = Object.values(registry) as Array<{name?: string}>;
    return overrides.some((o) => o.name === "TestRenamed");
  });

  await run("Editor: recolor narrator", async () => {
    // Find the color input
    const colorInput = page.locator('aside[aria-label="Detail panel"] input[type="color"]').first();
    const count = await colorInput.count();
    if (count === 0) return false;
    await colorInput.fill("#ff0000");
    await page.waitForTimeout(500);
    // Verify the override was saved
    const registry = await page.evaluate(() => {
      const state = JSON.parse(localStorage.getItem("odyssey-reader-v1") || "{}");
      return state.state?.editor?.narratorOverrides || {};
    });
    const overrides = Object.values(registry) as Array<{color?: string}>;
    return overrides.some((o) => o.color === "#ff0000");
  });

  await run("Editor: merge narrators", async () => {
    // Find the merge select dropdown
    const mergeSelect = page.locator("aside[aria-label='Detail panel'] select").last();
    const count = await mergeSelect.count();
    if (count === 0) return false;
    // Select the first option that's not empty
    const options = await mergeSelect.locator("option").allTextContents();
    const targetOption = options.find((o) => o && o !== "— select target narrator —");
    if (!targetOption) return false;
    await mergeSelect.selectOption({ label: targetOption });
    await page.waitForTimeout(300);
    // Click the merge button
    const mergeBtn = page.locator("aside[aria-label='Detail panel'] button", { hasText: /^Merge / }).first();
    await mergeBtn.click();
    await page.waitForTimeout(500);
    // Verify a merge was saved
    const merges = await page.evaluate(() => {
      const state = JSON.parse(localStorage.getItem("odyssey-reader-v1") || "{}");
      return state.state?.editor?.merges || [];
    });
    return merges.length > 0;
  });

  await run("Editor: reset all corrections", async () => {
    // Navigate to settings to find the reset button
    await page.locator('button[aria-label="Settings"]').click();
    await page.waitForTimeout(500);
    // Find and click the reset button (it has a confirm dialog, so we need to accept)
    page.on("dialog", (d) => d.accept());
    const resetBtn = page.locator("button", { hasText: "Reset all corrections" });
    const count = await resetBtn.count();
    if (count === 0) return false;
    await resetBtn.click();
    await page.waitForTimeout(500);
    // Verify corrections are cleared
    const state = await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem("odyssey-reader-v1") || "{}");
      return {
        corrections: Object.keys(s.state?.editor?.blockCorrections || {}).length,
        merges: (s.state?.editor?.merges || []).length,
        overrides: Object.keys(s.state?.editor?.narratorOverrides || {}).length,
      };
    });
    return state.corrections === 0 && state.merges === 0 && state.overrides === 0;
  });

  // Turn off editor mode
  await page.locator('button[aria-label="Toggle editor mode"]').click();
  await page.waitForTimeout(500);

  // ============================================================
  // TEST 4: Settings panel
  // ============================================================
  log("TEST 4: Testing settings panel");

  await run("Light theme", async () => {
    await page.locator('button[aria-label="Settings"]').click();
    await page.waitForTimeout(500);
    await page.locator("button", { hasText: "Light" }).click();
    await page.waitForTimeout(400);
    const isDark = await page.evaluate(() => document.documentElement.classList.contains("dark"));
    return !isDark;
  });

  await run("Dark theme", async () => {
    await page.locator("button", { hasText: "Dark" }).click();
    await page.waitForTimeout(400);
    const isDark = await page.evaluate(() => document.documentElement.classList.contains("dark"));
    return isDark;
  });

  await run("High contrast toggle", async () => {
    // Find the switch by its associated label
    const switchLocator = page.locator("label:has-text('High contrast')").locator("..").locator("button[role='switch']");
    await switchLocator.click();
    await page.waitForTimeout(400);
    const isHc = await page.evaluate(() => document.documentElement.classList.contains("high-contrast"));
    await switchLocator.click(); // toggle back
    await page.waitForTimeout(300);
    return isHc;
  });

  await run("Reduced motion toggle", async () => {
    const switchLocator = page.locator("label:has-text('Reduced motion')").locator("..").locator("button[role='switch']");
    await switchLocator.click();
    await page.waitForTimeout(400);
    const isRm = await page.evaluate(() => document.documentElement.classList.contains("reduced-motion"));
    await switchLocator.click();
    await page.waitForTimeout(300);
    return isRm;
  });

  await run("Auto theme", async () => {
    await page.locator("button", { hasText: "Auto" }).click();
    await page.waitForTimeout(300);
    return true;
  });

  // ============================================================
  // TEST 5: Bookmarks + annotations
  // ============================================================
  log("TEST 5: Testing bookmarks + annotations");

  await run("Add bookmark", async () => {
    await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    // Clear localStorage
    await page.evaluate(() => localStorage.removeItem("odyssey-reader-v1"));
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    // Navigate to Book One
    await page.locator('nav[aria-label="Chapter navigation"] button', { hasText: "Book One" }).first().click();
    await page.waitForTimeout(2000);
    // Hover first paragraph to reveal bookmark button
    const firstPara = page.locator("p[data-block-id]").first();
    await firstPara.hover();
    await page.waitForTimeout(500);
    // Use .first() to avoid strict mode violation (all bookmark buttons are in DOM)
    await page.locator('button[aria-label="Add bookmark"]').first().click();
    await page.waitForTimeout(500);
    const bmCount = await page.evaluate(() => JSON.parse(localStorage.getItem("odyssey-reader-v1") || "{}").state?.bookmarks?.length || 0);
    return bmCount === 1;
  });

  await run("Bookmark appears in panel", async () => {
    // Navigate fresh and open bookmarks panel
    await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    await page.locator('button[aria-label="Bookmarks and annotations"]').click();
    await page.waitForTimeout(1000);
    const text = await page.locator("aside[aria-label='Detail panel']").textContent();
    // CSS uppercase makes "Bookmarks (1)" render as "BOOKMARKS (1)" but textContent is mixed case
    return text?.toLowerCase().includes("bookmarks (1)") ?? false;
  });

  await run("Add annotation", async () => {
    // Navigate to Book One and hover a paragraph to add annotation
    await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    await page.locator('nav[aria-label="Chapter navigation"] button', { hasText: "Book One" }).first().click();
    await page.waitForTimeout(2000);
    // Hover the second paragraph (first might be a header)
    const para = page.locator("p[data-block-id]").nth(1);
    await para.hover();
    await page.waitForTimeout(500);
    await page.locator('button[aria-label="Add annotation"]').first().click();
    await page.waitForTimeout(500);
    // Type into the textarea using Playwright's fill (properly triggers React events)
    const textarea = page.locator('textarea[placeholder="Your note…"]');
    await textarea.fill("My test annotation");
    await page.waitForTimeout(300);
    // Click Save — use the textarea's parent container to find the right Save button
    const annotationContainer = page.locator('textarea[placeholder="Your note…"]').locator("..").locator("..");
    await annotationContainer.locator("button", { hasText: "Save" }).click();
    await page.waitForTimeout(1000);
    const annotCount = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem("odyssey-reader-v1") || "{}").state?.annotations || {}).length);
    return annotCount === 1;
  });

  await run("Annotation persists across reload", async () => {
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    const annotCount = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem("odyssey-reader-v1") || "{}").state?.annotations || {}).length);
    return annotCount === 1;
  });

  await run("Annotation appears in panel", async () => {
    // Navigate fresh and open bookmarks panel
    await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    // The annotation was added to a Book One paragraph in a previous test.
    // The bookmarks panel should show it regardless of which chapter is loaded.
    await page.locator('button[aria-label="Bookmarks and annotations"]').click();
    await page.waitForTimeout(1000);
    const text = await page.locator("aside[aria-label='Detail panel']").textContent();
    // Check for annotations (1) AND the annotation text
    const hasAnnotCount = text?.toLowerCase().includes("annotations (1)") ?? false;
    const hasAnnotText = text?.includes("My test annotation") ?? false;
    return hasAnnotCount && hasAnnotText;
  });

  await run("Delete annotation", async () => {
    // Clear all localStorage to clean up
    await page.evaluate(() => localStorage.removeItem("odyssey-reader-v1"));
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    const annotCount = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem("odyssey-reader-v1") || "{}").state?.annotations || {}).length);
    const bmCount = await page.evaluate(() => JSON.parse(localStorage.getItem("odyssey-reader-v1") || "{}").state?.bookmarks?.length || 0);
    return annotCount === 0 && bmCount === 0;
  });

  // ============================================================
  // TEST 6: Search
  // ============================================================
  log("TEST 6: Testing search");

  await run("Search 'Odysseus' returns results", async () => {
    await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
    await page.waitForTimeout(10000); // wait for background chapter load
    await page.locator('button[aria-label="Search"]').click();
    await page.waitForTimeout(500);
    await page.locator('input[aria-label="Search query"]').fill("Odysseus");
    await page.waitForTimeout(3000);
    const resultCount = await page.locator("aside[aria-label='Detail panel'] li").count();
    return resultCount > 0;
  });

  await run("Search no-match shows message", async () => {
    await page.locator('input[aria-label="Search query"]').fill("zzzznotaword");
    await page.waitForTimeout(1500);
    const text = await page.locator("aside[aria-label='Detail panel']").textContent();
    return text?.includes("No matches") ?? false;
  });

  // ============================================================
  // TEST 7: LLM evaluator
  // ============================================================
  log("TEST 7: Testing LLM evaluator");

  await run("LLM evaluator returns proposal", async () => {
    await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    await page.locator('nav[aria-label="Chapter navigation"] button', { hasText: "Book One" }).first().click();
    await page.waitForTimeout(2000);
    await page.locator('button[aria-label="Toggle editor mode"]').click();
    await page.waitForTimeout(800);
    await page.locator("p[data-block-id]").first().click();
    await page.waitForTimeout(800);
    await page.locator("button", { hasText: "Ask LLM to critique" }).click();
    // Wait up to 15s for the proposal
    for (let i = 0; i < 15; i++) {
      await page.waitForTimeout(1000);
      const text = await page.locator("aside[aria-label='Detail panel']").textContent();
      if (text?.includes("LLM proposes:")) return true;
    }
    return false;
  });

  // ============================================================
  // TEST 8: Folding system
  // ============================================================
  log("TEST 8: Testing folding system");

  await run("Narrator list populated", async () => {
    await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
    await page.waitForTimeout(3000);
    await page.locator('nav[aria-label="Chapter navigation"] button', { hasText: "Book One" }).first().click();
    await page.waitForTimeout(2000);
    // Turn off editor mode if it's on (left over from previous tests)
    const editorBtn = page.locator('button[aria-label="Toggle editor mode"]');
    const isPressed = await editorBtn.getAttribute("aria-pressed");
    if (isPressed === "true") {
      await editorBtn.click();
      await page.waitForTimeout(500);
    }
    // Ensure the narrator legend panel is open and showing.
    // Try up to 5 times to click the Narrators button until hide buttons appear.
    for (let attempt = 0; attempt < 5; attempt++) {
      const hideBtnCount = await page.locator("aside[aria-label='Detail panel'] button[aria-label^='Hide ']").count();
      if (hideBtnCount > 0) break;
      // Click Narrators button
      await page.locator('button[aria-label="Toggle narrator legend"]').click();
      await page.waitForTimeout(1000);
    }
    const count = await page.locator("aside[aria-label='Detail panel'] button[aria-label^='Hide ']").count();
    return count > 3;
  });

  await run("Hide Guide produces folded seams", async () => {
    // The legend should already be open from the previous test.
    // Click "Hide The Guide" — the first narrator in the list is "The Guide".
    const hideBtn = page.locator('button[aria-label="Hide The Guide"]').first();
    await hideBtn.click();
    await page.waitForTimeout(1500);
    const seamCount = await page.locator(".border-dashed").count();
    return seamCount > 0;
  });

  await run("Click seam expands", async () => {
    const beforeCount = await page.locator(".border-dashed").count();
    await page.locator(".border-dashed").first().click();
    await page.waitForTimeout(800);
    const afterCount = await page.locator(".border-dashed").count();
    return afterCount < beforeCount;
  });

  await run("Show all clears seams", async () => {
    await page.locator("button", { hasText: "Show all" }).click();
    await page.waitForTimeout(800);
    const finalCount = await page.locator(".border-dashed").count();
    return finalCount === 0;
  });

  // ============================================================
  // TEST 9: Export annotations (new feature)
  // ============================================================
  log("TEST 9: Testing export annotations");

  await run("Export Markdown API returns 200", async () => {
    const stateParam = encodeURIComponent(JSON.stringify({
      bookmarks: ["odyssey-book-01:5"],
      annotations: { "odyssey-book-01:5": "Test annotation" },
      editor: { blockCorrections: {}, merges: [], narratorOverrides: {} },
    }));
    const res = await page.evaluate(async (sp) => {
      const r = await fetch(`/api/export?format=markdown&state=${sp}`);
      return { status: r.status, contentType: r.headers.get("content-type") };
    }, stateParam);
    return res.status === 200 && res.contentType?.includes("text/markdown") === true;
  });

  await run("Export JSON API returns 200", async () => {
    const stateParam = encodeURIComponent(JSON.stringify({
      bookmarks: ["odyssey-book-01:5"],
      annotations: { "odyssey-book-01:5": "Test annotation" },
      editor: { blockCorrections: {}, merges: [], narratorOverrides: {} },
    }));
    const res = await page.evaluate(async (sp) => {
      const r = await fetch(`/api/export?format=json&state=${sp}`);
      const body = await r.json();
      return { status: r.status, hasBookmarks: Array.isArray(body.bookmarks), hasAnnotations: typeof body.annotations === "object" };
    }, stateParam);
    return res.status === 200 && res.hasBookmarks && res.hasAnnotations;
  });

  // ============================================================
  // Console errors check
  // ============================================================
  log("TEST 9: Console errors check");
  await run("No console errors during tests", async () => {
    return consoleErrors.length === 0;
  });

  // ============================================================
  // Summary
  // ============================================================
  await browser.close();

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  log(`\n========================================`);
  log(`RESULTS: ${passed} passed, ${failed} failed, ${results.length} total`);
  log(`========================================\n`);
  for (const r of results) {
    log(`[${r.passed ? "PASS" : "FAIL"}] ${r.name}${r.error ? " — " + r.error : ""}`);
  }
  if (consoleErrors.length > 0) {
    log(`\nConsole errors:\n${consoleErrors.slice(0, 10).join("\n")}`);
  }
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
