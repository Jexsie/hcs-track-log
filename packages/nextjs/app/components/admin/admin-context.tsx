"use client";

import type { PublicKey } from "@hiero-ledger/sdk";
import type SignClient from "@walletconnect/sign-client";
import type { SessionTypes } from "@walletconnect/types";
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  createSession,
  getSession,
  requestChallenge,
  signOut as endSession,
} from "@/lib/admin/api";
import { fetchAccountKey } from "@/lib/mirror/ledger-state";
import { type HederaNetwork, hederaAccountFromSession } from "@/lib/wallet/hip820";
import { buildScheduleSignTransaction } from "@/lib/wallet/schedule-sign";
import {
  disconnectWallet,
  getSignClient,
  restoreSession,
  startPairing,
  walletSignAndExecute,
  walletSignMessage,
} from "@/lib/wallet/wallet-connect-client";

export interface AdminConfig {
  network: HederaNetwork;
  topicId: string;
  mirrorBaseUrl: string;
  /** WalletConnect Cloud project id; null when not configured. */
  projectId: string | null;
}

export type WalletState =
  | { status: "unconfigured" }
  | { status: "idle" }
  | { status: "pairing"; uri: string }
  | { status: "connected"; accountId: string; publicKey: PublicKey | null };

interface AdminContextValue {
  config: AdminConfig;
  wallet: WalletState;
  /** Account id of the signed-in administrator (from the session cookie), or null. */
  adminAccountId: string | null;
  sessionChecked: boolean;
  error: string | null;
  busy: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  /** Sign and submit a ScheduleSign for `scheduleId` from the connected wallet. */
  approve: (scheduleId: string) => Promise<void>;
  clearError: () => void;
}

const AdminContext = createContext<AdminContextValue | null>(null);

export function useAdmin(): AdminContextValue {
  const value = useContext(AdminContext);
  if (!value) throw new Error("useAdmin must be used inside <AdminProvider>");
  return value;
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

export function AdminProvider({ config, children }: { config: AdminConfig; children: ReactNode }) {
  const [wallet, setWallet] = useState<WalletState>(
    config.projectId ? { status: "idle" } : { status: "unconfigured" },
  );
  const [adminAccountId, setAdminAccountId] = useState<string | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const client = useRef<SignClient | null>(null);
  const session = useRef<SessionTypes.Struct | null>(null);

  const adopt = useCallback(
    async (s: SessionTypes.Struct) => {
      const accountId = hederaAccountFromSession(s, config.network);
      if (!accountId) throw new Error(`the wallet did not share a ${config.network} account`);
      session.current = s;
      setWallet({ status: "connected", accountId, publicKey: null });
      const publicKey = await fetchAccountKey(config.mirrorBaseUrl, accountId).catch(() => null);
      setWallet({ status: "connected", accountId, publicKey });
    },
    [config.mirrorBaseUrl, config.network],
  );

  // Restore the admin session cookie and any live wallet session after a reload.
  useEffect(() => {
    let cancelled = false;
    getSession().then((result) => {
      if (cancelled) return;
      setAdminAccountId(result.ok ? result.data.accountId : null);
      setSessionChecked(true);
    });
    if (config.projectId) {
      getSignClient(config.projectId)
        .then((c) => {
          client.current = c;
          const existing = restoreSession(c, config.network);
          return existing && !cancelled ? adopt(existing) : undefined;
        })
        .catch(
          (e: unknown) => !cancelled && setError(`WalletConnect failed to start: ${message(e)}`),
        );
    }
    return () => {
      cancelled = true;
    };
  }, [adopt, config.network, config.projectId]);

  const run = useCallback(async (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }, []);

  const requireWallet = useCallback(() => {
    if (!client.current || !session.current || wallet.status !== "connected")
      throw new Error("connect a wallet first");
    return { c: client.current, s: session.current, accountId: wallet.accountId };
  }, [wallet]);

  const value = useMemo<AdminContextValue>(
    () => ({
      config,
      wallet,
      adminAccountId,
      sessionChecked,
      error,
      busy,
      clearError: () => setError(null),
      connect: () =>
        run(async () => {
          if (!config.projectId) throw new Error("NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is not set");
          const c = (client.current ??= await getSignClient(config.projectId));
          const { uri, approval } = await startPairing(c, config.network);
          setWallet({ status: "pairing", uri });
          try {
            await adopt(await approval());
          } catch (e) {
            setWallet({ status: "idle" });
            throw e;
          }
        }),
      disconnect: () =>
        run(async () => {
          if (client.current && session.current)
            await disconnectWallet(client.current, session.current).catch(() => {});
          session.current = null;
          setWallet({ status: "idle" });
        }),
      signIn: () =>
        run(async () => {
          const { c, s, accountId } = requireWallet();
          const challenge = await requestChallenge(accountId);
          if (!challenge.ok) throw new Error(challenge.message);
          const signatureMap = await walletSignMessage(
            c,
            s,
            config.network,
            accountId,
            challenge.data.message,
          );
          const signedIn = await createSession({
            accountId,
            token: challenge.data.token,
            signatureMap,
          });
          if (!signedIn.ok) throw new Error(signedIn.message);
          setAdminAccountId(signedIn.data.accountId);
        }),
      signOut: () =>
        run(async () => {
          await endSession();
          setAdminAccountId(null);
        }),
      approve: async (scheduleId) => {
        const { c, s, accountId } = requireWallet();
        const transactionList = buildScheduleSignTransaction({
          scheduleId,
          payerAccountId: accountId,
        });
        await walletSignAndExecute(c, s, config.network, accountId, transactionList);
      },
    }),
    [adminAccountId, adopt, busy, config, error, requireWallet, run, sessionChecked, wallet],
  );

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}
