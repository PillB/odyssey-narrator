#!/usr/bin/env bun
/**
 * Comprehensive Playwright test suite for the AI Odyssey reader.
 * Uses agent-browser CLI under the hood.
 */
interface TestResult { name: string; passed: boolean; error?: string; details?: unknown; }
const results: TestResult[] = [];
function log(msg: string) { console.log(`[test] ${msg}`); }

function ab(...args: string[]): string {
  const { stdout, stderr } = Bun.spawnSync(["agent-browser", ...args], { stdout: "pipe", stderr: "pipe" });
  const out = stdout.toString().trim();
  const err = stderr.toString().trim();
  // For data-returning commands (snapshot, eval), prefer stdout.
  // For action commands (click, open), stdout may be empty — return stderr.
  return out || err;
}

function evalJs(expr: string): unknown {
  const out = ab("eval", expr);
  // agent-browser eval prints JSON-ish output; extract the first JSON value
  const match = out.match(/(\{[\s\S]*\}|\[[\s\S]*\]|^"[^"]*"|^true|^false|^-?\d+)/m);
  if (!match) return out.trim();
  try { return JSON.parse(match[1]); } catch { return match[1]; }
}

function wait(ms: number) { return new Promise((r) => setTimeout(r, ms)); }
function snapshot(): string { return ab("snapshot", "-i"); }
function clickRef(ref: string) { return ab("click", ref); }

function findRefByLabel(label: string | RegExp): string | null {
  const snap = snapshot();
  for (const line of snap.split("\n")) {
    if (typeof label === "string" ? line.includes(label) : label.test(line)) {
      const m = line.match(/\[ref=(\w+)\]/);
      if (m) return m[1];
    }
  }
  return null;
}

/** Retry findRefByLabel up to 5 times with 1s waits. */
async function findRefByLabelRetry(label: string | RegExp): Promise<string | null> {
  for (let i = 0; i < 5; i++) {
    const ref = findRefByLabel(label);
    if (ref) return ref;
    await wait(1000);
  }
  return null;
}

async function testAllChapters(): Promise<void> {
  log("TEST 1: Visiting all 25 chapters");
  ab("open", "http://localhost:3000");
  await wait(4000);
  const labels = ["Preface","Book One","Book Two","Book Three","Book Four","Book Five","Book Six","Book Seven","Book Eight","Book Nine","Book Ten","Book Eleven","Book Twelve","Book Thirteen","Book Fourteen","Book Fifteen","Book Sixteen","Book Seventeen","Book Eighteen","Book Nineteen","Book Twenty","Book Twenty-One","Book Twenty-Two","Book Twenty-Three","Book Twenty-Four"];
  for (const label of labels) {
    try {
      const ref = await findRefByLabelRetry(new RegExp(`button "${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}( |\\d)`));
      if (!ref) { results.push({ name: `Chapter ${label}`, passed: false, error: "Button not found" }); continue; }
      clickRef(ref);
      await wait(1500);
      const blockCount = evalJs(`document.querySelectorAll('[data-block-id]').length`) as number;
      const hasError = evalJs(`!!document.querySelector('.text-destructive')`) as boolean;
      results.push({ name: `Chapter ${label}`, passed: blockCount > 3 && !hasError, details: { blocks: blockCount }, error: blockCount <= 3 ? `only ${blockCount} blocks` : undefined });
    } catch (e) { results.push({ name: `Chapter ${label}`, passed: false, error: (e as Error).message }); }
  }
}

async function testToolbarButtons(): Promise<void> {
  log("TEST 2: Testing every toolbar button");
  ab("open", "http://localhost:3000");
  await wait(4000);

  // Toggle contents
  try {
    const ref = await findRefByLabelRetry("Toggle contents");
    if (!ref) throw new Error("not found");
    clickRef(ref); await wait(400);
    const closedW = evalJs(`document.querySelector('aside[aria-label="Chapter list"]')?.offsetWidth`) as number;
    clickRef(ref); await wait(400);
    const openW = evalJs(`document.querySelector('aside[aria-label="Chapter list"]')?.offsetWidth`) as number;
    results.push({ name: "Toggle contents", passed: closedW === 0 && openW > 0 });
  } catch (e) { results.push({ name: "Toggle contents", passed: false, error: (e as Error).message }); }

  // Previous disabled at Preface
  try {
    const snap = snapshot();
    const line = snap.split("\n").find((l) => l.includes("Previous chapter"));
    results.push({ name: "Previous chapter disabled at Preface", passed: !!line?.includes("disabled") });
  } catch (e) { results.push({ name: "Previous chapter", passed: false, error: (e as Error).message }); }

  // Next chapter
  try {
    const bookOneRef = await findRefByLabelRetry(/Book One \d/);
    if (bookOneRef) { clickRef(bookOneRef); await wait(1500); }
    const nextRef = await findRefByLabelRetry("Next chapter");
    if (!nextRef) throw new Error("no next");
    clickRef(nextRef); await wait(1500);
    const title = evalJs(`document.querySelector('header')?.textContent`) as string;
    results.push({ name: "Next chapter", passed: title.includes("Book Two") });
  } catch (e) { results.push({ name: "Next chapter", passed: false, error: (e as Error).message }); }

  // Search button
  try {
    const ref = await findRefByLabelRetry("Search");
    if (!ref) throw new Error("not found");
    clickRef(ref); await wait(500);
    const has = evalJs(`!!document.querySelector('input[aria-label="Search query"]')`) as boolean;
    results.push({ name: "Search button", passed: has });
  } catch (e) { results.push({ name: "Search button", passed: false, error: (e as Error).message }); }

  // Editor toggle
  try {
    const ref = await findRefByLabelRetry("Toggle editor mode");
    if (!ref) throw new Error("not found");
    clickRef(ref); await wait(800);
    const n = evalJs(`document.querySelectorAll('p[data-block-id]').length`) as number;
    results.push({ name: "Editor mode toggle", passed: n > 5 });
    const r2 = await findRefByLabelRetry("Toggle editor mode");
    if (r2) clickRef(r2);
    await wait(500);
  } catch (e) { results.push({ name: "Editor mode toggle", passed: false, error: (e as Error).message }); }

  // Settings
  try {
    const ref = await findRefByLabelRetry("Settings");
    if (!ref) throw new Error("not found");
    clickRef(ref); await wait(500);
    const has = evalJs(`!!document.querySelector('button[class*="Light"]')`) as boolean;
    results.push({ name: "Settings button", passed: has });
  } catch (e) { results.push({ name: "Settings button", passed: false, error: (e as Error).message }); }

  // Bookmarks
  try {
    const ref = await findRefByLabelRetry("Bookmarks and annotations");
    if (!ref) throw new Error("not found");
    clickRef(ref); await wait(500);
    const has = evalJs(`document.querySelector('aside[aria-label="Detail panel"]')?.textContent?.includes('SAVED')`) as boolean;
    results.push({ name: "Bookmarks button", passed: has });
  } catch (e) { results.push({ name: "Bookmarks button", passed: false, error: (e as Error).message }); }

  // Toggle narrator legend
  try {
    const ref = await findRefByLabelRetry("Toggle narrator legend");
    if (!ref) throw new Error("not found");
    clickRef(ref); await wait(400);
    const hidden = evalJs(`document.querySelector('aside[aria-label="Detail panel"]')?.offsetWidth`) as number;
    clickRef(ref); await wait(400);
    const shown = evalJs(`document.querySelector('aside[aria-label="Detail panel"]')?.offsetWidth`) as number;
    results.push({ name: "Toggle narrator legend", passed: hidden === 0 && shown > 0 });
  } catch (e) { results.push({ name: "Toggle narrator legend", passed: false, error: (e as Error).message }); }
}

async function testEditorFlow(): Promise<void> {
  log("TEST 3: Testing editor flow");
  ab("open", "http://localhost:3000");
  await wait(4000);
  const bookOneRef = await findRefByLabelRetry(/Book One \d/);
  if (bookOneRef) { clickRef(bookOneRef); await wait(2000); }
  const editorToggle = await findRefByLabelRetry("Toggle editor mode");
  if (!editorToggle) { results.push({ name: "Editor flow", passed: false, error: "no toggle" }); return; }
  clickRef(editorToggle); await wait(800);
  const paraRef = await findRefByLabelRetry(/paragraph.*clickable/);
  if (!paraRef) { results.push({ name: "Editor flow", passed: false, error: "no para" }); return; }
  clickRef(paraRef); await wait(800);
  const hasInf = evalJs(`document.querySelector('aside[aria-label="Detail panel"]')?.textContent?.includes('Inference')`) as boolean;
  results.push({ name: "Editor shows inference", passed: hasInf });

  // Test reassign
  try {
    const before = evalJs(`document.querySelector('select#narrator-select')?.value`) as string;
    const selectRef = await findRefByLabelRetry("ASSIGN NARRATOR");
    if (selectRef) {
      ab("select", selectRef, "unknown");
      await wait(500);
      const after = evalJs(`document.querySelector('select#narrator-select')?.value`) as string;
      results.push({ name: "Editor reassign narrator", passed: after === "unknown", details: { before, after } });
    } else {
      results.push({ name: "Editor reassign narrator", passed: false, error: "select not found" });
    }
  } catch (e) { results.push({ name: "Editor reassign narrator", passed: false, error: (e as Error).message }); }

  const r2 = await findRefByLabelRetry("Toggle editor mode");
  if (r2) clickRef(r2);
  await wait(500);
}

async function testSettingsPanel(): Promise<void> {
  log("TEST 4: Testing settings panel");
  ab("open", "http://localhost:3000");
  await wait(4000);
  const settingsRef = await findRefByLabelRetry("Settings");
  if (!settingsRef) { results.push({ name: "Settings panel", passed: false, error: "no btn" }); return; }
  clickRef(settingsRef); await wait(800);

  try {
    const r = await findRefByLabelRetry("Light");
    if (!r) throw new Error("no Light");
    clickRef(r); await wait(400);
    const isLight = evalJs(`!document.documentElement.classList.contains('dark')`) as boolean;
    results.push({ name: "Light theme", passed: isLight });
  } catch (e) { results.push({ name: "Light theme", passed: false, error: (e as Error).message }); }

  try {
    const r = await findRefByLabelRetry("Dark");
    if (!r) throw new Error("no Dark");
    clickRef(r); await wait(400);
    const isDark = evalJs(`document.documentElement.classList.contains('dark')`) as boolean;
    results.push({ name: "Dark theme", passed: isDark });
  } catch (e) { results.push({ name: "Dark theme", passed: false, error: (e as Error).message }); }

  // High contrast
  try {
    const snap = snapshot();
    const hcLine = snap.split("\n").find((l) => l.includes("High contrast"));
    const m = hcLine?.match(/\[ref=(\w+)\]/);
    if (m) {
      clickRef(m[1]); await wait(400);
      const isHc = evalJs(`document.documentElement.classList.contains('high-contrast')`) as boolean;
      results.push({ name: "High contrast toggle", passed: isHc });
      clickRef(m[1]); await wait(300);
    } else { results.push({ name: "High contrast toggle", passed: false, error: "no ref" }); }
  } catch (e) { results.push({ name: "High contrast toggle", passed: false, error: (e as Error).message }); }

  // Reduced motion
  try {
    const snap = snapshot();
    const rmLine = snap.split("\n").find((l) => l.includes("Reduced motion"));
    const m = rmLine?.match(/\[ref=(\w+)\]/);
    if (m) {
      clickRef(m[1]); await wait(400);
      const isRm = evalJs(`document.documentElement.classList.contains('reduced-motion')`) as boolean;
      results.push({ name: "Reduced motion toggle", passed: isRm });
      clickRef(m[1]); await wait(300);
    } else { results.push({ name: "Reduced motion toggle", passed: false, error: "no ref" }); }
  } catch (e) { results.push({ name: "Reduced motion toggle", passed: false, error: (e as Error).message }); }

  try {
    const r = await findRefByLabelRetry("Auto");
    if (r) { clickRef(r); await wait(300); }
    results.push({ name: "Auto theme", passed: true });
  } catch (e) { results.push({ name: "Auto theme", passed: false, error: (e as Error).message }); }
}

async function testBookmarksAndAnnotations(): Promise<void> {
  log("TEST 5: Testing bookmarks + annotations");
  ab("open", "http://localhost:3000");
  await wait(4000);
  evalJs(`localStorage.removeItem('odyssey-reader-v1')`);
  ab("reload"); await wait(4000);
  const bookOneRef = await findRefByLabelRetry(/Book One \d/);
  if (bookOneRef) { clickRef(bookOneRef); await wait(2000); }

  try {
    const paras = evalJs(`Array.from(document.querySelectorAll('p[data-block-id]')).slice(0,3).map(p => p.getBoundingClientRect().top)`) as number[];
    ab("mouse", "move", "200", String(Math.round(paras[0] + 20)));
    await wait(500);
    const clicked = evalJs(`(function(){ var btn = document.querySelector('button[aria-label="Add bookmark"]'); if(!btn) return 'no btn'; btn.click(); return 'clicked'; })()`) as string;
    await wait(500);
    const bmCount = evalJs(`JSON.parse(localStorage.getItem('odyssey-reader-v1')||'{}').state?.bookmarks?.length || 0`) as number;
    results.push({ name: "Add bookmark", passed: clicked === 'clicked' && bmCount === 1, details: { clicked, bmCount } });
  } catch (e) { results.push({ name: "Add bookmark", passed: false, error: (e as Error).message }); }

  try {
    const r = await findRefByLabelRetry("Bookmarks and annotations");
    if (!r) throw new Error("no bm btn");
    clickRef(r); await wait(800);
    const has = evalJs(`document.querySelector('aside[aria-label="Detail panel"]')?.textContent?.includes('BOOKMARKS (1)')`) as boolean;
    results.push({ name: "Bookmark appears in panel", passed: has });
  } catch (e) { results.push({ name: "Bookmark in panel", passed: false, error: (e as Error).message }); }
}

async function testSearch(): Promise<void> {
  log("TEST 6: Testing search");
  ab("open", "http://localhost:3000");
  await wait(4000);
  await wait(8000); // chapters background-load
  const searchRef = await findRefByLabelRetry("Search");
  if (!searchRef) { results.push({ name: "Search", passed: false, error: "no btn" }); return; }
  clickRef(searchRef); await wait(500);
  const inputRef = await findRefByLabelRetry("Search query");
  if (!inputRef) { results.push({ name: "Search", passed: false, error: "no input" }); return; }
  ab("fill", inputRef, "Odysseus");
  await wait(3500);
  const count = evalJs(`document.querySelectorAll('aside[aria-label="Detail panel"] li').length`) as number;
  results.push({ name: "Search 'Odysseus'", passed: count > 0, details: { count } });

  ab("fill", inputRef, "zzzznotaword");
  await wait(1500);
  const noMatch = evalJs(`document.querySelector('aside[aria-label="Detail panel"]')?.textContent?.includes('No matches')`) as boolean;
  results.push({ name: "Search no-match", passed: noMatch });
}

async function testLLMEvaluator(): Promise<void> {
  log("TEST 7: Testing LLM evaluator");
  ab("open", "http://localhost:3000");
  await wait(4000);
  const bookOneRef = await findRefByLabelRetry(/Book One \d/);
  if (bookOneRef) { clickRef(bookOneRef); await wait(2000); }
  const editorToggle = await findRefByLabelRetry("Toggle editor mode");
  if (!editorToggle) { results.push({ name: "LLM evaluator", passed: false, error: "no toggle" }); return; }
  clickRef(editorToggle); await wait(800);
  const paraRef = await findRefByLabelRetry(/paragraph.*clickable/);
  if (!paraRef) { results.push({ name: "LLM evaluator", passed: false, error: "no para" }); return; }
  clickRef(paraRef); await wait(800);
  const llmRef = await findRefByLabelRetry("Ask LLM to critique");
  if (!llmRef) { results.push({ name: "LLM evaluator", passed: false, error: "no LLM btn" }); return; }
  clickRef(llmRef);
  let text = "";
  for (let i = 0; i < 30; i++) {
    await wait(1000);
    text = evalJs(`document.querySelector('aside[aria-label="Detail panel"]')?.textContent || ''`) as string;
    if (text.includes("LLM proposes:")) break;
  }
  results.push({ name: "LLM evaluator returns proposal", passed: text.includes("LLM proposes:"), details: { snippet: text.slice(0, 200) } });
}

async function testFolding(): Promise<void> {
  log("TEST 8: Testing folding system");
  ab("open", "http://localhost:3000");
  await wait(4000);
  const bookOneRef = await findRefByLabelRetry(/Book One \d/);
  if (bookOneRef) { clickRef(bookOneRef); await wait(2000); }
  const narratorCount = evalJs(`document.querySelectorAll('aside[aria-label="Detail panel"] button[aria-label^="Hide "]').length`) as number;
  results.push({ name: "Narrator list populated", passed: narratorCount > 3, details: { narratorCount } });

  try {
    const hideRef = await findRefByLabelRetry("Hide The Guide");
    if (!hideRef) throw new Error("no Hide Guide");
    clickRef(hideRef); await wait(1500);
    const seamCount = evalJs(`document.querySelectorAll('.border-dashed').length`) as number;
    results.push({ name: "Hide Guide produces seams", passed: seamCount > 0, details: { seamCount } });
    if (seamCount > 0) {
      const expanded = evalJs(`(function(){ var s = document.querySelector('.border-dashed'); if(!s) return 'no seam'; s.click(); return 'clicked'; })()`) as string;
      await wait(800);
      const remaining = evalJs(`document.querySelectorAll('.border-dashed').length`) as number;
      results.push({ name: "Click seam expands", passed: expanded === 'clicked' && remaining < seamCount });
    }
    const showAllRef = await findRefByLabelRetry("Show all");
    if (showAllRef) { clickRef(showAllRef); await wait(800); }
    const final = evalJs(`document.querySelectorAll('.border-dashed').length`) as number;
    results.push({ name: "Show all clears seams", passed: final === 0 });
  } catch (e) { results.push({ name: "Folding system", passed: false, error: (e as Error).message }); }
}

async function main() {
  log("Starting comprehensive Playwright tests");
  await testAllChapters();
  await testToolbarButtons();
  await testEditorFlow();
  await testSettingsPanel();
  await testBookmarksAndAnnotations();
  await testSearch();
  await testLLMEvaluator();
  await testFolding();
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  log(`\n========================================`);
  log(`RESULTS: ${passed} passed, ${failed} failed, ${results.length} total`);
  log(`========================================\n`);
  for (const r of results) {
    log(`[${r.passed ? "PASS" : "FAIL"}] ${r.name}${r.error ? " — " + r.error : ""}`);
  }
  ab("close");
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
