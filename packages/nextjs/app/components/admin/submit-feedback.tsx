import type { ApiResult } from "@/lib/admin/api";

type Failure = Extract<ApiResult<unknown>, { ok: false }>;

const HINT: Record<string, string> = {
  UNAUTHORIZED:
    "The submitter token was rejected. Forget it above and paste the current SUBMITTER_API_TOKEN.",
  VALIDATION_ERROR: "Fix the highlighted field and submit again.",
  PARCEL_NOT_FOUND: "No parcel has this tracking ID.",
  PARCEL_EXISTS: "This parcel is already registered.",
  SUBMISSION_FAILED:
    "The ledger did not accept the submission. Nothing was recorded; it is safe to retry.",
  SERVER_MISCONFIGURED:
    "The server's Hedera configuration is incomplete or the topic keys do not match. Nothing was recorded.",
  CACHE_WRITE_FAILED:
    "The event IS anchored on the ledger, but the database write failed. Do not resubmit: ask an operator to replay it from the server log.",
  NETWORK_ERROR: "Check your connection and retry.",
};

export function SubmitError({ failure }: { failure: Failure }) {
  return (
    <div className="rounded-xl border-2 border-danger bg-danger-soft px-4 py-3" role="alert">
      <strong className="block text-danger">{failure.message}</strong>
      <p className="mt-1 mb-0 text-sm text-fg">
        {HINT[failure.code] ?? `Request failed (${failure.code}).`}
      </p>
    </div>
  );
}

export function SubmitButton({ pending, children }: { pending: boolean; children: string }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-[10px] bg-accent px-6 py-3 font-semibold text-white disabled:cursor-progress disabled:opacity-70"
    >
      {pending && (
        <span
          className="size-3.5 animate-spin rounded-full border-2 border-white border-r-transparent motion-reduce:animate-none"
          aria-hidden
        />
      )}
      {pending ? "Anchoring on Hedera…" : children}
    </button>
  );
}
