import { Redis } from 'ioredis'
import { RedisRepository } from '../lib/redis-repository.js'
import { runIpniSync } from '../lib/ipni-watcher.js'
import { runWalkers, walkProviderChain } from '../lib/advertisement-walker.js'

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

for await (const providerIds of runIpniSync({ repository, minSyncIntervalInMs: 60_000 })) {
  for (const id of providerIds) {
    if (providerWalkers.get(id)) continue

    providerWalkers.set(id, true)
    walkProviderChain({
      repository,
      providerId,
      // TODO: replace this with an in-memory structure
      getProviderInfo: async (id) => repository.getIpniInfo(id),
      minStepIntervalInMs: 100
    }).finally(
      () => providerWalkers.set(id, false)
    )
  }
}
