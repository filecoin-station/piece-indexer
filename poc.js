import assert from 'node:assert'
import { multiaddrToUri } from '@multiformats/multiaddr-to-uri'

// IPNI specs: https://github.com/ipni/specs

// TODO: list all index providers
// https://cid.contact/providers

// https://github.com/filecoin-station/frisbii-on-fly
// This index provider does not set Graphsync metadata
// const providerPeerId = '12D3KooWHge6fZmx6fMsizP9YYpbJPNZjiWz7Ye1WLCvmj6VTnjq'
//
// Doesn't work - cannot fetch Entries CID
// Error: Cannot GET http://183.60.90.198:3104/ipni/v1/ad/bafkreehdwdcefgh4dqkjv67uzcmw7oje: 500
// unable to load data for cid
// const providerPeerId = '12D3KooWFpNqyFpqujkMXeKrbtasvKkbUSL8ipN5vXtNyfVo7n4f'

// This one works:
const providerPeerId = '12D3KooWDYiKtcxTrjNFtR6UqKRkJpESYHmmFznQAAkDX2ZHQ49t'

// Get the latest announcement
const res = await fetch(`https://cid.contact/providers/${encodeURIComponent(providerPeerId)}`)
assert(res.ok)

/** @type {{
AddrInfo:{ID:string,Addrs:string[]},
LastAdvertisement:{"/":string},
LastAdvertisementTime: string,
Publisher:{ID:string,Addrs:string[]},
FrozenAt:null
 * }}
 */
const providerMetadata = await res.json()

console.log('Provider metadata:', providerMetadata)
const providerBaseUrl = multiaddrToUri(providerMetadata.Publisher.Addrs[0], { assumeHttp: false })
if (!providerBaseUrl.startsWith('http')) {
  throw new Error(`Unsupported URI scheme: ${providerBaseUrl}`)
}

// TODO: handle libp2p index providers, e.g.
// Publisher: {
//   ID: '12D3KooWCmLYzfYU2fWVnWJDuEkjt7d8pq7PHYAkXoUFVCPogTA9',
//   Addrs: [ '/ip4/103.9.208.54/tcp/48080' ]
// }

/** @type {{
  Addresses: string[],
  ContextID: { '/': { bytes: string } },,
  Entries: {
    '/': string
  },
  IsRm: false,
  Metadata: { '/': { bytes: string } },
  Provider: string
  Signature: {
    '/': {
      bytes: string
    }
  }
 }} */
const head = await fetchCid(providerBaseUrl, providerMetadata.LastAdvertisement['/'])
console.log('HEAD', head)

const entries = await fetchCid(providerBaseUrl, head.Entries['/'])
// console.log('ENTRIES', entries.Entries)

const entryHash = entries.Entries[0]['/'].bytes
console.log('FIRST ENTRY:', entryHash)
// const multihash = Buffer.from(entryHash, 'base64')
// const payloadCid = CID.parse('m' + entryHash, base64.decoder)
// console.log('PAYLOAD CID', payloadCid)

async function fetchCid (providerBaseUrl, adCid) {
  const url = new URL(adCid, new URL('/ipni/v1/ad/_', providerBaseUrl))
  console.log('fetching %s', url)
  const res = await fetch(url)
  console.log('status', res.status)
  if (!res.ok) {
    throw new Error(`Cannot GET ${url}: ${res.status}\n${await res.text()}`)
  }
  return await res.json()
}
