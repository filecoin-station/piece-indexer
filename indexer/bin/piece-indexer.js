import assert from 'assert'
import { Redis } from 'ioredis'
import { walkProviderChain } from '../lib/advertisement-walker.js'
import { runIpniSync } from '../lib/ipni-watcher.js'
import { RedisRepository } from '../lib/redis-repository.js'

/** @import { ProviderToInfoMap } from '../lib/typings.d.ts' */

const {
  REDIS_URL: redisUrl = 'redis://localhost:6379'
} = process.env

// TODO: setup Sentry

const redisUrlParsed = new URL(redisUrl)
const redis = new Redis({
  host: redisUrlParsed.hostname,
  port: Number(redisUrlParsed.port),
  username: redisUrlParsed.username,
  password: redisUrlParsed.password,
  lazyConnect: true, // call connect() explicitly so that we can exit on connection error
  family: 6 // required for upstash
})

await redis.connect()
const repository = new RedisRepository(redis)

/** @type {Map<string, boolean>} */
const providerWalkers = new Map()

/** @type {ProviderToInfoMap} */
const recentProvidersInfo = new Map()

/**
 * @param {string} providerId
 */
const getProviderInfo = async (providerId) => {
  const info = recentProvidersInfo.get(providerId)
  assert(!!info, `Unknown providerId ${providerId}`)
  return info
}

for await (const providerInfos of runIpniSync({ minSyncIntervalInMs: 60_000 })) {
  for (const [providerId, providerInfo] of providerInfos.entries()) {
    recentProvidersInfo.set(providerId, providerInfo)
    if (providerWalkers.get(providerId)) continue

    providerWalkers.set(providerId, true)
    walkProviderChain({
      repository,
      providerId,
      getProviderInfo,
      minStepIntervalInMs: 100
    }).finally(
      () => providerWalkers.set(providerId, false)
    )
  }
}
