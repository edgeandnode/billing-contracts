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
  const networkName = hre.network.name
  const addressBook = addresses[networkName]
  hre['contracts'] = lazyObject(() => {
    return loadContracts(addressBook.billing, addressBook.grt, hre.ethers.provider)
  })
})
