import '../lib/instrument.js'

import http from 'node:http'
import { once } from 'node:events'
import { createHandler } from '../lib/handler.js'
import { RedisRepository } from '@filecoin-station/spark-piece-indexer-repository'
import { Redis } from 'ioredis'

const {
  PORT = 3000,
  HOST = '127.0.0.1',
  DOMAIN: domain = 'localhost',
  REDIS_URL: redisUrl = 'redis://localhost:6379',
  REQUEST_LOGGING: requestLogging = 'true'
} = process.env

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

const logger = {
  error: console.error,
  info: console.info,
  request: ['1', 'true'].includes(requestLogging) ? console.info : () => {}
}

const handler = createHandler({ repository, domain, logger })
const server = http.createServer(handler)
console.log('Starting the http server on host %j port %s', HOST, PORT)
server.listen(Number(PORT), HOST)
await once(server, 'listening')
console.log(`http://${HOST}:${server.address().port}`)
