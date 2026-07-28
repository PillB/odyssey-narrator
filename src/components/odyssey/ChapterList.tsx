"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { ChevronRight, BookOpen } from "lucide-react";
import { useOdysseyStore } from "@/lib/odyssey/store";
import { CHAPTER_MANIFEST } from "@/lib/odyssey/chapters";
import { ScrollArea } from "@/components/ui/scroll-area";

export function ChapterList() {
  const currentChapterId = useOdysseyStore((s) => s.currentChapterId);
  const setCurrentChapter = useOdysseyStore((s) => s.setCurrentChapter);
  const scrollProgress = useOdysseyStore((s) => s.scrollProgress);
  const chapters = useOdysseyStore((s) => s.chapters);

  return (
    <nav className="flex flex-col h-full" aria-label="Chapter navigation">
      <div className="px-4 py-3 border-b">
        <h2 className="text-xs uppercase tracking-widest text-muted-foreground flex items-center gap-2">
          <BookOpen className="h-3.5 w-3.5" /> Contents
        </h2>
      </div>
      <ScrollArea className="flex-1 odyssey-scroll">
        <ul className="py-1">
          {CHAPTER_MANIFEST.map((c) => {
            const isActive = currentChapterId === c.slug;
            const loaded = chapters.get(c.slug);
            const progress = scrollProgress[c.slug] ?? 0;
            return (
              <li key={c.slug}>
                <button
                  className={cn(
                    "w-full text-left px-4 py-2 flex items-center gap-2 transition-colors",
                    "hover:bg-sidebar-accent/60 focus:bg-sidebar-accent/60 outline-none",
                    isActive && "bg-sidebar-accent font-medium",
                  )}
                  onClick={() => setCurrentChapter(c.slug)}
                >
                  <ChevronRight
                    className={cn(
                      "h-3 w-3 shrink-0 transition-transform",
                      isActive && "rotate-90 text-primary",
                    )}
                  />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm truncate">{c.label}</span>
                    {loaded && (
                      <span className="block text-[10px] text-muted-foreground">
                        {loaded.subtitle || `${loaded.wordCount.toLocaleString()} words`}
                      </span>
                    )}
                  </span>
                  {progress > 0 && (
                    <span
                      className="text-[10px] tabular-nums text-muted-foreground shrink-0"
                      aria-label={`${Math.round(progress * 100)}% read`}
                    >
                      {Math.round(progress * 100)}%
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </ScrollArea>
    </nav>
  );
}
