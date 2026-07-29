"use client";

import { Moon, Sun, Monitor, Type, Eye, Accessibility, RotateCcw, Compass } from "lucide-react";
import { useOdysseyStore } from "@/lib/odyssey/store";
import { replayTour } from "@/components/odyssey/Tour";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

export function SettingsPanel() {
  const reader = useOdysseyStore((s) => s.reader);
  const setReaderPref = useOdysseyStore((s) => s.setReaderPref);
  const resetEditor = useOdysseyStore((s) => s.resetEditor);

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b">
        <h2 className="text-xs uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
          <Accessibility className="h-3.5 w-3.5" /> Reading & Accessibility
        </h2>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-5 odyssey-scroll">
        {/* Replay tour */}
        <section>
          <Button
            variant="outline"
            size="sm"
            className="w-full h-8 text-xs"
            onClick={() => replayTour()}
          >
            <Compass className="h-3.5 w-3.5 mr-1.5" /> Replay interactive tour
          </Button>
        </section>

        {/* Theme */}
        <section>
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Theme</Label>
          <div className="mt-1 grid grid-cols-3 gap-1">
            <Button
              variant={reader.theme === "light" ? "default" : "outline"}
              size="sm"
              className="h-8 text-xs"
              onClick={() => setReaderPref("theme", "light")}
            >
              <Sun className="h-3.5 w-3.5 mr-1" /> Light
            </Button>
            <Button
              variant={reader.theme === "dark" ? "default" : "outline"}
              size="sm"
              className="h-8 text-xs"
              onClick={() => setReaderPref("theme", "dark")}
            >
              <Moon className="h-3.5 w-3.5 mr-1" /> Dark
            </Button>
            <Button
              variant={reader.theme === "system" ? "default" : "outline"}
              size="sm"
              className="h-8 text-xs"
              onClick={() => setReaderPref("theme", "system")}
            >
              <Monitor className="h-3.5 w-3.5 mr-1" /> Auto
            </Button>
          </div>
        </section>

        {/* Font family */}
        <section>
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Font</Label>
          <Select
            value={reader.fontFamily}
            onValueChange={(v) => setReaderPref("fontFamily", v as "serif" | "sans" | "wenkai" | "lexend" | "atkinson")}
          >
            <SelectTrigger className="h-8 text-xs mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="serif">Cormorant (classic serif)</SelectItem>
              <SelectItem value="sans">Geist (clean sans)</SelectItem>
              <SelectItem value="lexend">Lexend (reading proficiency)</SelectItem>
              <SelectItem value="atkinson">Atkinson Hyperlegible (low vision)</SelectItem>
              <SelectItem value="wenkai">System serif fallback</SelectItem>
            </SelectContent>
          </Select>
        </section>

        {/* Font size */}
        <section>
          <div className="flex justify-between items-center">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <Type className="h-3 w-3" /> Font size
            </Label>
            <span className="text-xs tabular-nums">{reader.fontSize}px</span>
          </div>
          <Slider
            value={[reader.fontSize]}
            onValueChange={([v]) => setReaderPref("fontSize", v)}
            min={12}
            max={32}
            step={1}
            className="mt-2"
            aria-label="Font size"
          />
        </section>

        {/* Line height */}
        <section>
          <div className="flex justify-between items-center">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Line height</Label>
            <span className="text-xs tabular-nums">{reader.lineHeight.toFixed(2)}</span>
          </div>
          <Slider
            value={[reader.lineHeight]}
            onValueChange={([v]) => setReaderPref("lineHeight", v)}
            min={1.3}
            max={2.2}
            step={0.05}
            className="mt-2"
            aria-label="Line height"
          />
        </section>

        {/* Paragraph spacing */}
        <section>
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Paragraph spacing</Label>
          <Select
            value={reader.paragraphSpacing}
            onValueChange={(v) => setReaderPref("paragraphSpacing", v as "compact" | "comfortable" | "spacious")}
          >
            <SelectTrigger className="h-8 text-xs mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="compact">Compact</SelectItem>
              <SelectItem value="comfortable">Comfortable</SelectItem>
              <SelectItem value="spacious">Spacious</SelectItem>
            </SelectContent>
          </Select>
        </section>

        <Separator />

        {/* Accessibility */}
        <section className="space-y-3">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
            <Eye className="h-3 w-3" /> Accessibility
          </Label>

          <div className="flex items-center justify-between">
            <Label htmlFor="hc" className="text-xs">High contrast</Label>
            <Switch
              id="hc"
              checked={reader.highContrast}
              onCheckedChange={(v) => setReaderPref("highContrast", v)}
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="bw" className="text-xs">Black & white (pure)</Label>
            <Switch
              id="bw"
              checked={reader.colorBlindMode === "bw"}
              onCheckedChange={(v) => setReaderPref("colorBlindMode", v ? "bw" : "none")}
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="rm" className="text-xs">Reduced motion</Label>
            <Switch
              id="rm"
              checked={reader.reducedMotion}
              onCheckedChange={(v) => setReaderPref("reducedMotion", v)}
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="nl" className="text-xs">Show narrator labels</Label>
            <Switch
              id="nl"
              checked={reader.showNarratorLabels}
              onCheckedChange={(v) => setReaderPref("showNarratorLabels", v)}
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="fi" className="text-xs">Footnotes inline</Label>
            <Switch
              id="fi"
              checked={reader.showFootnotesInline}
              onCheckedChange={(v) => setReaderPref("showFootnotesInline", v)}
            />
          </div>

          <div>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Color-blind palette</Label>
            <Select
              value={reader.colorBlindMode}
              onValueChange={(v) => setReaderPref("colorBlindMode", v as "none" | "protanopia" | "deuteranopia" | "tritanopia" | "bw")}
            >
              <SelectTrigger className="h-8 text-xs mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="bw">Black & white (pure)</SelectItem>
                <SelectItem value="protanopia">Protanopia (red-blind)</SelectItem>
                <SelectItem value="deuteranopia">Deuteranopia (green-blind)</SelectItem>
                <SelectItem value="tritanopia">Tritanopia (blue-blind)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </section>

        <Separator />

        <section>
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Editor state</Label>
          <Button
            variant="outline"
            size="sm"
            className="mt-1 h-7 text-xs w-full"
            onClick={() => {
              if (confirm("Reset all narrator corrections, merges, and overrides?")) {
                resetEditor();
              }
            }}
          >
            <RotateCcw className="h-3 w-3 mr-1" /> Reset all corrections
          </Button>
          <p className="mt-1 text-[10px] text-muted-foreground/80">
            Resets block assignments, merges, and narrator metadata. Reading preferences are kept.
          </p>
        </section>
      </div>
    </div>
  );
}
