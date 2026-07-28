/**
 * Export API — generates Markdown / JSON of the user's bookmarks + annotations.
 * -----------------------------------------------------------------------
 * GET /api/export?format=markdown  →  text/markdown
 * GET /api/export?format=json      →  application/json
 *
 * The body comes from the `?state=` query param (URL-encoded JSON of the
 * persisted state from localStorage). This keeps the API stateless — the
 * client sends its own state, the server formats it.
 */
import { NextRequest, NextResponse } from "next/server";

interface PersistedState {
  bookmarks: string[];
  annotations: Record<string, string>;
  editor?: {
    blockCorrections: Record<string, string>;
    merges: Array<{ fromId: string; toId: string; createdAt: string }>;
    narratorOverrides: Record<string, { name?: string; color?: string }>;
  };
}

export async function GET(req: NextRequest) {
  const format = req.nextUrl.searchParams.get("format") || "markdown";
  const stateParam = req.nextUrl.searchParams.get("state");

  if (!stateParam) {
    return NextResponse.json({ error: "Missing 'state' query param" }, { status: 400 });
  }

  let state: PersistedState;
  try {
    state = JSON.parse(decodeURIComponent(stateParam));
  } catch {
    return NextResponse.json({ error: "Invalid JSON in 'state' param" }, { status: 400 });
  }

  if (format === "json") {
    return NextResponse.json(
      {
        exportedAt: new Date().toISOString(),
        bookmarks: state.bookmarks || [],
        annotations: state.annotations || {},
        editorCorrections: state.editor?.blockCorrections || {},
        editorMerges: state.editor?.merges || [],
      },
      { headers: { "Content-Disposition": `attachment; filename="odyssey-export.json"` } },
    );
  }

  // Markdown format
  const md = generateMarkdown(state);
  return new NextResponse(md, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="odyssey-export.md"`,
    },
  });
}

function generateMarkdown(state: PersistedState): string {
  const lines: string[] = [
    "# The AI Odyssey — Reader Export",
    "",
    `Exported: ${new Date().toISOString()}`,
    "",
  ];

  // Bookmarks
  const bookmarks = state.bookmarks || [];
  lines.push(`## Bookmarks (${bookmarks.length})`);
  lines.push("");
  if (bookmarks.length === 0) {
    lines.push("_No bookmarks._");
  } else {
    for (const blockId of bookmarks) {
      const [slug, idx] = blockId.split(":");
      const chapterLabel = slug.replace("odyssey-book-", "Book ").replace("-preface", " (Preface)");
      lines.push(`- **${chapterLabel}** — block #${idx} (\`${blockId}\`)`);
    }
  }
  lines.push("");

  // Annotations
  const annotations = state.annotations || {};
  const annotEntries = Object.entries(annotations);
  lines.push(`## Annotations (${annotEntries.length})`);
  lines.push("");
  if (annotEntries.length === 0) {
    lines.push("_No annotations._");
  } else {
    for (const [blockId, text] of annotEntries) {
      const [slug, idx] = blockId.split(":");
      const chapterLabel = slug.replace("odyssey-book-", "Book ").replace("-preface", " (Preface)");
      lines.push(`### ${chapterLabel} — block #${idx}`);
      lines.push("");
      lines.push(`> ${text.replace(/\n/g, "\n> ")}`);
      lines.push("");
      lines.push(`_Block ID: \`${blockId}\`_`);
      lines.push("");
    }
  }

  // Editor corrections
  const corrections = state.editor?.blockCorrections || {};
  const correctionEntries = Object.entries(corrections);
  if (correctionEntries.length > 0) {
    lines.push(`## Narrator Corrections (${correctionEntries.length})`);
    lines.push("");
    lines.push("| Block | Corrected Narrator |");
    lines.push("|-------|--------------------|");
    for (const [blockId, narratorId] of correctionEntries) {
      lines.push(`| \`${blockId}\` | \`${narratorId}\` |`);
    }
    lines.push("");
  }

  // Merges
  const merges = state.editor?.merges || [];
  if (merges.length > 0) {
    lines.push(`## Narrator Merges (${merges.length})`);
    lines.push("");
    for (const m of merges) {
      lines.push(`- \`${m.fromId}\` → \`${m.toId}\` (at ${m.createdAt})`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
