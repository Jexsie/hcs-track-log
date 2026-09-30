import { PrivateKey } from "@hiero-ledger/sdk";
import { describe, expect, it } from "vitest";
import { MirrorNotFoundError, MirrorRequestError } from "./http";
import { fetchAccountKey, fetchSchedule, fetchTopicKeys } from "./ledger-state";

const BASE = "https://mirror.test";
const json =
  (body: unknown, status = 200): typeof fetch =>
  async () =>
    Response.json(body, { status });

/** Real testnet mirror response for topic 0.0.10730186 (2-of-3 ED25519 submit key). */
const REAL_SUBMIT_KEY_HEX =
  "2a700802126c0a221220b5df55c5f6852f38553b784199a2d326a07c249e8f9cdddf1fd7500e9490fb320a221220e105813786eaf57efdc0444ba40f03eb08b868341cdc8360edf558a72fd9a3240a22122046bdcc23ad7a21e0195fe1c62424daa17c6eb8c38ce41013de3d72a2ffb6f072";

describe("fetchAccountKey", () => {
  it.each([
    ["ED25519", () => PrivateKey.generateED25519().publicKey],
    ["ECDSA_SECP256K1", () => PrivateKey.generateECDSA().publicKey],
  ])("parses a %s account key", async (type, make) => {
    const key = make();
    const fetched = await fetchAccountKey(
      BASE,
      "0.0.100",
      json({ account: "0.0.100", key: { _type: type, key: key.toStringRaw() } }),
    );

    expect(fetched.equals(key)).toBe(true);
  });

  it("refuses complex (key list) account keys and unknown accounts", async () => {
    await expect(
      fetchAccountKey(
        BASE,
        "0.0.100",
        json({ account: "0.0.100", key: { _type: "ProtobufEncoded", key: REAL_SUBMIT_KEY_HEX } }),
      ),
    ).rejects.toThrow("single ED25519 or ECDSA key");
    await expect(fetchAccountKey(BASE, "0.0.404", json({}, 404))).rejects.toBeInstanceOf(
      MirrorNotFoundError,
    );
    await expect(fetchAccountKey(BASE, "not-an-id", json({}))).rejects.toBeInstanceOf(
      MirrorRequestError,
    );
  });
});

describe("fetchTopicKeys", () => {
  it("decodes the real threshold submit key served by the mirror node", async () => {
    const keys = await fetchTopicKeys(
      BASE,
      "0.0.10730186",
      json({ submit_key: { _type: "ProtobufEncoded", key: REAL_SUBMIT_KEY_HEX }, admin_key: null }),
    );

    expect(keys.adminKey).toBeNull();
    expect(keys.submitKey).toMatchObject({ kind: "threshold", threshold: 2 });
    if (keys.submitKey?.kind !== "threshold") return;
    expect(keys.submitKey.keys.map((k) => k.kind)).toEqual(["ed25519", "ed25519", "ed25519"]);
  });
});

describe("fetchSchedule", () => {
  const signer = PrivateKey.generateED25519().publicKey;
  // SchedulableTransactionBody{ consensusSubmitMessage(21){ topicID{topicNum 5005}, message "hi" } }
  const body = Buffer.from([
    0xaa, 0x01, 0x09, 0x0a, 0x03, 0x18, 0x8d, 0x27, 0x12, 0x02, 0x68, 0x69,
  ]).toString("base64");

  it("reports status, signer keys and the decoded scheduled topic message", async () => {
    const schedule = await fetchSchedule(
      BASE,
      "0.0.777",
      json({
        schedule_id: "0.0.777",
        executed_timestamp: "1790000000.000000001",
        deleted: false,
        expiration_time: "1790086400.000000000",
        signatures: [
          {
            public_key_prefix: Buffer.from(signer.toBytesRaw()).toString("base64"),
            type: "ED25519",
          },
        ],
        transaction_body: body,
      }),
    );

    expect(schedule).toMatchObject({
      scheduleId: "0.0.777",
      executedTimestamp: "1790000000.000000001",
      deleted: false,
    });
    expect(schedule.signerPublicKeys.map((k) => Buffer.from(k).toString("hex"))).toEqual([
      signer.toStringRaw(),
    ]);
    expect(schedule.scheduledMessage).toEqual({
      topicId: "0.0.5005",
      message: new TextEncoder().encode("hi"),
    });
  });

  it("returns a null scheduled message when the body is not a topic message, and 404s as not found", async () => {
    const other = await fetchSchedule(
      BASE,
      "0.0.1",
      json({
        schedule_id: "0.0.1",
        executed_timestamp: null,
        deleted: false,
        expiration_time: null,
        signatures: [],
        transaction_body: Buffer.from([0x08, 0x01]).toString("base64"),
      }),
    );

    expect(other.scheduledMessage).toBeNull();
    await expect(fetchSchedule(BASE, "0.0.2", json({}, 404))).rejects.toBeInstanceOf(
      MirrorNotFoundError,
    );
  });
});
