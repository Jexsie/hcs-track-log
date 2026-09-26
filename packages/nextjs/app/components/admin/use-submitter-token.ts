"use client";

import { useSyncExternalStore } from "react";

/**
 * The write API's bearer token, kept in sessionStorage: it survives reloads but is dropped when the
 * tab closes, and is never sent anywhere except this app's own /api routes.
 */
const KEY = "hcs-track-log.submitter-token";
const CHANGED = "hcs-track-log:token-changed";

function read(): string {
  try {
    return window.sessionStorage.getItem(KEY) ?? "";
  } catch {
    return ""; // storage blocked (privacy mode): behave as "no token"
  }
}

function write(token: string): void {
  try {
    if (token) window.sessionStorage.setItem(KEY, token);
    else window.sessionStorage.removeItem(KEY);
  } catch {
    /* storage blocked: the token simply is not remembered */
  }
  window.dispatchEvent(new Event(CHANGED));
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGED, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGED, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useSubmitterToken(): [token: string, setToken: (token: string) => void] {
  const token = useSyncExternalStore(subscribe, read, () => "");
  return [token, write];
}
