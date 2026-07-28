#!/bin/bash
# Translate a single chapter using z-ai CLI (one paragraph at a time for resilience)
# Usage: bash scripts/translate-chapter.sh <slug>

SLUG="$1"
if [ -z "$SLUG" ]; then
  echo "Usage: translate-chapter.sh <slug>"
  exit 1
fi

EN_FILE="/home/z/my-project/public/books/${SLUG}.md"
ES_FILE="/home/z/my-project/public/books/es/${SLUG}.md"
ES_DIR="/home/z/my-project/public/books/es"

mkdir -p "$ES_DIR"

if [ -f "$ES_FILE" ]; then
  echo "$SLUG: already translated"
  exit 0
fi

echo "$SLUG: starting translation"

# Read the English file and split into paragraphs
# Use bun to do the splitting and call z-ai for each chunk
bun -e "
import { readFile, writeFile } from 'fs/promises';
const en = await readFile('${EN_FILE}', 'utf-8');
const paras = en.split(/\n{2,}/);
const chunks = [];
let cur = [], curW = 0;
for (const p of paras) {
  const w = p.split(/\s+/).filter(Boolean).length;
  if (curW + w > 300 && cur.length > 0) { chunks.push(cur.join('\n\n')); cur = [p]; curW = w; }
  else { cur.push(p); curW += w; }
}
if (cur.length > 0) chunks.push(cur.join('\n\n'));

const SYS = 'You are a literary translator. Translate the given text from English to neutral LATAM Spanish (Latinoamérica). Use Spanish character names: Odiseo, Telémaco, Penélope, Zeus, Atenea, Poseidón, Hermes, Agamenón, Menelao, Helena, Calipso, Circe, Nausícaa, Alcínoo, Eumeo, Euriclea, Antinoo, Eurímaco, Polifemo, Néstor, Egisto, Clitemnestra, Orestes, Troya, Ítaca, Esparta, Pilos. Use tú/ustedes. Preserve ALL markdown formatting (#, ##, ###, ---, *italic*, **bold**, [^n]). Return ONLY the translation, no preamble.';

const ZAI = (await import('z-ai-web-dev-sdk')).default;
const zai = await ZAI.create();

const results = [];
for (let i = 0; i < chunks.length; i++) {
  try {
    const c = await zai.chat.completions.create({
      messages: [{role:'system',content:SYS},{role:'user',content:'Translate to Spanish:\n\n' + chunks[i]}],
      thinking: {type:'disabled'}, temperature: 0.3, max_tokens: 3000,
    });
    let t = c.choices[0]?.message?.content || '';
    t = t.replace(/^\`\`\`(?:markdown)?\s*\n/i,'').replace(/\n\`\`\`\s*$/i,'').trim();
    if (t.length < 10) throw new Error('too short');
    results.push(t);
    if ((i+1) % 5 === 0) console.log('${SLUG}: ' + (i+1) + '/' + chunks.length + ' chunks done');
  } catch(e) {
    console.error('${SLUG}: chunk ' + (i+1) + ' failed: ' + e.message);
    results.push(chunks[i]); // fallback to English
  }
}
const out = results.join('\n\n');
await writeFile('${ES_FILE}', out, 'utf-8');
console.log('${SLUG}: saved (' + out.split(/\s+/).filter(Boolean).length + ' words)');
" 2>&1
