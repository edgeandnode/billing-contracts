import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { extendEnvironment } from 'hardhat/config'
import { lazyObject } from 'hardhat/plugins'

import addresses from '../addresses.json'
import { BillingContracts, loadContracts } from '../utils/contracts'

declare module 'hardhat/types/runtime' {
  export interface HardhatRuntimeEnvironment {
    contracts: BillingContracts
  }
}

extendEnvironment((hre: HardhatRuntimeEnvironment) => {
  const chainId = hre.network.config.chainId
  const addressBook = addresses[chainId as number]
  hre['contracts'] = lazyObject(() => {
    return loadContracts(addressBook.billing, addressBook.billingConnector, addressBook.grt, hre.ethers.provider)
  })
})
