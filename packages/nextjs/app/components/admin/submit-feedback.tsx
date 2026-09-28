import type { ApiFailure } from "@/lib/admin/api";

const MESSAGE: Record<string, string> = {
  UNAUTHENTICATED: "Your session has expired. Sign in again.",
  NOT_A_SUBMITTER: "This wallet is not allowed to submit changes.",
  VALIDATION_ERROR: "Check the highlighted fields.",
  PARCEL_NOT_FOUND: "No shipment found with this tracking ID.",
  PARCEL_EXISTS: "This shipment already exists or is waiting for approval.",
  SUBMISSION_FAILED: "Could not submit. Nothing was saved, so you can try again.",
  SERVER_MISCONFIGURED: "Admin is not set up correctly. Contact whoever runs this service.",
  LEDGER_UNAVAILABLE: "The service is busy. Try again in a moment.",
  NETWORK_ERROR: "No connection. Try again.",
};

export function SubmitError({ failure }: { failure: ApiFailure }) {
  return (
    <p
      className="m-0 rounded-xl border border-danger bg-danger-soft px-4 py-3 text-sm font-semibold text-danger"
      role="alert"
    >
      {MESSAGE[failure.code] ?? "Something went wrong. Try again."}
    </p>
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
      {pending ? "Submitting…" : children}
    </button>
  );
}

export const SIGN_IN_FIRST: ApiFailure = {
  ok: false,
  status: 401,
  code: "UNAUTHENTICATED",
  message: "Sign in with your wallet first.",
};
