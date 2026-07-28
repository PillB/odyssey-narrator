"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Bookmark, MessageSquarePlus, X } from "lucide-react";
import type { Block, Chapter } from "@/lib/odyssey/types";
import { useOdysseyStore, useBlockNarrator } from "@/lib/odyssey/store";
import { resolveBlockNarrator } from "@/lib/odyssey/identity";
import { getContextInjectedRaw } from "@/lib/odyssey/context-injection";

interface ParagraphProps {
  block: Block;
  /** True for the first narration paragraph after a header (gets drop cap). */
  dropCap?: boolean;
  /** Optional onClick for editor mode. */
  onClick?: (block: Block) => void;
  /** The full chapter blocks array (for context injection detection). */
  chapterBlocks?: Block[];
}

/**
 * Paragraph — renders a single block with its narrator's color stripe,
 * confidence indicator, and editor affordances.
 */
export function Paragraph({ block, dropCap, onClick, chapterBlocks }: ParagraphProps) {
  const narrator = useBlockNarrator(block);
  const editorMode = useOdysseyStore((s) => s.editor.editorMode);
  const showNarratorLabels = useOdysseyStore((s) => s.reader.showNarratorLabels);
  const fontSize = useOdysseyStore((s) => s.reader.fontSize);
  const lineHeight = useOdysseyStore((s) => s.reader.lineHeight);
  const paragraphSpacing = useOdysseyStore((s) => s.reader.paragraphSpacing);
  const bookmarks = useOdysseyStore((s) => s.bookmarks);
  const annotations = useOdysseyStore((s) => s.annotations);
  const toggleBookmark = useOdysseyStore((s) => s.toggleBookmark);
  const setAnnotation = useOdysseyStore((s) => s.setAnnotation);
  const visibility = useOdysseyStore((s) => s.visibility);
  const editor = useOdysseyStore((s) => s.editor);

  const [annotating, setAnnotating] = useState(false);
  const [annotationDraft, setAnnotationDraft] = useState("");

  const color = narrator?.color ?? "var(--muted-foreground)";
  const accent = narrator?.accent ?? color;
  const name = narrator?.name ?? "Uncertain";

  const isBookmarked = bookmarks.includes(block.id);
  const existingAnnotation = annotations[block.id];

  const spacingClass = {
    compact: "mb-2",
    comfortable: "mb-4",
    spacious: "mb-6",
  }[paragraphSpacing];

  // Check if this dialogue block needs contextual speaker injection
  // (when the preceding narration that identifies the speaker is folded).
  const contextInjection = useMemo(() => {
    if (!chapterBlocks || block.kind !== "dialogue") {
      return { needsInjection: false, modifiedRaw: block.raw, speakerName: "" };
    }
    const resolvedNarratorIds = new Map<string, string>();
    for (const b of chapterBlocks) {
      resolvedNarratorIds.set(b.id, resolveBlockNarrator(b, editor.merges, editor.blockCorrections));
    }
    return getContextInjectedRaw(block, chapterBlocks, resolvedNarratorIds, visibility);
  }, [block, chapterBlocks, editor.merges, editor.blockCorrections, visibility]);

  // Render by block kind. Use modifiedRaw if context injection is needed.
  const effectiveBlock = contextInjection.needsInjection
    ? { ...block, raw: contextInjection.modifiedRaw }
    : block;
  const content = useMemo(
    () => renderBlockContent(effectiveBlock, narrator?.color),
    [effectiveBlock, narrator?.color],
  );


  if (block.kind === "scene_break") {
    return (
      <div className={cn("my-8 flex items-center justify-center", spacingClass)} aria-hidden="true">
        <div className="odyssey-ornament w-full max-w-xs">
          <span className="text-base">❦</span>
        </div>
      </div>
    );
  }

  if (block.kind === "header") {
    const level = block.headingLevel ?? 2;
    if (level === 1) {
      return (
        <h1 className="font-serif text-3xl md:text-4xl font-semibold text-center tracking-tight mt-2 mb-2">
          {block.text}
        </h1>
      );
    }
    if (level === 2) {
      return (
        <h2 className="font-serif text-2xl md:text-3xl font-semibold text-center mt-10 mb-1 tracking-tight">
          {block.text}
        </h2>
      );
    }
    return (
      <h3 className="font-serif text-lg md:text-xl italic text-center text-muted-foreground mb-8">
        {block.text}
      </h3>
    );
  }

  if (block.kind === "notes_section_header") {
    return (
      <div className="mt-12 mb-4">
        <div className="odyssey-ornament w-full mb-2">
          <span className="text-xs uppercase tracking-widest">Notes</span>
        </div>
        <h2 className="font-serif text-xl font-semibold text-center">{block.text}</h2>
      </div>
    );
  }

  if (block.kind === "footnote") {
    return (
      <div
        className={cn("flex gap-3 text-sm text-muted-foreground odyssey-prose", spacingClass)}
        id={`footnote-${block.footnoteNumber ?? block.index}`}
      >
        <span className="font-serif text-xs font-semibold mt-1 min-w-[1.5rem] text-right">
          {block.footnoteNumber ?? "•"}
        </span>
        <div
          className="flex-1 border-l-2 pl-3 italic"
          style={{ borderColor: color }}
        >
          {content}
        </div>
      </div>
    );
  }

  // narration, dialogue, invocation, teaser — all rendered as paragraphs
  // with a left narrator stripe.

  const isInvocation = block.kind === "invocation";
  const isDialogue = block.kind === "dialogue";
  const isTeaser = block.kind === "teaser";
  // Only show bookmark/annotation UI on narrator-owned prose blocks.
  const canAnnotate = !isInvocation && !isTeaser && block.kind !== "header" && block.kind !== "scene_break" && block.kind !== "notes_section_header";

  const startAnnotating = () => {
    setAnnotationDraft(existingAnnotation ?? "");
    setAnnotating(true);
  };
  const saveAnnotation = () => {
    setAnnotation(block.id, annotationDraft);
    setAnnotating(false);
    setAnnotationDraft("");
  };
  const cancelAnnotation = () => {
    setAnnotating(false);
    setAnnotationDraft("");
  };

  return (
    <div className={cn("group relative", spacingClass)}>
      {/* Hover-revealed margin controls (left of the narrator stripe). */}
      {canAnnotate && !editorMode && (
        <div
          className="absolute -left-1 top-0 flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity"
          style={{ transform: "translateX(-100%)" }}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleBookmark(block.id);
            }}
            className={cn(
              "p-1 rounded transition-colors",
              isBookmarked
                ? "text-amber-600 dark:text-amber-400"
                : "text-muted-foreground/50 hover:text-foreground hover:bg-accent",
            )}
            aria-label={isBookmarked ? "Remove bookmark" : "Add bookmark"}
            aria-pressed={isBookmarked}
            title={isBookmarked ? "Remove bookmark" : "Add bookmark"}
          >
            <Bookmark className="h-3.5 w-3.5" fill={isBookmarked ? "currentColor" : "none"} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              startAnnotating();
            }}
            className={cn(
              "p-1 rounded transition-colors",
              existingAnnotation
                ? "text-blue-600 dark:text-blue-400"
                : "text-muted-foreground/50 hover:text-foreground hover:bg-accent",
            )}
            aria-label={existingAnnotation ? "Edit annotation" : "Add annotation"}
            title={existingAnnotation ? "Edit annotation" : "Add annotation"}
          >
            <MessageSquarePlus className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <p
        className={cn(
          "odyssey-prose relative pl-4 md:pl-5 border-l-2 transition-colors",
          dropCap && "odyssey-dropcap",
          isInvocation && "italic text-center pl-0 border-l-0",
          isTeaser && "italic text-muted-foreground text-center pl-0 border-l-0 mt-12",
          editorMode && "cursor-pointer hover:bg-accent/40 rounded",
          isBookmarked && "bg-amber-50/40 dark:bg-amber-950/15",
        )}
        style={{
          borderColor: isInvocation || isTeaser ? "transparent" : color,
          fontSize: `${fontSize}px`,
          lineHeight,
          ...(isDialogue ? { fontStyle: "normal" } : {}),
        }}
        onClick={editorMode ? () => onClick?.(block) : undefined}
        data-block-id={block.id}
        data-narrator={narrator?.id}
      >
        {content}
        {(showNarratorLabels || editorMode) && !isInvocation && !isTeaser && (
          <span
            className="ml-2 inline-block align-middle text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-sm font-sans font-medium"
            style={{
              backgroundColor: `${color}22`,
              color,
              border: `1px solid ${color}44`,
            }}
            aria-label={`Narrator: ${name}`}
          >
            {name}
            {block.confidence < 0.7 && " ·?"}
          </span>
        )}
        {isBookmarked && (
          <Bookmark
            className="inline-block ml-1.5 h-3 w-3 align-middle text-amber-600 dark:text-amber-400"
            fill="currentColor"
            aria-label="Bookmarked"
          />
        )}
      </p>

      {/* Annotation bubble (when one exists, or when the editor is open). */}
      {(existingAnnotation || annotating) && canAnnotate && (
        <div
          className="mt-1.5 ml-4 md:ml-5 border-l-2 pl-3 py-1.5 text-sm bg-blue-50/40 dark:bg-blue-950/15 border-blue-400/60 dark:border-blue-700/60 rounded-r"
        >
          {annotating ? (
            <div className="flex flex-col gap-1.5">
              <textarea
                autoFocus
                value={annotationDraft}
                onChange={(e) => setAnnotationDraft(e.target.value)}
                placeholder="Your note…"
                className="w-full min-h-[60px] text-xs p-2 rounded border border-border bg-background resize-y focus:outline-none focus:ring-1 focus:ring-ring"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Escape") cancelAnnotation();
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) saveAnnotation();
                }}
              />
              <div className="flex gap-1.5 justify-end text-[10px]">
                <button
                  type="button"
                  onClick={cancelAnnotation}
                  className="px-2 py-1 rounded border border-border hover:bg-accent"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveAnnotation}
                  className="px-2 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  Save
                </button>
              </div>
            </div>
          ) : (
            <div className="text-xs text-foreground/80 italic flex gap-2">
              <div className="flex-1 whitespace-pre-wrap">{existingAnnotation}</div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  startAnnotating();
                }}
                className="text-[10px] text-muted-foreground hover:text-foreground underline"
                aria-label="Edit annotation"
              >
                edit
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setAnnotation(block.id, "");
                }}
                className="text-[10px] text-muted-foreground hover:text-destructive underline"
                aria-label="Delete annotation"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Render block content as inline-formatted text.
 *  Handles italics (**bold**, *italic*) and footnote refs ([^n]) minimally.
 *  Also handles injected context speaker tags like (Zeus). */
function renderBlockContent(block: Block, narratorColor?: string): React.ReactNode {
  // For dialogue, parse out the spoken text vs. attribution.
  if (block.kind === "dialogue") {
    return <DialogueContent raw={block.raw} narratorColor={narratorColor} />;
  }
  return <InlineMarkdown raw={block.raw} />;
}

/** Minimal inline markdown: *italic*, **bold**, [^n] footnote refs. */
function InlineMarkdown({ raw }: { raw: string }) {
  const parts = parseInline(raw);
  return (
    <>
      {parts.map((p, i) => {
        if (p.type === "italic") return <em key={i}>{p.text}</em>;
        if (p.type === "bold") return <strong key={i}>{p.text}</strong>;
        if (p.type === "footnote-ref") {
          const num = p.text;
          return (
            <sup key={i} className="text-[0.7em] ml-0.5 cursor-pointer text-muted-foreground hover:text-foreground">
              <a href={`#footnote-${num}`}>[{num}]</a>
            </sup>
          );
        }
        return <span key={i}>{p.text}</span>;
      })}
    </>
  );
}

/** Dialogue content: emphasize spoken text, dim attribution.
 *  Detects injected context speaker tags like "(Zeus)" and renders them
 *  as colored badges with the narrator's color. */
function DialogueContent({ raw, narratorColor }: { raw: string; narratorColor?: string }) {
  // Find quoted segments and attribution.
  const quoteMatch = raw.match(/^([""'])(.*?)\1(.*)$/s);
  if (quoteMatch) {
    const quote = quoteMatch[2];
    let attribution = quoteMatch[3]?.trim() ?? "";
    // Check for injected speaker tag: "(SpeakerName)" anywhere in attribution
    const speakerMatch = attribution.match(/\(([^)]+)\)/);
    let speakerTag: string | null = null;
    if (speakerMatch) {
      speakerTag = speakerMatch[1];
      // Remove the tag from the attribution text (we'll render it separately)
      attribution = attribution.replace(/\([^)]+\)/, "").trim();
    }
    return (
      <>
        <span className="italic">"{quote}"</span>
        {attribution && (
          <span className="text-muted-foreground not-italic"> {attribution}</span>
        )}
        {speakerTag && (
          <span
            className="ml-1 inline-block align-baseline text-[0.65em] font-medium px-1.5 py-0.5 rounded-sm border"
            style={{
              color: narratorColor || "var(--muted-foreground)",
              backgroundColor: `${narratorColor || "#888"}22`,
              borderColor: `${narratorColor || "#888"}44`,
            }}
            title={`Speaker referenced from folded narration: ${speakerTag}`}
          >
            {speakerTag}
          </span>
        )}
      </>
    );
  }
  // Fallback: just render inline.
  return <InlineMarkdown raw={raw} />;
}

type InlinePart =
  | { type: "text"; text: string }
  | { type: "italic"; text: string }
  | { type: "bold"; text: string }
  | { type: "footnote-ref"; text: string };

function parseInline(input: string): InlinePart[] {
  const parts: InlinePart[] = [];
  // Tokenize: **bold**, *italic*, [^n]
  const re = /(\*\*([^*]+)\*\*|\*([^*]+)\*|\[\^(\d+)\])/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input)) !== null) {
    if (m.index > last) {
      parts.push({ type: "text", text: input.slice(last, m.index) });
    }
    if (m[2] !== undefined) {
      parts.push({ type: "bold", text: m[2] });
    } else if (m[3] !== undefined) {
      parts.push({ type: "italic", text: m[3] });
    } else if (m[4] !== undefined) {
      parts.push({ type: "footnote-ref", text: m[4] });
    }
    last = re.lastIndex;
  }
  if (last < input.length) {
    parts.push({ type: "text", text: input.slice(last) });
  }
  return parts;
}
