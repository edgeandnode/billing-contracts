import path from 'path'
import fs from 'fs'
import * as dotenv from 'dotenv'

import 'hardhat/types/runtime'

dotenv.config()

// Plugins

import '@nomiclabs/hardhat-ethers'
import '@nomiclabs/hardhat-etherscan'
import '@nomiclabs/hardhat-waffle'
import '@typechain/hardhat'
import 'hardhat-abi-exporter'

const SKIP_LOAD = process.env.SKIP_LOAD === 'true'

if (!SKIP_LOAD) {
  ;['deployment'].forEach((folder) => {
    const tasksPath = path.join(__dirname, 'tasks', folder)
    fs.readdirSync(tasksPath)
      .filter((pth) => pth.includes('.ts'))
      .forEach((task) => {
        require(`${tasksPath}/${task}`)
      })
  })
}

// Networks

interface NetworkConfig {
  network: string
  chainId: number
  url?: string
  gas?: number | 'auto'
  gasPrice?: number | 'auto'
}

const networkConfigs: NetworkConfig[] = [
  { network: 'mainnet', chainId: 1 },
  { network: 'goerli', chainId: 5 },
  { network: 'polygon', chainId: 137, url: process.env.POLYGON_RPC_URL },
  { network: 'mumbai', chainId: 80001, url: process.env.POLYGON_RPC_URL },
  {
    network: 'arb-mainnet',
    chainId: 42161,
    url: process.env.ARBITRUM_RPC_URL,
  },
]

function getAccountsKeys() {
  if (process.env.MNEMONIC) return { mnemonic: process.env.MNEMONIC }
  if (process.env.PRIVATE_KEY) return [process.env.PRIVATE_KEY]
  return 'remote'
}

function getProviderURL(network: string) {
  return `https://${network}.infura.io/v3/${process.env.INFURA_KEY}`
}

function setupNetworkConfig(config) {
  for (const netConfig of networkConfigs) {
    config.networks[netConfig.network] = {
      chainId: netConfig.chainId,
      url: netConfig.url ? netConfig.url : getProviderURL(netConfig.network),
      gas: netConfig.gas || 'auto',
      gasPrice: netConfig.gasPrice || 'auto',
      accounts: getAccountsKeys(),
    }
  }
}

// Config

const config = {
  paths: {
    sources: './contracts',
    tests: './test',
    artifacts: './build/artifacts',
  },
  solidity: {
    version: '0.8.4',
    optimizer: {
      enabled: true,
      runs: 200,
    },
  },
  defaultNetwork: 'hardhat',
  networks: {
    hardhat: {
      chainId: 1337,
      loggingEnabled: false,
      gas: 11000000,
      gasPrice: 'auto',
      blockGasLimit: 12000000,
      accounts: {
        mnemonic: 'myth like bonus scare over problem client lizard pioneer submit female collect',
      },
    },
    ganache: {
      chainId: 1337,
      url: 'http://localhost:8545',
    },
  },
  etherscan: {
    apiKey: {
      mainnet: process.env.ETHERSCAN_API_KEY,
      arbitrumOne: process.env.ARBISCAN_API_KEY,
    },
  },
  abiExporter: {
    path: './build/abis',
    clear: true,
  },
  typechain: {
    outDir: 'build/types',
    target: 'ethers-v5',
  },
}

setupNetworkConfig(config)

export default config
