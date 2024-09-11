/** @import { ProviderInfo, ProviderToInfoMap, ProviderToWalkerStateMap, WalkerState } from './typings.js' */

export class RedisRepository {
  #redis

  /**
   * @param {import('ioredis').Redis} redis
   */
  constructor (redis) {
    this.#redis = redis
  }

  /**
   * @returns {Promise<ProviderToInfoMap>}
   */
  async getIpniInfoForAllProviders () {
    const stringEntries = await this.#scanEntries('ipni-state')
    /** @type {[string, ProviderInfo][]} */
    const entries = stringEntries.map(
      ([providerId, stateJson]) => (([providerId, JSON.parse(stateJson)]))
    )
    return new Map(entries)
  }

  /**
   * @param {ProviderToInfoMap} keyValueMap
   */
  async setIpniInfoForAllProviders (keyValueMap) {
    const serialized = new Map(
      Array.from(keyValueMap.entries()).map(([key, value]) => ([`ipni-state:${key}`, JSON.stringify(value)]))
    )
    await this.#redis.mset(serialized)
  }

  /**
   * @returns {Promise<ProviderToWalkerStateMap>}
   */
  async getWalkerStateForAllProviders () {
    const stringEntries = await this.#scanEntries('walker-state')
    /** @type {[string, WalkerState][]} */
    const entries = stringEntries.map(
      ([providerId, stateJson]) => (([providerId, JSON.parse(stateJson)]))
    )
    return new Map(entries)
  }

  /**
   * @param {string} providerId
   * @returns {Promise<WalkerState>}
   */
  async getWalkerState (providerId) {
    const json = await this.#redis.get(`walker-state:${providerId}`)
    return json ? JSON.parse(json) : undefined
  }

  /**
   * @param {string} providerId
   * @param {WalkerState} state
   */
  async setWalkerState (providerId, state) {
    const data = JSON.stringify(state)
    await this.#redis.set(`walker-state:${providerId}`, data)
  }

  /**
   * @param {string} providerId
   * @param {string} pieceCid
   * @param {string[]} payloadCids
   */
  async addPiecePayloadBlocks (providerId, pieceCid, ...payloadCids) {
    await this.#redis.sadd(`piece-payload:${providerId}:${pieceCid}`, ...payloadCids)
  }

  /**
   * @param {string} providerId
   * @param {string} pieceCid
   * @returns {Promise<string[]>}
   */
  async getPiecePayloadBlocks (providerId, pieceCid) {
    const payloadCids = await this.#redis.smembers(`piece-payload:${providerId}:${pieceCid}`)
    return payloadCids
  }

  /**
   * @param {"ipni-state" | "walker-state"} keyPrefix "ipni-state" or "walker-state"
   */
  async #scanEntries (keyPrefix) {
    /** @type {string[]} */
    const redisKeys = []
    const keyStream = this.#redis.scanStream({
      match: `${keyPrefix}:*`,
      count: 1000
    })
    for await (const chunk of keyStream) {
      redisKeys.push(...chunk)
    }

    if (!redisKeys.length) return []

    const stringValues = await this.#redis.mget(redisKeys)

    /** @type {[string, string][]} */
    const result = []
    for (let ix = 0; ix < redisKeys.length; ix++) {
      const prefixedKey = redisKeys[ix]
      const value = stringValues[ix]
      if (!value) {
        console.error('Unexpected Redis state: the existing key %s does not have any value', prefixedKey)
        continue
      }
      const key = prefixedKey.split(':')[1]
      result.push([key, value])
    }

    return result
  }
}
