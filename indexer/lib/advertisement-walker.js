import * as cbor from '@ipld/dag-cbor'
import createDebug from 'debug'
import { varint } from 'multiformats'
import { CID } from 'multiformats/cid'
import * as multihash from 'multiformats/hashes/digest'
import assert from 'node:assert'
import { assertOkResponse } from './http-assertions.js'

/** @import { ProviderInfo, WalkerState } from './typings.js' */
// /** @import { RedisRepository as Repository } from './redis-repository.js' */

const debug = createDebug('spark-piece-indexer:observer')

/**
 * @param {string} providerId
 * @param {ProviderInfo} providerInfo
 * @param {WalkerState | undefined} currentWalkerState
 */
export async function processNextAdvertisement (providerId, providerInfo, currentWalkerState) {
  const nextHead = providerInfo.lastAdvertisementCID

  /** @type {WalkerState} */
  let state

  if (currentWalkerState?.tail) {
    debug('Next step for provider %s (%s): %s', providerId, providerInfo.providerAddress, currentWalkerState.tail)
    state = { ...currentWalkerState }
  } else if (nextHead === currentWalkerState?.lastHead) {
    debug('No new advertisements from provider %s (%s)', providerId, providerInfo.providerAddress)
    return {}
  } else {
    debug('New walk for provider %s (%s): %s', providerId, providerInfo.providerAddress, providerInfo.lastAdvertisementCID)
    state = {
      head: nextHead,
      tail: nextHead,
      lastHead: currentWalkerState?.lastHead,
      status: 'placeholder'
    }
  }

  // TypeScript is not able to infer (yet?) that state.tail is always set by the code above
  assert(state.tail)

  // TODO: handle networking errors, Error: connect ENETUNREACH 154.42.3.42:3104
  const { previousAdvertisementCid, ...entry } = await fetchAdvertisedPayload(providerInfo.providerAddress, state.tail)

  if (!previousAdvertisementCid || previousAdvertisementCid === state.lastHead) {
    // We finished the walk
    state.lastHead = state.head
    state.head = undefined
    state.tail = undefined
    state.status = `All advertisements from ${state.lastHead} to the end of the chain were processed.`
  } else {
    // There are more steps in this walk
    state.tail = previousAdvertisementCid
    state.status = `Walking the advertisements from ${state.head}, next step: ${state.tail}`
  }

  const indexEntry = entry.pieceCid ? entry : undefined
  return {
    newState: state,
    indexEntry
  }
}

/**
 * @param {string} providerAddress
 * @param {string} advertisementCid
 */
export async function fetchAdvertisedPayload (providerAddress, advertisementCid) {
  const advertisement =
    /** @type {{
      Addresses: string[],
      ContextID: { '/': { bytes: string } },
      Entries: { '/': string },
      IsRm: false,
      Metadata: { '/': { bytes: string } },
      PreviousID?: { '/': string },
      Provider: string
      Signature: {
        '/': {
          bytes: string
        }
      }
     }} */(
      await fetchCid(providerAddress, advertisementCid)
    )
  const previousAdvertisementCid = advertisement.PreviousID?.['/']
  debug('advertisement %s %j', advertisementCid, advertisement)

  const entriesCid = advertisement.Entries?.['/']
  if (!entriesCid || entriesCid === 'bafkreehdwdcefgh4dqkjv67uzcmw7oje') {
    // An empty advertisement with no entries
    // See https://github.com/ipni/ipni-cli/blob/512ef8294eb717027b72e572897fbd8a1ed74564/pkg/adpub/client_store.go#L46-L48
    // https://github.com/ipni/go-libipni/blob/489479457101ffe3cbe80682570b63c12ba2546d/ingest/schema/schema.go#L65-L71
    debug('advertisement %s has no entries: %j', advertisementCid, advertisement.Entries)
    return { previousAdvertisementCid }
  }

  const entriesChunk =
    /** @type {{
     Entries: { '/' :  { bytes: string } }[]
    }} */(
      await fetchCid(providerAddress, entriesCid)
    )
  debug('entriesChunk %s %j', entriesCid, entriesChunk.Entries.slice(0, 5))
  const entryHash = entriesChunk.Entries[0]['/'].bytes
  const payloadCid = CID.create(1, 0x55 /* raw */, multihash.decode(Buffer.from(entryHash, 'base64'))).toString()

  const meta = parseMetadata(advertisement.Metadata['/'].bytes)
  const pieceCid = meta.deal?.PieceCID.toString()

  return {
    previousAdvertisementCid,
    pieceCid,
    payloadCid
  }
}

/**
 * @param {string} providerBaseUrl
 * @param {string} cid
 * @returns {Promise<unknown>}
 */
async function fetchCid (providerBaseUrl, cid) {
  const url = new URL(cid, new URL('/ipni/v1/ad/_cid_placeholder_', providerBaseUrl))
  debug('Fetching %s', url)
  // const res = await fetch(url)
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) })
  await assertOkResponse(res)
  return await res.json()
}

/**
 * @param {string} meta
 */
export function parseMetadata (meta) {
  const bytes = Buffer.from(meta, 'base64')
  const [protocolCode, nextOffset] = varint.decode(bytes)

  const protocol = {
    0x900: 'bitswap',
    0x910: 'graphsync',
    0x0920: 'http'
  }[protocolCode] ?? '0x' + protocolCode.toString(16)

  if (protocol === 'graphsync') {
    // console.log(bytes.subarray(nextOffset).toString('hex'))
    /** @type {{
    PieceCID: import('multiformats/cid').CID,
    VerifiedDeal: boolean,
    FastRetrieval: boolean
    }} */
    const deal = cbor.decode(bytes.subarray(nextOffset))
    return { protocol, deal }
  } else {
    return { protocol }
  }
}
