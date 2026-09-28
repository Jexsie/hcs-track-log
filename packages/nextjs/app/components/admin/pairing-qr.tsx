"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";

/** WalletConnect pairing URI as a QR code (scan with HashPack, Kabila, Blade, …) plus a copy button. */
export function PairingQr({ uri, onCancel }: { uri: string; onCancel: () => void }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    QRCode.toString(uri, { type: "svg", margin: 1, errorCorrectionLevel: "M" }).then((markup) => {
      if (!cancelled) setSvg(markup);
    });
    return () => {
      cancelled = true;
    };
  }, [uri]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(uri);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="grid gap-3 sm:grid-cols-[180px_1fr] sm:items-center">
      <div
        className="size-[180px] rounded-lg bg-white p-2"
        role="img"
        aria-label="Wallet connection QR code"
        // Generated locally by the qrcode library from the pairing URI; contains no user input.
        dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
      />
      <div className="grid gap-2 text-sm">
        <strong>Scan with your wallet app</strong>
        <span className="text-muted">Or copy the link into your wallet.</span>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={copy}
            className="cursor-pointer rounded-lg border border-line bg-surface px-3 py-1.5 font-semibold text-fg"
          >
            {copied ? "Copied" : "Copy link"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="cursor-pointer rounded-lg px-3 py-1.5 font-semibold text-muted"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
