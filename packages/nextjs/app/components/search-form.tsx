"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { normalizeHashInput } from "@/lib/hashing/sha256";

export function SearchForm({ initialValue = "" }: { initialValue?: string }) {
  const router = useRouter();
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parcelHash = normalizeHashInput(value);
    if (!parcelHash) {
      setError("A tracking ID is 64 hexadecimal characters.");
      return;
    }
    setError(null);
    setPending(true);
    router.push(`/track/${parcelHash}`);
  }

  return (
    <form className="grid gap-2" onSubmit={onSubmit} role="search" noValidate>
      <label htmlFor="tracking-id" className="text-sm font-semibold">
        Tracking ID
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id="tracking-id"
          className="min-w-0 flex-1 rounded-[10px] border border-line bg-surface px-3.5 py-3 font-mono text-sm text-fg focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent aria-invalid:border-danger"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="e.g. 39c6b2dc…1fcc74 (64 hex characters)"
          autoComplete="off"
          spellCheck={false}
          aria-invalid={error !== null}
          aria-describedby={error ? "tracking-id-error" : undefined}
        />
        <button
          className="cursor-pointer rounded-[10px] bg-accent px-5.5 py-3 font-semibold text-white disabled:cursor-progress disabled:opacity-70"
          type="submit"
          disabled={pending}
        >
          {pending ? "Searching…" : "Track"}
        </button>
      </div>
      {error && (
        <p id="tracking-id-error" className="m-0 text-sm text-danger" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
