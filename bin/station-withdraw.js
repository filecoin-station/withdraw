import ethers from 'ethers'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import http from 'node:http'
import Sentry from '@sentry/node'
import { once } from 'node:events'
import { createHandler } from '../index.js'

const {
  IE_CONTRACT_ADDRESS = '0x226f69aa515e57593b537cbf5e627c533f005a1f',
  RPC_URL = 'https://api.calibration.node.glif.io/rpc/v0',
  PORT = 8080,
  SENTRY_ENVIRONMENT = 'development',
  WALLET_SEED
} = process.env

const pkg = JSON.parse(
  await fs.readFile(
    fileURLToPath(new URL('../package.json', import.meta.url)),
    'utf8'
  )
)

Sentry.init({
  dsn: 'https://28d804594d9d85f8408d04641b3daf6e@o1408530.ingest.sentry.io/4506162722766848',
  release: pkg.version,
  environment: SENTRY_ENVIRONMENT,
  tracesSampleRate: 0.1
})

const abi = JSON.parse(
  await fs.readFile(
    fileURLToPath(new URL('../abi.json', import.meta.url)),
    'utf8'
  )
)

const provider = new ethers.providers.JsonRpcProvider(RPC_URL)
const signer = ethers.Wallet.fromMnemonic(WALLET_SEED).connect(provider)
const contract = new ethers.Contract(
  IE_CONTRACT_ADDRESS,
  abi,
  provider
).connect(signer)

const server = http.createServer(createHandler({
  signer,
  contract
}))
server.listen(PORT)
await once(server, 'listening')
console.log(`http://127.0.0.1:${PORT}`)
