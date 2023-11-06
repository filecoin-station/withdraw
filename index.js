import assert from 'http-assert'
import getRawBody from 'raw-body'
import Sentry from '@sentry/node'
import ethers from 'ethers'

const locks = new Set()
const lockOrFail = async (account, fn) => {
  assert(!locks.has(account), 409, 'Withdrawal already in progress')
  locks.add(account)
  try {
    return await fn()
  } finally {
    locks.delete(account)
  }
}

const handler = async (req, res, { signer, contract }) => {
  assert.strictEqual(req.method, 'POST', 404)

  const body = await getRawBody(req, { limit: '100kb' })
  const { account, nonce, target, value: _value, v, r, s } = JSON.parse(body)
  const value = ethers.BigNumber.from(_value)

  const digest = ethers.utils.solidityKeccak256(
    ['address', 'uint256', 'address', 'address', 'uint256'],
    [account, nonce, signer.address, target, value]
  )
  const reqSigner = ethers.utils.verifyMessage(
    digest,
    ethers.utils.joinSignature({ v, r, s })
  )
  assert.strictEqual(reqSigner, account, 403, 'Invalid signature')

  const tx = await lockOrFail(account, async () => {
    const fetchRes = await fetch(
      `https://station-wallet-screening.fly.dev/${target}`
    )
    assert.notStrictEqual(fetchRes.status, 403, 403, '`target` address sanctioned')
    assert(fetchRes.ok, 500, 'Failed to screen `target` address')

    const balance = await contract.balanceOf(account)
    assert(
      balance.gt(ethers.utils.parseUnits('0.1')),
      'Insufficient balance for gas fees',
      401
    )
    assert(balance.gte(value), 'Insufficient balance', 401)
    const tx = await contract.withdrawOnBehalf(account, target, value, v, r, s)
    await tx.wait()
    return tx
  })

  res.end(tx.hash)
}

const errorHandler = (res, err) => {
  if (err instanceof SyntaxError) {
    res.statusCode = 400
    res.end('Invalid JSON Body')
  } else if (err.code === 'INVALID_ARGUMENT' && err.reason) {
    res.statusCode = 400
    res.end(`Invalid argument: ${JSON.stringify(err.value)} (${err.reason})`)
  } else if (err.statusCode) {
    res.statusCode = err.statusCode
    res.end(err.message)
  } else {
    console.error(err)
    res.statusCode = 500
    res.end('Internal Server Error')
  }

  if (res.statusCode >= 500) {
    Sentry.captureException(err)
  }
}

export const createHandler = ({ signer, contract }) => (req, res) => {
  handler(req, res, {
    signer,
    contract
  }).catch(err => errorHandler(res, err))
}
