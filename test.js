import http from 'node:http'
import { createHandler } from './index.js'
import ethers from 'ethers'
import { once } from 'node:events'
import assert from 'node:assert'

const signer = ethers.Wallet.createRandom()
const contract = {
  balanceOf: () => Promise.resolve(ethers.utils.parseUnits('1')),
  withdrawOnBehalf: () => Promise.resolve({ hash: '0x...', wait: () => Promise.resolve() })
}

const server = http.createServer(createHandler({
  signer,
  contract
}))
server.listen()
await once(server, 'listening')

const account = signer.address
const nonce = 0
const withdraw = signer.address
const target = signer.address
const value = ethers.utils.parseUnits('1')

const digest = ethers.utils.solidityKeccak256(
  ['address', 'uint256', 'address', 'address', 'uint256'],
  [account, nonce, withdraw, target, value]
)
const signed = await signer.signMessage(digest)
const { v, r, s } = ethers.utils.splitSignature(signed)

const res = await fetch(`http://127.0.0.1:${server.address().port}`, {
  method: 'POST',
  body: JSON.stringify({
    account,
    nonce,
    target,
    value: value.toString(),
    v,
    r,
    s
  })
})
assert(res.ok)

const txHash = await res.text()
assert.strictEqual(txHash, '0x...')

server.close()
console.log('OK')
