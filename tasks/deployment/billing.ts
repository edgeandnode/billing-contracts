import { Wallet } from 'ethers'
import { task } from 'hardhat/config'
import { HardhatRuntimeEnvironment } from 'hardhat/types'
import '@nomiclabs/hardhat-ethers'

import { deployBilling } from '../../utils/deploy'
import { deployConfig } from '../../utils/config'

task('deployBilling', deployConfig.billing.description)
  .addParam('token', 'Address of the token', deployConfig.billing.params.tokenAddress)
  .addParam('gateway', 'Address of the gateway', deployConfig.billing.params.gatewayAddress)
  .addParam('governor', 'Address of the governor, ', deployConfig.billing.params.governor)
  .setAction(async (taskArgs, hre: HardhatRuntimeEnvironment) => {
    const accounts = await hre.ethers.getSigners()
    await deployBilling([taskArgs.gateway, taskArgs.token, taskArgs.governor], accounts[0] as unknown as Wallet)
  })
