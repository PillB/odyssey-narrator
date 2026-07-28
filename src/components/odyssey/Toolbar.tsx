"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  Pencil,
  Settings as SettingsIcon,
  ChevronLeft,
  ChevronRight,
  List,
  PanelRight,
  PanelLeft,
  Search,
  Bookmark,
} from "lucide-react";
import { useOdysseyStore } from "@/lib/odyssey/store";
import { CHAPTER_MANIFEST } from "@/lib/odyssey/chapters";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";

interface ToolbarProps {
  leftSidebarOpen: boolean;
  rightSidebarOpen: boolean;
  onToggleLeft: () => void;
  onOpenSettings: () => void;
  onOpenSearch: () => void;
  onOpenBookmarks: () => void;
  /** Show the narrator legend panel (replaces whatever is currently shown). */
  onShowLegend: () => void;
}

export function Toolbar({
  leftSidebarOpen,
  rightSidebarOpen,
  onToggleLeft,
  onOpenSettings,
  onOpenSearch,
  onOpenBookmarks,
  onShowLegend,
}: ToolbarProps) {
  const currentChapterId = useOdysseyStore((s) => s.currentChapterId);
  const setCurrentChapter = useOdysseyStore((s) => s.setCurrentChapter);
  const editorMode = useOdysseyStore((s) => s.editor.editorMode);
  const setEditorMode = useOdysseyStore((s) => s.setEditorMode);
  const chapters = useOdysseyStore((s) => s.chapters);
  const bookmarkCount = useOdysseyStore((s) => s.bookmarks.length);
  const annotationCount = useOdysseyStore((s) => Object.keys(s.annotations).length);
  const language = useOdysseyStore((s) => s.reader.language);
  const setLanguage = useOdysseyStore((s) => s.setLanguage);
  const currentIndex = CHAPTER_MANIFEST.findIndex((c) => c.slug === currentChapterId);
  const prev = currentIndex > 0 ? CHAPTER_MANIFEST[currentIndex - 1] : null;
  const next = currentIndex >= 0 && currentIndex < CHAPTER_MANIFEST.length - 1 ? CHAPTER_MANIFEST[currentIndex + 1] : null;
  const current = currentIndex >= 0 ? CHAPTER_MANIFEST[currentIndex] : null;
  const currentChapter = currentChapterId ? chapters.get(currentChapterId) : undefined;

  return (
    <header
      className="sticky top-0 z-30 flex items-center gap-2 px-3 py-2 border-b bg-background/85 backdrop-blur-sm"
      role="banner"
    >
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onToggleLeft} aria-label="Toggle contents">
              <List className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Contents</TooltipContent>
        </Tooltip>

        <div className="flex items-center gap-1 ml-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            disabled={!prev}
            onClick={() => prev && setCurrentChapter(prev.slug)}
            aria-label="Previous chapter"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="px-2 min-w-0 max-w-[40vw]">
            <div className="text-xs font-medium truncate">
              {current?.label ?? "—"}
            </div>
            {currentChapter?.subtitle && (
              <div className="text-[10px] text-muted-foreground truncate">
                {currentChapter.subtitle}
              </div>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            disabled={!next}
            onClick={() => next && setCurrentChapter(next.slug)}
            aria-label="Next chapter"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1" />

        {/* Language toggle (EN / ES) */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center rounded-md border border-border overflow-hidden" role="group" aria-label="Language toggle">
              <button
                type="button"
                onClick={() => setLanguage("en")}
                className={cn(
                  "px-2 h-8 text-[10px] font-medium transition-colors",
                  language === "en"
                    ? "bg-primary text-primary-foreground"
                    : "bg-transparent text-muted-foreground hover:bg-accent",
                )}
                aria-pressed={language === "en"}
                aria-label="English"
              >
                EN
              </button>
              <button
                type="button"
                onClick={() => setLanguage("es")}
                className={cn(
                  "px-2 h-8 text-[10px] font-medium transition-colors border-l border-border",
                  language === "es"
                    ? "bg-primary text-primary-foreground"
                    : "bg-transparent text-muted-foreground hover:bg-accent",
                )}
                aria-pressed={language === "es"}
                aria-label="Español"
              >
                ES
              </button>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom">Toggle language (English / Español)</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 relative" onClick={onOpenBookmarks} aria-label="Bookmarks and annotations">
              <Bookmark className="h-4 w-4" />
              {(bookmarkCount + annotationCount) > 0 && (
                <span
                  className="absolute -top-0.5 -right-0.5 min-w-[14px] h-3.5 px-0.5 rounded-full bg-primary text-primary-foreground text-[9px] font-medium flex items-center justify-center tabular-nums"
                  aria-label={`${bookmarkCount + annotationCount} saved items`}
                >
                  {bookmarkCount + annotationCount}
                </span>
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Bookmarks & annotations</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onOpenSearch} aria-label="Search">
              <Search className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Search book</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={editorMode ? "default" : "ghost"}
              size="sm"
              className={cn("h-8 px-2", !editorMode && "w-8 p-0")}
              onClick={() => setEditorMode(!editorMode)}
              aria-label="Toggle editor mode"
              aria-pressed={editorMode}
            >
              <Pencil className="h-4 w-4" />
              {editorMode && <span className="ml-1 text-xs">Editor</span>}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Editor mode</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onOpenSettings} aria-label="Settings">
              <SettingsIcon className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Settings & accessibility</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={onShowLegend}
              aria-label="Toggle narrator legend"
            >
              <PanelRight className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Narrators</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </header>
  );
}
