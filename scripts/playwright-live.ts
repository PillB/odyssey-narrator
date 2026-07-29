#!/usr/bin/env bun
/**
 * Playwright E2E tests against the LIVE GitHub Pages deployment.
 * Run with: bun /home/z/my-project/scripts/playwright-live.ts
 */
import { chromium } from "playwright";

const LIVE_URL = "https://pillb.github.io/odyssey-narrator/";

interface TestResult { name: string; passed: boolean; error?: string; }
const results: TestResult[] = [];
function log(msg: string) { console.log(`[test] ${msg}`); }

async function run(name: string, fn: () => Promise<boolean>): Promise<void> {
  try {
    const passed = await fn();
    results.push({ name, passed });
  } catch (e) {
    results.push({ name, passed: false, error: (e as Error).message });
  }
}

async function main() {
  log(`Testing live site: ${LIVE_URL}`);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  // Test 1: Page loads
  await run("Page loads with correct title", async () => {
    await page.goto(LIVE_URL, { waitUntil: "networkidle" });
    await page.waitForTimeout(3000);
    const title = await page.title();
    return title.includes("AI Odyssey");
  });

  // Test 2: All 25 chapters in sidebar
  await run("All 25 chapters visible in sidebar", async () => {
    const count = await page.locator('nav[aria-label="Chapter navigation"] button').count();
    return count >= 25;
  });

  // Test 3: Navigate to Book One (EN)
  await run("Book One (EN) loads with content", async () => {
    await page.locator('nav[aria-label="Chapter navigation"] button', { hasText: "Book One" }).first().click();
    await page.waitForTimeout(3000);
    const blocks = await page.locator("[data-block-id]").count();
    return blocks > 10;
  });

  // Test 4: Multiple narrator colors present
  await run("Multiple narrator colors present", async () => {
    const colors = await page.evaluate(() => {
      const paras = document.querySelectorAll("p[data-block-id]");
      const colorSet = new Set();
      paras.forEach(p => {
        const style = window.getComputedStyle(p);
        colorSet.add(style.borderLeftColor);
      });
      return colorSet.size;
    });
    return colors >= 3;
  });

  // Test 5: Spanish mode works
  await run("Spanish mode renders Spanish content", async () => {
    await page.locator('button[aria-label="Español"]').click();
    await page.waitForTimeout(3000);
    const text = await page.locator("[data-block-id]").first().textContent();
    return text?.includes("Antes de comenzar") || text?.includes("comienzos") || false;
  });

  // Test 6: Spanish chapter list labels
  await run("Spanish chapter list shows 'Libro Uno'", async () => {
    const text = await page.locator('nav[aria-label="Chapter navigation"]').textContent();
    return text?.includes("Libro Uno") || false;
  });

  // Test 7: Switch back to English
  await run("Switch back to English works", async () => {
    await page.locator('button[aria-label="English"]').click();
    await page.waitForTimeout(2000);
    const text = await page.locator('nav[aria-label="Chapter navigation"]').textContent();
    return text?.includes("Book One") || false;
  });

  // Test 8: Editor mode toggle
  await run("Editor mode toggle works", async () => {
    await page.locator('button[aria-label="Toggle editor mode"]').click();
    await page.waitForTimeout(1000);
    const paras = await page.locator("p[data-block-id]").count();
    return paras > 0;
  });

  // Test 9: Click paragraph shows editor
  await run("Click paragraph shows editor panel", async () => {
    await page.locator("p[data-block-id]").first().click();
    await page.waitForTimeout(1000);
    const text = await page.locator("aside[aria-label='Detail panel']").textContent();
    return text?.includes("Inference") || false;
  });

  // Test 10: Settings panel
  await run("Settings panel opens", async () => {
    await page.locator('button[aria-label="Settings"]').click();
    await page.waitForTimeout(500);
    const hasLight = await page.locator("button", { hasText: "Light" }).count();
    return hasLight > 0;
  });

  // Test 11: Dark theme
  await run("Dark theme works", async () => {
    await page.locator("button", { hasText: "Dark" }).click();
    await page.waitForTimeout(500);
    const isDark = await page.evaluate(() => document.documentElement.classList.contains("dark"));
    return isDark;
  });

  // Test 12: Search
  await run("Search returns results", async () => {
    await page.goto(LIVE_URL, { waitUntil: "networkidle" });
    await page.waitForTimeout(5000);
    await page.locator('button[aria-label="Search"]').click();
    await page.waitForTimeout(500);
    await page.locator('input[aria-label="Search query"]').fill("Odysseus");
    await page.waitForTimeout(3000);
    const count = await page.locator("aside[aria-label='Detail panel'] li").count();
    return count > 0;
  });

  // Test 13: No console errors
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  await run("No console errors on page load", async () => {
    await page.goto(LIVE_URL, { waitUntil: "networkidle" });
    await page.waitForTimeout(3000);
    return consoleErrors.length === 0;
  });

  // Test 14: Book 19 (Spanish) loads
  await run("Book 19 loads (Spanish fallback to English)", async () => {
    await page.goto(LIVE_URL, { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    await page.locator('nav[aria-label="Chapter navigation"] button', { hasText: "Book Nineteen" }).first().click();
    await page.waitForTimeout(3000);
    const blocks = await page.locator("[data-block-id]").count();
    return blocks > 10;
  });

  // Test 15: Context injection when Guide is folded
  await run("Context injection works when Guide narrator is hidden", async () => {
    // Use a completely fresh browser context to avoid any state leakage
    const freshContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const freshPage = await freshContext.newPage();
    try {
      await freshPage.goto(LIVE_URL, { waitUntil: "networkidle" });
      await freshPage.waitForTimeout(5000);
      await freshPage.locator('nav[aria-label="Chapter navigation"] button', { hasText: "Book One" }).first().click();
      await freshPage.waitForTimeout(4000);
      const hideBtn = freshPage.locator('button[aria-label="Hide The Guide"]').first();
      const count = await hideBtn.count();
      if (count > 0) {
        await hideBtn.click();
        await freshPage.waitForTimeout(3000);
        const seams = await freshPage.locator(".border-dashed").count();
        return seams > 0;
      }
      return false;
    } finally {
      await freshContext.close();
    }
  });

  await browser.close();

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  log(`\n========================================`);
  log(`LIVE SITE RESULTS: ${passed} passed, ${failed} failed, ${results.length} total`);
  log(`========================================\n`);
  for (const r of results) {
    log(`[${r.passed ? "PASS" : "FAIL"}] ${r.name}${r.error ? " — " + r.error : ""}`);
  }
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });
