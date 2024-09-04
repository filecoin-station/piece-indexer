/** @import { Repository, ProvidersWithState} from "./typings.js" */

/** @implements {Repository} */
export class RedisRepository {
  #redis

  /**
   * @param {import('ioredis').Redis} redis
   */
  constructor (redis) {
    this.#redis = redis
  }

  /**
   * @returns {Promise<ProvidersWithState>}
   */
  async getProvidersWithState () {
    /** @type {string[]} */
    const providerIds = []
    const keyStream = this.#redis.scanStream({
      match: 'provider-state:*',
      count: 1000
    })
    for await (const key of keyStream) {
      const [, id] = key.split(':')
      providerIds.push(id)
    }

    const rawStates = this.#redis.
    // TODO
    return new Map()
  }

  /**
   * @param {ProvidersWithState} updates
   */
  async updateProvidersWithState (updates) {
    throw new Error('Method not implemented.')
  }
}
