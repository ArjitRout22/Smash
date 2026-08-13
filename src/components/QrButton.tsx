"use client";

import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { QrCode } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/Modal";

/**
 * Show a scannable QR for a link — print it or hold up your phone at the court so
 * players can open the tournament and join without typing a URL.
 */
export function QrButton({
  url,
  label = "QR",
  title = "Scan to open",
  caption,
}: {
  url: string;
  label?: string;
  title?: string;
  caption?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} aria-label="Show QR code">
        <QrCode className="h-4 w-4" /> {label}
      </Button>
      {open && (
        <Modal open onClose={() => setOpen(false)} title={title} footer={<Button variant="ghost" onClick={() => setOpen(false)}>Close</Button>}>
          <div className="flex flex-col items-center gap-4 py-2">
            {caption && <p className="text-center text-sm text-muted">{caption}</p>}
            {/* White quiet-zone box keeps the code scannable in any theme. */}
            <div className="rounded-xl bg-white p-4">
              <QRCodeSVG value={url} size={224} level="M" marginSize={0} />
            </div>
            <p className="max-w-full break-all text-center text-xs text-muted">{url}</p>
          </div>
        </Modal>
      )}
    </>
  );
}
