"use client";

import { useAdmin } from "./admin-context";
import { PairingQr } from "./pairing-qr";

const BUTTON =
  "cursor-pointer rounded-lg px-3.5 py-2 text-sm font-semibold disabled:cursor-progress disabled:opacity-60";
const PRIMARY = `${BUTTON} bg-accent text-white`;
const SECONDARY = `${BUTTON} border border-line bg-surface text-fg`;

export function WalletPanel() {
  const {
    wallet,
    adminAccountId,
    sessionChecked,
    busy,
    error,
    connect,
    disconnect,
    signIn,
    signOut,
    clearError,
  } = useAdmin();
  const connectedAs = wallet.status === "connected" ? wallet.accountId : null;
  const signedInHere = adminAccountId !== null && adminAccountId === connectedAs;

  return (
    <section
      className="grid gap-3 rounded-xl border border-line bg-surface px-4 py-3.5"
      aria-label="Administrator wallet"
    >
      {wallet.status === "unconfigured" && (
        <p className="m-0 text-sm">
          <strong>Wallet sign-in is not set up yet.</strong>
        </p>
      )}

      {wallet.status === "idle" && (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-muted">Connect your wallet to sign in.</span>
          <button type="button" className={`${PRIMARY} ml-auto`} onClick={connect} disabled={busy}>
            Connect wallet
          </button>
        </div>
      )}

      {wallet.status === "pairing" && <PairingQr uri={wallet.uri} onCancel={disconnect} />}

      {connectedAs && (
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-full bg-ok-soft px-2.5 py-1 text-xs font-semibold text-ok">
            Connected
          </span>
          <span className="font-mono text-sm">{connectedAs}</span>
          {signedInHere ? (
            <span className="rounded-full bg-accent px-2.5 py-1 text-xs font-semibold text-white">
              Signed in
            </span>
          ) : (
            sessionChecked && (
              <button type="button" className={PRIMARY} onClick={signIn} disabled={busy}>
                {busy ? "Confirm in your wallet…" : "Sign in"}
              </button>
            )
          )}
          <span className="ml-auto flex gap-2">
            {adminAccountId && (
              <button type="button" className={SECONDARY} onClick={signOut} disabled={busy}>
                Sign out
              </button>
            )}
            <button type="button" className={SECONDARY} onClick={disconnect} disabled={busy}>
              Disconnect
            </button>
          </span>
        </div>
      )}

      {adminAccountId && !signedInHere && connectedAs && (
        <p className="m-0 text-sm text-warn">
          Signed in as {adminAccountId}. Sign in again to switch to this wallet.
        </p>
      )}

      {error && (
        <div
          className="flex items-start gap-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger"
          role="alert"
        >
          <span className="flex-1">{error}</span>
          <button type="button" className="cursor-pointer font-semibold" onClick={clearError}>
            Dismiss
          </button>
        </div>
      )}
    </section>
  );
}
