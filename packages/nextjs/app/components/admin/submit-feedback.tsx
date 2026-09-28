import type { ApiFailure } from "@/lib/admin/api";

const HINT: Record<string, string> = {
  UNAUTHENTICATED: "Your administrator session has expired. Sign in again with your wallet above.",
  NOT_A_SUBMITTER: "The connected wallet's key is not one of the topic's submit keys.",
  VALIDATION_ERROR: "Fix the highlighted field and submit again.",
  PARCEL_NOT_FOUND: "No parcel has exactly this tracking ID.",
  PARCEL_EXISTS: "This parcel is already registered or is already awaiting approval.",
  SUBMISSION_FAILED:
    "Hedera did not accept the schedule. Nothing was proposed; it is safe to retry.",
  SERVER_MISCONFIGURED:
    "The server's Hedera configuration is incomplete or the topic's keys do not match it. Nothing was proposed.",
  LEDGER_UNAVAILABLE: "The Hedera mirror node did not respond. Nothing changed; retry in a moment.",
  NETWORK_ERROR: "Check your connection and retry.",
};

export function SubmitError({ failure }: { failure: ApiFailure }) {
  return (
    <div className="rounded-xl border-2 border-danger bg-danger-soft px-4 py-3" role="alert">
      <strong className="block text-danger">{failure.message}</strong>
      <p className="mt-1 mb-0 text-sm text-fg">
        {HINT[failure.code] ?? `Request failed (${failure.code}).`}
      </p>
    </div>
  );
}

export function SubmitButton({
  pending,
  disabled,
  children,
}: {
  pending: boolean;
  disabled?: boolean;
  children: string;
}) {
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-[10px] bg-accent px-6 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending && (
        <span
          className="size-3.5 animate-spin rounded-full border-2 border-white border-r-transparent motion-reduce:animate-none"
          aria-hidden
        />
      )}
      {pending ? "Scheduling on Hedera…" : children}
    </button>
  );
}

export const SIGN_IN_FIRST: ApiFailure = {
  ok: false,
  status: 401,
  code: "UNAUTHENTICATED",
  message: "Sign in with your administrator wallet first.",
};
