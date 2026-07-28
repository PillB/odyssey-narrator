#!/usr/bin/env bun
/**
 * Translate a SINGLE chapter to Spanish. Called by translate-all.sh.
 * Usage: bun scripts/translate-one.ts <slug>
 */
import ZAI from "z-ai-web-dev-sdk";
import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";

const slug = process.argv[2];
if (!slug) {
  console.error("Usage: translate-one.ts <slug>");
  process.exit(1);
}

const BOOKS_DIR = "/home/z/my-project/public/books";
const ES_DIR = "/home/z/my-project/public/books/es";
const enPath = `${BOOKS_DIR}/${slug}.md`;
const esPath = `${ES_DIR}/${slug}.md`;

if (existsSync(esPath)) {
  console.log(`${slug}: already translated, skipping`);
  process.exit(0);
}

const SYSTEM_PROMPT = `You are an expert literary translator specializing in Spanish (Latinoamérica — neutral international Spanish, NOT country-specific).

Translate the given English text from Homer's Odyssey (a modern prose retelling) into neutral international Spanish.

RULES:
1. Use neutral LATAM Spanish. Avoid country-specific slang. Use "ustedes" for plural you, "tú" for singular.
2. Character names in Spanish: Odiseo, Telémaco, Penélope, Zeus, Atenea, Poseidón, Hermes, Apolo, Agamenón, Menelao, Helena, Calipso, Circe, Nausícaa, Alcínoo, Arete, Eumeo, Euriclea, Antinoo, Eurímaco, Polifemo, Tirsesias, Elpénor, Anticlea, Femio, Médon, Méntor, Teoclímeno, Laertes, Néstor, Egisto, Clitemnestra, Orestes, Troya, Ítaca, Esparta, Pilos.
3. Preserve the narrator's warm, direct voice addressing the reader as "tú".
4. Preserve ALL markdown formatting: #, ##, ###, ---, *italic*, **bold**, [^n] footnote refs.
5. Keep the same paragraph structure and footnote numbering.
6. Translate faithfully, not word-for-word.

Return ONLY the translated markdown. No preamble, no code fences.`;

async function translateChunk(zai: any, text: string, chunkNum: number, total: number): Promise<string> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const completion = await zai.chat.completions.create({
        messages: [
          { role: "system", content: SYSTEM_PROMPT + (total > 1 ? "\n\nYou are translating a CHUNK of a larger chapter. Maintain consistency." : "") },
          { role: "user", content: total > 1 ? `Translate this chunk (${chunkNum} of ${total}) to neutral LATAM Spanish:\n\n${text}` : `Translate this chapter to neutral LATAM Spanish:\n\n${text}` },
        ],
        thinking: { type: "disabled" },
        temperature: 0.3,
        max_tokens: 4000,
      });
      const content = completion.choices[0]?.message?.content;
      if (!content || content.trim().length < 20) throw new Error("Empty response");
      return content.replace(/^```(?:markdown)?\s*\n/i, "").replace(/\n```\s*$/i, "").trim();
    } catch (e) {
      console.error(`${slug}: chunk ${chunkNum} attempt ${attempt} failed: ${(e as Error).message}`);
      if (attempt < 3) await new Promise((r) => setTimeout(r, 2000 * attempt));
      else throw e;
    }
  }
  throw new Error("unreachable");
}

async function main() {
  if (!existsSync(ES_DIR)) await mkdir(ES_DIR, { recursive: true });
  const englishText = await readFile(enPath, "utf-8");
  const wordCount = englishText.split(/\s+/).filter(Boolean).length;
  console.log(`${slug}: ${wordCount} words`);

  const zai = await ZAI.create();

  // Split into ~400-word chunks at paragraph boundaries
  const paragraphs = englishText.split(/\n{2,}/);
  const chunks: string[] = [];
  let currentChunk: string[] = [];
  let currentWords = 0;
  for (const para of paragraphs) {
    const pw = para.split(/\s+/).filter(Boolean).length;
    if (currentWords + pw > 400 && currentChunk.length > 0) {
      chunks.push(currentChunk.join("\n\n"));
      currentChunk = [para];
      currentWords = pw;
    } else {
      currentChunk.push(para);
      currentWords += pw;
    }
  }
  if (currentChunk.length > 0) chunks.push(currentChunk.join("\n\n"));

  console.log(`${slug}: ${chunks.length} chunks`);

  const translated: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    process.stdout.write(`${slug}: chunk ${i + 1}/${chunks.length}... `);
    const t = await translateChunk(zai, chunks[i], i + 1, chunks.length);
    translated.push(t);
    console.log("done");
  }

  const result = translated.join("\n\n");
  await writeFile(esPath, result, "utf-8");
  console.log(`${slug}: saved (${result.split(/\s+/).filter(Boolean).length} words)`);
}

main().catch((e) => {
  console.error(`${slug}: FATAL — ${e.message}`);
  process.exit(1);
});
