# The AI Odyssey — Intelligent Reader

An interactive reading experience for an AI-translated Homer's *Odyssey*, with multi-narrator detection, folding, an editor mode, bilingual support (English / Spanish LATAM), and accessibility-first design.

**Live site**: [GitHub Pages](https://odyssey-narrator.github.io/odyssey-narrator/)

## Features

### Multi-Narrator Intelligence
Every paragraph is classified by narrator:
- **The Guide** — the primary Tolkien-style avuncular narrator
- **Odysseus** — inner first-person narration in Books 9–12
- **The Invocation** — italic Muse invocations
- **Footnotes** — explanatory notes (always the guide's voice)
- **Character speakers** — quoted dialogue attributed to Zeus, Athena, etc.

Each narrator gets a unique color stripe. Every classification is correctable in the editor.

### Bilingual (English / Spanish LATAM)
- Toggle between English and neutral LATAM Spanish with the **EN / ES** button in the toolbar
- All 25 chapters translated using AI with validation + correction passes
- Spanish uses neutral international Spanish (no country-specific slang)

### Editor Mode
- Click any paragraph to inspect its narrator + confidence + reasoning
- Reassign narrator via dropdown
- Rename and recolor narrators
- Merge narrators (with chain-walking)
- "Ask LLM to critique" — adversarial evaluation via z-ai-web-dev-sdk (server-only)
- Reset all corrections

### Folding System
- Hide any narrator to fold their paragraphs into elegant dashed-border seams
- Seams show narrator name, paragraph count, and reading-time estimate
- Click a seam to expand

### Bookmarks & Annotations
- Hover any paragraph → bookmark + annotation icons appear in the left margin
- Annotations render as a styled bubble below the paragraph
- All data persists to localStorage (no login, no cookies)
- Export as Markdown or JSON (client-side, works on GitHub Pages)

### Search
- Full-text search across all 25 chapters
- Results show chapter + narrator + snippet
- Click to jump + highlight

### Accessibility
- Light / Dark / System theme
- High-contrast mode
- Reduced motion mode
- Color-blind palettes (protanopia, deuteranopia, tritanopia)
- Keyboard navigation (← → arrows at scroll edges)
- ARIA labels on all icon-only buttons
- Art Nouveau-inspired palette (parchment + walnut)

## Tech Stack
- **Framework**: Next.js 16 with App Router
- **Language**: TypeScript 5
- **Styling**: Tailwind CSS 4 + shadcn/ui
- **State**: Zustand with localStorage persistence
- **Typography**: Cormorant Garamond (serif) + Geist (sans)
- **Testing**: Bun test (59 unit tests) + Playwright (62 E2E tests)
- **AI**: z-ai-web-dev-sdk (LLM adversarial evaluator, Spanish translation)

## Project Structure
```
src/
  app/
    page.tsx                    — Single-route 3-pane reading layout
    layout.tsx                  — Root layout with fonts
    globals.css                 — Art Nouveau palette + accessibility tokens
    api/
      evaluator/route.ts        — LLM adversarial evaluator (server-only)
  components/odyssey/
    Toolbar.tsx                 — Top nav with EN/ES toggle
    ChapterList.tsx             — Left sidebar: 25 chapters
    Reader.tsx                  — Main reading pane
    Paragraph.tsx               — Block renderer + bookmark/annotation UI
    FoldedSeam.tsx              — Dashed-border placeholder for hidden narrators
    NarratorLegend.tsx          — Right sidebar: narrator list + stats
    EditorPanel.tsx             — Right sidebar: narrator correction tools
    SettingsPanel.tsx           — Right sidebar: theme, font, accessibility
    SearchPanel.tsx             — Right sidebar: full-text search
    BookmarksPanel.tsx          — Right sidebar: bookmarks + annotations + export
  lib/odyssey/
    types.ts                    — Core data model
    chapters.ts                 — Chapter manifest + multilingual loader
    parser.ts                   — Markdown → Block[] classifier
    narrator-engine.ts          — Phase 1-3: inference + validation + adversarial
    narrator-engine-canon.ts    — Speaker canonicalization
    identity.ts                 — Phase 4-5: cross-chapter identity graph
    store.ts                    — Zustand store with persistence
    export-utils.ts             — Client-side Markdown/JSON export
public/books/                   — English markdown (25 chapters)
public/books/es/                — Spanish LATAM markdown (25 chapters)
scripts/
  playwright-direct.ts          — 62-test E2E suite
  translate-spanish.ts          — AI translation script
```

## Development
```bash
bun install
bun run dev          # Dev server on :3000
bun run lint         # ESLint
bun test src/        # Unit tests (59)
bun scripts/playwright-direct.ts  # E2E tests (62)
```

## Deployment (GitHub Pages)
The app is configured for static export. Push to `main` triggers the GitHub Actions workflow (`.github/workflows/deploy.yml`) which:
1. Builds the static export with `GITHUB_ACTIONS=true`
2. Adds `.nojekyll` to bypass Jekyll processing
3. Uploads the `out/` directory as a Pages artifact
4. Deploys to GitHub Pages

The `basePath` and `assetPrefix` are set to `/<repo-name>/` when `GITHUB_ACTIONS=true`.

## Source
Based on [robertdavidgraham/ai-odyssey](https://github.com/robertdavidgraham/ai-odyssey) — an AI translation of Homer's Odyssey following a detailed [style bible](https://github.com/robertdavidgraham/ai-odyssey/blob/master/STYLE-BIBLE.md).

## License
The source Odyssey text is from the original repository. The reader application code is MIT.
