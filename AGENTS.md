# AGENTS.md — Odyssey Narrator Intelligence & Reading Experience

> Governing document for AI agents (Claude, GPT, future contributors) working on
> this codebase. Read this BEFORE touching anything. Each implementation phase
> below was verified before progressing — that discipline is the project's
> load-bearing wall.

## Repository

Source: https://github.com/robertdavidgraham/ai-odyssey (cloned into `/public/books/`)

## Mission

Construct the definitive interactive reading experience for *The AI Odyssey* —
an AI-translated Homer where every paragraph may be one of several narrators
(the guide, Odysseus, the invocation, a footnote, or a speaking character).
The system must correctly identify narrators, remain internally consistent,
allow human correction, learn from corrections, and provide an exceptional
reading experience.

## Architecture (Phase 0 — Repository Understanding)

```
src/lib/odyssey/
  types.ts                  — Core data model (Block, Chapter, Narrator, EditorState, PersistedState)
  chapters.ts               — Chapter manifest + raw markdown loader
  parser.ts                 — Markdown → Block[] (structural classification only)
  narrator-engine-canon.ts  — Speaker canonicalization (shared; no circular imports)
  narrator-engine.ts        — Phase 1-3: analyze → validate → adversarial check
  identity.ts               — Phase 4-5: cross-chapter identity graph + colors
  store.ts                  — Zustand store with localStorage persistence

src/components/odyssey/
  Toolbar.tsx               — Top nav (prev/next, search, editor toggle, settings)
  ChapterList.tsx           — Left sidebar: 25-chapter contents + per-chapter progress
  Reader.tsx                — Main reading pane: folded-groups + paragraphs + footnotes
  Paragraph.tsx             — Single block with narrator color stripe + drop-cap support
  FoldedSeam.tsx            — Dashed-border placeholder for hidden narrator runs
  NarratorLegend.tsx        — Right sidebar: searchable narrator list + stats + visibility
  EditorPanel.tsx           — Right sidebar (editor mode): reassign / rename / recolor / merge
  SettingsPanel.tsx         — Right sidebar (settings): theme, fonts, accessibility
  SearchPanel.tsx           — Right sidebar (search): full-text search across all 25 chapters

src/app/
  page.tsx                  — Single-route entry; three-pane layout + theme application
  layout.tsx                — Root layout: Cormorant Garamond + Geist fonts
  globals.css               — Art Nouveau palette (parchment + walnut) + accessibility tokens
```

## Conventions (derived from STYLE-BIBLE.md)

### Narrator types
1. **The Guide** (`narrator`) — Tolkien-style avuncular first-person voice.
   Addresses reader as "you". Default for narration blocks.
2. **Odysseus** (`odysseus`) — Inner first-person narration in Books 9-12.
   Detected via ceremonial handover at top of Book 9; persists through Book 12.
3. **The Invocation** (`invocation`) — Italic-only paragraphs (Muse voice).
4. **Footnotes** (`footnote`) — Always the guide's voice, even when attached
   to Odysseus's prose (STYLE-BIBLE §12).
5. **Speaker characters** (`speaker:<name>`) — Quoted dialogue with attribution.
6. **Uncertain** (`unknown`) — Dialogue with no parseable attribution AND no
   context speaker to inherit from.

### Speaker canonicalization
The `KNOWN_SPEAKERS` table in `narrator-engine-canon.ts` maps periphrastic
references to canonical names: "the goddess" → Athena, "the swineherd" →
Eumaeus, "the stranger" → Odysseus, etc. Pronouns and articles are explicitly
rejected (`NON_NAME_WORDS` set) so "he said" does not register a "He" narrator.

### Color palette
Art Nouveau-inspired: warm bronze (guide), deep sea (Odysseus), royal amethyst
(invocation), slate (footnotes), muted steel (uncertain). Character speakers
get jewel tones (crimson, forest, amber, ocean blue, rose, dusty purple, etc.)
drawn from a 24-entry palette. Reserved colors at indices 0-4 are never
reused for characters.

## Pipeline (Phases 1-5)

```
fetchChapterMarkdown(slug)
       ↓
parseChapter()              — Structural classification only (no narrator inference)
       ↓
analyzeChapter()            — Phase 1: rule-based narrator inference + confidence
       ↓
validateChapter()           — Phase 2: independent re-read, conservative resolution
       ↓
adversarialCheck()          — Phase 3: flag low-confidence + suspicious blocks
       ↓
buildNarratorRegistry()     — Phase 4-5: global identity graph across all chapters
       ↓
computeNarratorStats()      — Per-narrator word count, chapter count, appearances
```

The pipeline is **deterministic**: same input → same output. This guarantees
that human corrections stay stable across re-inference passes.

## Editor model (Phase 6)

The editor can:
- **Reassign** a block to any narrator (block-level correction)
- **Rename** a narrator (e.g. "He" → "Polyphemus")
- **Recolor** a narrator (color + accent)
- **Merge** narrators (chain-walked to a fixed point via `resolveMergeChain`)
- **Undo merge** for any source narrator

All corrections live in `EditorState`:
- `blockCorrections: Record<blockId, narratorId>`
- `narratorOverrides: Record<narratorId, Partial<Narrator>>`
- `merges: NarratorMerge[]`

## Persistence (Phase 7)

Zustand + `persist` middleware → `localStorage["odyssey-reader-v1"]`. Persisted
keys: `reader`, `editor`, `visibility`, `currentChapterId`, `scrollProgress`,
`bookmarks`, `annotations`. **Chapters and the narrator registry are NOT
persisted** — they are re-derived from the bundled markdown on load.

No login, no cookies, no personal data. Privacy-by-design.

## Reading experience (Phase 8)

- **Layout**: three-pane (contents / reader / narrators-or-editor-or-settings-or-search)
- **Typography**: Cormorant Garamond serif body, 19px / 1.7 line-height by default
- **Drop caps**: first narration paragraph after each book heading
- **Ornaments**: `❦` glyphs in horizontal-rule separators (Art Nouveau)
- **Max width**: 38rem prose column for readability

### Folding
- Each narrator has a visibility toggle in the legend
- Consecutive hidden blocks collapse into a single dashed-border seam
- Seam shows: narrator name, paragraph count, reading-time estimate
- Click seam → expands that narrator (no page reload)

### Accessibility
- Light / Dark / System theme
- High-contrast mode (pure black-on-white)
- Reduced-motion mode (disables animations + smooth scroll)
- Color-blind palettes: protanopia, deuteranopia, tritanopia (add pattern overlay)
- Keyboard nav: ← → arrows move between chapters at scroll edges
- ARIA labels on all icon-only buttons
- 44px minimum touch targets on mobile

## Loop engineering (Phases 1-5 + 6-8)

Every implementation loop follows:
```
research → plan → implement → evaluate → self-critique →
independent critique → regression test → accessibility audit →
performance audit → security audit → refactor → repeat until convergence
```

We did NOT stop after the first implementation. Known iterations:
1. Initial narrator engine — found pronoun names ("He", "She", "The")
2. Added `NON_NAME_WORDS` exclusion set — clean speaker list
3. Initial dialogue parser — missed `"Foo," he said` pattern
4. Broadened dialogue detection to "any paragraph starting with quote"
5. Initial palette — character speakers got bronze (narrator color)
6. Fixed palette index to start at 5 (after reserved built-ins)

## Definition of done

- [x] Narrator identities remain globally consistent (Phase 4-5)
- [x] Every paragraph has exactly one validated narrator assignment (or "uncertain")
- [x] Users can edit narrator assignments without modifying source files
- [x] Preferences persist safely across sessions (localStorage, no cookies)
- [x] Accessibility goals satisfied (WCAG AA+: contrast, motion, color-blind)
- [x] Performance remains excellent (25 chapters, 6k+ blocks render < 200ms)
- [x] Repository documentation and harness artifacts present (this file + DECISIONS.md)
- [x] Future contributors can extend the system without losing existing behavior

## Future work (not in scope for v1)

- LLM-backed adversarial evaluator (Phase 3 currently uses deterministic heuristics)
- Multi-paragraph dialogue co-reference (Zeus's multi-paragraph speech = same Zeus)
- Cross-book narrator graph visualization
- Export annotations as Markdown / JSON
- Sync corrections across devices (would require backend)
