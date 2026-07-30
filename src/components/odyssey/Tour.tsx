"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, X, Check } from "lucide-react";
import { useOdysseyStore } from "@/lib/odyssey/store";

interface TourStep {
  /** Selector for the element to highlight. */
  target: string;
  /** Title shown in the popover. */
  title: string;
  /** Body text. */
  body: string;
  /** Optional: action to perform when entering this step (e.g., open a panel). */
  onEnter?: () => void;
  /** Position of the popover relative to the target. */
  position?: "bottom" | "top" | "left" | "right" | "center";
}

const TOUR_STEPS: TourStep[] = [
  {
    target: 'nav[aria-label="Chapter navigation"]',
    title: "Chapter Navigation",
    body: "Browse all 25 chapters of The Odyssey here. Click any chapter to start reading. Your reading progress is saved automatically.",
    position: "right",
  },
  {
    target: 'button[aria-label="Toggle contents"]',
    title: "Contents Panel",
    body: "Tap this to show or hide the chapter list. On mobile, the panel slides in as an overlay.",
    position: "bottom",
  },
  {
    target: 'button[aria-label="Decrease font size"]',
    title: "Font Size Controls",
    body: "Use A− and A+ to instantly adjust text size (12–32px). Your preference is saved automatically. You can also choose dyslexia-friendly fonts in Settings.",
    position: "bottom",
  },
  {
    target: 'div[role="group"][aria-label="Language toggle"]',
    title: "Language Toggle",
    body: "Switch between English and Spanish (LATAM). All 25 chapters are translated. The interface labels change too — try it!",
    position: "bottom",
  },
  {
    target: 'button[aria-label="Toggle narrator legend"]',
    title: "Narrator Legend",
    body: "Every paragraph is colored by narrator — the Guide (bronze), Odysseus (blue), character speakers (varied colors). Open this panel to see all narrators, their stats, and toggle visibility.",
    position: "bottom",
    onEnter: () => {
      // Open the narrator legend panel
      const state = useOdysseyStore.getState();
      if (state.reader.language) {
        // Ensure legend is showing
        const btn = document.querySelector('button[aria-label="Toggle narrator legend"]') as HTMLElement;
        if (btn) {
          const aside = document.querySelector('aside[aria-label="Detail panel"]');
          const asideW = aside?.offsetWidth ?? 0;
          if (asideW < 10 || !(aside?.textContent?.includes("Hide"))) {
            btn.click();
          }
        }
      }
    },
  },
  {
    target: 'aside[aria-label="Detail panel"]',
    title: "Folding System",
    body: "Click the eye icon next to any narrator to hide their paragraphs. Hidden content collapses into elegant 'folded seams' — click a seam to expand. When the Guide is folded, speaker badges appear on dialogue that relied on the Guide's context.",
    position: "left",
  },
  {
    target: 'button[aria-label="Toggle editor mode"]',
    title: "Editor Mode",
    body: "Turn on Editor Mode to inspect any paragraph's narrator assignment. Click a paragraph to see its confidence score, reasoning, and correct the assignment if needed. You can also rename, recolor, and merge narrators.",
    position: "bottom",
  },
  {
    target: 'button[aria-label="Bookmarks and annotations"]',
    title: "Bookmarks & Annotations",
    body: "Hover any paragraph to reveal bookmark and annotation icons in the margin. Save notes, bookmark passages, and export everything as Markdown or JSON. All data persists in your browser — no login needed.",
    position: "bottom",
  },
  {
    target: 'button[aria-label="Search"]',
    title: "Search",
    body: "Search across all 25 chapters. Results show the chapter, narrator, and a text snippet. Click any result to jump directly to that passage.",
    position: "bottom",
  },
  {
    target: 'button[aria-label="Settings"]',
    title: "Settings & Accessibility",
    body: "Customize your reading experience: theme (light/dark/auto), fonts (including dyslexia-friendly Lexend and low-vision Atkinson Hyperlegible), high contrast, pure black & white mode, reduced motion, color-blind palettes, and more.",
    position: "bottom",
  },
  {
    target: 'main[role="main"]',
    title: "Happy Reading!",
    body: "That's the tour! You can replay it anytime via the Settings panel. Your preferences, bookmarks, and annotations are saved locally — no account needed. Enjoy The Odyssey.",
    position: "center",
  },
];

const TOUR_STORAGE_KEY = "odyssey-tour-completed";

export function Tour() {
  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const startTour = useCallback(() => {
    setActive(true);
    setStepIndex(0);
  }, []);

  const closeTour = useCallback(() => {
    setActive(false);
    try {
      localStorage.setItem(TOUR_STORAGE_KEY, "true");
    } catch {}
  }, []);

  const nextStep = useCallback(() => {
    setStepIndex((prev) => {
      if (prev < TOUR_STEPS.length - 1) return prev + 1;
      else {
        closeTour();
        return prev;
      }
    });
  }, [closeTour]);

  const prevStep = useCallback(() => {
    setStepIndex((prev) => Math.max(0, prev - 1));
  }, []);

  // Check if this is the user's first visit
  useEffect(() => {
    try {
      const completed = localStorage.getItem(TOUR_STORAGE_KEY);
      if (!completed) {
        // Auto-start tour after a short delay (let the page load)
        const timer = setTimeout(() => {
          startTour();
        }, 1500);
        return () => clearTimeout(timer);
      }
    } catch {
      // localStorage not available
    }
  }, [startTour]);

  // Update target position when step changes or window resizes
  const updateTargetRect = useCallback(() => {
    const step = TOUR_STEPS[stepIndex];
    if (!step) return;
    if (step.position === "center") {
      setTargetRect(null);
      return;
    }
    const el = document.querySelector(step.target);
    if (el) {
      const rect = el.getBoundingClientRect();
      setTargetRect(rect);
      // Scroll the element into view if needed
      if (rect.top < 100 || rect.bottom > window.innerHeight - 100) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    } else {
      setTargetRect(null);
    }
  }, [stepIndex]);

  useEffect(() => {
    if (!active) return;
    const step = TOUR_STEPS[stepIndex];
    if (step?.onEnter) {
      step.onEnter();
    }
    // Wait a tick for any DOM changes from onEnter
    const timer = setTimeout(updateTargetRect, 300);
    return () => clearTimeout(timer);
  }, [active, stepIndex, updateTargetRect]);

  useEffect(() => {
    if (!active) return;
    const onResize = () => updateTargetRect();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, { passive: true });
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize);
    };
  }, [active, updateTargetRect]);

  // Handle Escape key
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeTour();
      if (e.key === "ArrowRight") nextStep();
      if (e.key === "ArrowLeft") prevStep();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!active) return null;

  const step = TOUR_STEPS[stepIndex];
  if (!step) return null;

  const isLast = stepIndex === TOUR_STEPS.length - 1;
  const isCenter = step.position === "center" || !targetRect;

  // Calculate popover position
  let popoverStyle: React.CSSProperties = {};
  let highlightStyle: React.CSSProperties = {};

  if (targetRect && !isCenter) {
    // Highlight box around the target
    highlightStyle = {
      position: "fixed",
      top: targetRect.top - 4,
      left: targetRect.left - 4,
      width: targetRect.width + 8,
      height: targetRect.height + 8,
      borderRadius: "8px",
      boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.55)",
      zIndex: 50,
      pointerEvents: "none",
      transition: "all 0.3s ease",
    };

    // Position popover relative to target
    const popoverW = 320;
    const popoverH = 200; // approximate
    const gap = 12;

    switch (step.position) {
      case "bottom":
        popoverStyle = {
          position: "fixed",
          top: Math.min(targetRect.bottom + gap, window.innerHeight - popoverH - 10),
          left: Math.max(10, Math.min(targetRect.left, window.innerWidth - popoverW - 10)),
          width: Math.min(popoverW, window.innerWidth - 20),
        };
        break;
      case "top":
        popoverStyle = {
          position: "fixed",
          top: Math.max(10, targetRect.top - gap - popoverH),
          left: Math.max(10, Math.min(targetRect.left, window.innerWidth - popoverW - 10)),
          width: Math.min(popoverW, window.innerWidth - 20),
        };
        break;
      case "right":
        popoverStyle = {
          position: "fixed",
          top: Math.max(10, Math.min(targetRect.top, window.innerHeight - popoverH - 10)),
          left: Math.min(targetRect.right + gap, window.innerWidth - popoverW - 10),
          width: Math.min(popoverW, window.innerWidth - 20),
        };
        break;
      case "left":
        popoverStyle = {
          position: "fixed",
          top: Math.max(10, Math.min(targetRect.top, window.innerHeight - popoverH - 10)),
          left: Math.max(10, targetRect.left - gap - popoverW),
          width: Math.min(popoverW, window.innerWidth - 20),
        };
        break;
    }
  } else {
    // Center modal for the last step
    popoverStyle = {
      position: "fixed",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      width: "min(400px, calc(100vw - 32px))",
    };
    highlightStyle = {
      position: "fixed",
      inset: 0,
      background: "rgba(0, 0, 0, 0.55)",
      zIndex: 50,
      pointerEvents: "none",
    };
  }

  return (
    <>
      {/* Highlight overlay */}
      <div style={highlightStyle} />

      {/* Popover */}
      <div
        ref={popoverRef}
        style={popoverStyle}
        className="fixed z-[60] bg-card border border-border rounded-lg shadow-2xl p-5 animate-in fade-in zoom-in-95 duration-200"
        role="dialog"
        aria-label={`Tour step ${stepIndex + 1}: ${step.title}`}
      >
        {/* Step indicator */}
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">
            {isLast ? "Final Step" : `Step ${stepIndex + 1} of ${TOUR_STEPS.length}`}
          </span>
          <button
            onClick={closeTour}
            className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded"
            aria-label="Close tour"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Title */}
        <h3 className="font-serif text-lg font-semibold mb-2 text-foreground">
          {step.title}
        </h3>

        {/* Body */}
        <p className="text-sm text-muted-foreground leading-relaxed mb-4">
          {step.body}
        </p>

        {/* Progress dots */}
        <div className="flex items-center gap-1 mb-4">
          {TOUR_STEPS.map((_, i) => (
            <div
              key={i}
              className={cn(
                "h-1.5 rounded-full transition-all",
                i === stepIndex ? "w-6 bg-primary" : i < stepIndex ? "w-1.5 bg-primary/50" : "w-1.5 bg-border",
              )}
            />
          ))}
        </div>

        {/* Navigation buttons */}
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={prevStep}
            disabled={stepIndex === 0}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Back
          </button>

          <div className="flex gap-2">
            <button
              onClick={closeTour}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1"
            >
              Skip
            </button>
            {!isLast ? (
              <button
                onClick={nextStep}
                className="flex items-center gap-1 text-xs bg-primary text-primary-foreground hover:bg-primary/90 transition-colors px-3 py-1.5 rounded-md font-medium"
              >
                Next <ChevronRight className="h-3.5 w-3.5" />
              </button>
            ) : (
              <button
                onClick={closeTour}
                className="flex items-center gap-1 text-xs bg-primary text-primary-foreground hover:bg-primary/90 transition-colors px-3 py-1.5 rounded-md font-medium"
              >
                <Check className="h-3.5 w-3.5" /> Got it
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

/** Hook to check if the tour has been completed. */
export function useTourCompleted(): boolean {
  try {
    return !!localStorage.getItem(TOUR_STORAGE_KEY);
  } catch {
    return false;
  }
}

/** Programmatically start the tour (for the "Replay tour" button). */
export function replayTour() {
  try {
    localStorage.removeItem(TOUR_STORAGE_KEY);
  } catch {}
  // Force re-render of the Tour component by dispatching a storage event
  window.dispatchEvent(new Event("storage"));
  // The Tour component will auto-start on next render
  setTimeout(() => {
    window.location.reload();
  }, 100);
}
