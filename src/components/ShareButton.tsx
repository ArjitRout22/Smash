"use client";

import { useState } from "react";
import { Share2, Check } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";

/**
 * Share a link via the native share sheet (mobile) with a copy-to-clipboard
 * fallback (desktop). Used to share the app and individual public tournaments.
 */
export function ShareButton({
  url,
  title,
  text,
  label = "Share",
  variant = "outline",
  size = "sm",
}: {
  url: string;
  title: string;
  text?: string;
  label?: string;
  variant?: "primary" | "outline" | "ghost";
  size?: "sm" | "md";
}) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  async function share() {
    const nav = typeof navigator !== "undefined" ? navigator : undefined;
    if (nav?.share) {
      try {
        await nav.share({ title, text, url });
        return;
      } catch (err) {
        // User dismissed the share sheet — do nothing.
        if (err instanceof Error && err.name === "AbortError") return;
        // Otherwise fall through to copying the link.
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
    <Button variant={variant} size={size} onClick={share}>
      {copied ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />} {label}
    </Button>
  );
}
