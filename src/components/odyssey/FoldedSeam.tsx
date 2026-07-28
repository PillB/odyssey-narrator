"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useOdysseyStore } from "@/lib/odyssey/store";
import type { Narrator } from "@/lib/odyssey/types";

interface FoldedSeamProps {
  narrator: Narrator;
  /** Number of consecutive hidden blocks this seam represents. */
  count: number;
  /** Total words hidden. */
  words: number;
  onExpand: () => void;
}

/**
 * FoldedSeam — elegant placeholder shown in place of one or more hidden
 * narrator blocks. Includes a small narrator tab, the count of folded
 * paragraphs, and an expand button. Persists state across renders via
 * the parent.
 */
export function FoldedSeam({ narrator, count, words, onExpand }: FoldedSeamProps) {
  const [hovered, setHovered] = useState(false);

  const readingTimeMin = Math.max(1, Math.round(words / 200));
  return (
    <div
      className={cn(
        "my-3 flex items-center gap-3 group cursor-pointer transition-all rounded-md",
        "border border-dashed px-3 py-2 text-sm",
        hovered ? "bg-accent/50" : "bg-transparent",
      )}
      style={{
        borderColor: `${narrator.color}66`,
        color: narrator.color,
      }}
      onClick={onExpand}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      role="button"
      tabIndex={0}
      aria-label={`Expand ${count} hidden ${narrator.name} ${count === 1 ? "paragraph" : "paragraphs"} (${readingTimeMin} min)`}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onExpand();
        }
      }}
    >
      <ChevronRight className="h-4 w-4 shrink-0" />
      <span
        className="inline-block h-3 w-3 rounded-sm shrink-0 border"
        style={{ backgroundColor: `${narrator.color}33`, borderColor: narrator.color }}
        aria-hidden="true"
      />
      <span className="font-medium truncate">{narrator.name}</span>
      <span className="text-muted-foreground text-xs">
        {count} {count === 1 ? "paragraph" : "paragraphs"} hidden · {readingTimeMin} min
      </span>
      <ChevronDown className="h-3.5 w-3.5 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
    </div>
  );
}

/**
 * Convenience hook: given a list of blocks, group consecutive hidden ones
 * (per the current visibility map) into seams so we render a single seam
 * for a run of folded paragraphs rather than one per block.
 */
export function useFoldedGroups(
  blocks: Array<{ id: string; inferredNarratorId: string; text: string }>,
  resolvedNarratorIds: Map<string, string>,
  visibility: Record<string, boolean>,
) {
  // We intentionally recompute on each render; cheap for chapter-sized lists.
  const groups: Array<
    | { type: "visible"; block: typeof blocks[number] }
    | { type: "seam"; narratorId: string; count: number; words: number }
  > = [];
  let currentSeam: { narratorId: string; count: number; words: number } | null = null;
  for (const block of blocks) {
    const narratorId = resolvedNarratorIds.get(block.id) ?? block.inferredNarratorId;
    const visible = visibility[narratorId] !== false;
    if (visible) {
      if (currentSeam) {
        groups.push({ type: "seam", ...currentSeam });
        currentSeam = null;
      }
      groups.push({ type: "visible", block });
    } else {
      const words = block.text.split(/\s+/).filter(Boolean).length;
      if (currentSeam && currentSeam.narratorId === narratorId) {
        currentSeam.count++;
        currentSeam.words += words;
      } else {
        if (currentSeam) groups.push({ type: "seam", ...currentSeam });
        currentSeam = { narratorId, count: 1, words };
      }
    }
  }
  if (currentSeam) groups.push({ type: "seam", ...currentSeam });
  return groups;
}
