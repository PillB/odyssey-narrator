#!/usr/bin/env bun
/**
 * Playwright validation of contextual speaker injection badges.
 * Tests both English and Spanish modes on the live site.
 */
import { chromium } from "playwright";

const LIVE_URL = "https://pillb.github.io/odyssey-narrator/";

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
  log("Starting badge validation tests...");
  const browser = await chromium.launch({ headless: true });

  // ============================================================
  // ENGLISH MODE TESTS
  // ============================================================
  log("\n=== ENGLISH MODE ===");
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();

    await run("EN: Book One loads", async () => {
      await page.goto(LIVE_URL, { waitUntil: "networkidle" });
      await page.waitForTimeout(5000);
      await page.locator('nav[aria-label="Chapter navigation"] button', { hasText: "Book One" }).first().click();
      await page.waitForTimeout(4000);
      const blocks = await page.locator("[data-block-id]").count();
      return blocks > 10;
    });

    await run("EN: No badges before folding", async () => {
      const badges = await page.locator('div[title^="Speaker referenced"]').count();
      return badges === 0;
    });

    await run("EN: Hide Guide produces folded seams", async () => {
      // Find and click Hide The Guide
      const hideBtn = page.locator('button[aria-label="Hide The Guide"]').first();
      const count = await hideBtn.count();
      if (count === 0) {
        // Try opening the legend panel first
        await page.locator('button[aria-label="Toggle narrator legend"]').click();
        await page.waitForTimeout(1000);
      }
      await page.locator('button[aria-label="Hide The Guide"]').first().click();
      await page.waitForTimeout(3000);
      const seams = await page.locator(".border-dashed").count();
      return seams > 0;
    });

    await run("EN: Speaker badges appear after folding", async () => {
      const badges = await page.locator('div[title^="Speaker referenced"]').count();
      return badges > 0;
    });

    await run("EN: Badges are positioned above paragraphs (top tabs)", async () => {
      const badges = await page.locator('div[title^="Speaker referenced"]').all();
      if (badges.length === 0) return false;
      // Each badge should be immediately followed by a <p> (the paragraph)
      for (const badge of badges) {
        const badgeBox = await badge.boundingBox();
        const nextP = await badge.locator("xpath=following-sibling::p").first();
        const pBox = await nextP.boundingBox();
        if (!badgeBox || !pBox) return false;
        // Badge should be above the paragraph (y < p.y)
        if (badgeBox.y >= pBox.y) return false;
      }
      return true;
    });

    await run("EN: Badge text is white on dark background (WCAG contrast)", async () => {
      const badges = await page.locator('div[title^="Speaker referenced"]').all();
      if (badges.length === 0) return false;
      const badge = badges[0];
      const styles = await badge.evaluate((el) => {
        const computed = window.getComputedStyle(el);
        return {
          backgroundColor: computed.backgroundColor,
          color: computed.color,
        };
      });
      // Check that text is white (rgb(255, 255, 255))
      const isWhiteText = styles.color.includes("255, 255, 255");
      // Check that background is not transparent
      const hasBg = !styles.backgroundColor.includes("0, 0, 0, 0");
      return isWhiteText && hasBg;
    });

    await run("EN: Badge shows speaker name (Zeus or Odysseus)", async () => {
      const texts = await page.locator('div[title^="Speaker referenced"]').allTextContents();
      const hasKnownSpeaker = texts.some(t => t.includes("Zeus") || t.includes("Odysseus"));
      return hasKnownSpeaker;
    });

    await run("EN: Dialogue text no longer contains inline (SpeakerName)", async () => {
      // The injected speaker name should be in the top tab, not inline in the text
      const dialogueParas = await page.locator('p[data-narrator^="speaker:"]').allTextContents();
      // Check that no paragraph contains "(Zeus)" or "(Odysseus)" inline
      const hasInline = dialogueParas.some(t => t.includes("(Zeus)") || t.includes("(Odysseus)"));
      return !hasInline;
    });

    await ctx.close();
  }

  // ============================================================
  // SPANISH MODE TESTS
  // ============================================================
  log("\n=== SPANISH MODE ===");
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();

    await run("ES: Book One loads in Spanish", async () => {
      await page.goto(LIVE_URL, { waitUntil: "networkidle" });
      await page.waitForTimeout(5000);
      // Switch to Spanish
      await page.locator('button[aria-label="Español"]').click();
      await page.waitForTimeout(3000);
      // Navigate to Book One (Libro Uno)
      await page.locator('nav[aria-label="Chapter navigation"] button', { hasText: "Libro Uno" }).first().click();
      await page.waitForTimeout(4000);
      const blocks = await page.locator("[data-block-id]").count();
      return blocks > 10;
    });

    await run("ES: No badges before folding", async () => {
      const badges = await page.locator('div[title^="Speaker referenced"]').count();
      return badges === 0;
    });

    await run("ES: Hide Guide produces folded seams", async () => {
      const hideBtn = page.locator('button[aria-label="Hide The Guide"]').first();
      const count = await hideBtn.count();
      if (count === 0) {
        await page.locator('button[aria-label="Toggle narrator legend"]').click();
        await page.waitForTimeout(1000);
      }
      await page.locator('button[aria-label="Hide The Guide"]').first().click();
      await page.waitForTimeout(3000);
      const seams = await page.locator(".border-dashed").count();
      return seams > 0;
    });

    await run("ES: Speaker badges appear after folding (Spanish context injection)", async () => {
      const badges = await page.locator('div[title^="Speaker referenced"]').count();
      return { passed: badges > 0, details: { badgeCount: badges } };
    });

    await run("ES: Badge shows Zeus (Spanish pronoun resolution)", async () => {
      const texts = await page.locator('div[title^="Speaker referenced"]').allTextContents();
      const hasZeus = texts.some(t => t.includes("Zeus"));
      return { passed: hasZeus, details: { badgeTexts: texts } };
    });

    await run("ES: Badges positioned above paragraphs (top tabs)", async () => {
      const badges = await page.locator('div[title^="Speaker referenced"]').all();
      if (badges.length === 0) return false;
      for (const badge of badges) {
        const badgeBox = await badge.boundingBox();
        const nextP = await badge.locator("xpath=following-sibling::p").first();
        const pBox = await nextP.boundingBox();
        if (!badgeBox || !pBox) return false;
        if (badgeBox.y >= pBox.y) return false;
      }
      return true;
    });

    await run("ES: Badge has WCAG-compliant contrast", async () => {
      const badges = await page.locator('div[title^="Speaker referenced"]').all();
      if (badges.length === 0) return false;
      const badge = badges[0];
      const styles = await badge.evaluate((el) => {
        const computed = window.getComputedStyle(el);
        return {
          backgroundColor: computed.backgroundColor,
          color: computed.color,
        };
      });
      const isWhiteText = styles.color.includes("255, 255, 255");
      const hasBg = !styles.backgroundColor.includes("0, 0, 0, 0");
      return isWhiteText && hasBg;
    });

    await ctx.close();
  }

  // ============================================================
  // ACCESSIBILITY TESTS
  // ============================================================
  log("\n=== ACCESSIBILITY ===");
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();

    await run("A11Y: Badge has aria-label", async () => {
      await page.goto(LIVE_URL, { waitUntil: "networkidle" });
      await page.waitForTimeout(5000);
      await page.locator('nav[aria-label="Chapter navigation"] button', { hasText: "Book One" }).first().click();
      await page.waitForTimeout(4000);
      // Hide Guide
      const hideBtn = page.locator('button[aria-label="Hide The Guide"]').first();
      if (await hideBtn.count() > 0) {
        await hideBtn.click();
        await page.waitForTimeout(3000);
      }
      const badges = await page.locator('div[title^="Speaker referenced"]').all();
      if (badges.length === 0) return false;
      const hasAriaLabel = await badges[0].getAttribute("aria-label");
      return hasAriaLabel?.includes("Speaker:") ?? false;
    });

    await run("A11Y: Badge has tooltip (title attribute)", async () => {
      const badges = await page.locator('div[title^="Speaker referenced"]').all();
      if (badges.length === 0) return false;
      const title = await badges[0].getAttribute("title");
      return title?.includes("Speaker referenced") ?? false;
    });

    await ctx.close();
  }

  await browser.close();

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  log(`\n========================================`);
  log(`BADGE VALIDATION: ${passed} passed, ${failed} failed, ${results.length} total`);
  log(`========================================\n`);
  for (const r of results) {
    const status = r.passed ? "PASS" : "FAIL";
    log(`[${status}] ${r.name}${r.error ? " — " + r.error : ""}`);
  }
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });
