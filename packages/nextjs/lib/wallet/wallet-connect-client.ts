import SignClient from "@walletconnect/sign-client";
import type { SessionTypes } from "@walletconnect/types";
import {
  type HederaNetwork,
  hederaAccountFromSession,
  requiredNamespaces,
  signAndExecuteRequest,
  signMessageRequest,
} from "./hip820";

/** Browser-only: a thin HIP-820 layer over WalletConnect's SignClient. */

let clientPromise: Promise<SignClient> | null = null;

export function getSignClient(projectId: string): Promise<SignClient> {
  clientPromise ??= SignClient.init({
    projectId,
    metadata: {
      name: "hcs-track-log administrator console",
      description: "Approve cargo events for the Hedera Consensus Service",
      url: window.location.origin,
      icons: [],
    },
  }).catch((error: unknown) => {
    clientPromise = null;
    throw error;
  });
  return clientPromise;
}

/** The most recent live session that has an account on `network`. */
export function restoreSession(
  client: SignClient,
  network: HederaNetwork,
): SessionTypes.Struct | null {
  const now = Date.now() / 1000;
  return (
    client.session
      .getAll()
      .filter((s) => s.expiry > now && hederaAccountFromSession(s, network) !== null)
      .at(-1) ?? null
  );
}

/** Start pairing: show `uri` as a QR code; `approval()` resolves once the wallet accepts. */
export async function startPairing(client: SignClient, network: HederaNetwork) {
  const { uri, approval } = await client.connect({
    requiredNamespaces: requiredNamespaces(network),
  });
  if (!uri) throw new Error("wallet pairing did not return a URI");
  return { uri, approval };
}

export async function walletSignMessage(
  client: SignClient,
  session: SessionTypes.Struct,
  network: HederaNetwork,
  accountId: string,
  message: string,
): Promise<string> {
  const result = await client.request<{ signatureMap?: unknown }>(
    signMessageRequest(session.topic, network, accountId, message),
  );
  if (typeof result.signatureMap !== "string") throw new Error("wallet returned no signature");
  return result.signatureMap;
}

export async function walletSignAndExecute(
  client: SignClient,
  session: SessionTypes.Struct,
  network: HederaNetwork,
  accountId: string,
  transactionList: string,
): Promise<void> {
  await client.request(signAndExecuteRequest(session.topic, network, accountId, transactionList));
}

export async function disconnectWallet(
  client: SignClient,
  session: SessionTypes.Struct,
): Promise<void> {
  await client.disconnect({
    topic: session.topic,
    reason: { code: 6000, message: "User disconnected" },
  });
}
