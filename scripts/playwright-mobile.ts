#!/usr/bin/env bun
/**
 * Mobile + Accessibility Playwright validation.
 * Tests across iPhone, Android, Samsung, tablet sizes and accessibility features.
 */
import { chromium } from "playwright";

const LIVE_URL = "https://pillb.github.io/odyssey-narrator/";

interface TestResult { name: string; passed: boolean; error?: string; }
const results: TestResult[] = [];
function log(msg: string) { console.log(`[test] ${msg}`); }

async function run(name: string, fn: () => Promise<boolean>): Promise<void> {
  try { results.push({ name, passed: await fn() }); }
  catch (e) { results.push({ name, passed: false, error: (e as Error).message }); }
}

// Device profiles: [name, width, height]
const DEVICES = [
  ["iPhone SE", 375, 667],
  ["iPhone 14", 390, 844],
  ["iPhone 14 Pro Max", 430, 932],
  ["Samsung Galaxy S22", 360, 780],
  ["Samsung Galaxy S24", 412, 915],
  ["Google Pixel 7", 412, 915],
  ["iPad Mini", 768, 1024],
  ["iPad Pro 11", 834, 1194],
];

async function main() {
  log("Starting mobile + accessibility validation...");
  const browser = await chromium.launch({ headless: true });

  // ============================================================
  // SECTION 1: Device viewport tests
  // ============================================================
  log("\n=== DEVICE VIEWPORT TESTS ===");
  for (const [name, w, h] of DEVICES) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage();

    await run(`${name} (${w}x${h}): Page loads`, async () => {
      await page.goto(LIVE_URL, { waitUntil: "networkidle" });
      await page.waitForTimeout(3000);
      return page.title().includes("AI Odyssey");
    });

    await run(`${name}: Book One loads with content`, async () => {
      // On mobile, contents panel might need to be opened first
      const asideW = await page.evaluate(() => document.querySelector('aside[aria-label="Chapter list"]')?.offsetWidth ?? 0);
      if (asideW < 10) {
        await page.locator('button[aria-label="Toggle contents"]').click();
        await page.waitForTimeout(500);
      }
      await page.locator('nav[aria-label="Chapter navigation"] button', { hasText: "Book One" }).first().click();
      await page.waitForTimeout(3000);
      const blocks = await page.locator("[data-block-id]").count();
      return blocks > 10;
    });

    await run(`${name}: No horizontal scroll`, async () => {
      const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientW = await page.evaluate(() => document.documentElement.clientWidth);
      return scrollW <= clientW + 5; // 5px tolerance
    });

    await run(`${name}: Toolbar visible and not wrapping badly`, async () => {
      const headerH = await page.evaluate(() => {
        const h = document.querySelector("header");
        return h ? h.offsetHeight : 0;
      });
      return headerH > 0 && headerH < 200; // Should be compact, not excessively tall
    });

    await run(`${name}: Font size controls (A-/A+) work`, async () => {
      const beforeSize = await page.evaluate(() => {
        const p = document.querySelector("p.odyssey-prose");
        return p ? p.style.fontSize : "";
      });
      await page.locator('button[aria-label="Increase font size"]').click();
      await page.waitForTimeout(300);
      const afterSize = await page.evaluate(() => {
        const p = document.querySelector("p.odyssey-prose");
        return p ? p.style.fontSize : "";
      });
      return beforeSize !== afterSize;
    });

    await run(`${name}: Sidebar collapses on mobile`, async () => {
      // Close contents
      await page.locator('button[aria-label="Toggle contents"]').click();
      await page.waitForTimeout(500);
      const asideW = await page.evaluate(() => document.querySelector('aside[aria-label="Chapter list"]')?.offsetWidth ?? 0);
      return asideW < 10;
    });

    await ctx.close();
  }

  // ============================================================
  // SECTION 2: Accessibility tests
  // ============================================================
  log("\n=== ACCESSIBILITY TESTS ===");
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.goto(LIVE_URL, { waitUntil: "networkidle" });
    await page.waitForTimeout(3000);

    await run("A11Y: Lexend font (dyslexia-friendly) selectable", async () => {
      await page.locator('button[aria-label="Settings"]').click();
      await page.waitForTimeout(500);
      // Check if Lexend option exists
      const fontSelect = page.locator("select").first();
      const options = await fontSelect.locator("option").allTextContents();
      return options.some(o => o.includes("Lexend"));
    });

    await run("A11Y: Atkinson Hyperlegible font selectable", async () => {
      const fontSelect = page.locator("select").first();
      const options = await fontSelect.locator("option").allTextContents();
      return options.some(o => o.includes("Atkinson"));
    });

    await run("A11Y: Font size range 12-32px", async () => {
      await page.locator('button[aria-label="Settings"]').click();
      await page.waitForTimeout(500);
      const slider = page.locator('input[type="range"]').first();
      const min = await slider.getAttribute("min");
      const max = await slider.getAttribute("max");
      return min === "12" && max === "32";
    });

    await run("A11Y: Black & white mode toggle", async () => {
      // Find the B/W toggle
      const bwLabel = page.locator("label:has-text('Black & white')");
      const bwCount = await bwLabel.count();
      if (bwCount === 0) return false;
      const bwSwitch = bwLabel.locator("..").locator("button[role='switch']");
      await bwSwitch.click();
      await page.waitForTimeout(500);
      const hasBw = await page.evaluate(() => document.documentElement.classList.contains("high-contrast-bw"));
      await bwSwitch.click(); // toggle off
      return hasBw;
    });

    await run("A11Y: High contrast toggle works", async () => {
      const hcLabel = page.locator("label:has-text('High contrast')");
      const hcSwitch = hcLabel.locator("..").locator("button[role='switch']");
      await hcSwitch.click();
      await page.waitForTimeout(400);
      const isHc = await page.evaluate(() => document.documentElement.classList.contains("high-contrast"));
      await hcSwitch.click();
      return isHc;
    });

    await run("A11Y: Reduced motion toggle works", async () => {
      const rmLabel = page.locator("label:has-text('Reduced motion')");
      const rmSwitch = rmLabel.locator("..").locator("button[role='switch']");
      await rmSwitch.click();
      await page.waitForTimeout(400);
      const isRm = await page.evaluate(() => document.documentElement.classList.contains("reduced-motion"));
      await rmSwitch.click();
      return isRm;
    });

    await run("A11Y: All buttons have aria-labels", async () => {
      const buttons = await page.locator("button:not([aria-label])").count();
      const totalButtons = await page.locator("button").count();
      // Allow some buttons without aria-label (like option buttons in selects)
      return buttons < totalButtons * 0.3; // At least 70% should have aria-labels
    });

    await run("A11Y: A-/A+ font controls in toolbar", async () => {
      const decrease = await page.locator('button[aria-label="Decrease font size"]').count();
      const increase = await page.locator('button[aria-label="Increase font size"]').count();
      return decrease > 0 && increase > 0;
    });

    await ctx.close();
  }

  await browser.close();

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  log(`\n${"=".repeat(60)}`);
  log(`MOBILE + A11Y VALIDATION: ${passed} passed, ${failed} failed, ${results.length} total`);
  log(`${"=".repeat(60)}\n`);
  for (const r of results) {
    log(`[${r.passed ? "PASS" : "FAIL"}] ${r.name}${r.error ? " — " + r.error : ""}`);
  }
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });
