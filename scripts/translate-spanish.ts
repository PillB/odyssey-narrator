#!/usr/bin/env bun
/**
 * Spanish (LATAM International) Translation Script
 * ================================================
 * Translates all 25 chapters of The AI Odyssey from English to Spanish
 * using the z-ai-web-dev-sdk LLM.
 *
 * Approach:
 *   - Reads each English chapter from /public/books/
 *   - Translates to neutral LATAM Spanish (not country-specific)
 *   - Saves to /public/books/es/
 *   - Does validation + correction passes
 *
 * Run with: bun /home/z/my-project/scripts/translate-spanish.ts
 */
import ZAI from "z-ai-web-dev-sdk";
import { readdir, readFile, writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";

const BOOKS_DIR = "/home/z/my-project/public/books";
const ES_DIR = "/home/z/my-project/public/books/es";

const SYSTEM_PROMPT = `You are an expert literary translator specializing in Spanish (Latinoamérica — neutral international Spanish, NOT country-specific).

Your task: translate the given English text from Homer's Odyssey (a modern prose retelling) into neutral international Spanish.

TRANSLATION RULES:
1. Use neutral LATAM Spanish that reads naturally in any Spanish-speaking country. Avoid:
   - Country-specific slang (no "ché", "vos", "guey", "tío" as pronoun, etc.)
   - Region-specific vocabulary (use "muchacho" not "chavo"; "niño" not "pibe")
   - The "vosotros" form — always use "ustedes" for plural you
   - Country-specific idioms
2. Use "tú" for singular informal address (standard across LATAM)
3. Keep character names in their recognized Spanish forms: Odiseo, Telémaco, Penélope, Zeus, Atenea, Poseidón, Hermes, Apolo, Agamenón, Menelao, Helena, Calipso, Circe, Nausícaa, Alcínoo, Arete, Eumeo, Euriclea, Antinoo, Eurímaco, Polifemo, Tirsesias, Elpénor, Anticlea, Femio, Médon, Méntor, Teoclímeno, Laertes, Néstor, Egisto, Clitemnestra, Orestes, Troya, Ítaca, Esparta, Pilos
4. Keep place names in Spanish: Ítaca, Troya, Esparta, Pilos, Ogygia → Ogigia, Feacia → Fecia, Eolia → Eolia
5. Preserve the narrator's avuncular, Tolkien-style voice — warm, direct, addresses the reader as "tú"
6. Preserve all markdown formatting: #, ##, ###, ---, *italic*, **bold**, [^n] footnote refs
7. Keep the same paragraph structure — do not merge or split paragraphs
8. Keep the same footnote numbering ([^1], [^2], etc.)
9. Translate the spirit, not word-for-word — but stay faithful to the original meaning
10. For Greek terms in italics (like *xenia*, *homophrosynē*), keep the Greek word in italics and add a Spanish gloss in parenthesis on first use
11. Preserve the "In Which..." chapter subtitles format: "En la que..." or "En el que..."

OUTPUT: Return ONLY the translated markdown. No preamble, no explanation, no code fences.`;

interface TranslationResult {
  slug: string;
  success: boolean;
  originalWords: number;
  translatedWords: number;
  error?: string;
}

async function translateChapter(
  zai: Awaited<ReturnType<typeof ZAI.create>>,
  slug: string,
  englishText: string,
): Promise<string> {
  // For large chapters (>1500 words), split into chunks and translate separately.
  // This avoids LLM timeouts on very long inputs.
  const wordCount = englishText.split(/\s+/).filter(Boolean).length;
  if (wordCount > 1000) {
    console.log(`[translate] ${slug}: large chapter (${wordCount} words), splitting into chunks...`);
    return translateLargeChapter(zai, slug, englishText);
  }

  // Retry up to 3 times for small chapters
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const completion = await zai.chat.completions.create({
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Translate this chapter to neutral LATAM Spanish:\n\n${englishText}` },
        ],
        thinking: { type: "disabled" },
        temperature: 0.3,
        max_tokens: 8000,
      });
      const content = completion.choices[0]?.message?.content;
      if (!content || content.trim().length < 50) throw new Error("Empty or too-short response");
      return content
        .replace(/^```(?:markdown)?\s*\n/i, "")
        .replace(/\n```\s*$/i, "")
        .trim();
    } catch (e) {
      lastError = e as Error;
      console.log(`[translate] ${slug}: attempt ${attempt} failed: ${(e as Error).message}`);
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
  throw lastError ?? new Error("Translation failed after 3 attempts");
}

/** Translate a large chapter by splitting it into ~2000-word chunks at
 *  paragraph boundaries, translating each chunk, then reassembling. */
async function translateLargeChapter(
  zai: Awaited<ReturnType<typeof ZAI.create>>,
  slug: string,
  englishText: string,
): Promise<string> {
  // Split into paragraphs
  const paragraphs = englishText.split(/\n{2,}/);
  // Group into chunks of ~400 words each (very small for reliability)
  const chunks: string[] = [];
  let currentChunk: string[] = [];
  let currentWords = 0;
  for (const para of paragraphs) {
    const paraWords = para.split(/\s+/).filter(Boolean).length;
    if (currentWords + paraWords > 400 && currentChunk.length > 0) {
      chunks.push(currentChunk.join("\n\n"));
      currentChunk = [para];
      currentWords = paraWords;
    } else {
      currentChunk.push(para);
      currentWords += paraWords;
    }
  }
  if (currentChunk.length > 0) chunks.push(currentChunk.join("\n\n"));

  console.log(`[translate] ${slug}: split into ${chunks.length} chunks`);

  const translatedChunks: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    console.log(`[translate] ${slug}: translating chunk ${i + 1}/${chunks.length}...`);
    let chunkError: Error | null = null;
    let chunkTranslated = false;
    for (let attempt = 1; attempt <= 3 && !chunkTranslated; attempt++) {
      try {
        const completion = await zai.chat.completions.create({
          messages: [
            { role: "system", content: SYSTEM_PROMPT + "\n\nYou are translating a CHUNK of a larger chapter. Maintain consistency with surrounding chunks. Do not add headers or footers." },
            { role: "user", content: `Translate this text chunk to neutral LATAM Spanish (chunk ${i + 1} of ${chunks.length}):\n\n${chunks[i]}` },
          ],
          thinking: { type: "disabled" },
          temperature: 0.3,
          max_tokens: 4000,
        });
        const content = completion.choices[0]?.message?.content;
        if (!content || content.trim().length < 20) throw new Error(`Empty response for chunk ${i + 1}`);
        const cleaned = content
          .replace(/^```(?:markdown)?\s*\n/i, "")
          .replace(/\n```\s*$/i, "")
          .trim();
        translatedChunks.push(cleaned);
        chunkTranslated = true;
      } catch (e) {
        chunkError = e as Error;
        console.log(`[translate] ${slug}: chunk ${i + 1} attempt ${attempt} failed: ${(e as Error).message}`);
        await new Promise((r) => setTimeout(r, 2000 * attempt));
      }
    }
    if (!chunkTranslated) {
      throw chunkError ?? new Error(`Chunk ${i + 1} failed after 3 attempts`);
    }
  }

  return translatedChunks.join("\n\n");
}

async function validateTranslation(
  zai: Awaited<ReturnType<typeof ZAI.create>>,
  englishText: string,
  spanishText: string,
): Promise<{ issues: string[]; correctedText?: string }> {
  const validationPrompt = `You are a translation quality reviewer. Compare the English original with the Spanish translation and check for:

1. Missing paragraphs (count must match)
2. Missing footnotes (numbering must match)
3. Untranslated English words remaining
4. Country-specific Spanish (should be neutral LATAM)
5. Broken markdown formatting
6. Character names not in Spanish form

English original (first 2000 chars):
${englishText.slice(0, 2000)}

Spanish translation (first 2000 chars):
${spanishText.slice(0, 2000)}

If you find NO issues, respond with exactly: NO_ISSUES
If you find issues, respond with a JSON object: {"issues": ["issue1", "issue2"], "correctedText": "the full corrected Spanish text"}

Only include "correctedText" if the issues are minor and you can fix them. For major issues, leave correctedText empty.`;

  const completion = await zai.chat.completions.create({
    messages: [
      { role: "system", content: "You are a translation quality reviewer for Spanish (LATAM)." },
      { role: "user", content: validationPrompt },
    ],
    thinking: { type: "disabled" },
    temperature: 0.2,
    max_tokens: 16000,
  });
  const content = completion.choices[0]?.message?.content?.trim();
  if (!content) return { issues: ["Empty validation response"] };
  if (content === "NO_ISSUES" || content.startsWith("NO_ISSUES")) {
    return { issues: [] };
  }
  try {
    const match = content.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      return {
        issues: Array.isArray(parsed.issues) ? parsed.issues : [],
        correctedText: typeof parsed.correctedText === "string" ? parsed.correctedText : undefined,
      };
    }
  } catch {
    // Fall through
  }
  return { issues: ["Could not parse validation response"] };
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function countParagraphs(text: string): number {
  return text.split(/\n{2,}/).filter((p) => p.trim().length > 0).length;
}

function countFootnotes(text: string): number {
  const matches = text.match(/\[\^(\d+)\]/g);
  return matches ? new Set(matches.map((m) => m.match(/\d+/)?.[0])).size : 0;
}

async function main() {
  console.log("[translate] Initializing ZAI SDK...");
  const zai = await ZAI.create();

  // Ensure output directory exists
  if (!existsSync(ES_DIR)) {
    await mkdir(ES_DIR, { recursive: true });
  }

  // Get all English chapter files
  const files = (await readdir(BOOKS_DIR)).filter(
    (f) => f.endsWith(".md") && f.startsWith("odyssey-book-"),
  );
  files.sort();

  console.log(`[translate] Found ${files.length} chapters to translate`);

  const results: TranslationResult[] = [];

  for (const file of files) {
    const slug = file.replace(".md", "");
    const esPath = join(ES_DIR, file);

    // Skip if already translated (resumable)
    if (existsSync(esPath)) {
      const existing = await readFile(esPath, "utf-8");
      if (existing.length > 100) {
        console.log(`[translate] ${slug}: already translated, skipping`);
        results.push({
          slug,
          success: true,
          originalWords: 0,
          translatedWords: countWords(existing),
        });
        continue;
      }
    }

    console.log(`[translate] ${slug}: reading English original...`);
    const englishText = await readFile(join(BOOKS_DIR, file), "utf-8");
    const originalWords = countWords(englishText);

    try {
      // Pass 1: Translate
      console.log(`[translate] ${slug}: translating (${originalWords} words)...`);
      let spanishText = await translateChapter(zai, slug, englishText);
      console.log(`[translate] ${slug}: translation done (${countWords(spanishText)} words)`);

      // Structural validation (fast, no LLM call)
      const enParas = countParagraphs(englishText);
      const esParas = countParagraphs(spanishText);
      const enFootnotes = countFootnotes(englishText);
      const esFootnotes = countFootnotes(spanishText);

      if (enParas !== esParas) {
        console.log(`[translate] ${slug}: WARNING paragraph count mismatch (EN=${enParas}, ES=${esParas})`);
      }
      if (enFootnotes !== esFootnotes) {
        console.log(`[translate] ${slug}: WARNING footnote count mismatch (EN=${enFootnotes}, ES=${esFootnotes})`);
      }

      // Pass 2: Quick LLM correction pass only if structural issues found
      if (enParas !== esParas || enFootnotes !== esFootnotes) {
        console.log(`[translate] ${slug}: structural issues found, running correction pass...`);
        const validation = await validateTranslation(zai, englishText, spanishText);
        if (validation.issues.length > 0) {
          console.log(`[translate] ${slug}: found ${validation.issues.length} issues:`);
          for (const issue of validation.issues.slice(0, 3)) {
            console.log(`  - ${issue}`);
          }
          if (validation.correctedText && validation.correctedText.length > 100) {
            console.log(`[translate] ${slug}: applying corrections...`);
            spanishText = validation.correctedText;
          }
        }
      } else {
        console.log(`[translate] ${slug}: structural validation passed`);
      }

      // Save
      await writeFile(esPath, spanishText, "utf-8");
      console.log(`[translate] ${slug}: saved to ${esPath}`);

      results.push({
        slug,
        success: true,
        originalWords,
        translatedWords: countWords(spanishText),
      });
    } catch (e) {
      console.error(`[translate] ${slug}: FAILED — ${(e as Error).message}`);
      results.push({
        slug,
        success: false,
        originalWords,
        translatedWords: 0,
        error: (e as Error).message,
      });
    }

    // Small delay between chapters to avoid rate limiting
    await new Promise((r) => setTimeout(r, 1000));
  }

  // Summary
  console.log("\n========================================");
  console.log("TRANSLATION SUMMARY");
  console.log("========================================");
  const succeeded = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);
  console.log(`Succeeded: ${succeeded.length}/${results.length}`);
  console.log(`Failed: ${failed.length}/${results.length}`);
  if (failed.length > 0) {
    console.log("\nFailed chapters:");
    for (const f of failed) {
      console.log(`  - ${f.slug}: ${f.error}`);
    }
  }
  const totalWords = succeeded.reduce((sum, r) => sum + r.translatedWords, 0);
  console.log(`\nTotal translated words: ${totalWords.toLocaleString()}`);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
