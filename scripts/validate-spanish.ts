#!/usr/bin/env bun
/**
 * Validate Spanish translations against English originals.
 * Checks:
 *   1. Paragraph count matches
 *   2. Footnote count matches
 *   3. No obvious untranslated English text remaining
 *   4. Markdown structure preserved (headers, scene breaks)
 */
import { readdir, readFile } from "fs/promises";
import { join } from "path";

const EN_DIR = "/home/z/my-project/public/books";
const ES_DIR = "/home/z/my-project/public/books/es";

function countParagraphs(text: string): number {
  return text.split(/\n{2,}/).filter((p) => p.trim().length > 0).length;
}

function countFootnotes(text: string): number {
  const matches = text.match(/\[\^(\d+)\]/g);
  return matches ? new Set(matches.map((m) => m.match(/\d+/)?.[0])).size : 0;
}

function countHeaders(text: string): number {
  return (text.match(/^#{1,3}\s/gm) || []).length;
}

function countSceneBreaks(text: string): number {
  return (text.match(/^---+\s*$/gm) || []).length;
}

/** Check for untranslated English words (common English words that shouldn't
 *  appear in a Spanish translation). */
function findUntranslatedEnglish(text: string): string[] {
  const englishWords = [
    "the ", "and ", "but ", "with ", "from ", "that ", "this ", "have ",
    "they ", "them ", "their ", "would ", "could ", "should ", "before ",
    "after ", "between ", "through ", "during ", "without ",
  ];
  const found: string[] = [];
  const lower = text.toLowerCase();
  // Only check outside markdown formatting and proper nouns
  // Look for sequences of English words
  for (const word of englishWords) {
    // Check if it appears as a standalone word (not part of a larger word)
    const regex = new RegExp(`\\b${word.trim()}`, "gi");
    const matches = lower.match(regex);
    if (matches && matches.length > 3) {
      found.push(`${word.trim()} (${matches.length} occurrences)`);
    }
  }
  return found;
}

async function main() {
  const files = (await readdir(EN_DIR)).filter(
    (f) => f.endsWith(".md") && f.startsWith("odyssey-book-"),
  );
  files.sort();

  console.log("Chapter                Paras(EN/ES)  Footnotes(EN/ES)  Headers(EN/ES)  SceneBrks(EN/ES)  Issues");
  console.log("--------------------   -----------   ----------------  -------------   ----------------  ------");

  let totalIssues = 0;
  const issues: Array<{ file: string; issues: string[] }> = [];

  for (const file of files) {
    const enText = await readFile(join(EN_DIR, file), "utf-8");
    let esText: string;
    try {
      esText = await readFile(join(ES_DIR, file), "utf-8");
    } catch {
      console.log(`${file.padEnd(22)} NOT TRANSLATED`);
      issues.push({ file, issues: ["not translated"] });
      totalIssues++;
      continue;
    }

    const enParas = countParagraphs(enText);
    const esParas = countParagraphs(esText);
    const enFn = countFootnotes(enText);
    const esFn = countFootnotes(esText);
    const enH = countHeaders(enText);
    const esH = countHeaders(esText);
    const enSb = countSceneBreaks(enText);
    const esSb = countSceneBreaks(esText);

    const chapterIssues: string[] = [];
    if (enParas !== esParas) chapterIssues.push(`paras: ${enParas}→${esParas}`);
    if (enFn !== esFn) chapterIssues.push(`footnotes: ${enFn}→${esFn}`);
    if (enH !== esH) chapterIssues.push(`headers: ${enH}→${esH}`);
    if (enSb !== esSb) chapterIssues.push(`scenebrks: ${enSb}→${esSb}`);

    const untranslated = findUntranslatedEnglish(esText);
    if (untranslated.length > 0) {
      chapterIssues.push(`english: ${untranslated.join(", ")}`);
    }

    const slug = file.replace(".md", "").replace("odyssey-book-", "B");
    const status = chapterIssues.length === 0 ? "✓" : "⚠";
    console.log(
      `${slug.padEnd(22)} ${String(enParas).padStart(3)}/${String(esParas).padStart(3)}        ${String(enFn).padStart(3)}/${String(esFn).padStart(3)}             ${String(enH).padStart(3)}/${String(esH).padStart(3)}           ${String(enSb).padStart(3)}/${String(esSb).padStart(3)}             ${status} ${chapterIssues.join("; ")}`,
    );

    if (chapterIssues.length > 0) {
      issues.push({ file, issues: chapterIssues });
      totalIssues += chapterIssues.length;
    }
  }

  console.log("\n========================================");
  console.log(`VALIDATION SUMMARY: ${issues.length} chapters with issues, ${totalIssues} total issues`);
  console.log("========================================");
  if (issues.length > 0) {
    console.log("\nChapters needing correction:");
    for (const { file, issues: i } of issues) {
      console.log(`  ${file}:`);
      for (const issue of i) {
        console.log(`    - ${issue}`);
      }
    }
  }
}

main().catch(console.error);
