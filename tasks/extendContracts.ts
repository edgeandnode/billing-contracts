import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { extendEnvironment } from 'hardhat/config'
import { lazyObject } from 'hardhat/plugins'
import '@nomiclabs/hardhat-ethers'

import { addresses } from '../utils/addresses'
import { BillingContracts, loadContracts } from '../utils/contracts'

declare module 'hardhat/types/runtime' {
  export interface HardhatRuntimeEnvironment {
    contracts: BillingContracts
  }
}

extendEnvironment((hre: HardhatRuntimeEnvironment) => {
  hre['contracts'] = lazyObject(() => {
    // 137 = matic. 1337 = hardhat & hardhat-matic-fork
    if (hre.network.config.chainId == 137 || hre.network.config.chainId == 1337) {
      return loadContracts(addresses.mainnet.maticBilling, addresses.mainnet.maticGRT, hre.ethers.provider)
    } else if (hre.network.config.chainId == 80001) {
      return loadContracts(addresses.testnet.mumbaiBilling, addresses.testnet.mumbaiDummyERC20, hre.ethers.provider)
    }
  })
})
