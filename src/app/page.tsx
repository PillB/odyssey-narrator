"use client";

import { useEffect, useRef, useState } from "react";
import { useOdysseyStore } from "@/lib/odyssey/store";
import { Toolbar } from "@/components/odyssey/Toolbar";
import { ChapterList } from "@/components/odyssey/ChapterList";
import { Reader } from "@/components/odyssey/Reader";
import { NarratorLegend } from "@/components/odyssey/NarratorLegend";
import { EditorPanel } from "@/components/odyssey/EditorPanel";
import { SettingsPanel } from "@/components/odyssey/SettingsPanel";
import { Tour } from "@/components/odyssey/Tour";
import { SearchPanel } from "@/components/odyssey/SearchPanel";
import { BookmarksPanel } from "@/components/odyssey/BookmarksPanel";
import type { Block } from "@/lib/odyssey/types";
import { cn } from "@/lib/utils";

type RightPanelKind = "legend" | "editor" | "settings" | "search" | "bookmarks";

export default function Page() {
  const [leftOpen, setLeftOpen] = useState(true);
  // `rightPanelTarget` is the user's explicit choice. The effective panel
  // shown is derived from target + editor mode + selected block.
  const [rightPanelTarget, setRightPanelTarget] = useState<RightPanelKind | null>("legend");
  const [rightOpen, setRightOpen] = useState(true);
  const [selectedBlock, setSelectedBlock] = useState<Block | null>(null);
  const hydratedRef = useRef(false);

  const reader = useOdysseyStore((s) => s.reader);
  const editorMode = useOdysseyStore((s) => s.editor.editorMode);
  const currentChapterId = useOdysseyStore((s) => s.currentChapterId);

  // Derive the effective right panel.
  // - If editor mode is on AND the user hasn't explicitly chosen a non-editor
  //   panel (settings/search/bookmarks), prefer the editor panel.
  // - If editor mode is off, never show editor panel (fall back to legend).
  // - Explicit user choices (settings/search/bookmarks) always win over editor
  //   mode, because the user just clicked that button.
  const effectiveRightPanel: RightPanelKind | null = !rightOpen
    ? null
    : editorMode && rightPanelTarget !== "settings" && rightPanelTarget !== "search" && rightPanelTarget !== "bookmarks"
      ? "editor"
      : rightPanelTarget === "editor"
        ? "legend"
        : rightPanelTarget;

  // After hydration: set initial chapter if none, kick off background load.
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    const state = useOdysseyStore.getState();
    if (!state.currentChapterId) {
      state.setCurrentChapter("odyssey-book-00-preface");
      state.loadChapter("odyssey-book-00-preface");
    }
    if (state.chapters.size < 5) {
      state.loadAllChapters();
    }
  }, []);

  // Apply theme + accessibility classes to <html> (no React state, just side-effects).
  useEffect(() => {
    const html = document.documentElement;
    const apply = () => {
      const { theme, highContrast, reducedMotion, colorBlindMode, fontFamily } = useOdysseyStore.getState().reader;
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      const isDark = theme === "dark" || (theme === "system" && prefersDark);
      html.classList.toggle("dark", isDark);
      html.classList.toggle("high-contrast", highContrast);
      html.classList.toggle("high-contrast-bw", colorBlindMode === "bw");
      html.classList.toggle("reduced-motion", reducedMotion);
      html.setAttribute("data-cb", colorBlindMode === "bw" ? "none" : colorBlindMode);
      const root = html.style;
      if (fontFamily === "serif") {
        root.setProperty("--font-serif-display-active", "var(--font-serif-display), Georgia, serif");
      } else if (fontFamily === "sans") {
        root.setProperty("--font-serif-display-active", "var(--font-geist-sans), system-ui, sans-serif");
      } else if (fontFamily === "lexend") {
        root.setProperty("--font-serif-display-active", "var(--font-lexend), system-ui, sans-serif");
      } else if (fontFamily === "atkinson") {
        root.setProperty("--font-serif-display-active", "var(--font-atkinson), system-ui, sans-serif");
      } else {
        root.setProperty("--font-serif-display-active", "Georgia, 'Times New Roman', serif");
      }
    };
    apply();
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", apply);
    const unsub = useOdysseyStore.subscribe(apply);
    return () => {
      mq.removeEventListener("change", apply);
      unsub();
    };
  }, []);

  const handleBlockSelect = (block: Block | null) => {
    setSelectedBlock(block);
  };

  const handleJumpFromSearch = (chapterId: string, blockId: string) => {
    useOdysseyStore.getState().setCurrentChapter(chapterId);
    setRightPanelTarget("legend");
    setTimeout(() => {
      const el = document.querySelector(`[data-block-id="${blockId}"]`) as HTMLElement | null;
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("ring-2", "ring-primary");
        setTimeout(() => el.classList.remove("ring-2", "ring-primary"), 1800);
      }
    }, 350);
  };

  // When user toggles editor mode on, ensure right panel opens to editor.
  const handleEditorModeToggle = (on: boolean) => {
    useOdysseyStore.getState().setEditorMode(on);
    if (on) {
      setRightOpen(true);
      setRightPanelTarget("editor");
      // On mobile, close left panel to avoid overlap
      if (window.innerWidth < 768) setLeftOpen(false);
    }
  };

  // "Show legend" = toggle behavior:
  // - If panel is closed → open it showing legend
  // - If panel is open showing legend → close it
  // - If panel is open showing something else → switch to legend
  const onShowLegend = () => {
    // On mobile, close left panel when opening right
    if (window.innerWidth < 768) setLeftOpen(false);
    if (!rightOpen) {
      setRightOpen(true);
      setRightPanelTarget("legend");
    } else if (effectiveRightPanel === "legend") {
      setRightOpen(false);
    } else {
      setRightPanelTarget("legend");
    }
  };

  return (
    <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden">
      <Toolbar
        leftSidebarOpen={leftOpen}
        rightSidebarOpen={rightOpen}
        onToggleLeft={() => {
          // On mobile, close right panel when opening left
          if (window.innerWidth < 768 && !leftOpen) {
            setRightOpen(false);
            setRightPanelTarget(null);
          }
          setLeftOpen((v) => !v);
        }}
        onOpenSettings={() => {
          if (window.innerWidth < 768) setLeftOpen(false);
          setRightOpen(true);
          setRightPanelTarget("settings");
        }}
        onOpenSearch={() => {
          if (window.innerWidth < 768) setLeftOpen(false);
          setRightOpen(true);
          setRightPanelTarget("search");
        }}
        onOpenBookmarks={() => {
          if (window.innerWidth < 768) setLeftOpen(false);
          setRightOpen(true);
          setRightPanelTarget("bookmarks");
        }}
        onShowLegend={onShowLegend}
      />
      <div className="flex-1 flex min-h-0 relative">
        {/* Left sidebar — fixed overlay on mobile, inline on desktop */}
        <aside
          className={cn(
            "border-r bg-sidebar/95 backdrop-blur-sm transition-all overflow-hidden z-20",
            "max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:top-[49px] max-md:bottom-0 max-md:shadow-xl",
            leftOpen ? "w-full max-w-64" : "w-0 max-md:max-w-0",
          )}
          aria-label="Chapter list"
          aria-hidden={!leftOpen}
        >
          {leftOpen && <ChapterList />}
        </aside>

        {/* Overlay backdrop for mobile when left panel is open */}
        {leftOpen && (
          <div
            className="md:hidden fixed inset-0 top-[49px] bg-black/30 z-10"
            onClick={() => setLeftOpen(false)}
            aria-hidden="true"
          />
        )}

        {/* Main reading area */}
        <main className="flex-1 min-w-0 flex flex-col">
          <Reader onBlockSelect={handleBlockSelect} />
        </main>

        {/* Right sidebar — fixed overlay on mobile, inline on desktop */}
        <aside
          className={cn(
            "border-l bg-sidebar/95 backdrop-blur-sm transition-all overflow-hidden z-20",
            "max-md:fixed max-md:inset-y-0 max-md:right-0 max-md:top-[49px] max-md:bottom-0 max-md:shadow-xl",
            effectiveRightPanel !== null ? "w-full max-w-80" : "w-0 max-md:max-w-0",
          )}
          aria-label="Detail panel"
        >
          {effectiveRightPanel === "legend" && <NarratorLegend />}
          {effectiveRightPanel === "editor" && (
            <EditorPanel
              selectedBlock={selectedBlock}
              onClose={() => {
                setRightPanelTarget("legend");
                setSelectedBlock(null);
              }}
            />
          )}
          {effectiveRightPanel === "settings" && <SettingsPanel />}
          {effectiveRightPanel === "search" && (
            <SearchPanel
              onClose={() => setRightPanelTarget("legend")}
              onJump={handleJumpFromSearch}
            />
          )}
          {effectiveRightPanel === "bookmarks" && (
            <BookmarksPanel onJump={handleJumpFromSearch} />
          )}
        </aside>

        {/* Overlay backdrop for mobile when right panel is open */}
        {effectiveRightPanel !== null && (
          <div
            className="md:hidden fixed inset-0 top-[49px] bg-black/30 z-10"
            onClick={() => {
              setRightOpen(false);
              setRightPanelTarget(null);
            }}
            aria-hidden="true"
          />
        )}
      </div>
      {/* Footer (sticky bottom) */}
      <footer className="border-t px-3 py-1.5 text-[10px] text-muted-foreground flex items-center justify-between bg-background">
        <span>
          {currentChapterId
            ? currentChapterId.replace("odyssey-book-", "Book ").replace("-preface", " (Preface)")
            : "—"}
        </span>
        <span className="hidden sm:inline">
          ← → arrows navigate chapters at scroll edges
        </span>
        <span>The AI Odyssey · Reader v1</span>
      </footer>

      {/* Interactive onboarding tour (auto-starts on first visit) */}
      <Tour />
    </div>
  );
}
