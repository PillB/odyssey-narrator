"use client";

import { useEffect, useRef, useState } from "react";
import { useOdysseyStore } from "@/lib/odyssey/store";
import { Toolbar } from "@/components/odyssey/Toolbar";
import { ChapterList } from "@/components/odyssey/ChapterList";
import { Reader } from "@/components/odyssey/Reader";
import { NarratorLegend } from "@/components/odyssey/NarratorLegend";
import { EditorPanel } from "@/components/odyssey/EditorPanel";
import { SettingsPanel } from "@/components/odyssey/SettingsPanel";
import { SearchPanel } from "@/components/odyssey/SearchPanel";
import type { Block } from "@/lib/odyssey/types";
import { cn } from "@/lib/utils";

type RightPanelKind = "legend" | "editor" | "settings" | "search";

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
  // - If editor mode is on, prefer editor panel (unless user explicitly
  //   chose settings/search).
  // - If editor mode is off, never show editor panel (fall back to legend).
  const effectiveRightPanel: RightPanelKind | null = !rightOpen
    ? null
    : editorMode && rightPanelTarget !== "settings" && rightPanelTarget !== "search"
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
      html.classList.toggle("reduced-motion", reducedMotion);
      html.setAttribute("data-cb", colorBlindMode);
      const root = html.style;
      if (fontFamily === "serif") {
        root.setProperty("--font-serif-display-active", "var(--font-serif-display), Georgia, serif");
      } else if (fontFamily === "sans") {
        root.setProperty("--font-serif-display-active", "var(--font-geist-sans), system-ui, sans-serif");
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
    }
  };

  // Toolbar callbacks
  const onToggleRight = () => {
    setRightOpen((v) => !v);
  };

  return (
    <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden">
      <Toolbar
        leftSidebarOpen={leftOpen}
        rightSidebarOpen={rightOpen}
        onToggleLeft={() => setLeftOpen((v) => !v)}
        onToggleRight={onToggleRight}
        onOpenSettings={() => {
          setRightOpen(true);
          setRightPanelTarget("settings");
        }}
        onOpenSearch={() => {
          setRightOpen(true);
          setRightPanelTarget("search");
        }}
      />
      <div className="flex-1 flex min-h-0">
        {/* Left sidebar */}
        <aside
          className={cn(
            "border-r bg-sidebar/60 shrink-0 transition-all overflow-hidden",
            leftOpen ? "w-64" : "w-0",
          )}
          aria-label="Chapter list"
          aria-hidden={!leftOpen}
        >
          {leftOpen && <ChapterList />}
        </aside>

        {/* Main reading area */}
        <main className="flex-1 min-w-0 flex flex-col">
          <Reader onBlockSelect={handleBlockSelect} />
        </main>

        {/* Right sidebar */}
        <aside
          className={cn(
            "border-l bg-sidebar/60 shrink-0 transition-all overflow-hidden",
            effectiveRightPanel !== null ? "w-80" : "w-0",
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
        </aside>
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
    </div>
  );
}
