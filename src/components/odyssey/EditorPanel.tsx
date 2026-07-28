"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { X, GitMerge, Pencil, Sparkles, Check, AlertCircle } from "lucide-react";
import { useOdysseyStore } from "@/lib/odyssey/store";
import type { Block, Chapter } from "@/lib/odyssey/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface EditorPanelProps {
  /** Currently-selected block (when in inline editor mode). */
  selectedBlock: Block | null;
  onClose: () => void;
}

interface LLMProposal {
  proposedNarratorId: string;
  proposedSpeaker?: string;
  critique: string;
  confidence: number;
  alternatives: string[];
  parseError?: boolean;
}

/**
 * EditorPanel — slides in when editor mode is active. Shows:
 *   1. The currently-selected block's narrator + confidence + reasoning
 *   2. A dropdown to reassign the block to any narrator in the registry
 *   3. Buttons to split/merge narrators, rename, recolor
 */
export function EditorPanel({ selectedBlock, onClose }: EditorPanelProps) {
  const narratorRegistry = useOdysseyStore((s) => s.narratorRegistry);
  const setBlockNarrator = useOdysseyStore((s) => s.setBlockNarrator);
  const renameNarrator = useOdysseyStore((s) => s.renameNarrator);
  const recolorNarrator = useOdysseyStore((s) => s.recolorNarrator);
  const mergeNarrators = useOdysseyStore((s) => s.mergeNarrators);
  const unmergeNarrator = useOdysseyStore((s) => s.unmergeNarrator);
  const editor = useOdysseyStore((s) => s.editor);
  const chapters = useOdysseyStore((s) => s.chapters);

  // Local UI state for renaming/recoloring the *current* block's narrator.
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [mergeTarget, setMergeTarget] = useState("");

  // LLM adversarial-evaluator state.
  const [llmLoading, setLlmLoading] = useState(false);
  const [llmProposal, setLlmProposal] = useState<LLMProposal | null>(null);
  const [llmError, setLlmError] = useState<string | null>(null);

  /** Call the /api/evaluator endpoint with the selected block + context. */
  const requestLLMEvaluation = async () => {
    if (!selectedBlock) return;
    setLlmLoading(true);
    setLlmError(null);
    setLlmProposal(null);
    try {
      // Build surrounding context from the chapter: ~3 blocks before + 3 after.
      const cacheKey = `${useOdysseyStore.getState().reader.language}:${selectedBlock.chapterId}`;
      const chapter = chapters.get(cacheKey) as Chapter | undefined;
      let context = "";
      if (chapter) {
        const idx = selectedBlock.index;
        const before = chapter.blocks.slice(Math.max(0, idx - 3), idx);
        const after = chapter.blocks.slice(idx + 1, idx + 4);
        context = [...before, selectedBlock, ...after]
          .map((b) => b.text.slice(0, 200))
          .join("\n\n");
      }
      const res = await fetch("/api/evaluator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chapterId: selectedBlock.chapterId,
          blockId: selectedBlock.id,
          raw: selectedBlock.raw,
          kind: selectedBlock.kind,
          inferredNarratorId: selectedBlock.inferredNarratorId,
          confidence: selectedBlock.confidence,
          reasoning: selectedBlock.reasoning,
          surroundingContext: context,
        }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error ?? `HTTP ${res.status}`);
      }
      const proposal = (await res.json()) as LLMProposal;
      setLlmProposal(proposal);
    } catch (e) {
      setLlmError((e as Error).message);
    } finally {
      setLlmLoading(false);
    }
  };

  if (!selectedBlock) {
    return (
      <div className="flex flex-col h-full">
        <div className="px-3 py-2 border-b flex items-center justify-between">
          <h2 className="text-xs uppercase tracking-widest text-muted-foreground">
            Editor Mode
          </h2>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={onClose}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="flex-1 flex items-center justify-center p-4 text-center text-xs text-muted-foreground">
          <div>
            <Pencil className="h-6 w-6 mx-auto mb-2 opacity-40" />
            <p>Click any paragraph in the reading area to inspect or correct its narrator.</p>
            <div className="mt-4 text-[10px] opacity-70 space-y-1">
              <p>Block corrections: {Object.keys(editor.blockCorrections).length}</p>
              <p>Merges applied: {editor.merges.length}</p>
              <p>Custom names: {Object.keys(editor.narratorOverrides).length}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const currentNarratorId = editor.blockCorrections[selectedBlock.id] ?? selectedBlock.inferredNarratorId;
  const currentNarrator = narratorRegistry.find((n) => n.id === currentNarratorId);
  const override = editor.narratorOverrides[currentNarratorId];
  // Merge currentNarrator with override. If currentNarrator is undefined
  // (e.g. after a merge), fall back to override only, then to a safe default.
  const displayNarrator = currentNarrator
    ? (override ? { ...currentNarrator, ...override } : currentNarrator)
    : override
      ? { id: currentNarratorId, name: "", builtin: false, isCharacter: true, color: "#8b6f47", accent: "#c9a875", ...override }
      : undefined;

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b flex items-center justify-between">
        <h2 className="text-xs uppercase tracking-widest text-muted-foreground">
          Editor · Block
        </h2>
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={onClose}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      <ScrollArea className="flex-1 odyssey-scroll">
        <div className="p-3 space-y-4">
          {/* Block preview */}
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Paragraph (truncated)
            </Label>
            <p className="mt-1 text-xs border-l-2 pl-2 italic line-clamp-4" style={{ borderColor: displayNarrator?.color }}>
              {selectedBlock.text.slice(0, 240)}
              {selectedBlock.text.length > 240 && "…"}
            </p>
            <p className="mt-1 text-[10px] text-muted-foreground">
              {selectedBlock.id} · kind: {selectedBlock.kind}
            </p>
          </div>

          {/* Inference details */}
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Inference
            </Label>
            <div className="mt-1 text-xs space-y-1 bg-muted/40 p-2 rounded">
              <div className="flex justify-between">
                <span>Confidence:</span>
                <span className="tabular-nums">{(selectedBlock.confidence * 100).toFixed(0)}%</span>
              </div>
              <div className="flex justify-between">
                <span>Inferred:</span>
                <span className="truncate ml-2">{selectedBlock.inferredNarratorId}</span>
              </div>
              {selectedBlock.parsedSpeaker && (
                <div className="flex justify-between">
                  <span>Speaker:</span>
                  <span>{selectedBlock.parsedSpeaker}</span>
                </div>
              )}
              <div className="text-muted-foreground italic mt-1">
                {selectedBlock.reasoning}
              </div>
            </div>
          </div>

          {/* LLM adversarial evaluator (Phase 3) */}
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <Sparkles className="h-3 w-3" /> LLM adversarial evaluator
            </Label>
            <Button
              size="sm"
              className="mt-1 h-7 text-xs w-full"
              disabled={llmLoading}
              onClick={requestLLMEvaluation}
            >
              <Sparkles className={cn("h-3 w-3 mr-1", llmLoading && "animate-pulse")} />
              {llmLoading ? "Evaluating…" : "Ask LLM to critique"}
            </Button>
            {llmError && (
              <div className="mt-1 text-[10px] text-destructive flex items-start gap-1">
                <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
                <span className="break-words">{llmError}</span>
              </div>
            )}
            {llmProposal && (
              <div className="mt-2 text-xs space-y-1.5 bg-amber-50/60 dark:bg-amber-950/20 border border-amber-400/40 dark:border-amber-700/40 p-2 rounded">
                <div className="flex justify-between items-center">
                  <span className="font-medium">LLM proposes:</span>
                  <span className="text-[10px] text-muted-foreground tabular-nums">
                    conf {(llmProposal.confidence * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="font-mono text-[11px] bg-background/60 px-1.5 py-0.5 rounded">
                  {llmProposal.proposedNarratorId}
                </div>
                <p className="text-[11px] italic text-foreground/80">{llmProposal.critique}</p>
                {llmProposal.alternatives && llmProposal.alternatives.length > 0 && (
                  <div className="text-[10px] text-muted-foreground">
                    Alternatives: {llmProposal.alternatives.join(", ")}
                  </div>
                )}
                {llmProposal.parseError && (
                  <div className="text-[10px] text-amber-700 dark:text-amber-400">
                    Note: LLM response was not parseable JSON; no automatic proposal.
                  </div>
                )}
                {llmProposal.proposedNarratorId !== currentNarratorId && !llmProposal.parseError && (
                  <Button
                    size="sm"
                    className="h-6 text-[10px] w-full mt-1"
                    onClick={() => {
                      setBlockNarrator(selectedBlock.id, llmProposal.proposedNarratorId);
                      setLlmProposal(null);
                    }}
                  >
                    <Check className="h-3 w-3 mr-1" /> Accept proposal
                  </Button>
                )}
              </div>
            )}
            <p className="mt-1 text-[10px] text-muted-foreground/70">
              Calls the LLM (z-ai-web-dev-sdk) on the server. Proposals are suggestions — accept or ignore.
            </p>
          </div>

          {/* Reassign narrator */}
          <div>
            <Label htmlFor="narrator-select" className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Assign narrator
            </Label>
            <select
              id="narrator-select"
              value={currentNarratorId}
              onChange={(e) => setBlockNarrator(selectedBlock.id, e.target.value)}
              className="mt-1 w-full h-8 rounded border border-border bg-background px-2 text-xs"
            >
              {narratorRegistry
                .sort((a, b) => {
                  if (a.builtin !== b.builtin) return a.builtin ? -1 : 1;
                  return a.name.localeCompare(b.name);
                })
                .map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name} {n.builtin ? "(voice)" : "(character)"}
                  </option>
                ))}
            </select>
            {editor.blockCorrections[selectedBlock.id] && (
              <Button
                variant="ghost"
                size="sm"
                className="mt-1 h-6 text-[10px] text-muted-foreground w-full"
                onClick={() => {
                  const corrections = { ...editor.blockCorrections };
                  delete corrections[selectedBlock.id];
                  useOdysseyStore.setState({
                    editor: { ...editor, blockCorrections: corrections },
                  });
                }}
              >
                Reset to inference
              </Button>
            )}
          </div>

          {/* Rename + recolor current narrator */}
          {displayNarrator && !displayNarrator.builtin && (
            <div>
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Narrator metadata
              </Label>
              <div className="mt-1 space-y-2">
                <div className="flex gap-1">
                  <Input
                    value={renameValue || displayNarrator.name || ""}
                    onChange={(e) => {
                      setRenaming(true);
                      setRenameValue(e.target.value);
                    }}
                    className="h-7 text-xs"
                    placeholder="Display name"
                  />
                  <Button
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => {
                      renameNarrator(currentNarratorId, renameValue || displayNarrator.name || "");
                      setRenaming(false);
                    }}
                  >
                    Save
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-[10px]">Color</Label>
                  <input
                    type="color"
                    value={displayNarrator.color || "#8b6f47"}
                    onChange={(e) => recolorNarrator(currentNarratorId, e.target.value)}
                    className="h-6 w-8 cursor-pointer border rounded"
                  />
                  <Label className="text-[10px]">Accent</Label>
                  <input
                    type="color"
                    value={displayNarrator.accent || "#c9a875"}
                    onChange={(e) => recolorNarrator(currentNarratorId, displayNarrator.color || "#8b6f47", e.target.value)}
                    className="h-6 w-8 cursor-pointer border rounded"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Merge */}
          {displayNarrator && !displayNarrator.builtin && (
            <div>
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <GitMerge className="h-3 w-3" /> Merge into…
              </Label>
              <select
                value={mergeTarget}
                onChange={(e) => setMergeTarget(e.target.value)}
                className="mt-1 w-full h-8 rounded border border-border bg-background px-2 text-xs"
              >
                <option value="">— select target narrator —</option>
                {narratorRegistry
                  .filter((n) => n.id !== currentNarratorId && (n.builtin ? false : true))
                  .map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.name}
                    </option>
                  ))}
              </select>
              <div className="flex gap-1 mt-1">
                <Button
                  size="sm"
                  className="h-7 text-xs flex-1"
                  disabled={!mergeTarget}
                  onClick={() => {
                    mergeNarrators(currentNarratorId, mergeTarget);
                    setMergeTarget("");
                  }}
                >
                  Merge {displayNarrator.name} → {narratorRegistry.find((n) => n.id === mergeTarget)?.name ?? "…"}
                </Button>
              </div>
              {editor.merges.some((m) => m.fromId === currentNarratorId) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-1 h-6 text-[10px] text-muted-foreground w-full"
                  onClick={() => unmergeNarrator(currentNarratorId)}
                >
                  Undo merge
                </Button>
              )}
            </div>
          )}

          {/* Block-level corrections audit */}
          {Object.keys(editor.blockCorrections).length > 0 && (
            <div>
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                All corrections ({Object.keys(editor.blockCorrections).length})
              </Label>
              <ul className="mt-1 text-[10px] space-y-1 max-h-32 overflow-y-auto">
                {Object.entries(editor.blockCorrections).slice(-10).reverse().map(([blockId, narratorId]) => {
                  const [slug, idx] = blockId.split(":");
                  return (
                    <li key={blockId} className="flex items-center justify-between gap-1">
                      <span className="truncate">
                        {slug.replace("odyssey-book-", "B")}:#{idx}
                      </span>
                      <span className="text-muted-foreground truncate">→ {narratorRegistry.find((n) => n.id === narratorId)?.name ?? narratorId}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
