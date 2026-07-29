/**
 * Client-side export utilities.
 * Generates Markdown / JSON of the user's bookmarks + annotations
 * directly in the browser (no server needed — works on GitHub Pages).
 */

interface ExportState {
  bookmarks: string[];
  annotations: Record<string, string>;
  editor?: {
    blockCorrections: Record<string, string>;
    merges: Array<{ fromId: string; toId: string; createdAt: string }>;
    narratorOverrides: Record<string, { name?: string; color?: string }>;
  };
}

/** Generate Markdown export of bookmarks + annotations + corrections. */
export function generateMarkdownExport(state: ExportState): string {
  const lines: string[] = [
    "# The AI Odyssey — Reader Export",
    "",
    `Exported: ${new Date().toISOString()}`,
    "",
  ];

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

/** Generate JSON export. */
export function generateJsonExport(state: ExportState): string {
  return JSON.stringify({
    exportedAt: new Date().toISOString(),
    bookmarks: state.bookmarks || [],
    annotations: state.annotations || {},
    editorCorrections: state.editor?.blockCorrections || {},
    editorMerges: state.editor?.merges || [],
  }, null, 2);
}

/** Trigger a browser download of the given text content. */
export function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
