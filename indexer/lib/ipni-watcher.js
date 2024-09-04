import createDebug from 'debug'
import { assertOkResponse } from './http-assertions.js'
import { multiaddrToHttpUrl } from './vendored/multiaddr.js'

const debug = createDebug('spark-piece-indexer:observer')

/** @import { ProviderToInfoMap, ProviderInfo } from './typings.js' */
/** @import { RedisRepository as Repository } from './redis-repository.js' */

/**
 * @returns {Promise<ProviderToInfoMap>}
 */
export async function getProvidersWithMetadata () {
  const res = await fetch('https://cid.contact/providers')
  assertOkResponse(res)

  const providers = /** @type {{
    AddrInfo: {
      ID: string;
      Addrs: string[];
    },
    LastAdvertisement: {
      "/": string;
    },
    LastAdvertisementTime: string;
    Publisher: {
      ID: string;
      Addrs: string[];
    },
    // Ignored: ExtendedProviders, FrozenAt
   * }[]}
   */(await res.json())

  /** @type {[string, ProviderInfo][]} */
  const entries = providers.map(p => {
    const providerId = p.Publisher.ID
    const lastAdvertisementCID = p.LastAdvertisement['/']

    // FIXME: handle empty Addrs[]
    let providerAddress = p.Publisher.Addrs[0]
    try {
      providerAddress = multiaddrToHttpUrl(providerAddress)
    } catch (err) {
      debug('Cannot convert address to HTTP(s) URL (provider: %s): %s', providerId, err)
    }

    return [providerId, { providerAddress, lastAdvertisementCID }]
  })
  return new Map(entries)
}

/**
 * @param {Repository} repository
 */
export async function syncProvidersFromIPNI (repository) {
  const providerInfos = await getProvidersWithMetadata()
  await repository.setIpniInfoForAllProviders(providerInfos)
  return providerInfos
}
