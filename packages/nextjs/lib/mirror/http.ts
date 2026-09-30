/** Shared mirror-node HTTP plumbing. Runs unchanged in Node and the browser. */

export class MirrorNotFoundError extends Error {
  constructor(what: string) {
    super(`${what} not found on the mirror node`);
    this.name = "MirrorNotFoundError";
  }
}

export class MirrorRequestError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "MirrorRequestError";
  }
}

// Wrapped rather than referenced: an unbound `window.fetch` throws "Illegal invocation" in browsers.
export const defaultFetch: typeof fetch = (input, init) => globalThis.fetch(input, init);

/** GET JSON. A 404 becomes MirrorNotFoundError(notFound) when `notFound` is given. */
export async function getMirrorJson(
  url: string,
  fetchImpl: typeof fetch,
  notFound?: string,
): Promise<unknown> {
  let response: Response;

  try {
    response = await fetchImpl(url, { headers: { accept: "application/json" } });
  } catch (cause) {
    throw new MirrorRequestError("mirror node is unreachable", { cause });
  }

  if (response.status === 404 && notFound !== undefined) throw new MirrorNotFoundError(notFound);
  if (!response.ok) throw new MirrorRequestError(`mirror node responded ${response.status}`);

  try {
    return await response.json();
  } catch (cause) {
    throw new MirrorRequestError("mirror node returned invalid JSON", { cause });
  }
}

export function decodeBase64(value: string): Uint8Array {
  try {
    return Uint8Array.from(atob(value.replace(/\s+/g, "")), (c) => c.charCodeAt(0));
  } catch (cause) {
    throw new MirrorRequestError("mirror node returned invalid base64", { cause });
  }
}

export const ENTITY_ID = /^\d+\.\d+\.\d+$/;
