import { BRAND } from "@/lib/brand";

/** Logo: a stylised lake wave under a cargo box, plus the company name. */
export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-bold ${className}`}>
      <svg viewBox="0 0 24 24" className="size-6" aria-hidden>
        <rect x="6" y="3" width="12" height="10" rx="1.5" className="fill-accent" />
        <path d="M6 8h12M12 3v10" className="stroke-white/70" strokeWidth="1.2" />
        <path
          d="M2 17c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2M2 21c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2"
          className="stroke-current"
          strokeWidth="1.6"
          fill="none"
          strokeLinecap="round"
        />
      </svg>
      {BRAND.name}
    </span>
  );
}
