/** @import { ProviderToIpniStateMap } from "./typings.js" */

export class RedisRepository {
  #redis

  /**
   * @param {import('ioredis').Redis} redis
   */
  constructor (redis) {
    this.#redis = redis
  }

  /**
   * @returns {Promise<ProviderToIpniStateMap>}
   */
  async getIpniStateForAllProviders () {
    /** @type {string[]} */
    const redisKeys = []
    const keyStream = this.#redis.scanStream({
      match: 'ipni-state:*',
      count: 1000
    })
    for await (const chunk of keyStream) {
      redisKeys.push(...chunk)
    }

    const stateList = await this.#redis.mget(redisKeys)

    /** @type {ProviderToIpniStateMap} */
    const result = new Map()
    for (let ix = 0; ix < redisKeys.length; ix++) {
      const key = redisKeys[ix]
      const stateStr = stateList[ix]
      if (!stateStr) {
        console.error('Unexpected Redis state: the existing key %s does not have any value', key)
        continue
      }
      const providerId = key.split(':')[1]
      result.set(providerId, JSON.parse(stateStr))
    }

    return result
  }

  /**
   * @param {ProviderToIpniStateMap} stateMap
   */
  async setIpniStateForAllProviders (stateMap) {
    const serialized = new Map(
      Array.from(stateMap.entries()).map(([key, value]) => ([`ipni-state:${key}`, JSON.stringify(value)]))
    )
    await this.#redis.mset(serialized)
  }
}
