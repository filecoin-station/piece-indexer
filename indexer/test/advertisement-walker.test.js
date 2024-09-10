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
const providerId = '12D3KooWHKeaNCnYByQUMS2n5PAZ1KZ9xKXqsb4bhpxVJ6bBJg5V'
const providerAddress = 'http://f010479.twinquasar.io:3104'
const knownAdvertisement = {
  adCid: 'baguqeerarbmakqcnzzuhki25xs357xyin4ieqxvumrp5cy7s44v7tzwwmg3q',
  previousAdCid: 'baguqeerau2rz67nvzcaotgowm2olalanx3eynr2asbjwdkaq3y5umqvdi2ea',
  payloadCid: 'bafkreigrnnl64xuevvkhknbhrcqzbdvvmqnchp7ae2a4ulninsjoc5svoq',
  pieceCid: 'baga6ea4seaqlwzed5tgjtyhrugjziutzthx2wrympvsuqhfngwdwqzvosuchmja'
}

describe('processNextAdvertisement', () => {
  it('handles a new index provider not seen before', async () => {
    /** @type {ProviderInfo} */
    const providerInfo = {
      providerAddress,
      lastAdvertisementCID: knownAdvertisement.adCid
    }
    const walkerState = undefined
    const { indexEntry, newState } = await processNextAdvertisement(providerId, providerInfo, walkerState)
    assert.deepStrictEqual(newState, /** @type {WalkerState} */({
      head: providerInfo.lastAdvertisementCID,
      lastHead: providerInfo.lastAdvertisementCID,
      tail: knownAdvertisement.previousAdCid,
      status: `Walking the advertisements from ${knownAdvertisement.adCid}, next step: ${knownAdvertisement.previousAdCid}`
    }))

    assert.deepStrictEqual(indexEntry, {
      payloadCid: knownAdvertisement.payloadCid,
      pieceCid: knownAdvertisement.pieceCid
    })
  })

  it('does nothing when the last advertisement has been already processed', async () => {
    /** @type {ProviderInfo} */
    const providerInfo = {
      providerAddress,
      lastAdvertisementCID: knownAdvertisement.adCid
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
    const result = await fetchAdvertisedPayload(providerAddress, knownAdvertisement.adCid)
    assert.deepStrictEqual(result, /** @type {AdvertisedPayload} */({
      payloadCid: knownAdvertisement.payloadCid,
      pieceCid: knownAdvertisement.pieceCid,
      previousAdvertisementCid: knownAdvertisement.previousAdCid
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
