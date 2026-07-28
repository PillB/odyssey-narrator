"use client";

import { useOdysseyStore } from "@/lib/odyssey/store";
import { CHAPTER_MANIFEST } from "@/lib/odyssey/chapters";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bookmark, MessageSquare, Trash2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BookmarksPanelProps {
  onJump: (chapterId: string, blockId: string) => void;
}

/**
 * BookmarksPanel — shows the reader's saved bookmarks + annotations.
 * Click an entry to jump to that block.
 * Export button downloads all saved data as Markdown or JSON.
 */
export function BookmarksPanel({ onJump }: BookmarksPanelProps) {
  const bookmarks = useOdysseyStore((s) => s.bookmarks);
  const annotations = useOdysseyStore((s) => s.annotations);
  const toggleBookmark = useOdysseyStore((s) => s.toggleBookmark);
  const setAnnotation = useOdysseyStore((s) => s.setAnnotation);
  const editor = useOdysseyStore((s) => s.editor);
  const chapters = useOdysseyStore((s) => s.chapters);

  /** Look up the chapter label + paragraph text for a block id. */
  const resolveBlock = (blockId: string) => {
    const [slug, idxStr] = blockId.split(":");
    const idx = parseInt(idxStr, 10);
    const ch = chapters.get(slug);
    if (!ch) return null;
    const block = ch.blocks[idx];
    if (!block) return null;
    const meta = CHAPTER_MANIFEST.find((c) => c.slug === slug);
    return {
      chapterLabel: meta?.label ?? slug,
      text: block.text.slice(0, 140) + (block.text.length > 140 ? "…" : ""),
      block,
    };
  };

  const bookmarked = bookmarks.map(resolveBlock).filter(Boolean);
  const annotated = Object.entries(annotations).map(([blockId, text]) => ({
    blockId,
    text,
    ...resolveBlock(blockId)!,
  }));

  /** Export bookmarks + annotations + corrections as Markdown or JSON. */
  const exportData = async (format: "markdown" | "json") => {
    const stateParam = encodeURIComponent(
      JSON.stringify({
        bookmarks,
        annotations,
        editor: {
          blockCorrections: editor.blockCorrections,
          merges: editor.merges,
          narratorOverrides: editor.narratorOverrides,
        },
      }),
    );
    const url = `/api/export?format=${format}&state=${stateParam}`;
    const res = await fetch(url);
    if (!res.ok) {
      alert("Export failed: " + (await res.text()));
      return;
    }
    const blob = await res.blob();
    const disposition = res.headers.get("Content-Disposition") || "";
    const filenameMatch = disposition.match(/filename="?([^"]+)"?/);
    const filename = filenameMatch?.[1] || `odyssey-export.${format === "markdown" ? "md" : "json"}`;
    // Trigger download
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b flex items-center justify-between">
        <h2 className="text-xs uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
          <Bookmark className="h-3.5 w-3.5" /> Saved
        </h2>
        {(bookmarks.length > 0 || Object.keys(annotations).length > 0) && (
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[10px] px-2"
              onClick={() => exportData("markdown")}
              title="Export as Markdown"
            >
              <Download className="h-3 w-3 mr-1" /> .md
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[10px] px-2"
              onClick={() => exportData("json")}
              title="Export as JSON"
            >
              <Download className="h-3 w-3 mr-1" /> .json
            </Button>
          </div>
        )}
      </div>
      <ScrollArea className="flex-1 odyssey-scroll">
        <div className="py-2">
          {/* Bookmarks */}
          <section>
            <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground sticky top-0 bg-sidebar/80 backdrop-blur-sm">
              Bookmarks ({bookmarked.length})
            </div>
            {bookmarked.length === 0 ? (
              <p className="px-3 py-4 text-[11px] text-muted-foreground/70 text-center">
                Hover any paragraph and click the bookmark icon to save it here.
              </p>
            ) : (
              <ul>
                {bookmarked.map((b) => (
                  <li key={b!.block.id} className="group">
                    <button
                      className="w-full text-left px-3 py-2 hover:bg-sidebar-accent/50 transition-colors"
                      onClick={() => onJump(b!.block.chapterId, b!.block.id)}
                    >
                      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                        <Bookmark className="h-2.5 w-2.5 text-amber-600 dark:text-amber-400" fill="currentColor" />
                        <span className="font-medium">{b!.chapterLabel}</span>
                      </div>
                      <p className="text-xs mt-0.5 line-clamp-2 italic">{b!.text}</p>
                    </button>
                    <button
                      className="ml-3 mb-1 text-[10px] text-muted-foreground hover:text-destructive inline-flex items-center gap-1 opacity-0 group-hover:opacity-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleBookmark(b!.block.id);
                      }}
                    >
                      <Trash2 className="h-2.5 w-2.5" /> Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Annotations */}
          <section className="mt-2 border-t">
            <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground sticky top-0 bg-sidebar/80 backdrop-blur-sm flex items-center gap-1">
              <MessageSquare className="h-2.5 w-2.5" />
              Annotations ({annotated.length})
            </div>
            {annotated.length === 0 ? (
              <p className="px-3 py-4 text-[11px] text-muted-foreground/70 text-center">
                Hover any paragraph and click the annotation icon to add a note.
              </p>
            ) : (
              <ul>
                {annotated.map((a) => (
                  <li key={a.blockId} className="group px-3 py-2 hover:bg-sidebar-accent/50 transition-colors cursor-pointer" onClick={() => onJump(a.block.chapterId, a.block.id)}>
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      <span className="font-medium">{a.chapterLabel}</span>
                    </div>
                    <p className="text-[11px] mt-0.5 line-clamp-1 italic text-muted-foreground">↳ {a.text}</p>
                    <p className="text-xs mt-1 line-clamp-3 bg-blue-50/40 dark:bg-blue-950/15 border-l-2 border-blue-400/60 dark:border-blue-700/60 pl-2 py-1 rounded-r whitespace-pre-wrap">
                      {a.text ? a.text : <span className="italic text-muted-foreground/60">[empty]</span>}
                    </p>
                    <button
                      className="mt-1 text-[10px] text-muted-foreground hover:text-destructive inline-flex items-center gap-1 opacity-0 group-hover:opacity-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        setAnnotation(a.blockId, "");
                      }}
                    >
                      <Trash2 className="h-2.5 w-2.5" /> Delete
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </ScrollArea>
    </div>
  );
}
