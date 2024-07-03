import { CID } from 'multiformats/cid'
import * as multihash from 'multiformats/hashes/digest'

/*
HUMAN READABLE CID
base32    - cidv1   - raw        - (sha2-256 : 256 : FAE8D07F50DBBCD3FDD65610ADCD6C3DF2171B31AE97041B1E222506E78DFD94)
MULTIBASE - VERSION - MULTICODEC - MULTIHASH (NAME : SIZE : DIGEST IN HEX)
*/
const MY_CID = 'bafkreih25dih6ug3xtj73vswccw423b56ilrwmnos4cbwhrceudopdp5sq'
console.log('CID string', MY_CID)

// Found via https://cid.contact/cid/bafkreih25dih6ug3xtj73vswccw423b56ilrwmnos4cbwhrceudopdp5sq
const MULTIHASH = 'EiD66NB/UNu80/3WVhCtzWw98hcbMa6XBBseIiUG5439lA=='
console.log('IPNI Multihash (base64)', MULTIHASH)
console.log('IPNI multihash (hex)', Buffer.from(MULTIHASH, 'base64').toString('hex'))

const cid = CID.parse(MY_CID)
console.log('CID multihash (hex) ', Buffer.from(cid.multihash.bytes).toString('hex'))
console.log('CID codec', '0x' + cid.code.toString(16))

const cid2 = CID.create(cid.version, 0x70 /* dag-pb */, cid.multihash)
console.log('dag-pb CID', cid2)

console.log('CID FROM MULTIHASH', CID.create(1, 0x55 /* raw */, multihash.decode(Buffer.from(MULTIHASH, 'base64'))))
console.log('ORIGINAL CID      ', cid)
