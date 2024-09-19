import { RedisRepository } from '@filecoin-station/spark-piece-indexer-repository'
import createDebug from 'debug'
import { Redis } from 'ioredis'
import assert from 'node:assert'
import { once } from 'node:events'
import http from 'node:http'
import { after, before, beforeEach, describe, it } from 'node:test'
import { createHandler } from '../lib/handler.js'
import { assertResponseStatus, getPort } from './test-helpers.js'

const debug = createDebug('test')

describe('HTTP request handler', () => {
  /** @type {Redis} */
  let redis
  /** @type {RedisRepository} */
  let repository

  /** @type {http.Server} */
  let server
  /** @type {string} */
  let baseUrl

  before(async () => {
    redis = new Redis({ db: 1 })
    repository = new RedisRepository(redis)

    const handler = createHandler({
      repository,
      domain: '127.0.0.1',
      logger: {
        info: debug,
        error: console.error,
        request: debug
      }
    })

    server = http.createServer(handler)
    server.listen()
    await once(server, 'listening')
    baseUrl = `http://127.0.0.1:${getPort(server)}`
  })

  beforeEach(async () => {
    await redis.flushall()
  })

  after(async () => {
    server.closeAllConnections()
    server.close()
    await redis?.disconnect()
  })

  it('returns 404 for GET /', async () => {
    const res = await fetch(new URL('/', baseUrl))
    await assertResponseStatus(res, 404)
  })

  describe('GET /samples/{providerId}/{pieceCid}', () => {
    it('returns the first payload block from the index', async () => {
      await repository.addPiecePayloadBlocks('provider-id', 'piece-cid', 'payload-cid-1', 'payload-cid-2')
      await repository.addPiecePayloadBlocks('provider-id2', 'piece-cid', 'payload-cid-1', 'payload-cid-2')
      await repository.addPiecePayloadBlocks('provider-id', 'piece-cid2', 'payload-cid-1', 'payload-cid-2')

      const res = await fetch(new URL('/sample/provider-id/piece-cid', baseUrl))
      await assertResponseStatus(res, 200)
      const body = await res.json()

      assert.deepStrictEqual(body, {
        samples: ['payload-cid-1']
      })

      // TODO: assert cache settings
    })

    // TODO: handle unknown provider, unknown piece
  })

  describe('GET /ingestion-status/{providerId}', () => {
    it('returns info about a provider seen by the indexer', async () => {
      await repository.setWalkerState('provider-id', { status: 'walking', lastHead: 'last-head' })
      await repository.addPiecePayloadBlocks('provider-id', 'piece-cid', 'bafy1')

      const res = await fetch(new URL('/ingestion-status/provider-id', baseUrl))
      await assertResponseStatus(res, 200)
      const body = await res.json()

      assert.deepStrictEqual(body, {
        providerId: 'provider-id',
        // TODO
        // providerAddress: "state.providerAddress",
        ingestionStatus: 'walking',
        lastHeadWalkedFrom: 'last-head',
        piecesIndexed: 1
      })

      // TODO: assert cache settings
    })

    // TODO: handle the case when lastHead is not set
    // TODO: handle unknown provider
  })
})
