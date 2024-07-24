# Design Doc: Piece Indexer

## Introduction

### Context

Filecoin defines a `Piece` as the main unit of negotiation for data that users
_store_ on the Filecoin network. This is reflected in the on-chain metadata field
`PieceCID`.

On the other hand, content is _retrieved_ from Filecoin using the CID of the
requested payload.

This dichotomy poses a challenge for retrieval checkers like Spark: for a given
deal storing some PieceCID, what payload CID to request when testing the retrieval?

Spark v1 relies on StorageMarket's DealProposal metadata `Label`, which is often
(but not always!) set by the client to the root CID of the payload stored.

In the first half of 2024, the Filecoin network added support for DDO (Direct
Data Onboarding) deals. These deals don't have any DealProposal, there is no
`Label` field. Only `PieceCID`. We need to find a different solution to support
these deals.

In the longer term, we want IPNI to provide a reverse lookup functionality that
will allow clients like Spark to request a sample of payload block CIDs
associated with the given ContextID or PieceCID, see the
[design proposal for InterPlanetary Piece Index](https://docs.google.com/document/d/1jhvP48ccUltmCr4xmquTnbwfTSD7LbO1i1OVil04T2w).

To cover the gap until the InterPlanetary Piece Index is live, we want to
implement a lightweight solution that can serve as a stepping stone between
Label-based CID discovery and full Piece Index sampling.

### High-Level Idea

Let's implement a lightweight IPNI ingester that will process the advertisements
from Filecoin SPs and extract the list of `(ProviderID, PieceCID, PayloadCID)`
entries. Store these entries in a Postgres database. Provide a REST API endpoint
accepting `(ProviderID, PieceCID)` and returning a single `PayloadCID`.

#### Notes

Pieces are immutable. If we receive an advertisement saying that a payload block
CID was found in a piece CID, then this information remains valid forever, even
after the SP advertise that they are no longer storing that block. This means
our indexer can ignore `IsRm` advertisements.

The indexer protocol does not provide any guarantees about the list of CIDs
advertised for the same Piece CID. Different SPs can advertise different lists
(e.g. the entries can be ordered differently) or can even cheat and submit CIDs
that are not part of the Piece. Our indexer must scope the information to each
index provider.

### Anatomy of IPNI Advertisements

Quoting from
[Ingestion](https://github.com/ipni/specs/blob/90648bca4749ef912b2d18f221514bc26b5bef0a/IPNI.md#ingestion):

> The indexer reads the advertisement chain starting from the head, reading
> previous advertisements until a previously seen advertisement, or the end of
> the chain, is reached. The advertisements and their entries are then processed
> in order from earliest to head.

An Advertisement has several properties (see
[the full spec](https://github.com/ipni/specs/blob/90648bca4749ef912b2d18f221514bc26b5bef0a/IPNI.md#advertisements)),
we need the following ones:

- **`PreviousID`** is the CID of the previous advertisement, and is empty for
  the 'genesis'.

- **`Metadata`** represents additional opaque data. The metadata for Graphsync
  retrievals includes the PieceCID that we are looking for.

- **`Entries`** is a link to a data structure that contains the advertised multihashes. For our purposes, it's
  enough to take the first entry and ignore the rest.

Advertisements are made available for consumption by indexer nodes as a set of
files that can be fetched via HTTP.

Quoting from
[Advertisement Transfer](https://github.com/ipni/specs/blob/90648bca4749ef912b2d18f221514bc26b5bef0a/IPNI.md#advertisement-transfer):

> All IPNI HTTP requests use the IPNI URL path prefix, `/ipni/v1/ad/`. Indexers
> and advertisement publishers implicitly use and expect this prefix to precede
> the requested resource.
>
> The IPLD objects of advertisements and entries are represented as files named
> by their CIDs in an HTTP directory. These files are immutable, so can be
> safely cached or stored on CDNs. To fetch an advertisement or entries file by
> CID, the request made by the indexer to the publisher is
> `GET /ipni/v1/ad/{CID}`.

The IPNI instance running at https://cid.contact provides an API returning the
list of all index providers from which cid.contact have received announcements:

https://cid.contact/providers

The response provides all the metadata we need to download the advertisements:

- `Publisher.Addrs` describes where we can contact SP's index provider
- `LastAdvertisement` contains the CID of the head advertisement

## Proposed Design

### Ingestion

Ingesting announcements from all Storage Providers is the most complex
component. For each storage provider, we need to periodically check for the
latest advertisement head and process the chain from head until we find an
advertisement we have already processed before. The chain can be very long,
therefore we need to account for the cases when the service restarts or a new
head is published before we finish processing the chain.

#### Proposed algorithm

Use the following per-provider state persisted in the database:

- `provider_id` - Primary key.

- `provider_address` - Provider's address where we can fetch advertisements
  from.

- `last_head` - The CID of the head where we started the previous walk. All
  advertisements from `last_head` to the end of the chain have already
  been processed.

- `next_head` - The CID of the most recent head seen by cid.contact. This is
  where we need to start the next walk from.

- `head` - The CID of the head advertisement we started the current walk from.
  We update this value whenever we start a new walk.

- `tail` - The CID of the next advertisement in the chain that we need to
  process in the current walk.

Every minute, fetch the latest providers from cid.contact. For each provider
found, fetch the state from the database and run the following algorithm (using
the name `new_head` for the CID of the latest advertisement).

1. If `last_head` is not set, then we need to start the ingestion from scratch.
   Update the state as follows and start the chain walker:

   ```
   last_head = new_head
   next_head = new_head
   head = new_head
   tail = new_head
   ```

2. If `new_head` is the same as `next_head`, then there was no change since we
   checked the head last time and we are done.

3. If `next_tail` is not null, then there is an ongoing walk of the chain we
   need to finish before we can ingest new advertisements. Update the state as
   follows and abort.

   ```
   next_head := new_head
   ```

4. `next_tail` is null, which means we have finished ingesting all
   advertisements from `head` to the end of the chain. Update the state as
   follows and start the chain walker.

   ```
   next_head = new_head
   head = new_head
   tail = new_head
   ```

The chain-walking algorithm loops over the following steps:

1. If ` tail == last_head || tail == null`, then we finished the walk. Update
   the state as follows:

   ```
   last_head = head
   head = null
   tail = null
   ```

   If `next_head != last_head` then start a new walk by updating the state as
   follows:

   ```
   head = next_head
   tail = next_head
   ```

2. Otherwise take a step to the next item in the chain:

   1. Fetch the advertisement identified by `tail` from the index provider.
   2. Process the metadata and entries to extract one `(PieceCID, PayloadCID)`
      entry.
   3. Update the `tail` field using the `PreviousID` field from the
      advertisement.

   ```
   tail = PreviousID
   ```

#### Handling the Scale

At the time of writing this document, cid.contact was tracking 322 index
providers. From Sparks' measurements, we know there are an additional 843
storage providers that don't advertise to IPNI. The number of storage providers
grows over time, our system must be prepared to ingest advertisements from
thousands of providers.

Each storage/index provider produces tens of thousands to hundreds of thousands
of advertisements (in total). The initial ingestion run will take a while to
complete. We also must be careful to not overload the SP by sending too many
requests.

The design outlined in the previous section divides the ingestion process into
small steps that can be scheduled and executed independently. This allows us to
avoid the complexity of managing long-running per-provider tasks and instead
repeatedly execute one step of the process.

Loop 1: Every minute, fetch the latest provider information from cid.contact and
update the persisted state as outlined above.

Loop 2: Discover walks in progress and make one step in each walk.

1. Find all provider state records where `tail != null`.

2. For each provider, execute one step as described above. We can execute these
   steps in parallel. Since each parallel job will query a different provider,
   we are not going to overload any single provider.

3. Optionally, we can introduce a small delay before the next iteration. I think
   we won't need it because the time to execute SQL queries should create enough
   delay.

### REST API

Implement the following endpoint that will be called by Spark checker nodes. The
endpoint will sign the response using the server's private key to allow
spark-evaluate to verify the authenticity of results reported by checker nodes:

```
GET /sample/{providerId}/{pieceCid}?seed={seed}
```

Response in JSON format, when the piece was found:

```json
{
  "samples": ["exactly one CID of a payload block advertised for PieceCID"],
  "pubkey": "server's public key",
  "signature": "signature over dag-json{providerId,pieceCid,seed,samples}"
}
```

Response in JSON format, when the piece or the provider was not found:

```json
{
  "error": "code - e.g. PROVIDER_NOT_FOUND or PIECE_NOT_FOUND",
  "pubkey": "server's public key",
  "signature": "signature over dag-json{providerId,pieceCid,seed,error}"
}
```

In the initial version, the server will ignore the `seed` value and use it only
as a nonce preventing replay attacks. Spark checker nodes will set the seed
using the DRAND randomness string for the current Spark round.

In the future, when IPNI implements the proposed reverse-index sampling
endpoint, the seed will be used to pick the samples at random. See the
[IPNI Multihash Sampling API proposal](https://github.com/ipni/xedni/blob/526f90f5a6001cb50b52e6376f8877163f8018af/openapi.yaml)

### Observability

We need visibility into the status of ingestion for any given provider. Some
providers don't advertise at all, some may have misconfigured integration with
IPNI, we need to understand why our index does not include any data for a
provider.

Let's enhance the state table with another column describing the ingestion
status as a free-form string and implement a new REST API endpoint to query the
ingestion status.

```
GET /ingestion-status/{providerId}
```

Response in JSON format:

```json
{
  "providerId": "state.provider_id",
  "providerAddress": "state.provider_address",
  "ingestionStatus": "state.ingestion_status",
  "lastHeadWalkedFrom": "state.last_head",
  "piecesIndexed": 123
  // ^^ number of (PieceCID, PayloadCID) records found for this provider
}
```
