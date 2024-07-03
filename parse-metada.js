import { varint } from 'multiformats'
import * as cbor from '@ipld/dag-cbor'

// console.log(parseMetadata(
//   'kBKjaFBpZWNlQ0lE2CpYKAABgeIDkiAgieDL6/pbxDBAJtdZ19ZsvGh1NE77nBxbFwesoG1S/jJsVmVyaWZpZWREZWFs9W1GYXN0UmV0cmlldmFs9Q'
// ))

export function parseMetadata (meta) {
  const bytes = Buffer.from(meta, 'base64')
  const [protocolCode, nextOffset] = varint.decode(bytes)

  const protocol = {
    0x900: 'bitswap',
    0x910: 'graphsync',
    0x0920: 'http'
  }[protocolCode] ?? '0x' + protocolCode.toString(16)

  if (protocol === 'graphsync') {
    // console.log(bytes.subarray(nextOffset).toString('hex'))

    /** @type {{
    PieceCID: import('multiformats/cid').CID,
    VerifiedDeal: boolean,
    FastRetrieval: boolean
    }} */
    const deal = cbor.decode(bytes.subarray(nextOffset))
    return { protocol, deal }
  } else {
    return { protocol }
  }
}
