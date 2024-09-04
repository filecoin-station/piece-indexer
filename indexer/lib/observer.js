import createDebug from 'debug'
import { multiaddrToUri } from '@multiformats/multiaddr-to-uri'
import { assertOkResponse } from './http-assertions.js'

const debug = createDebug('spark-piece-indexer:observer')

/** @import { Repository, IpniProviderInfo } from './typings.js' */

/**
 * @returns {Promise<IpniProviderInfo[]>}
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

  return providers.map(p => {
    const providerId = p.Publisher.ID
    const lastAdvertisementCID = p.LastAdvertisement['/']

    // FIXME: handle empty Addrs[]
    let providerAddress = p.Publisher.Addrs[0]
    try {
      providerAddress = multiaddrToUri(providerAddress)
    } catch (err) {
      debug('Cannot convert address to URI (provider: %s): %s', providerId, err)
    }

    return { providerId, providerAddress, lastAdvertisementCID }
  })
}

/**
 * @param {Repository} repository
 * @param {IpniProviderInfo[]} ipniProviders
 */
export async function updateProviderStateFromIPNI (repository, ipniProviders) {
  const providersWithState = await repository.getProvidersWithState()

  for (const { providerId, providerAddress, lastAdvertisementCID } of ipniProviders) {
    const status = providersWithState.get(providerId)
    if (!status) {
      const status = {
        providerAddress,
        lastHead: lastAdvertisementCID,
        nextHead: lastAdvertisementCID,
        head: lastAdvertisementCID,
        tail: lastAdvertisementCID,
        status: 'advertisement walk not started yet'
      }
      providersWithState.set(providerId, status)
      debug('Initializing status for provider %s: %o', providerId, status)
      continue
    }

    let updated = false
    if (providerAddress !== status.providerAddress) {
      debug('Updating provider address from %s to %s', status.providerAddress, providerAddress)
      status.providerAddress = providerAddress
      updated = true
    }

    // TODO: update the status

    if (!updated) {
      debug('No changes for provider %s', providerId)
      providersWithState.delete(providerId)
    }
  }

  await repository.updateProvidersWithState(providersWithState)
}
