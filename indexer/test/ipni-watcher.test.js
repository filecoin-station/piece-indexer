import createDebug from 'debug'
import { Redis } from 'ioredis'
import assert from 'node:assert'
import { after, before, beforeEach, describe, it } from 'node:test'
import { getProvidersWithMetadata, syncProvidersFromIPNI } from '../lib/ipni-watcher.js'
import { RedisRepository } from '../lib/redis-repository.js'
import { FRISBII_ADDRESS, FRISBII_ID } from './helpers/test-data.js'

/** @import { ProviderInfo, WalkerState } from '../lib/typings.js' */

const debug = createDebug('test')

describe('getProvidersWithMetadata', () => {
  it('returns response including known providers', async () => {
    const providers = await getProvidersWithMetadata()
    debug(JSON.stringify(providers, null, 2))

    const frisbiiOnFly = providers.find(
      p => p.providerId === FRISBII_ID && p.providerAddress === FRISBII_ADDRESS
    )

    assert(frisbiiOnFly)
    assert.match(frisbiiOnFly.lastAdvertisementCID, /^bagu/)
  })
})

describe('syncProvidersFromIPNI', () => {
  /** @type {Redis} */
  let redis

  before(async () => {
    redis = new Redis({ db: 1 })
  })

  beforeEach(async () => {
    await redis.flushall()
  })

  after(async () => {
    await redis?.disconnect()
  })

  it('downloads metadata from IPNI and stores it in our DB', async () => {
    const repository = new RedisRepository(redis)
    await syncProvidersFromIPNI(repository)

    const stateMap = await repository.getIpniInfoForAllProviders()

    const frisbiiOnFly = stateMap.get(FRISBII_ID)
    assert(frisbiiOnFly, 'Frisbii index provider was not found in our state')
    assert.equal(frisbiiOnFly.providerAddress, FRISBII_ADDRESS)
    assert.match(frisbiiOnFly.lastAdvertisementCID, /^bagu/)
  })
})
