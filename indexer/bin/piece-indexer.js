import { Redis } from 'ioredis'
import { RedisRepository } from '../lib/redis-repository.js'
import { syncProvidersFromIPNI } from '../lib/ipni-watcher.js'
import timers from 'node:timers/promises'

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

while (true) {
  const started = Date.now()
  try {
    console.log('Syncing from IPNI')
    const providers = await syncProvidersFromIPNI(new RedisRepository(redis))
    console.log(
      'Found %s providers, %s support(s) HTTP(s)',
      providers.length,
      providers.filter(p => p.providerAddress.match(/^https?:\/\//)).length
    )
  } catch (err) {
    console.error('Cannot sync from IPNI.', err)
    // TODO: log to Sentry
  }
  const delay = 6_000 - (Date.now() - started)
  if (delay > 0) {
    console.log('Waiting for %sms before the next sync from IPNI', delay)
    await timers.setTimeout(delay)
  }
}
