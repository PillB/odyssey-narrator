"use client";

import { useEffect, useMemo, useRef } from "react";
import { useOdysseyStore } from "@/lib/odyssey/store";
import { CHAPTER_MANIFEST } from "@/lib/odyssey/chapters";
import { resolveBlockNarrator } from "@/lib/odyssey/identity";
import { Paragraph } from "./Paragraph";
import { FoldedSeam } from "./FoldedSeam";
import type { Block } from "@/lib/odyssey/types";
import { Loader2 } from "lucide-react";

interface ReaderProps {
  onBlockSelect: (block: Block | null) => void;
}

/**
 * Compute folded-groups: a flat list of either "visible block" or "seam".
 * Pure function — does not call hooks. Used by Reader.
 */
function computeFoldedGroups(
  blocks: Block[],
  resolvedNarratorIds: Map<string, string>,
  visibility: Record<string, boolean>,
): Array<
  | { type: "visible"; block: Block; showDrop: boolean }
  | { type: "seam"; narratorId: string; count: number; words: number; key: string }
> {
  const out: ReturnType<typeof computeFoldedGroups> = [];
  let currentSeam: { narratorId: string; count: number; words: number; startIndex: number } | null = null;
  let dropCapNext = false;

  const flushSeam = () => {
    if (!currentSeam) return;
    out.push({
      type: "seam",
      narratorId: currentSeam.narratorId,
      count: currentSeam.count,
      words: currentSeam.words,
      key: `seam:${currentSeam.narratorId}:${currentSeam.startIndex}`,
    });
    currentSeam = null;
  };

  for (const block of blocks) {
    // Headers / scene breaks / notes section headers are never folded
    // (they are structural, not narrator-owned).
    const isFoldable =
      block.kind === "narration" ||
      block.kind === "dialogue" ||
      block.kind === "invocation" ||
      block.kind === "teaser" ||
      block.kind === "footnote";

    const isNarration = block.kind === "narration";
    const showDrop = dropCapNext && isNarration;
    if (block.kind === "header" && block.headingLevel === 2) {
      dropCapNext = true;
    } else if (isNarration) {
      dropCapNext = false;
    }

    if (!isFoldable) {
      flushSeam();
      out.push({ type: "visible", block, showDrop });
      continue;
    }

    const narratorId = resolvedNarratorIds.get(block.id) ?? block.inferredNarratorId;
    const visible = visibility[narratorId] !== false;

    if (visible) {
      flushSeam();
      out.push({ type: "visible", block, showDrop });
    } else {
      const words = block.text.split(/\s+/).filter(Boolean).length;
      if (currentSeam && currentSeam.narratorId === narratorId) {
        currentSeam.count++;
        currentSeam.words += words;
      } else {
        flushSeam();
        currentSeam = { narratorId, count: 1, words, startIndex: block.index };
      }
    }
  }
  flushSeam();
  return out;
}

export function Reader({ onBlockSelect }: ReaderProps) {
  const currentChapterId = useOdysseyStore((s) => s.currentChapterId);
  const chapters = useOdysseyStore((s) => s.chapters);
  const loading = useOdysseyStore((s) => s.loading);
  const error = useOdysseyStore((s) => s.error);
  const loadChapter = useOdysseyStore((s) => s.loadChapter);
  const visibility = useOdysseyStore((s) => s.visibility);
  const editor = useOdysseyStore((s) => s.editor);
  const setScrollProgress = useOdysseyStore((s) => s.setScrollProgress);
  const narratorRegistry = useOdysseyStore((s) => s.narratorRegistry);
  const showFootnotesInline = useOdysseyStore((s) => s.reader.showFootnotesInline);
  const language = useOdysseyStore((s) => s.reader.language);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-load current chapter when it changes (or when language changes).
  const cacheKey = `${language}:${currentChapterId}`;
  useEffect(() => {
    if (!currentChapterId) return;
    if (!chapters.has(cacheKey)) {
      loadChapter(currentChapterId);
    } else {
      // Scroll to top on chapter/language change.
      scrollRef.current?.scrollTo({ top: 0, behavior: "auto" });
    }
  }, [cacheKey, currentChapterId, chapters, loadChapter]);

  // Track scroll progress.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !currentChapterId) return;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const max = el.scrollHeight - el.clientHeight;
        const progress = max > 0 ? el.scrollTop / max : 0;
        setScrollProgress(currentChapterId, progress);
        ticking = false;
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [currentChapterId, setScrollProgress]);

  // Keyboard navigation: ← → between chapters (only at scroll edges)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT") return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (!currentChapterId) return;
      const idx = CHAPTER_MANIFEST.findIndex((c) => c.slug === currentChapterId);
      if (idx < 0) return;
      if (e.key === "ArrowLeft" && idx > 0 && scrollRef.current && scrollRef.current.scrollTop <= 5) {
        useOdysseyStore.getState().setCurrentChapter(CHAPTER_MANIFEST[idx - 1].slug);
        e.preventDefault();
      } else if (e.key === "ArrowRight" && idx < CHAPTER_MANIFEST.length - 1 && scrollRef.current) {
        const max = scrollRef.current.scrollHeight - scrollRef.current.clientHeight;
        if (scrollRef.current.scrollTop >= max - 5) {
          useOdysseyStore.getState().setCurrentChapter(CHAPTER_MANIFEST[idx + 1].slug);
          e.preventDefault();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [currentChapterId]);

  const chapter = currentChapterId ? chapters.get(cacheKey) : undefined;

  // Resolve each block's effective narrator id (for folding).
  const resolvedNarratorIds = useMemo(() => {
    const map = new Map<string, string>();
    if (!chapter) return map;
    for (const b of chapter.blocks) {
      map.set(b.id, resolveBlockNarrator(b, editor.merges, editor.blockCorrections));
    }
    return map;
  }, [chapter, editor.merges, editor.blockCorrections]);

  // Compute folded groups (seams + visible blocks).
  const groups = useMemo(() => {
    if (!chapter) return [];
    // We render footnotes separately below the main flow, so exclude them here.
    const mainBlocks = chapter.blocks.filter((b) => b.kind !== "footnote" && b.kind !== "notes_section_header");
    return computeFoldedGroups(mainBlocks, resolvedNarratorIds, visibility);
  }, [chapter, resolvedNarratorIds, visibility]);

  if (!currentChapterId) {
    return <EmptyState />;
  }

  if (loading && !chapter) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error && !chapter) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 text-center text-sm text-destructive">
        {error}
      </div>
    );
  }

  if (!chapter) return null;

  const footnoteSection = chapter.blocks.filter((b) => b.kind === "notes_section_header" || b.kind === "footnote");
  const setNarratorVisibility = useOdysseyStore.getState().setNarratorVisibility;

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto odyssey-scroll" role="main">
      <article className="mx-auto px-5 md:px-8 py-10 md:py-14" style={{ maxWidth: "var(--odyssey-prose-max-width)" }}>
        {groups.map((g) => {
          if (g.type === "visible") {
            return (
              <Paragraph
                key={g.block.id}
                block={g.block}
                dropCap={g.showDrop}
                onClick={(b) => onBlockSelect(b)}
              />
            );
          }
          // Seam
          const narrator = narratorRegistry.find((n) => n.id === g.narratorId);
          if (!narrator) return null;
          return (
            <FoldedSeam
              key={g.key}
              narrator={narrator}
              count={g.count}
              words={g.words}
              onExpand={() => setNarratorVisibility(g.narratorId, true)}
            />
          );
        })}

        {showFootnotesInline && footnoteSection.length > 0 && (
          <section className="mt-16 pt-8 border-t">
            {footnoteSection.map((block) => (
              <Paragraph key={block.id} block={block} onClick={(b) => onBlockSelect(b)} />
            ))}
          </section>
        )}

        <div className="mt-16 mb-8 odyssey-ornament w-full">
          <span className="text-base">❦</span>
        </div>
      </article>
    </div>
  );
}

function EmptyState() {
  const loadChapter = useOdysseyStore((s) => s.loadChapter);
  const setCurrentChapter = useOdysseyStore((s) => s.setCurrentChapter);
  const language = useOdysseyStore((s) => s.reader.language);
  const isEs = language === "es";

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="text-center max-w-md">
        <div className="odyssey-ornament w-full mb-6">
          <span className="text-2xl">❦</span>
        </div>
        <h1 className="font-serif text-3xl md:text-4xl font-semibold mb-3">
          {isEs ? "La Odisea, Recontada" : "The Odyssey, Retold"}
        </h1>
        <p className="text-sm text-muted-foreground mb-6 italic">
          {isEs
            ? "Una experiencia de lectura inteligente para un Homero traducido por IA. Cada párrafo está clasificado por narrador — el guía, Odiseo, la invocación, las notas al pie, o los personajes que hablan — y cada clasificación es corregible en el editor."
            : "An intelligent reading experience for an AI-translated Homer. Every paragraph is classified by narrator — the guide, Odysseus, the invocation, the footnotes, or the speaking characters — and every classification is correctable in the editor."}
        </p>
        <button
          className="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground px-5 py-2.5 text-sm font-medium hover:bg-primary/90 transition-colors"
          onClick={() => {
            setCurrentChapter("odyssey-book-00-preface");
            loadChapter("odyssey-book-00-preface");
          }}
        >
          {isEs ? "Comenzar a leer" : "Begin reading"}
        </button>
        <p className="text-[10px] text-muted-foreground/70 mt-4">
          {isEs ? "O elige un capítulo del panel de contenido a la izquierda." : "Or pick a chapter from the contents panel on the left."}
        </p>
      </div>
    </div>
  );
}
