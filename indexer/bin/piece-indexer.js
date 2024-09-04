import { Redis } from 'ioredis'
import { RedisRepository } from '../lib/redis-repository.js'
import { syncProvidersFromIPNI } from '../lib/ipni-watcher.js'
import timers from 'node:timers/promises'
import { processNextAdvertisement } from '../lib/advertisement-walker.js'

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

await Promise.all([
  runIpniSync(),
  runWalkers()
])

async function runIpniSync () {
  const repository = new RedisRepository(redis)
  while (true) {
    const started = Date.now()
    try {
      console.log('Syncing from IPNI')
      const providers = await syncProvidersFromIPNI(repository)
      console.log(
        'Found %s providers, %s support(s) HTTP(s)',
        providers.size,
        Array.from(providers.values()).filter(p => p.providerAddress.match(/^https?:\/\//)).length
      )
    } catch (err) {
      console.error('Cannot sync from IPNI.', err)
    // TODO: log to Sentry
    }
    const delay = 60_000 - (Date.now() - started)
    if (delay > 0) {
      console.log('Waiting for %sms before the next sync from IPNI', delay)
      await timers.setTimeout(delay)
    }
  }
}

async function runWalkers () {
  const repository = new RedisRepository(redis)
  while (true) {
    const started = Date.now()

    // EVERYTHING BELOW IS TEMPORARY AND WILL BE SIGNIFICANTLY REWORKED
    try {
      console.log('Walking one step')
      const ipniInfoMap = await repository.getIpniInfoForAllProviders()
      const walkerStateMap = await repository.getWalkerStateForAllProviders()

      // FIXME: run this concurrently
      for (const [providerId, info] of ipniInfoMap.entries()) {
        const state = walkerStateMap.get(providerId)

        if (!info.providerAddress?.match(/^https?:\/\//)) {
          console.log('Skipping provider %s address %s', providerId, info.providerAddress)
          continue
        }
        if (['12D3KooWKF2Qb8s4gFXsVB1jb98HpcwhWf12b1TA51VqrtY3PmMC'].includes(providerId)) {
          console.log('Skipping unreachable provider %s', providerId)
          continue
        }

        try {
          const result = await processNextAdvertisement(providerId, info, state)
          console.log('%s %o\n -> %o', providerId, result.newState, result.indexEntry)
        } catch (err) {
          console.error('Cannot process the next advertisement.', err)
          // TODO: log to Sentry
        }
      }
    } catch (err) {
      console.error('Walking step failed.', err)
    }

    const delay = 100 - (Date.now() - started)
    if (delay > 0) {
      console.log('Waiting for %sms before the next walk', delay)
      await timers.setTimeout(delay)
    }
  }
}
