import {
  type Client,
  type KeyList,
  type PrivateKey,
  Status,
  type TopicId,
  TopicMessageSubmitTransaction,
} from "@hiero-ledger/sdk";
import type { EnvelopeSubmitter, SubmissionReceipt } from "@/lib/tracking/ports";
import { assertSignersSatisfy } from "./threshold-key";

export interface HcsSubmitterOptions {
  client: Client;
  topicId: TopicId;
  /** The topic's threshold submit key. */
  submitKey: KeyList;
  /** Private keys of submit-key holders this process signs with. Must meet the threshold. */
  signers: readonly PrivateKey[];
}

/** Submits envelopes to the HCS topic, co-signed by enough submit-key holders. */
export class HcsEnvelopeSubmitter implements EnvelopeSubmitter {
  constructor(private readonly options: HcsSubmitterOptions) {
    assertSignersSatisfy(
      options.submitKey,
      options.signers.map((k) => k.publicKey),
      "submit",
    );
  }

  /** Build, freeze and sign the transaction without sending it. */
  async prepare(message: Uint8Array): Promise<TopicMessageSubmitTransaction> {
    const { client, topicId, signers } = this.options;
    const tx = new TopicMessageSubmitTransaction()
      .setTopicId(topicId)
      .setMessage(message)
      .setMaxChunks(1) // one envelope = one sequence number
      .freezeWith(client);
    for (const signer of signers) await tx.sign(signer);
    return tx;
  }

  close(): void {
    this.options.client.close();
  }

  /** Resolves only once the network reports consensus SUCCESS. */
  async submit(message: Uint8Array): Promise<SubmissionReceipt> {
    const { client } = this.options;
    const tx = await this.prepare(message);
    const response = await tx.execute(client);
    const receipt = await response.getReceipt(client); // throws ReceiptStatusError on failure
    if (receipt.status !== Status.Success || receipt.topicSequenceNumber === null) {
      throw new Error(`topic message not accepted: ${receipt.status.toString()}`);
    }
    const payer = response.transactionId.accountId;
    if (!payer) throw new Error("transaction id has no payer account");
    return {
      sequenceNumber: BigInt(receipt.topicSequenceNumber.toString()),
      transactionId: response.transactionId.toString(),
      payerAccountId: payer.toString(),
    };
  }
}
