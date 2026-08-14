"use client";

import { useState } from "react";
import { Share2, Check } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";

/** WhatsApp glyph (lucide has no brand icons). */
function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.945C.16 5.335 5.495 0 12.05 0a11.82 11.82 0 018.413 3.488 11.82 11.82 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 001.51 5.26l-.999 3.648 3.978-1.607zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.767.967-.94 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
    </svg>
  );
}

/**
 * Share a link: WhatsApp (prefilled), the native share sheet (mobile), and a
 * copy-to-clipboard fallback (desktop). WhatsApp is first because it's where our
 * players live. Used for the app, public tournaments, and results.
 */
export function ShareButton({
  url,
  title,
  text,
  label = "Share",
  variant = "outline",
  size = "sm",
  whatsapp = true,
}: {
  url: string;
  title: string;
  text?: string;
  label?: string;
  variant?: "primary" | "outline" | "ghost";
  size?: "sm" | "md";
  whatsapp?: boolean;
}) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  // A plain anchor deep-links reliably into WhatsApp on mobile (window.open with
  // noopener drops the prefilled text and lands on a blank chat).
  const waHref = `https://wa.me/?text=${encodeURIComponent(`${text ? `${text}\n` : ""}${url}`)}`;
  const btnCls = `inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-surface font-medium text-foreground transition hover:bg-surface-2 ${size === "md" ? "h-10 px-4 text-sm" : "h-8 px-3 text-sm"}`;

  // In an INSTALLED PWA, a `target="_blank"` link opens a sandboxed in-app
  // browser that can't hand off to WhatsApp (nothing happens / blank page). When
  // running standalone, navigate the current context so iOS/Android open the
  // WhatsApp app directly.
  function onWhatsApp(e: React.MouseEvent<HTMLAnchorElement>) {
    const nav = window.navigator as Navigator & { standalone?: boolean };
    const standalone = window.matchMedia?.("(display-mode: standalone)").matches || nav.standalone === true;
    if (standalone) {
      e.preventDefault();
      window.location.href = waHref;
    }
  }

  async function share() {
    const nav = typeof navigator !== "undefined" ? navigator : undefined;
    if (nav?.share) {
      try {
        await nav.share({ title, text, url });
        return;
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
      }
    }
    try {
      await nav!.clipboard.writeText(url);
      setCopied(true);
      toast.success("Link copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't share — copy the link from your address bar.");
    }
  }

  return (
    <div className="inline-flex gap-2">
      {whatsapp && (
        <a href={waHref} onClick={onWhatsApp} target="_blank" rel="noopener noreferrer" className={btnCls} aria-label="Share on WhatsApp">
          <WhatsAppIcon className="h-4 w-4 text-[#25D366]" /> WhatsApp
        </a>
      )}
      <Button variant={variant} size={size} onClick={share}>
        {copied ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />} {label}
      </Button>
    </div>
  );
}
