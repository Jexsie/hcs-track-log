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
          <strong>Wallet connection is not configured.</strong>{" "}
          <span className="text-muted">
            Set <code className="font-mono">NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID</code> (from
            dashboard.reown.com) and restart the server.
          </span>
        </p>
      )}

      {wallet.status === "idle" && (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-muted">
            Connect the Hedera wallet whose key is one of the topic&apos;s submit keys. Every
            submission must be approved in the required number of administrators&apos; wallets.
          </span>
          <button type="button" className={`${PRIMARY} ml-auto`} onClick={connect} disabled={busy}>
            Connect wallet
          </button>
        </div>
      )}

      {wallet.status === "pairing" && <PairingQr uri={wallet.uri} onCancel={disconnect} />}

      {connectedAs && (
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-full bg-ok-soft px-2.5 py-1 text-xs font-semibold text-ok">
            Wallet connected
          </span>
          <span className="font-mono text-sm">{connectedAs}</span>
          {signedInHere ? (
            <span className="rounded-full bg-accent px-2.5 py-1 text-xs font-semibold text-white">
              Signed in as administrator
            </span>
          ) : (
            sessionChecked && (
              <button type="button" className={PRIMARY} onClick={signIn} disabled={busy}>
                {busy ? "Check your wallet…" : "Sign in (sign a message)"}
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
          Your session belongs to {adminAccountId}, not the connected wallet. Sign in again to
          switch.
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
