import { Redis } from 'ioredis'
import { RedisRepository } from '../lib/redis-repository.js'
import { syncProvidersFromIPNI } from '../lib/ipni-watcher.js'
import timers from 'node:timers/promises'
import { processNextAdvertisement, walkOneStep } from '../lib/advertisement-walker.js'

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
    console.log('Walking one step')
    const ipniInfoMap = await repository.getIpniInfoForAllProviders()

    // FIXME: run this concurrently
    await Promise.allSettled([...ipniInfoMap.entries()].map(
      async ([providerId, info]) => {
        if (['12D3KooWKF2Qb8s4gFXsVB1jb98HpcwhWf12b1TA51VqrtY3PmMC'].includes(providerId)) {
          console.log('Skipping unreachable provider %s', providerId)
          return
        }

        try {
          await walkOneStep(repository, providerId, info)
          console.log('Ingested another advertisement from %s (%s)', providerId, info.providerAddress)
        } catch (err) {
          console.error('Error indexing provider %s (%s):', providerId, info.providerAddress, err)
        }
      }))

    const delay = 100 - (Date.now() - started)
    if (delay > 0) {
      console.log('Waiting for %sms before the next walk', delay)
      await timers.setTimeout(delay)
    }
  }
}
