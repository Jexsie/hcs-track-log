"use client";

import { useState } from "react";
import { CheckIcon, CopyIcon } from "./icons";

export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex flex-none cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs font-semibold text-fg hover:border-accent"
      aria-label={copied ? "Copied" : label}
    >
      {copied ? <CheckIcon className="size-3.5 text-ok" /> : <CopyIcon className="size-3.5" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
