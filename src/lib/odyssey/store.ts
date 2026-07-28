/**
 * Odyssey Application Store (Zustand + localStorage persistence)
 * --------------------------------------------------------------
 * Single source of truth for:
 *   • Loaded chapters (cached after first fetch)
 *   • Per-chapter audit trail (disagreements, adversarial flags)
 *   • Globally-resolved narrator registry
 *   • Per-block narrator (post-correction)
 *   • Reader preferences + editor state + visibility + bookmarks
 *
 * Persistence: the entire store is serialized to localStorage under a single
 * key. Chapters and audit trails are NOT persisted (too large + re-derivable);
 * only the user-facing state is.
 */

"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  Chapter,
  Narrator,
  NarratorMerge,
  PersistedState,
  ReaderPreferences,
  ValidationDisagreement,
} from "./types";
import { fetchChapterMarkdown, CHAPTER_MANIFEST, ODYSSEUS_INNER_BOOKS } from "./chapters";
import { fullAnalysisPipeline, type ValidationDisagreement as VD } from "./narrator-engine";
import {
  buildNarratorRegistry,
  computeNarratorStats,
  resolveBlockNarrator,
  type NarratorStats,
} from "./identity";

/** Default reader preferences — used on first visit. */
const DEFAULT_READER: ReaderPreferences = {
  theme: "system",
  fontSize: 19,
  lineHeight: 1.7,
  fontFamily: "serif",
  highContrast: false,
  reducedMotion: false,
  colorBlindMode: "none",
  showFootnotesInline: true,
  showNarratorLabels: false,
  paragraphSpacing: "comfortable",
};

interface OdysseyState {
  // --- Cached, derived data (NOT persisted) ---
  chapters: Map<string, Chapter>; // keyed by slug
  loading: boolean;
  error: string | null;
  auditTrails: Map<string, { disagreements: VD[]; flags: { blockId: string; reason: string }[] }>;
  narratorRegistry: Narrator[];
  narratorStats: Map<string, NarratorStats>;

  // --- Persisted user state ---
  reader: ReaderPreferences;
  editor: {
    blockCorrections: Record<string, string>;
    narratorOverrides: Record<string, Partial<Narrator>>;
    merges: NarratorMerge[];
    editorMode: boolean;
  };
  visibility: Record<string, boolean>;
  currentChapterId: string | null;
  scrollProgress: Record<string, number>;
  bookmarks: string[];
  annotations: Record<string, string>;

  // --- Actions ---
  loadChapter: (slug: string) => Promise<Chapter>;
  loadAllChapters: () => Promise<void>;
  setCurrentChapter: (slug: string) => void;
  setReaderPref: <K extends keyof ReaderPreferences>(key: K, value: ReaderPreferences[K]) => void;
  toggleNarratorVisibility: (narratorId: string) => void;
  setNarratorVisibility: (narratorId: string, visible: boolean) => void;
  setEditorMode: (on: boolean) => void;
  setBlockNarrator: (blockId: string, narratorId: string) => void;
  renameNarrator: (narratorId: string, newName: string) => void;
  recolorNarrator: (narratorId: string, color: string, accent?: string) => void;
  mergeNarrators: (fromId: string, toId: string) => void;
  unmergeNarrator: (fromId: string) => void;
  setScrollProgress: (chapterId: string, progress: number) => void;
  toggleBookmark: (blockId: string) => void;
  setAnnotation: (blockId: string, text: string) => void;
  resetEditor: () => void;
  /** Re-derive narrator registry + stats after a correction. */
  rebuildRegistry: () => void;
}

export const useOdysseyStore = create<OdysseyState>()(
  persist(
    (set, get) => ({
      // --- Non-persisted ---
      chapters: new Map(),
      loading: false,
      error: null,
      auditTrails: new Map(),
      narratorRegistry: [],
      narratorStats: new Map(),

      // --- Persisted (initial defaults) ---
      reader: DEFAULT_READER,
      editor: {
        blockCorrections: {},
        narratorOverrides: {},
        merges: [],
        editorMode: false,
      },
      visibility: {},
      currentChapterId: null,
      scrollProgress: {},
      bookmarks: [],
      annotations: {},

      // --- Actions ---

      loadChapter: async (slug: string) => {
        const existing = get().chapters.get(slug);
        if (existing) return existing;
        try {
          set({ loading: true, error: null });
          const raw = await fetchChapterMarkdown(slug);
          const meta = CHAPTER_MANIFEST.find((c) => c.slug === slug);
          if (!meta) throw new Error(`Unknown chapter slug: ${slug}`);
          const { chapter, disagreements, flags } = fullAnalysisPipeline(slug, meta.number, raw);
          set((state) => {
            const chapters = new Map(state.chapters);
            chapters.set(slug, chapter);
            const auditTrails = new Map(state.auditTrails);
            auditTrails.set(slug, { disagreements, flags });
            const narratorRegistry = buildNarratorRegistry(
              Array.from(chapters.values()),
              state.editor.merges,
            );
            const narratorStats = computeNarratorStats(
              Array.from(chapters.values()),
              state.editor.merges,
              state.editor.blockCorrections,
            );
            return {
              chapters,
              auditTrails,
              narratorRegistry,
              narratorStats,
              loading: false,
            };
          });
          return get().chapters.get(slug)!;
        } catch (e) {
          set({ loading: false, error: (e as Error).message });
          throw e;
        }
      },

      loadAllChapters: async () => {
        set({ loading: true, error: null });
        try {
          const slugs = CHAPTER_MANIFEST.map((c) => c.slug);
          // Load sequentially to keep memory bounded; chapters are small.
          for (const slug of slugs) {
            await get().loadChapter(slug);
          }
          set({ loading: false });
        } catch (e) {
          set({ loading: false, error: (e as Error).message });
        }
      },

      setCurrentChapter: (slug) => set({ currentChapterId: slug }),

      setReaderPref: (key, value) =>
        set((state) => ({ reader: { ...state.reader, [key]: value } })),

      toggleNarratorVisibility: (narratorId) =>
        set((state) => ({
          visibility: {
            ...state.visibility,
            [narratorId]: state.visibility[narratorId] === false ? true : false,
          },
        })),

      setNarratorVisibility: (narratorId, visible) =>
        set((state) => ({
          visibility: { ...state.visibility, [narratorId]: visible },
        })),

      setEditorMode: (on) =>
        set((state) => ({ editor: { ...state.editor, editorMode: on } })),

      setBlockNarrator: (blockId, narratorId) =>
        set((state) => {
          const blockCorrections = { ...state.editor.blockCorrections, [blockId]: narratorId };
          const narratorStats = computeNarratorStats(
            Array.from(state.chapters.values()),
            state.editor.merges,
            blockCorrections,
          );
          return {
            editor: { ...state.editor, blockCorrections },
            narratorStats,
          };
        }),

      renameNarrator: (narratorId, newName) =>
        set((state) => ({
          editor: {
            ...state.editor,
            narratorOverrides: {
              ...state.editor.narratorOverrides,
              [narratorId]: {
                ...state.editor.narratorOverrides[narratorId],
                name: newName,
              },
            },
          },
        })),

      recolorNarrator: (narratorId, color, accent) =>
        set((state) => ({
          editor: {
            ...state.editor,
            narratorOverrides: {
              ...state.editor.narratorOverrides,
              [narratorId]: {
                ...state.editor.narratorOverrides[narratorId],
                color,
                ...(accent !== undefined ? { accent } : {}),
              },
            },
          },
        })),

      mergeNarrators: (fromId, toId) =>
        set((state) => {
          // Remove any existing merge from fromId, then add new one.
          const merges = state.editor.merges.filter((m) => m.fromId !== fromId);
          merges.push({
            fromId,
            toId,
            createdAt: new Date().toISOString(),
          });
          const narratorRegistry = buildNarratorRegistry(
            Array.from(state.chapters.values()),
            merges,
          );
          const narratorStats = computeNarratorStats(
            Array.from(state.chapters.values()),
            merges,
            state.editor.blockCorrections,
          );
          return {
            editor: { ...state.editor, merges },
            narratorRegistry,
            narratorStats,
          };
        }),

      unmergeNarrator: (fromId) =>
        set((state) => {
          const merges = state.editor.merges.filter((m) => m.fromId !== fromId);
          const narratorRegistry = buildNarratorRegistry(
            Array.from(state.chapters.values()),
            merges,
          );
          const narratorStats = computeNarratorStats(
            Array.from(state.chapters.values()),
            merges,
            state.editor.blockCorrections,
          );
          return {
            editor: { ...state.editor, merges },
            narratorRegistry,
            narratorStats,
          };
        }),

      setScrollProgress: (chapterId, progress) =>
        set((state) => ({
          scrollProgress: { ...state.scrollProgress, [chapterId]: progress },
        })),

      toggleBookmark: (blockId) =>
        set((state) => ({
          bookmarks: state.bookmarks.includes(blockId)
            ? state.bookmarks.filter((b) => b !== blockId)
            : [...state.bookmarks, blockId],
        })),

      setAnnotation: (blockId, text) =>
        set((state) => {
          const annotations = { ...state.annotations };
          if (text.trim()) {
            annotations[blockId] = text;
          } else {
            delete annotations[blockId];
          }
          return { annotations };
        }),

      resetEditor: () =>
        set({
          editor: {
            blockCorrections: {},
            narratorOverrides: {},
            merges: [],
            editorMode: false,
          },
        }),

      rebuildRegistry: () =>
        set((state) => {
          const narratorRegistry = buildNarratorRegistry(
            Array.from(state.chapters.values()),
            state.editor.merges,
          );
          const narratorStats = computeNarratorStats(
            Array.from(state.chapters.values()),
            state.editor.merges,
            state.editor.blockCorrections,
          );
          return { narratorRegistry, narratorStats };
        }),
    }),
    {
      name: "odyssey-reader-v1",
      storage: createJSONStorage(() => localStorage),
      // Only persist user-facing state; chapters / registry are re-derived.
      partialize: (state) => ({
        reader: state.reader,
        editor: state.editor,
        visibility: state.visibility,
        currentChapterId: state.currentChapterId,
        scrollProgress: state.scrollProgress,
        bookmarks: state.bookmarks,
        annotations: state.annotations,
      }),
    },
  ),
);

/** Convenience selector: resolve the effective narrator for a block. */
export function useBlockNarrator(block: { id: string; inferredNarratorId: string }): Narrator | undefined {
  const { editor, narratorRegistry } = useOdysseyStore();
  const effectiveId = resolveBlockNarrator(
    { id: block.id, inferredNarratorId: block.inferredNarratorId } as any,
    editor.merges,
    editor.blockCorrections,
  );
  const base = narratorRegistry.find((n) => n.id === effectiveId);
  if (!base) return undefined;
  const override = editor.narratorOverrides[effectiveId];
  if (!override) return base;
  return { ...base, ...override } as Narrator;
}
