import * as cbor from '@ipld/dag-cbor'
import createDebug from 'debug'
import { varint } from 'multiformats'
import { CID } from 'multiformats/cid'
import * as multihash from 'multiformats/hashes/digest'
import assert from 'node:assert'
import timers from 'node:timers/promises'
import { assertOkResponse } from './http-assertions.js'

/** @import { ProviderInfo, WalkerState } from './typings.js' */
/** @import { RedisRepository as Repository } from './redis-repository.js' */

const debug = createDebug('spark-piece-indexer:observer')

/**
 * @param {object} args
 * @param {Repository} args.repository
 * @param {string} args.providerId
 * @param {(providerId: string) => Promise<ProviderInfo>} args.getProviderInfo
 * @param {number} args.minStepIntervalInMs
 * @param {AbortSignal} [args.signal]
 */
export async function walkProviderChain ({
  repository,
  providerId,
  getProviderInfo,
  minStepIntervalInMs,
  signal
}) {
  let stepInterval = minStepIntervalInMs

  while (!signal?.aborted) {
    const started = Date.now()
    const providerInfo = await getProviderInfo(providerId)
    let failed = false
    try {
      const result = await walkOneStep(repository, providerId, providerInfo)
      if (result.finished) break
      failed = !!result.failed
    } catch (err) {
      failed = true
      console.error('Error indexing provider %s (%s):', providerId, providerInfo.providerAddress, err)
      // FIXME: capture this error to Sentry
    }

    if (failed) {
      // exponential back-off for failing requests
      if (stepInterval < 1_000) stepInterval = 1_000
      else if (stepInterval < 60_000) stepInterval = stepInterval * 2
      else stepInterval = 60_000
    } else {
      stepInterval = minStepIntervalInMs
    }

    const delay = stepInterval - (Date.now() - started)
    if (delay > 0) {
      debug('Waiting for %sms before the next walk for provider %s (%s)', delay, providerId, providerInfo.providerAddress)
      await timers.setTimeout(delay)
    }
  }
}

/**
 * @param {Repository} repository
 * @param {string} providerId
 * @param {ProviderInfo} providerInfo
 */
export async function walkOneStep (repository, providerId, providerInfo) {
  const walkerState = await repository.getWalkerState(providerId)
  const {
    newState,
    indexEntry,
    failed,
    finished
  } = await processNextAdvertisement(providerId, providerInfo, walkerState)

  if (newState) {
    await repository.setWalkerState(providerId, newState)
  }
  if (indexEntry?.pieceCid) {
    await repository.addPiecePayloadBlocks(providerId, indexEntry.pieceCid, indexEntry.payloadCid)
  }
  return { failed, finished }
}

/**
 * @param {string} providerId
 * @param {ProviderInfo} providerInfo
 * @param {WalkerState | undefined} currentWalkerState
 */
export async function processNextAdvertisement (providerId, providerInfo, currentWalkerState) {
  if (!providerInfo.providerAddress?.match(/^https?:\/\//)) {
    debug('Skipping provider %s - address is not HTTP(s): %s', providerId, providerInfo.providerAddress)
    return {
      /** @type {WalkerState} */
      newState: {
        status: `Index provider advertises over an unsupported protocol: ${providerInfo.providerAddress}`
      },
      finished: true
    }
  }

  const nextHead = providerInfo.lastAdvertisementCID

  /** @type {WalkerState} */
  let state

  if (currentWalkerState?.tail) {
    debug('Next step for provider %s (%s): %s', providerId, providerInfo.providerAddress, currentWalkerState.tail)
    state = { ...currentWalkerState }
  } else if (nextHead === currentWalkerState?.lastHead) {
    debug('No new advertisements from provider %s (%s)', providerId, providerInfo.providerAddress)
    return { finished: true }
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

  try {
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
    const finished = !state.tail
    return {
      newState: state,
      indexEntry,
      finished
    }
  } catch (err) {
    // TODO: report details about networking errors, Error: connect ENETUNREACH 154.42.3.42:3104
    const reason = err && typeof err === 'object' && 'serverMessage' in err ? err.serverMessage : undefined
    console.error(
      'Cannot process provider %s (%s) advertisement %s: %s',
      providerId,
      providerInfo.providerAddress,
      state.tail,
      reason ?? err
    )
    state.status = `Cannot process advertisement ${state.tail}: ${reason ?? 'internal error'}`
    return {
      newState: state,
      failed: true
    }
  }
}

/** @typedef {{
    pieceCid: string | undefined;
    payloadCid: string;
}} AdvertisedPayload */

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
