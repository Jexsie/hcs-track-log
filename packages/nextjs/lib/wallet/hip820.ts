/**
 * HIP-820: Hedera over WalletConnect v2. Only the two calls this app needs. Formats match the
 * reference implementation (@hashgraph/hedera-wallet-connect), which we cannot depend on because it
 * pins an older @hiero-ledger/sdk.
 */

export type HederaNetwork = "testnet" | "mainnet" | "previewnet";

export const HEDERA_METHODS = ["hedera_signMessage", "hedera_signAndExecuteTransaction"] as const;
export const HEDERA_EVENTS = ["accountsChanged", "chainChanged"] as const;

export const chainId = (network: HederaNetwork) => `hedera:${network}`;
/** HIP-30 account identifier, e.g. "hedera:testnet:0.0.100". */
export const signerAccountId = (network: HederaNetwork, accountId: string) =>
  `${chainId(network)}:${accountId}`;

export function requiredNamespaces(network: HederaNetwork) {
  return {
    hedera: {
      chains: [chainId(network)],
      methods: [...HEDERA_METHODS],
      events: [...HEDERA_EVENTS],
    },
  };
}

export interface WalletRequest<P> {
  topic: string;
  chainId: string;
  request: { method: (typeof HEDERA_METHODS)[number]; params: P };
}

/** Result: `{ signatureMap }`, a base64 proto.SignatureMap over the HIP-820 prefixed message. */
export function signMessageRequest(
  topic: string,
  network: HederaNetwork,
  accountId: string,
  message: string,
) {
  return {
    topic,
    chainId: chainId(network),
    request: {
      method: "hedera_signMessage",
      params: { signerAccountId: signerAccountId(network, accountId), message },
    },
  } satisfies WalletRequest<unknown>;
}

/** `transactionList` is a base64-encoded, frozen Transaction; the wallet signs, pays and submits it. */
export function signAndExecuteRequest(
  topic: string,
  network: HederaNetwork,
  accountId: string,
  transactionList: string,
) {
  return {
    topic,
    chainId: chainId(network),
    request: {
      method: "hedera_signAndExecuteTransaction",
      params: { signerAccountId: signerAccountId(network, accountId), transactionList },
    },
  } satisfies WalletRequest<unknown>;
}

interface SessionLike {
  namespaces: Record<string, { accounts?: readonly string[] } | undefined>;
}

/** The connected account on the configured network, from "hedera:<network>:<shard.realm.num>". */
export function hederaAccountFromSession(
  session: SessionLike,
  network: HederaNetwork,
): string | null {
  const prefix = `${chainId(network)}:`;
  const account = session.namespaces.hedera?.accounts
    ?.find((a) => a.startsWith(prefix))
    ?.slice(prefix.length);

  return account && /^\d+\.\d+\.\d+$/.test(account) ? account : null;
}
