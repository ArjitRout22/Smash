"use client";

import { Share, SquarePlus } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/primitives";

/**
 * iOS "Add to Home Screen" education flow. iOS Safari has no programmatic
 * install prompt (unlike Android's beforeinstallprompt), so we teach the manual
 * steps with the real iOS glyphs — the Share icon (square + up arrow) and the
 * Add to Home Screen icon (square + plus). Rendered as the app's bottom-sheet
 * Modal so it already feels native on iPhone.
 */
export function IosInstallGuide({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add Smash to your Home Screen"
      footer={<Button onClick={onClose}>Got it</Button>}
    >
      <div className="flex flex-col gap-5">
        <p className="text-sm text-muted">
          Three quick steps in Safari — then Smash opens full-screen, just like a native app.
        </p>

        <ol className="flex flex-col gap-4">
          <Step
            n={1}
            title="Tap the Share button"
            glyph={<Share className="h-5 w-5" strokeWidth={2} />}
            desc="It's in Safari's toolbar — the square with an up arrow (bottom on iPhone, top on iPad)."
          />
          <Step
            n={2}
            title="Choose “Add to Home Screen”"
            glyph={<SquarePlus className="h-5 w-5" strokeWidth={2} />}
            desc="Scroll down the share sheet if you don't see it right away."
          />
          <Step
            n={3}
            title="Tap “Add”"
            glyph={<span className="px-0.5 text-xs font-bold leading-none">Add</span>}
            desc="Confirm in the top-right corner — the 🏸 Smash icon lands on your Home Screen."
          />
        </ol>
      </div>
    </Modal>
  );
}

function Step({ n, title, glyph, desc }: { n: number; title: string; glyph: React.ReactNode; desc: string }) {
  return (
    <li className="flex items-start gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-foreground">{title}</span>
          <span className="inline-flex h-7 min-w-[1.75rem] items-center justify-center rounded-lg border border-[var(--border)] bg-surface-2 px-1.5 text-primary">
            {glyph}
          </span>
        </div>
        <p className="mt-1 text-sm text-muted">{desc}</p>
      </div>
    </li>
  );
}
