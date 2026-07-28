"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Eye, EyeOff, Search, ChevronDown, ChevronRight } from "lucide-react";
import { useOdysseyStore } from "@/lib/odyssey/store";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/**
 * NarratorLegend — interactive list of every narrator in the book with
 * visibility toggle, word count, chapter count, and search.
 */
export function NarratorLegend() {
  const narratorRegistry = useOdysseyStore((s) => s.narratorRegistry);
  const narratorStats = useOdysseyStore((s) => s.narratorStats);
  const visibility = useOdysseyStore((s) => s.visibility);
  const toggleVisibility = useOdysseyStore((s) => s.toggleNarratorVisibility);
  const setCurrentChapter = useOdysseyStore((s) => s.setCurrentChapter);
  const editorOverrides = useOdysseyStore((s) => s.editor.narratorOverrides);
  const [query, setQuery] = useState("");
  const [showHidden, setShowHidden] = useState(false);

  // Sort: builtins first, then by word count descending.
  const narrators = [...narratorRegistry]
    .map((n) => {
      const override = editorOverrides[n.id];
      return override ? ({ ...n, ...override } as typeof n) : n;
    })
    .sort((a, b) => {
      if (a.builtin !== b.builtin) return a.builtin ? -1 : 1;
      const aWords = narratorStats.get(a.id)?.wordCount ?? 0;
      const bWords = narratorStats.get(b.id)?.wordCount ?? 0;
      return bWords - aWords;
    });

  const filtered = narrators.filter((n) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      n.name.toLowerCase().includes(q) ||
      n.id.toLowerCase().includes(q) ||
      (n.description ?? "").toLowerCase().includes(q)
    );
  });

  const totalWords = Array.from(narratorStats.values()).reduce(
    (s, n) => s + n.wordCount,
    0,
  );

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b">
        <h2 className="text-xs uppercase tracking-widest text-muted-foreground mb-2">
          Narrators
        </h2>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search narrators..."
            className="h-7 pl-7 text-xs"
            aria-label="Search narrators"
          />
        </div>
        <div className="flex items-center justify-between mt-2 text-[10px] text-muted-foreground">
          <span>{filtered.length} shown · {narratorRegistry.length} total</span>
          <span>{(totalWords / 1000).toFixed(1)}k words</span>
        </div>
      </div>
      <ScrollArea className="flex-1 odyssey-scroll">
        <ul className="py-1">
          {filtered.map((n) => {
            const stats = narratorStats.get(n.id);
            const isHidden = visibility[n.id] === false;
            return (
              <li
                key={n.id}
                className="group flex items-start gap-2 px-3 py-2 hover:bg-sidebar-accent/50 transition-colors"
              >
                <button
                  onClick={() => toggleVisibility(n.id)}
                  className="mt-0.5 shrink-0 p-1 rounded hover:bg-sidebar-accent transition-colors"
                  aria-label={isHidden ? `Show ${n.name}` : `Hide ${n.name}`}
                  title={isHidden ? "Show" : "Hide"}
                >
                  {isHidden ? (
                    <EyeOff className="h-3 w-3 text-muted-foreground" />
                  ) : (
                    <Eye className="h-3 w-3" style={{ color: n.color }} />
                  )}
                </button>
                <button
                  className="flex-1 min-w-0 text-left"
                  onClick={() => {
                    if (stats?.firstAppearance) {
                      setCurrentChapter(stats.firstAppearance.chapterId);
                    }
                  }}
                >
                  <div className="flex items-center gap-1.5">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-sm border shrink-0"
                      style={{ backgroundColor: `${n.color}33`, borderColor: n.color }}
                      aria-hidden="true"
                    />
                    <span className={cn("text-xs truncate", isHidden && "line-through opacity-60")}>
                      {n.name}
                    </span>
                    {!n.builtin && (
                      <span className="text-[9px] uppercase tracking-wider text-muted-foreground shrink-0">
                        character
                      </span>
                    )}
                  </div>
                  {stats && (
                    <div className="text-[10px] text-muted-foreground mt-0.5 flex gap-2">
                      <span>{stats.blockCount} ¶</span>
                      <span>{stats.wordCount.toLocaleString()} w</span>
                      <span>{stats.chapterIds.length} ch</span>
                    </div>
                  )}
                  {n.description && (
                    <div className="text-[10px] text-muted-foreground/80 mt-0.5 line-clamp-2">
                      {n.description}
                    </div>
                  )}
                </button>
              </li>
            );
          })}
          {filtered.length === 0 && (
            <li className="px-3 py-4 text-xs text-muted-foreground text-center">
              No narrators match.
            </li>
          )}
        </ul>
      </ScrollArea>
      <div className="border-t px-3 py-2 flex gap-1">
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs flex-1"
          onClick={() => {
            // Show all
            const all = new Set(narratorRegistry.map((n) => n.id));
            for (const id of all) {
              if (visibility[id] === false) toggleVisibility(id);
            }
          }}
        >
          Show all
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs flex-1"
          onClick={() => {
            // Hide all character narrators
            for (const n of narratorRegistry) {
              if (n.isCharacter && visibility[n.id] !== false) toggleVisibility(n.id);
            }
          }}
        >
          Hide characters
        </Button>
      </div>
    </div>
  );
}
