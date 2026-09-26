# hcs-track-log

A public cargo & package tracker on Hedera. Authorized parties record shipment events to a
**Hedera Consensus Service (HCS)** topic; anyone can search a parcel and verify every event
against the ledger.

The ledger is a tamper-evident notary log. Postgres is a fast read cache derived from it.

> **Verification recomputes the hash from content; it never trusts a stored hash.**

No Solidity, no smart contracts: HCS only, through the Hiero SDK.

## Quick start

```bash
npm create scaffold-hbar@latest -- --template Jexsie/hcs-track-log --package-manager npm
```

This template supports **npm only**.

## Prerequisites

| Requirement             | Notes                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------ |
| Node.js `>=20.18.3`     | CI runs Node 22 (see `.nvmrc`)                                                       |
| npm                     | The only supported package manager                                                   |
| Docker                  | Runs the bundled Postgres via `docker-compose.yml`                                   |
| **Postgres (required)** | The app does not run without it. Use Docker or bring your own and set `DATABASE_URL` |
| Hedera account          | A testnet operator account from [portal.hedera.com](https://portal.hedera.com/)      |

## Setup

```bash
npm install
cp .env.example .env        # fill in HEDERA_OPERATOR_ID / HEDERA_OPERATOR_KEY
npm run keys:generate       # dev only: prints submitter key lines to paste into .env
docker compose up -d        # start Postgres
npm run db:migrate          # create tables
npm run topic:create        # create the multi-sig HCS topic; put the id in HCS_TOPIC_ID
npm run db:seed             # optional: anchor a demo parcel on HCS and cache it
npm run next:dev            # http://localhost:3000
```

## Environment variables

All variables live in `.env` at the repository root. `.env.example` holds placeholders only.
**Never commit `.env`.**

| Variable                 | Purpose                                                                                        |
| ------------------------ | ---------------------------------------------------------------------------------------------- |
| `HEDERA_NETWORK`         | `testnet`, `previewnet` or `mainnet`                                                           |
| `HEDERA_OPERATOR_ID`     | Account that pays fees and creates the topic                                                   |
| `HEDERA_OPERATOR_KEY`    | Operator private key                                                                           |
| `HCS_TOPIC_ID`           | Topic that receives event envelopes                                                            |
| `HCS_SUBMIT_PUBLIC_KEYS` | Comma-separated public keys of authorized submitters                                           |
| `HCS_SUBMIT_THRESHOLD`   | Signatures required per message                                                                |
| `HCS_SUBMIT_SIGNER_KEYS` | Private keys this server signs with (must meet the threshold)                                  |
| `MIRROR_NODE_URL`        | Mirror node base URL used for verification                                                     |
| `DATABASE_URL`           | Postgres connection string                                                                     |
| `TEST_DATABASE_URL`      | Test database; **its schema is dropped** on every `npm run test`. The name must end in `_test` |
| `SUBMITTER_API_TOKEN`    | Bearer token for the write API (≥ 32 chars; `openssl rand -hex 32`)                            |

## Architecture

```
packages/nextjs    Next.js App Router app (Tailwind CSS v4): UI, API routes, domain logic, scripts
```

- **Write (HCS-first):** canonicalize the event → SHA-256 → build the envelope → submit to the
  topic → _only after consensus success_ write the event to Postgres. If submission fails,
  nothing is written.
- **Read (database-first):** the timeline renders straight from Postgres.
- **Verify (recompute):** for each event, rebuild the canonical bytes from the Postgres columns,
  hash them fresh, fetch the HCS message at the event's `hcs_sequence_number` from the mirror
  node, and compare.

### The two hashes

There are exactly two hashes, over **disjoint** field sets:

| Hash          | Covers                                                                                                                                    | Lifetime                              |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `parcelHash`  | consignment (description, packageCount, packageType, grossMassKg, volumeCubicMeters), parties (shipper, consignee), bookingRef, createdAt | Computed once; the public tracking ID |
| `payloadHash` | status, location, carrier (name, scacCode), timestamp                                                                                     | Computed fresh for every event        |

`bookingRef` and `createdAt` stop two identical shipments from colliding into the same ID, and
make the ID impossible to guess from business data alone.

### On-chain envelope

Only blind notary fields reach the ledger:

```ts
interface HcsMessageEnvelope {
  v: number; // envelope version
  parcelHash: string; // tracking ID, constant per parcel
  payloadHash: string; // SHA-256 of this event's canonical content
}
```

No statuses, locations, carriers or descriptions go on-chain.

#

#

#

S
e
a
r
c
h

a
n
d

v
e
r
i
f
y

1
.

O
p
e
n

`/`
,

p
a
s
t
e

a

t
r
a
c
k
i
n
g

I
D
,

a
n
d

y
o
u

l
a
n
d

o
n

`
/
t
r
a
c
k
/
<
p
a
r
c
e
l
H
a
s
h

>

`
.

T
h
e

s
e
r
v
e
r

r
e
n
d
e
r
s

t
h
e

w
h
o
l
e

t
i
m
e
l
i
n
e

s
t
r
a
i
g
h
t

f
r
o
m

P
o
s
t
g
r
e
s

(
d
a
t
a
b
a
s
e
-

f
i
r
s
t
)
.

E
a
c
h

r
o
w

s
h
o
w
s

i
t
s

`h
c
s
_
s
e
q
u
e
n
c
e
_
n
u
m
b
e
r`
.

2
.

A
n

a
n
i
m
a
t
e
d

-
-

"
V
e
r
i
f
y
i
n
g

l
i
v
e

l
e
d
g
e
r

i
n
t
e
g
r
i
t
y
…
" * *

o
v
e
r
l
a
y

a
p
p
e
a
r
s

w
h
i
l
e

-
-

y
o
u
r

b
r
o
w
s
e
r * *

c
h
e
c
k
s

e
a
c
h

e
v
e
n
t
.

P
u
b
l
i
c

m
i
r
r
o
r

n
o
d
e
s

a
l
l
o
w

c
r
o
s
s
-

o
r
i
g
i
n

r
e
q
u
e
s
t
s
,

s
o

t
h
e

c
h
e
c
k

d
o
e
s

n
o
t

d
e
p
e
n
d

o
n

t
r
u
s
t
i
n
g

t
h
i
s

a
p
p
'
s

s
e
r
v
e
r
.

F
o
r

e
a
c
h

e
v
e
n
t
,

t
h
e

b
r
o
w
s
e
r
:

-

r
e
b
u
i
l
d
s

t
h
e

c
a
n
o
n
i
c
a
l

b
y
t
e
s

f
r
o
m

t
h
e

d
i
s
p
l
a
y
e
d

c
o
n
t
e
n
t

a
n
d

c
o
m
p
u
t
e
s

S
H
A
-

2
5
6

f
r
e
s
h

(
W
e
b
C
r
y
p
t
o
)
,

-

f
e
t
c
h
e
s

`
G
E
T

{
M
I
R
R
O
R
_
N
O
D
E
_
U
R
L
}
/
a
p
i
/
v
1
/
t
o
p
i
c
s
/
{
t
o
p
i
c
I
d
}
/
m
e
s
s
a
g
e
s
/
{
s
e
q
u
e
n
c
e
N
u
m
b
e
r
}
`
,

-

r
e
q
u
i
r
e
s

t
h
e

o
n
-

c
h
a
i
n

`p
a
r
c
e
l
H
a
s
h`

t
o

e
q
u
a
l

t
h
e

s
e
a
r
c
h
e
d

I
D
,

a
n
d

t
h
e

o
n
-

c
h
a
i
n

`p
a
y
l
o
a
d
H
a
s
h`

t
o

e
q
u
a
l

t
h
e

r
e
c
o
m
p
u
t
e
d

h
a
s
h
.

3
.

T
h
e

b
r
o
w
s
e
r

a
l
s
o

r
e
c
o
m
p
u
t
e
s

t
h
e

t
r
a
c
k
i
n
g

I
D

f
r
o
m

t
h
e

p
a
r
c
e
l

d
e
t
a
i
l
s
.

4
.

E
a
c
h

e
v
e
n
t

t
h
e
n

s
h
o
w
s

o
n
e

o
f
:

-

*
*

✅

V
e
r
i
f
i
e
d

a
g
a
i
n
s
t

l
e
d
g
e
r * *
,

l
i
n
k
i
n
g

t
o

t
h
a
t

m
i
r
r
o
r
-

n
o
d
e

m
e
s
s
a
g
e
.

-

A

-
-

s
e
c
u
r
i
t
y

w
a
r
n
i
n
g * *

n
a
m
i
n
g

t
h
e

s
e
q
u
e
n
c
e

n
u
m
b
e
r
.

R
e
a
s
o
n
s
:

`
c
o
n
t
e
n
t
-

m
i
s
m
a
t
c
h
`
,

`
w
r
o
n
g
-

p
a
r
c
e
l
`
,

`
i
n
v
a
l
i
d
-

c
o
n
t
e
n
t
`
,

`
n
o
t
-

a
n
-

e
n
v
e
l
o
p
e
`
,

`
n
o
-

a
n
c
h
o
r
`
.

-

*
*

L
e
d
g
e
r

u
n
r
e
a
c
h
a
b
l
e * *
,

w
i
t
h

a

r
e
t
r
y

b
u
t
t
o
n
.

E
v
e
r
y

h
a
s
h

o
n

t
h
e

p
a
g
e

i
s

r
e
c
o
m
p
u
t
e
d
;

n
o
n
e

i
s

r
e
a
d

f
r
o
m

s
t
o
r
a
g
e
.

`
G
E
T

/
a
p
i
/
p
a
r
c
e
l
s
/
:
p
a
r
c
e
l
H
a
s
h
`

r
e
t
u
r
n
s

t
h
e

s
a
m
e

s
t
o
r
e
d

c
o
n
t
e
n
t

a
s

J
S
O
N
,

s
o

a
n
y

c
l
i
e
n
t

c
a
n

v
e
r
i
f
y

i
t

i
n
d
e
p
e
n
d
e
n
t
l
y
.

#

#

#

V
e
r
i
f
y

f
r
o
m

t
h
e

c
o
m
m
a
n
d

l
i
n
e

`
`
`
b
a
s
h

n
p
m

r
u
n

v
e
r
i
f
y

-
-

-
-

t
o
p
i
c

0
.
0
.
1
2
3
4
5

#

e
v
e
r
y

c
a
c
h
e
d

p
a
r
c
e
l

-

a

t
o
p
i
c

s
c
a
n

n
p
m

r
u
n

v
e
r
i
f
y

-
-

-
-

p
a
r
c
e
l

<
t
r
a
c
k
i
n
g
I
d

>

#

o
n
e

p
a
r
c
e
l

n
p
m

r
u
n

v
e
r
i
f
y

-
-

-
-

t
o
p
i
c

0
.
0
.
1
2
3
4
5

-
-

s
k
i
p
-

s
c
a
n

#

s
k
i
p

p
a
g
i
n
g

t
h
r
o
u
g
h

t
h
e

w
h
o
l
e

t
o
p
i
c

`
`
`

-

*
*

W
h
a
t

i
t

d
o
e
s
: * *

r
e
c
o
m
p
u
t
e
s

e
v
e
r
y

c
a
c
h
e
d

e
v
e
n
t

f
r
o
m

P
o
s
t
g
r
e
s

a
n
d

c
o
m
p
a
r
e
s

i
t

w
i
t
h

t
h
e

l
e
d
g
e
r
.

T
h
e

t
o
p
i
c

s
c
a
n

f
o
l
l
o
w
s

m
i
r
r
o
r
-

n
o
d
e

p
a
g
i
n
a
t
i
o
n
,

a
n
d

r
e
p
o
r
t
s

e
n
v
e
l
o
p
e
s

t
h
a
t

a
r
e

o
n

t
h
e

l
e
d
g
e
r

b
u
t

m
i
s
s
i
n
g

f
r
o
m

t
h
e

c
a
c
h
e

(
f
o
r

e
x
a
m
p
l
e

a
f
t
e
r

a

`C
A
C
H
E
_
W
R
I
T
E
_
F
A
I
L
E
D`
)
,

p
l
u
s

a
n
y

n
o
n
-

e
n
v
e
l
o
p
e

m
e
s
s
a
g
e
s
.

-

*
*

D
e
f
a
u
l
t
s
: * *

`
-

-

t
o
p
i
c
`

f
a
l
l
s

b
a
c
k

t
o

`H
C
S
_
T
O
P
I
C
_
I
D`
.

-

*
*

E
x
i
t

c
o
d
e
s
: * *

`0`

a
l
l

v
e
r
i
f
i
e
d
,

`1`

t
a
m
p
e
r
i
n
g

f
o
u
n
d
,

`2`

i
n
c
o
m
p
l
e
t
e

(
m
i
r
r
o
r

n
o
d
e

u
n
r
e
a
c
h
a
b
l
e
)
.

### Why recompute?

Postgres has no hash column that verification relies on. Every hash is recomputed from content
through the same canonical builder used at submit time. If someone edits a row (for example an
event's `location`), the recomputed hash no longer matches the on-chain `payloadHash`, and the
UI flags that event as **tampered**. Checking a stored hash against the chain would prove
nothing about the content.

### Configuring the multi-signature submit key

The topic's **submit key** is a threshold `KeyList`. Hedera rejects any message that lacks
enough valid signatures (`INVALID_SIGNATURE`), so the network enforces this, not the app.

1. **Collect submitter public keys.** Each authorized party generates its own keypair and shares
   only the public key. For local development, `npm run keys:generate -- --count 3 --threshold 2`
   prints a ready-made set.
2. **Configure `.env`:**
   - `HCS_SUBMIT_PUBLIC_KEYS`: every authorized public key, comma-separated (DER, or `0x`-hex ECDSA).
   - `HCS_SUBMIT_THRESHOLD`: signatures required per message. At least 2 and at most the number of
     keys. A threshold of 1 is refused, because it would not be multi-signature.
   - `HCS_SUBMIT_SIGNER_KEYS`: the private keys this server co-signs with. At startup the server
     checks they meet the threshold, before any fee is paid, and refuses to start otherwise.
3. **Create the topic:** `npm run topic:create`. This builds the `KeyList`, creates the topic, and
   then reads the topic back with `TopicInfoQuery` to confirm that the on-chain submit key matches.
   Put the printed id in `HCS_TOPIC_ID`.

The topic is created **without an admin key**, so it is immutable and no single party can replace
the submit key later. To rotate signers, create a new topic.

> **Deployment note.** If one server holds `threshold` private keys, that server is effectively
> one party. For real separation of duties, keep the keys with different parties and collect their
> signatures on each frozen `TopicMessageSubmitTransaction`. See
> `lib/hedera/hcs-submitter.ts#prepare` for where to split signing out.

To prove enforcement against the live network (this costs a few testnet cents):

```bash
RUN_TESTNET_TESTS=1 npm run test
```

This creates a 2-of-3 topic and checks that a message signed by one submitter is rejected with
`INVALID_SIGNATURE` while a message signed by two is accepted.

### Write-path failure modes

| Failure                                     | Ledger   | Postgres | Error                                                                                      |
| ------------------------------------------- | -------- | -------- | ------------------------------------------------------------------------------------------ |
| Invalid input, unknown or duplicate parcel  | nothing  | nothing  | `ValidationError` / `ParcelNotFoundError` / `ParcelExistsError`                            |
| Submission rejected or network error        | nothing  | nothing  | `SubmissionFailedError`                                                                    |
| Consensus OK, then the database write fails | anchored | missing  | `DerivedWriteError` (carries the sequence number and content so the insert can be retried) |

A parcel is written to Postgres together with its first event, and only after that event reaches
consensus. Every cached parcel is therefore anchored on the ledger. `createdAt` is always assigned
by the server, at whole-second precision.

### Database

**Postgres is required.** `docker compose up -d` starts Postgres 18 with two databases,
`hcs_track_log` (the app) and `hcs_track_log_test` (the test suite). Migrations live in
`packages/nextjs/migrations` as plain SQL and are run by `npm run db:migrate`. To roll back the
latest migration, run `npm run db:migrate -- --down`.

| Table          | Columns                                                                                                                                                                                                      | Notes                      |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------- |
| `parcels`      | `id`, `parcel_hash` (unique), description, package_count, package_type, gross_mass_kg `NUMERIC(10,2)`, volume_cubic_meters `NUMERIC(10,2)`, shipper, consignee, booking_ref, created_at `TIMESTAMPTZ(0)`     | Immutable parcel content   |
| `cargo_events` | `id`, `parcel_hash` → parcels `ON DELETE CASCADE`, status, location, carrier_name, carrier_scac_code, event_timestamp `TIMESTAMPTZ(0)`, payer_account_id, hcs_sequence_number `BIGINT` (unique), recorded_at | One row per anchored event |

- **No stored payload hash.** `parcel_hash` is only the lookup key. Verification recomputes both
  hashes from the content columns.
- **Round-trip safety.** `NUMERIC(10,2)` comes back from `pg` as a fixed-scale string (`"142.50"`)
  and `TIMESTAMPTZ(0)` as an instant, so the canonical builder rebuilds identical bytes. The test
  suite proves this under four different session time zones.
- **One topic per database.** `hcs_sequence_number` is unique across the table, which matches one
  topic per deployment.

### Write API

Both endpoints require `Authorization: Bearer $SUBMITTER_API_TOKEN`. The server co-signs
submissions, so an open write endpoint would let anyone write to the topic through it.

| Endpoint                               | Body                                                                                                     | Success                                                                 |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `POST /api/parcels`                    | `{ parcel: { consignment, parties, bookingRef }, firstEvent: { status, location, carrier, timestamp } }` | `201 { parcelHash, firstEvent: { hcsSequenceNumber, payerAccountId } }` |
| `POST /api/parcels/:parcelHash/events` | `{ status, location, carrier: { name, scacCode }, timestamp }`                                           | `201 { parcelHash, hcsSequenceNumber }`                                 |

Errors use the shape `{ error: { code, message, path? } }`. The codes are:

| HTTP status | Code                                                                                                             |
| ----------- | ---------------------------------------------------------------------------------------------------------------- |
| 400         | `VALIDATION_ERROR`                                                                                               |
| 401         | `UNAUTHORIZED`                                                                                                   |
| 404         | `PARCEL_NOT_FOUND`                                                                                               |
| 409         | `PARCEL_EXISTS`                                                                                                  |
| 502         | `SUBMISSION_FAILED` (nothing recorded)                                                                           |
| 500         | `SERVER_MISCONFIGURED`                                                                                           |
| 500         | `CACHE_WRITE_FAILED` (anchored at `hcsSequenceNumber`; the full content is written to the server log for replay) |

Timestamps must include a UTC offset and have whole-second precision.

### `payer_account_id`

`cargo_events.payer_account_id` is a convenience copy only. It is **not** covered by
`payloadHash`. The mirror node's transaction record is the authoritative payer.

## Scripts

| Command                 | Purpose                                                                     |
| ----------------------- | --------------------------------------------------------------------------- |
| `npm run next:dev`      | Start the dev server                                                        |
| `npm run next:build`    | Production build                                                            |
| `npm run lint`          | ESLint + TypeScript type-check                                              |
| `npm run test`          | Vitest: `unit` project + `db` project (needs Postgres)                      |
| `npm run format`        | Prettier                                                                    |
| `npm run keys:generate` | Generate dev submitter keypairs and print the `.env` lines                  |
| `npm run topic:create`  | Create the HCS topic with the threshold submit key                          |
| `npm run db:migrate`    | Apply migrations (`-- --down` rolls back the latest)                        |
| `npm run db:seed`       | Anchor a demo parcel and its journey on HCS, then cache it                  |
| `npm run verify`        | Verify cached events against the topic by recomputation (`-- --topic <id>`) |

## License

[MIT](./LICENSE)
