import createDebug from 'debug'
import { Redis } from 'ioredis'
import assert from 'node:assert'
import { after, before, beforeEach, describe, it } from 'node:test'
import { getProvidersWithMetadata, updateProviderStateFromIPNI } from '../lib/observer.js'
import { RedisRepository } from '../lib/redis-repository.js'

const debug = createDebug('test')

/** @import { ProvidersWithState, ProviderIndexingState } from '../lib/typings.js' */

// See https://github.com/filecoin-station/frisbii-on-fly
const FRISBII_ID = '12D3KooWC8gXxg9LoJ9h3hy3jzBkEAxamyHEQJKtRmAuBuvoMzpr'
const FRISBII_ADDRESS = 'https://frisbii.fly.dev'

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

describe('updateProviderStateFromIPNI', () => {
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

  it('creates an initial state for a new provider', async () => {
    const repository = new RedisRepository(redis)
    await updateProviderStateFromIPNI(repository, [
      {
        providerId: 'peer1',
        providerAddress: 'https://example.com',
        lastAdvertisementCID: 'bagu1'
      }
    ])

    const state = await repository.getProvidersWithState()
    assertStateEqual(state, {
      peer1: {
        providerAddress: 'https://example.com',
        lastHead: 'tbd',
        nextHead: 'tbd',
        head: 'tbd',
        tail: 'tbd',
        status: 'tbd'
      }
    })
  })
})

/**
 *
 * @param {ProvidersWithState} actualMap
 * @param {Record<string, ProviderIndexingState>} expectedObject
 */
function assertStateEqual (actualMap, expectedObject) {
  assert.deepStrictEqual(
    Object.fromEntries(actualMap.entries()),
    expectedObject
  )
}
