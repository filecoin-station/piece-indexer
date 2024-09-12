import createDebug from 'debug'
import assert from 'node:assert'
import { describe, it } from 'node:test'
import { getProvidersWithMetadata } from '../lib/ipni-watcher.js'
import { FRISBII_ADDRESS, FRISBII_ID } from './helpers/test-data.js'

const debug = createDebug('test')

describe('getProvidersWithMetadata', () => {
  it('returns response including known providers', async () => {
    const providers = await getProvidersWithMetadata()
    debug(JSON.stringify(providers, null, 2))

    const frisbiiOnFly = providers.get(FRISBII_ID)

    assert(frisbiiOnFly)
    assert.strictEqual(frisbiiOnFly.providerAddress, FRISBII_ADDRESS)
    assert.match(frisbiiOnFly.lastAdvertisementCID, /^bagu/)
  })
})
