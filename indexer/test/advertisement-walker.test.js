import createDebug from 'debug'
import { Redis } from 'ioredis'
import assert from 'node:assert'
import { after, before, beforeEach, describe, it } from 'node:test'
import { RedisRepository } from '../lib/redis-repository.js'
import { fetchAdvertisedPayload, processNextAdvertisement } from '../lib/advertisement-walker.js'
import { FRISBII_ADDRESS, FRISBII_AD_CID } from './helpers/test-data.js'

/** @import { ProviderInfo, WalkerState } from '../lib/typings.js' */

const debug = createDebug('test')

// TODO(bajtos) We may need to replace this with a mock index provider
const providerId = '12D3KooWDYiKtcxTrjNFtR6UqKRkJpESYHmmFznQAAkDX2ZHQ49t'
const providerAddress = 'http://222.214.219.200:3104'
const knownAdvertisementCID = 'baguqeeradb34kxwvi5fs3gj6wrxfkcqntzklq4qdallcejqfhyryftnpd25a'
const knownPrevAdvertisementCID = 'baguqeerawqvze5suesscwzsmpgemthwv6hx2yi2rg35zt7jdlmxapjf5qfdq'

describe('processNextAdvertisement', () => {
  it('handles a new index provider not seen before', async () => {
    /** @type {ProviderInfo} */
    const providerInfo = {
      providerAddress,
      lastAdvertisementCID: knownAdvertisementCID
    }
    const walkerState = undefined
    const { indexEntry, newState } = await processNextAdvertisement(providerId, providerInfo, walkerState)
    assert.deepStrictEqual(newState, /** @type {WalkerState} */({
      head: providerInfo.lastAdvertisementCID,
      lastHead: providerInfo.lastAdvertisementCID,
      tail: knownPrevAdvertisementCID,
      status: `Walking the advertisements from ${knownAdvertisementCID}, next step: ${knownPrevAdvertisementCID}`
    }))

    assert.deepStrictEqual(indexEntry, {
      payloadCid: 'bafk2bzaceaybhh2uenrbiuv4x6xywbv6oxizamydggd5r2xgnnvr53uwnjqea',
      pieceCid: 'baga6ea4seaqjk25ts2kekzqa5jplj6uyzk7qpiigg4koiqjz26dtmzooiocwuoa'
    })
  })

  it('does nothing when the last advertisement has been already processed', async () => {
    /** @type {ProviderInfo} */
    const providerInfo = {
      providerAddress,
      lastAdvertisementCID: knownAdvertisementCID
    }

    let result = await processNextAdvertisement(providerId, providerInfo, undefined)
    assert.strictEqual(result.newState?.lastHead, providerInfo.lastAdvertisementCID)

    result = await processNextAdvertisement(providerId, providerInfo, result.newState)
    assert(result.newState === undefined)
  })
})

/** @typedef {Awaited<ReturnType<fetchAdvertisedPayload>>} AdvertisedPayload */

describe('fetchAdvertisedPayload', () => {
  it('returns previousAdvertisementCid, pieceCid and payloadCid for Graphsync retrievals', async () => {
    const result = await fetchAdvertisedPayload(providerAddress, knownAdvertisementCID)
    assert.deepStrictEqual(result, /** @type {AdvertisedPayload} */({
      payloadCid: 'bafk2bzaceaybhh2uenrbiuv4x6xywbv6oxizamydggd5r2xgnnvr53uwnjqea',
      pieceCid: 'baga6ea4seaqjk25ts2kekzqa5jplj6uyzk7qpiigg4koiqjz26dtmzooiocwuoa',
      previousAdvertisementCid: 'baguqeerawqvze5suesscwzsmpgemthwv6hx2yi2rg35zt7jdlmxapjf5qfdq'
    }))
  })

  it('returns undefined pieceCid for HTTP retrievals', async () => {
    const result = await fetchAdvertisedPayload(FRISBII_ADDRESS, FRISBII_AD_CID)
    assert.deepStrictEqual(result, /** @type {AdvertisedPayload} */({
      payloadCid: 'bafkreih5zasorm4tlfga4ztwvm2dlnw6jxwwuvgnokyt3mjamfn3svvpyy',
      pieceCid: undefined,
      // Our Frisbii instance announced only one advertisement
      // That's unrelated to HTTP vs Graphsync retrievals
      previousAdvertisementCid: undefined
    }))
  })
})

it.only('exploratory testing', async () => {
  const result = await fetchAdvertisedPayload(
    'http://filswan.soundchina.net:3105',
    'baguqeeras2wvxglslzbl7fbyh6q4wbwi6nompdghd4vpnbdo3yiqq4zxhfiq'
  )
  console.log(result)
})
