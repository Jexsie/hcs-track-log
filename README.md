# hcs-track-log

This is a Scaffold-HBAR template for building tamper-evident records on the Hedera Consensus
Service. Readable data stays in Postgres, and a SHA-256 commitment to each record is anchored in an
HCS topic message. Verification recomputes the hash from the stored content and compares it against
the anchor retrieved from a public mirror node.

The model needs no smart contracts and no Solidity, because it works entirely through the Hiero SDK
against HCS and the mirror node REST API.

The template ships with a reference application called Kivu Cargo, which is a shipment tracker.
Staff post parcel updates through a threshold-signed approval flow, and customers verify each update
in their own browser. Setup, configuration and the demo data model are documented in
[`packages/nextjs/README.md`](packages/nextjs/README.md).

```bash
npm create scaffold-hbar@latest -- --template Jexsie/hcs-track-log --package-manager npm
```

> This template is experimental and has not been audited. Review it yourself before using it in
> production.

## Model

HCS provides consensus ordering, consensus timestamps and immutability, but it does not provide
queryable state. The template therefore splits responsibilities so that the topic holds commitments
while Postgres holds content and serves reads.

### On-chain envelope

Every topic message contains exactly three fields and nothing else. It is itself serialized in
canonical form, so the keys appear sorted.

```json
{ "parcelHash": "<64 hex>", "payloadHash": "<64 hex>", "v": 1 }
```

Both hashes are 64 lower-case hex characters with no `0x` prefix. The `parcelHash` is the tracking
identifier, derived once from the record's immutable fields. The `payloadHash` is the SHA-256 digest
of one update's canonical bytes. No business data is ever written to the topic, and the schedule
memo carries only an opaque submission identifier.

### Canonical form

Each record type has one builder that produces the bytes that get hashed, and every builder shares
one serializer. Strings are normalized to Unicode NFC and trimmed. Decimals are rendered as
fixed-scale strings, so `grossMassKg` becomes `"142.50"` rather than `142.5`. Instants are formatted
as ISO-8601 UTC with a trailing `Z`, at whole-second precision. Object keys are sorted
lexicographically at every depth. Separators are compact.

The builders are also strict. Unknown fields are rejected rather than ignored, so nothing can be
displayed as verified that the hash does not cover, and sub-second timestamps are rejected rather
than silently truncated.

The same builder runs on the write path and the verify path. A second implementation would
eventually drift from the first, so the template does not have one.

### Verification

The `verifyEvent(searchedParcelHash, event, mirror)` function accepts content and a sequence number,
and it never accepts a hash. It performs four steps in order.

1. It recomputes the `payloadHash` from `event.content` through the canonical builder.
2. It fetches `/api/v1/topics/{topicId}/messages/{sequenceNumber}` from the mirror node.
3. It parses the envelope and requires that `envelope.parcelHash` equals the searched tracking
   identifier.
4. It requires that `envelope.payloadHash` equals the recomputed digest.

The function returns one of three verdicts. A record is `verified` when every step holds. It is
`tampered` when any step fails, and the verdict carries a reason of `content-mismatch`,
`wrong-parcel`, `no-anchor`, `not-an-envelope` or `invalid-content`. It is `unavailable` when the
mirror node cannot be reached or answers unexpectedly. Keeping `unavailable` distinct from
`tampered` means a network failure is never reported as evidence of tampering.

The record itself is checked the same way: its tracking identifier is recomputed from the stored
immutable fields and compared with the searched identifier.

Storing a hash alongside its content provides no integrity guarantee, because the same write access
covers both values. Recomputation from content is the only step that makes the comparison
meaningful.

### Write ordering

The topic message reaches consensus before the Postgres row is written, so the application never
creates a cached row without an anchor, and a row inserted by hand verifies as `no-anchor`. The
browser checks only the rows Postgres returns, so it cannot notice a deleted row. The
`npm run verify` script closes that gap by scanning the topic for anchors that have no corresponding
row, and it exits with a distinct code when it finds one.

### Write authorization

The topic's submit key is a `KeyList` carrying a threshold, with a minimum of two keys and a minimum
threshold of two. The network rejects any `TopicMessageSubmitTransaction` that carries fewer
signatures from registered keys, and the server holds no submit key at all. The topic also carries a
separate threshold admin key, which is required to update or delete the topic, including rotating
the submit key set. The template creates both keys but ships no rotation script.

### Signature collection

Each write is a `ScheduleCreate` that wraps the topic message. The server's operator account pays for
it, and that account must not hold a submit key, because Hedera counts the payer's signature toward
the scheduled transaction. Approvers sign the scheduled transaction independently from their own
wallets, and the network executes it once the threshold is met. Before signing, each approver's
browser recomputes the envelope from the content displayed on screen and compares it against the
scheduled message, so an approver signs what they can see. After execution, the server repeats that
comparison against the message on the mirror node before it writes the row.

## Flow

```
   WRITE  (threshold-signed)                         VERIFY  (no account required)
   ─────────────────────────                         ─────────────────────────────

   form input                                        row read from Postgres
        │                                                      │
        ▼                                                      ▼
   normalize to NFC, fixed-scale                      normalize with the same
   decimals and UTC instants                          builder
        │                                                      │
        ▼                                                      ▼
   canonical bytes ──► SHA-256                        canonical bytes ──► SHA-256
        │                                                      │
        ▼                                                      │
   ScheduleCreate wrapping                                     │
   TopicMessageSubmit{v, parcelHash, payloadHash}              │
   (content staged in pending_submissions)                     │
        │                                                      │
        ▼                                                      │
   approvers sign in wallets until threshold                   │
        │                                                      │
        ▼                                                      ▼
   HCS consensus ───────────────────────►  GET /api/v1/topics/{id}/messages/{seq}
        │                                                      │
        ▼                                                      ▼
   mirror message matches staged content,   recomputed equals anchored, or it does not
   then the Postgres row is written
```

## Properties obtained from HCS

| Property               | Mechanism                                              | Consequence                                                                             |
| ---------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| Consensus timestamp    | The network assigns the time rather than the submitter | Proves when a commitment existed, independently of application clocks                   |
| Total ordering         | Sequence numbers are assigned per topic                | Every anchor has a fixed position, so a topic scan finds anchors missing from the cache |
| Immutability           | Topic messages cannot be updated or deleted            | A committed hash cannot be revised after the fact                                       |
| Threshold submit key   | A `KeyList` with a threshold, enforced at consensus    | Write authorization survives compromise of the application server                       |
| Scheduled transactions | `ScheduleCreate` followed by `ScheduleSign`            | Multi-party signing works without transporting transaction bytes out of band            |
| Public mirror node     | A REST API that requires no authentication             | Verification runs client-side without trusting the application server                   |
| Fixed fees             | USD-denominated fees per transaction                   | A write costs one `ScheduleCreate` plus one `ScheduleSign` per approver, predictably    |

## Setup

```bash
npm install
cp .env.example .env          # set HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY
npm run keys:generate         # development only, prints throwaway submit and admin key sets
docker compose up -d          # start Postgres
npm run db:migrate            # create the schema
npm run topic:create          # create the topic, then write the id to HCS_TOPIC_ID
npm run next:dev              # public tracker at / and staff portal at /admin
```

The staff portal also needs wallets, a WalletConnect project ID and a session secret. The full
guide, covering prerequisites, threshold keys, wallets and every environment variable, is in
[`packages/nextjs/README.md`](packages/nextjs/README.md#setup).

To watch tamper detection work, edit any hashed column of a cached record directly in Postgres and
then search for it at `/` or run `npm run verify`. The tracker marks that record as changed and the
script reports it as `tampered` with a reason of `content-mismatch`, while every other record
remains `verified`. Restoring the original value restores verification.

## Layout

```
packages/nextjs/
  app/              App Router holding the public tracker, staff portal and API routes
  lib/
    notary/         canonical form, SHA-256, envelope and verifier
    cargo/          demo domain covering hashed fields, forms, timeline and branding
    approvals/      proposal, wallet approvals and finalization
    hedera/         topic creation, threshold keys, scheduler, mirror client and protobuf
    server/         API handlers, Postgres access, configuration and admin sign-in
  migrations/       SQL migrations run by node-pg-migrate
  scripts/          topic:create, keys:generate, db:migrate and verify
```

The `hedera` layer and the notary primitives are domain-agnostic. The domain lives in `cargo`, and
the verifier, the approval flow and the database layer reach it through a small number of imports.
Substituting a different domain means changing which fields are hashed, the columns behind them and
their row mapping, the forms and the public page. The file-level mapping is documented in
[`AGENTS.md`](AGENTS.md).

## Out of scope

Each of the following is a deliberate omission and a valid extension under specific requirements.

**Decentralized storage of payloads.** Content currently exists only in Postgres while the topic
holds its hash, so losing the database leaves the anchors intact but the content unrecoverable.
Writing the canonical bytes to IPFS through a pinning service, to Arweave, or to object storage, and
then carrying the locator in the envelope, makes records independently retrievable.
Content-addressed storage additionally binds the identifier to the bytes, so the storage layer
cannot substitute different content under the same reference. This applies when records must
outlive the operator's infrastructure, or when counterparties need the content itself rather than a
verification result. It costs an additional dependency in the write path, an additional failure mode
in the read path, and a retention bill.

**Payload encryption.** The envelope carries no business data, so ledger exposure is not a concern,
but content at rest in Postgres is. Encrypting the content while hashing the plaintext canonical
form preserves verification for anyone holding the key. Selective disclosure follows naturally,
since committing to fields individually in a Merkle tree allows revealing only the fields a
counterparty is entitled to see, along with inclusion proofs against the anchored root.

**Merkle batching.** One message per record is linear in cost and gives every record its own
consensus timestamp. Anchoring a Merkle root over a batch reduces the message count by the batch
factor and supplies an inclusion proof per record, at the cost of batch-granularity timestamps. This
suits high-rate telemetry and is unsuitable wherever per-event timing is itself the evidence.

**Running-hash chain verification.** HCS publishes a running hash for each message, and recomputing
that chain independently proves the message sequence has not been interfered with at the ledger
level. This template verifies individual anchors and scans for missing ones, which covers tampering
with the cache. Chain recomputation is a stronger and more expensive check that becomes appropriate
when the ledger operator falls within the audit scope.

**Fee-charging topics under HIP-991.** A topic can charge a fee for each submitted message and
collect it automatically. This applies to consortium deployments where writes should carry an
economic cost, or where the operator recovers expenses from participants.

**Credential-based submitter identity.** The threshold key defines who may write but expresses no
roles, delegation or revocation schedule. HTS tokens or DID-based credentials supply a membership
lifecycle instead. The topic's admin key permits submit-key rotation, so the two approaches compose
cleanly.

**Indexing.** Reads currently go to the mirror node and Postgres directly, and aggregate queries
across an entire topic would warrant a dedicated index. Any such index must remain derived and
rebuildable, and it must never become the source that verification compares against.

## References

- [Consensus Service](https://docs.hedera.com/hedera/sdks-and-apis/sdks/consensus-service)
- [Scheduled transactions](https://docs.hedera.com/hedera/core-concepts/scheduled-transaction)
- [Mirror node REST API](https://docs.hedera.com/hedera/sdks-and-apis/rest-api)
- [HashScan](https://hashscan.io)
- [`AGENTS.md`](AGENTS.md) documents the invariants and key paths.
- [`packages/nextjs/README.md`](packages/nextjs/README.md) documents setup and the demo in detail.

## License

This template is released under the [MIT](./LICENSE) license.
