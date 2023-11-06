import http from 'node:http'
import { createHandler } from './index.js'
import ethers from 'ethers'
import { once } from 'node:events'
import assert from 'node:assert'
import timers from 'node:timers/promises'

describe('Withdraw', () => {
  const signer = ethers.Wallet.createRandom()
  let server

  beforeEach(async () => {
    server = http.createServer()
    server.listen()
    await once(server, 'listening')
  })

  afterEach(() => {
    server.close()
  })

  it('withdraws', async () => {
    const balanceOfCalls = []
    const withdrawOnBehalfCalls = []
    const contract = {
      balanceOf: async account => {
        balanceOfCalls.push(account)
        return ethers.utils.parseUnits('1')
      },
      withdrawOnBehalf: async (account, target, value, v, r, s) => {
        withdrawOnBehalfCalls.push({
          account,
          target,
          value,
          v,
          r,
          s
        })
        return {
          hash: '0x...',
          wait: async () => {}
        }
      }
    }
    server.once('request', createHandler({ signer, contract }))

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

    assert.deepStrictEqual(balanceOfCalls, [account])
    assert.deepStrictEqual(withdrawOnBehalfCalls, [{
      account,
      target,
      value,
      v,
      r,
      s
    }])
  })

  it('validates signatures', async () => {
    const balanceOfCalls = []
    const withdrawOnBehalfCalls = []
    const contract = {
      balanceOf: async () => balanceOfCalls.push({}),
      withdrawOnBehalf: async () => withdrawOnBehalfCalls.push({})
    }
    server.once('request', createHandler({ signer, contract }))

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
        nonce: 1, // invalid nonce
        target,
        value: value.toString(),
        v,
        r,
        s
      })
    })
    assert.strictEqual(res.status, 403)

    const message = await res.text()
    assert.strictEqual(message, 'Invalid signature')

    assert.deepStrictEqual(balanceOfCalls, [])
    assert.deepStrictEqual(withdrawOnBehalfCalls, [])
  })

  it('prevents parallel withdrawals', async () => {
    const balanceOfCalls = []
    const withdrawOnBehalfCalls = []
    const contract = {
      balanceOf: async () => {
        await timers.setTimeout()
        balanceOfCalls.push({})
        return ethers.utils.parseUnits('1')
      },
      withdrawOnBehalf: async () => {
        withdrawOnBehalfCalls.push({})
        return {
          hash: '0x...',
          wait: async () => {}
        }
      }
    }
    const handler = createHandler({ signer, contract })
    server.once('request', (req, res) => {
      handler(req, res)
      server.once('request', handler)
    })

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
    const body = JSON.stringify({
      account,
      nonce,
      target,
      value: value.toString(),
      v,
      r,
      s
    })

    const responses = await Promise.all([
      fetch(`http://127.0.0.1:${server.address().port}`, {
        method: 'POST',
        body
      }),
      fetch(`http://127.0.0.1:${server.address().port}`, {
        method: 'POST',
        body
      })
    ])
    assert(responses.find(res => res.status === 200))
    assert(responses.find(res => res.status === 409))

    assert.strictEqual(balanceOfCalls.length, 1)
    assert.strictEqual(withdrawOnBehalfCalls.length, 1)
  })
})
