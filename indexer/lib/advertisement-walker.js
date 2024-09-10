import createDebug from 'debug'
import { assertOkResponse } from './http-assertions.js'
import { CID } from 'multiformats/cid'
import * as multihash from 'multiformats/hashes/digest'
import { varint } from 'multiformats'
import * as cbor from '@ipld/dag-cbor'

/** @import { ProviderInfo, WalkerState } from './typings.js' */
/** @import { RedisRepository as Repository } from './redis-repository.js' */

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

  if (!currentWalkerState?.lastHead) {
    console.log('Initial walk for provider %s (%s): %s', providerId, providerInfo.providerAddress, providerInfo.lastAdvertisementCID)

    /** @type {WalkerState} */
    state = {
      lastHead: nextHead,
      head: nextHead,
      tail: nextHead,
      status: 'placeholder'
    }
  } else {
    console.log('WALK NOT IMPLEMENTED YET %s %o', providerId, currentWalkerState)
    return {}
  }

  // if (state.tail === state.lastHead || state.tail === undefined) {
  //   console.log('WALK FINISHED: %s %o', state)
  //   return { }
  // }
  if (!state || !state.tail) {
    console.log('NOTHING TO DO for %s %o', providerId, currentWalkerState)
    return {}
  }

  // TODO: handle networking errors, Error: connect ENETUNREACH 154.42.3.42:3104

  const { previousAdvertisementCid, ...entry } = await fetchAdvertisedPayload(providerInfo.providerAddress, state.tail)
  state.tail = previousAdvertisementCid
  state.status = `Walking the advertisements from ${state.head}, next step: ${state.tail}`

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
