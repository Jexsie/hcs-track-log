"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { normalizeHashInput } from "@/lib/hashing/sha256";
import styles from "./search-form.module.css";

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
    <form className={styles.form} onSubmit={onSubmit} role="search" noValidate>
      <label htmlFor="tracking-id" className={styles.label}>
        Tracking ID
      </label>
      <div className={styles.row}>
        <input
          id="tracking-id"
          className={styles.input}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="e.g. 39c6b2dc…1fcc74 (64 hex characters)"
          autoComplete="off"
          spellCheck={false}
          aria-invalid={error !== null}
          aria-describedby={error ? "tracking-id-error" : undefined}
        />
        <button className={styles.button} type="submit" disabled={pending}>
          {pending ? "Searching…" : "Track"}
        </button>
      </div>
      {error && (
        <p id="tracking-id-error" className={styles.error} role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
