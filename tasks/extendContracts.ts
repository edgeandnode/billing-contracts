import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { extendEnvironment } from 'hardhat/config'
import { lazyObject } from 'hardhat/plugins'
import '@nomiclabs/hardhat-ethers'

import { deployConfig } from '../utils/config'
import { BillingContracts, loadContracts } from '../utils/contracts'

declare module 'hardhat/types/runtime' {
  export interface HardhatRuntimeEnvironment {
    contracts: BillingContracts
  }
}

extendEnvironment((hre: HardhatRuntimeEnvironment) => {
  hre['contracts'] = lazyObject(() => {
    if (hre.network.config.chainId == 137) {
      return loadContracts(deployConfig.mainnet.maticBilling, deployConfig.mainnet.maticGRT, hre.ethers.provider)
    } else if (hre.network.config.chainId == 80001) {
      return loadContracts(
        deployConfig.testnet.mumbaiBilling,
        deployConfig.testnet.mumbaiDummyERC20,
        hre.ethers.provider,
      )
    }
  })
})
