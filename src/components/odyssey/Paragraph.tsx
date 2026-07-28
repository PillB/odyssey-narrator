"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import type { Block } from "@/lib/odyssey/types";
import { useOdysseyStore, useBlockNarrator } from "@/lib/odyssey/store";

interface ParagraphProps {
  block: Block;
  /** True for the first narration paragraph after a header (gets drop cap). */
  dropCap?: boolean;
  /** Optional onClick for editor mode. */
  onClick?: (block: Block) => void;
}

/**
 * Paragraph — renders a single block with its narrator's color stripe,
 * confidence indicator, and editor affordances.
 */
export function Paragraph({ block, dropCap, onClick }: ParagraphProps) {
  const narrator = useBlockNarrator(block);
  const editorMode = useOdysseyStore((s) => s.editor.editorMode);
  const showNarratorLabels = useOdysseyStore((s) => s.reader.showNarratorLabels);
  const fontSize = useOdysseyStore((s) => s.reader.fontSize);
  const lineHeight = useOdysseyStore((s) => s.reader.lineHeight);
  const paragraphSpacing = useOdysseyStore((s) => s.reader.paragraphSpacing);

  const color = narrator?.color ?? "var(--muted-foreground)";
  const accent = narrator?.accent ?? color;
  const name = narrator?.name ?? "Uncertain";

  const spacingClass = {
    compact: "mb-2",
    comfortable: "mb-4",
    spacious: "mb-6",
  }[paragraphSpacing];

  // Render by block kind.
  const content = useMemo(() => renderBlockContent(block), [block]);

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

  return (
    <p
      className={cn(
        "odyssey-prose relative pl-4 md:pl-5 border-l-2 transition-colors",
        spacingClass,
        dropCap && "odyssey-dropcap",
        isInvocation && "italic text-center pl-0 border-l-0",
        isTeaser && "italic text-muted-foreground text-center pl-0 border-l-0 mt-12",
        editorMode && "cursor-pointer hover:bg-accent/40 rounded",
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
    </p>
  );
}

/** Render block content as inline-formatted text.
 *  Handles italics (**bold**, *italic*) and footnote refs ([^n]) minimally. */
function renderBlockContent(block: Block): React.ReactNode {
  // For dialogue, parse out the spoken text vs. attribution.
  if (block.kind === "dialogue") {
    return <DialogueContent raw={block.raw} />;
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

/** Dialogue content: emphasize spoken text, dim attribution. */
function DialogueContent({ raw }: { raw: string }) {
  // Find quoted segments and attribution.
  const quoteMatch = raw.match(/^([""'])(.*?)\1(.*)$/s);
  if (quoteMatch) {
    const quote = quoteMatch[2];
    const attribution = quoteMatch[3]?.trim();
    return (
      <>
        <span className="italic">"{quote}"</span>
        {attribution && (
          <span className="text-muted-foreground not-italic"> {attribution}</span>
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
