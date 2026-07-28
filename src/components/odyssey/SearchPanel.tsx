"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useOdysseyStore } from "@/lib/odyssey/store";
import { CHAPTER_MANIFEST } from "@/lib/odyssey/chapters";
import { resolveBlockNarrator } from "@/lib/odyssey/identity";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Search, X } from "lucide-react";
import type { Block } from "@/lib/odyssey/types";

interface SearchPanelProps {
  onClose: () => void;
  onJump: (chapterId: string, blockId: string) => void;
}

/**
 * SearchPanel — full-text search across all loaded chapters.
 * Searches block text + narrator name. Clicking a result jumps to the block.
 */
export function SearchPanel({ onClose, onJump }: SearchPanelProps) {
  const chapters = useOdysseyStore((s) => s.chapters);
  const narratorRegistry = useOdysseyStore((s) => s.narratorRegistry);
  const editor = useOdysseyStore((s) => s.editor);
  const language = useOdysseyStore((s) => s.reader.language);
  const loadAllChapters = useOdysseyStore((s) => s.loadAllChapters);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus the input on mount.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // If chapters aren't loaded, kick off background load.
  useEffect(() => {
    if (chapters.size === 0) loadAllChapters();
  }, [chapters.size, loadAllChapters]);

  const results = useMemo(() => {
    if (!query.trim() || query.length < 2) return [];
    const q = query.toLowerCase();
    const out: Array<{ block: Block; chapterLabel: string; narratorName: string; snippet: string }> = [];
    for (const meta of CHAPTER_MANIFEST) {
      const ch = chapters.get(`${language}:${meta.slug}`);
      if (!ch) continue;
      for (const b of ch.blocks) {
        if (b.kind === "header" || b.kind === "scene_break" || b.kind === "notes_section_header") continue;
        const text = b.text.toLowerCase();
        const idx = text.indexOf(q);
        if (idx < 0) continue;
        const narratorId = resolveBlockNarrator(b, editor.merges, editor.blockCorrections);
        const narrator = narratorRegistry.find((n) => n.id === narratorId);
        const start = Math.max(0, idx - 60);
        const end = Math.min(b.text.length, idx + q.length + 80);
        const snippet =
          (start > 0 ? "…" : "") +
          b.text.slice(start, end) +
          (end < b.text.length ? "…" : "");
        out.push({
          block: b,
          chapterLabel: meta.label,
          narratorName: narrator?.name ?? "Unknown",
          snippet,
        });
        if (out.length >= 100) return out; // cap
      }
    }
    return out;
  }, [query, chapters, narratorRegistry, editor.merges, editor.blockCorrections, language]);

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b flex items-center gap-2">
        <Search className="h-3.5 w-3.5 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search all books…"
          className="h-7 border-0 px-0 text-xs focus-visible:ring-0"
          aria-label="Search query"
        />
        <button onClick={onClose} className="p-1 rounded hover:bg-accent" aria-label="Close search">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <ScrollArea className="flex-1 odyssey-scroll">
        <ul className="py-1">
          {query.trim().length < 2 && (
            <li className="px-3 py-6 text-center text-xs text-muted-foreground">
              Type at least 2 characters to search.
            </li>
          )}
          {query.trim().length >= 2 && results.length === 0 && (
            <li className="px-3 py-6 text-center text-xs text-muted-foreground">
              No matches {chapters.size < CHAPTER_MANIFEST.length && "(still loading books…)"}.
            </li>
          )}
          {results.map(({ block, chapterLabel, narratorName, snippet }) => (
            <li key={block.id}>
              <button
                className="w-full text-left px-3 py-2 hover:bg-sidebar-accent/50 transition-colors"
                onClick={() => onJump(block.chapterId, block.id)}
              >
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span className="font-medium">{chapterLabel}</span>
                  <span>·</span>
                  <span>{narratorName}</span>
                </div>
                <p className="text-xs mt-0.5 line-clamp-2">{snippet}</p>
              </button>
            </li>
          ))}
        </ul>
      </ScrollArea>
      {results.length > 0 && (
        <div className="border-t px-3 py-1 text-[10px] text-muted-foreground">
          {results.length === 100 ? "100+ matches (showing first 100)" : `${results.length} matches`}
        </div>
      )}
    </div>
  );
}
