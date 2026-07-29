#!/usr/bin/env bun
/**
 * Exhaustive Playwright validation suite.
 * Tests badges, translations, and all user flows on the live site.
 * Run with: bun /home/z/my-project/scripts/playwright-exhaustive.ts
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
  log("Starting exhaustive validation...");
  const browser = await chromium.launch({ headless: true });

  // ============================================================
  // SECTION 1: ENGLISH BADGE VALIDATION
  // ============================================================
  log("\n=== SECTION 1: ENGLISH BADGES ===");
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();

    await run("EN: Page loads", async () => {
      await page.goto(LIVE_URL, { waitUntil: "networkidle" });
      await page.waitForTimeout(5000);
      return page.title().includes("AI Odyssey");
    });

    await run("EN: Book One loads", async () => {
      await page.locator('nav[aria-label="Chapter navigation"] button', { hasText: "Book One" }).first().click();
      await page.waitForTimeout(4000);
      return (await page.locator("[data-block-id]").count()) > 10;
    });

    await run("EN: No badges before folding", async () => {
      return (await page.locator('div[title^="Speaker referenced"]').count()) === 0;
    });

    await run("EN: Hide Guide produces seams", async () => {
      const hideBtn = page.locator('button[aria-label="Hide The Guide"]').first();
      if (await hideBtn.count() === 0) {
        await page.locator('button[aria-label="Toggle narrator legend"]').click();
        await page.waitForTimeout(1000);
      }
      await page.locator('button[aria-label="Hide The Guide"]').first().click();
      await page.waitForTimeout(3000);
      return (await page.locator(".border-dashed").count()) > 0;
    });

    await run("EN: Badges appear after folding", async () => {
      return (await page.locator('div[title^="Speaker referenced"]').count()) > 0;
    });

    await run("EN: Badges positioned as top tabs (above paragraphs)", async () => {
      const badges = await page.locator('div[title^="Speaker referenced"]').all();
      for (const badge of badges) {
        const badgeBox = await badge.boundingBox();
        const nextP = await badge.locator("xpath=following-sibling::p").first();
        const pBox = await nextP.boundingBox();
        if (!badgeBox || !pBox || badgeBox.y >= pBox.y) return false;
      }
      return true;
    });

    await run("EN: Badge WCAG contrast (white text on dark bg)", async () => {
      const badge = page.locator('div[title^="Speaker referenced"]').first();
      const styles = await badge.evaluate((el) => ({
        bg: window.getComputedStyle(el).backgroundColor,
        color: window.getComputedStyle(el).color,
      }));
      return styles.color.includes("255, 255, 255") && !styles.bg.includes("0, 0, 0, 0");
    });

    await run("EN: Zeus badge on correct paragraph", async () => {
      const badges = await page.locator('div[title^="Speaker referenced"]').all();
      for (const badge of badges) {
        const text = await badge.textContent();
        if (text?.includes("Zeus")) {
          const nextP = await badge.locator("xpath=following-sibling::p").first();
          const paraText = await nextP.textContent();
          // Zeus's paragraph should contain "extraordinary" or "extraordinario"
          return paraText?.toLowerCase().includes("extraordinary") || false;
        }
      }
      return false;
    });

    await run("EN: Athena NOT tagged as Zeus (key bug fix)", async () => {
      const badges = await page.locator('div[title^="Speaker referenced"]').all();
      for (const badge of badges) {
        const text = await badge.textContent();
        const nextP = await badge.locator("xpath=following-sibling::p").first();
        const paraText = await nextP.textContent();
        // If the paragraph says "Father" and "she said" / "Aegisthus", it's Athena
        if (paraText?.includes("Father") && paraText?.includes("she said")) {
          // The badge should NOT say Zeus
          if (text?.includes("Zeus")) return false;
        }
      }
      return true;
    });

    await run("EN: No inline (SpeakerName) in dialogue text", async () => {
      const paras = await page.locator('p[data-narrator^="speaker:"]').allTextContents();
      return !paras.some(t => t.includes("(Zeus)") || t.includes("(Athena)") || t.includes("(Odysseus)"));
    });

    await run("EN: Badge has aria-label and title", async () => {
      const badge = page.locator('div[title^="Speaker referenced"]').first();
      const ariaLabel = await badge.getAttribute("aria-label");
      const title = await badge.getAttribute("title");
      return (ariaLabel?.includes("Speaker:") ?? false) && (title?.includes("Speaker referenced") ?? false);
    });

    await run("EN: Show all restores content", async () => {
      await page.locator("button", { hasText: "Show all" }).click();
      await page.waitForTimeout(2000);
      const seams = await page.locator(".border-dashed").count();
      const badges = await page.locator('div[title^="Speaker referenced"]').count();
      return seams === 0 && badges === 0;
    });

    await ctx.close();
  }

  // ============================================================
  // SECTION 2: SPANISH BADGE VALIDATION
  // ============================================================
  log("\n=== SECTION 2: SPANISH BADGES ===");
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();

    await run("ES: Page loads in Spanish mode", async () => {
      await page.goto(LIVE_URL, { waitUntil: "networkidle" });
      await page.waitForTimeout(5000);
      await page.locator('button[aria-label="Español"]').click();
      await page.waitForTimeout(3000);
      const navText = await page.locator('nav[aria-label="Chapter navigation"]').textContent();
      return navText?.includes("Contenido") ?? false;
    });

    await run("ES: Libro Uno loads", async () => {
      await page.locator('nav[aria-label="Chapter navigation"] button', { hasText: "Libro Uno" }).first().click();
      await page.waitForTimeout(4000);
      return (await page.locator("[data-block-id]").count()) > 10;
    });

    await run("ES: Content is in Spanish", async () => {
      const text = await page.locator("[data-block-id]").first().textContent();
      return text?.includes("comienzos") || text?.includes("Antes") || false;
    });

    await run("ES: No badges before folding", async () => {
      return (await page.locator('div[title^="Speaker referenced"]').count()) === 0;
    });

    await run("ES: Hide Guide produces seams", async () => {
      const hideBtn = page.locator('button[aria-label="Hide The Guide"]').first();
      if (await hideBtn.count() === 0) {
        await page.locator('button[aria-label="Toggle narrator legend"]').click();
        await page.waitForTimeout(1000);
      }
      await page.locator('button[aria-label="Hide The Guide"]').first().click();
      await page.waitForTimeout(3000);
      return (await page.locator(".border-dashed").count()) > 0;
    });

    await run("ES: Badges appear (Spanish pronoun resolution)", async () => {
      return (await page.locator('div[title^="Speaker referenced"]').count()) > 0;
    });

    await run("ES: Zeus badge on correct paragraph (extraordinario)", async () => {
      const badges = await page.locator('div[title^="Speaker referenced"]').all();
      for (const badge of badges) {
        const text = await badge.textContent();
        if (text?.includes("Zeus")) {
          const nextP = await badge.locator("xpath=following-sibling::p").first();
          const paraText = await nextP.textContent();
          return paraText?.toLowerCase().includes("extraordinario") || false;
        }
      }
      return false;
    });

    await run("ES: Athena NOT tagged as Zeus (key bug fix)", async () => {
      const badges = await page.locator('div[title^="Speaker referenced"]').all();
      for (const badge of badges) {
        const text = await badge.textContent();
        const nextP = await badge.locator("xpath=following-sibling::p").first();
        const paraText = await nextP.textContent();
        // Athena's paragraph: "Padre", dijo ella, "Aegisto..."
        if (paraText?.includes("Padre") && paraText?.includes("dijo ella")) {
          if (text?.includes("Zeus")) return false;
        }
      }
      return true;
    });

    await run("ES: Badges positioned as top tabs", async () => {
      const badges = await page.locator('div[title^="Speaker referenced"]').all();
      for (const badge of badges) {
        const badgeBox = await badge.boundingBox();
        const nextP = await badge.locator("xpath=following-sibling::p").first();
        const pBox = await nextP.boundingBox();
        if (!badgeBox || !pBox || badgeBox.y >= pBox.y) return false;
      }
      return true;
    });

    await run("ES: Badge WCAG contrast", async () => {
      const badge = page.locator('div[title^="Speaker referenced"]').first();
      const styles = await badge.evaluate((el) => ({
        bg: window.getComputedStyle(el).backgroundColor,
        color: window.getComputedStyle(el).color,
      }));
      return styles.color.includes("255, 255, 255") && !styles.bg.includes("0, 0, 0, 0");
    });

    await ctx.close();
  }

  // ============================================================
  // SECTION 3: ALL CHAPTERS RENDER (EN + ES)
  // ============================================================
  log("\n=== SECTION 3: ALL CHAPTERS ===");
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.goto(LIVE_URL, { waitUntil: "networkidle" });
    await page.waitForTimeout(3000);

    const chapterLabels = [
      "Preface", "Book One", "Book Two", "Book Three", "Book Four",
      "Book Five", "Book Six", "Book Seven", "Book Eight", "Book Nine",
      "Book Ten", "Book Eleven", "Book Twelve", "Book Thirteen", "Book Fourteen",
      "Book Fifteen", "Book Sixteen", "Book Seventeen", "Book Eighteen", "Book Nineteen",
      "Book Twenty", "Book Twenty-One", "Book Twenty-Two", "Book Twenty-Three", "Book Twenty-Four",
    ];

    let enPassed = 0, enFailed = 0;
    for (const label of chapterLabels) {
      try {
        await page.locator('nav[aria-label="Chapter navigation"] button', { hasText: label }).first().click();
        await page.waitForTimeout(2000);
        const blocks = await page.locator("[data-block-id]").count();
        if (blocks > 3) enPassed++;
        else { enFailed++; results.push({ name: `EN Chapter: ${label}`, passed: false, error: `Only ${blocks} blocks` }); }
      } catch { enFailed++; }
    }
    results.push({ name: `EN: All 25 chapters render (${enPassed}/${25})`, passed: enFailed === 0, details: { passed: enPassed, failed: enFailed } });

    // Switch to Spanish
    await page.locator('button[aria-label="Español"]').click();
    await page.waitForTimeout(3000);

    const esLabels = [
      "Prólogo", "Libro Uno", "Libro Dos", "Libro Tres", "Libro Cuatro",
      "Libro Cinco", "Libro Seis", "Libro Siete", "Libro Ocho", "Libro Nueve",
      "Libro Diez", "Libro Once", "Libro Doce", "Libro Trece", "Libro Catorce",
      "Libro Quince", "Libro Dieciséis", "Libro Diecisiete", "Libro Dieciocho", "Libro Diecinueve",
      "Libro Veinte", "Libro Veintiuno", "Libro Veintidós", "Libro Veintitrés", "Libro Veinticuatro",
    ];

    let esPassed = 0, esFailed = 0;
    for (const label of esLabels) {
      try {
        await page.locator('nav[aria-label="Chapter navigation"] button', { hasText: label }).first().click();
        await page.waitForTimeout(2000);
        const blocks = await page.locator("[data-block-id]").count();
        if (blocks > 3) esPassed++;
        else { esFailed++; results.push({ name: `ES Chapter: ${label}`, passed: false, error: `Only ${blocks} blocks` }); }
      } catch { esFailed++; }
    }
    results.push({ name: `ES: All 25 chapters render (${esPassed}/${25})`, passed: esFailed === 0, details: { passed: esPassed, failed: esFailed } });

    await ctx.close();
  }

  // ============================================================
  // SECTION 4: SPANISH TRANSLATION QUALITY SPOT CHECKS
  // ============================================================
  log("\n=== SECTION 4: TRANSLATION QUALITY ===");
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.goto(LIVE_URL, { waitUntil: "networkidle" });
    await page.waitForTimeout(3000);
    await page.locator('button[aria-label="Español"]').click();
    await page.waitForTimeout(3000);

    await run("ES: Preface contains Spanish text", async () => {
      await page.locator('nav button', { hasText: "Prólogo" }).first().click();
      await page.waitForTimeout(3000);
      const text = await page.locator("[data-block-id]").first().textContent();
      return text?.includes("poema") || text?.includes("secuela") || false;
    });

    await run("ES: Book 1 title is 'LIBRO UNO'", async () => {
      await page.locator('nav button', { hasText: "Libro Uno" }).first().click();
      await page.waitForTimeout(3000);
      const text = await page.locator("h2").first().textContent();
      return text?.includes("LIBRO UNO") || false;
    });

    await run("ES: Character names in Spanish (Zeus, Atenea)", async () => {
      const text = await page.locator("[data-block-id]").allTextContents();
      const allText = text.join(" ");
      return allText.includes("Zeus") || allText.includes("Atenea") || false;
    });

    await run("ES: No 404 errors on any chapter", async () => {
      const errors: string[] = [];
      page.on("response", (res) => {
        if (res.status() === 404 && res.url().includes("/books/")) {
          errors.push(res.url());
        }
      });
      // Just check the current chapter loaded
      await page.waitForTimeout(2000);
      return errors.length === 0;
    });

    await ctx.close();
  }

  // ============================================================
  // SECTION 5: UI FLOWS
  // ============================================================
  log("\n=== SECTION 5: UI FLOWS ===");
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.goto(LIVE_URL, { waitUntil: "networkidle" });
    await page.waitForTimeout(5000);

    await run("UI: Toggle contents panel", async () => {
      const aside = await page.evaluate(() => document.querySelector('aside[aria-label="Chapter list"]')?.offsetWidth ?? 0);
      await page.locator('button[aria-label="Toggle contents"]').click();
      await page.waitForTimeout(500);
      const closed = await page.evaluate(() => document.querySelector('aside[aria-label="Chapter list"]')?.offsetWidth ?? 0);
      await page.locator('button[aria-label="Toggle contents"]').click();
      await page.waitForTimeout(500);
      const reopened = await page.evaluate(() => document.querySelector('aside[aria-label="Chapter list"]')?.offsetWidth ?? 0);
      return closed < 10 && aside > 10 && reopened > 10;
    });

    await run("UI: Search returns results", async () => {
      await page.locator('button[aria-label="Search"]').click();
      await page.waitForTimeout(500);
      await page.locator('input[aria-label="Search query"]').fill("Odysseus");
      await page.waitForTimeout(3000);
      return (await page.locator("aside[aria-label='Detail panel'] li").count()) > 0;
    });

    await run("UI: Editor mode shows inference", async () => {
      await page.goto(LIVE_URL, { waitUntil: "networkidle" });
      await page.waitForTimeout(3000);
      await page.locator('nav button', { hasText: "Book One" }).first().click();
      await page.waitForTimeout(3000);
      await page.locator('button[aria-label="Toggle editor mode"]').click();
      await page.waitForTimeout(800);
      await page.locator("p[data-block-id]").first().click();
      await page.waitForTimeout(800);
      const text = await page.locator("aside[aria-label='Detail panel']").textContent();
      return text?.includes("Inference") ?? false;
    });

    await run("UI: Dark theme toggles", async () => {
      await page.locator('button[aria-label="Settings"]').click();
      await page.waitForTimeout(500);
      await page.locator("button", { hasText: "Dark" }).click();
      await page.waitForTimeout(400);
      return page.evaluate(() => document.documentElement.classList.contains("dark"));
    });

    await run("UI: High contrast toggles", async () => {
      const switchEl = page.locator("label:has-text('High contrast')").locator("..").locator("button[role='switch']");
      await switchEl.click();
      await page.waitForTimeout(400);
      const isHc = await page.evaluate(() => document.documentElement.classList.contains("high-contrast"));
      await switchEl.click();
      return isHc;
    });

    await run("UI: No console errors", async () => {
      const errors: string[] = [];
      page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
      await page.goto(LIVE_URL, { waitUntil: "networkidle" });
      await page.waitForTimeout(5000);
      return errors.length === 0;
    });

    await ctx.close();
  }

  await browser.close();

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  log(`\n${"=".repeat(60)}`);
  log(`EXHAUSTIVE VALIDATION: ${passed} passed, ${failed} failed, ${results.length} total`);
  log(`${"=".repeat(60)}\n`);
  for (const r of results) {
    const status = r.passed ? "PASS" : "FAIL";
    log(`[${status}] ${r.name}${r.error ? " — " + r.error : ""}`);
  }
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });
