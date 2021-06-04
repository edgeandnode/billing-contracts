import { Wallet } from 'ethers'
import { task } from 'hardhat/config'
import '@nomiclabs/hardhat-ethers'

import { deployBilling } from '../../utils/deploy'
import { deployDefaults } from '../../utils/defaults'

task('deployBilling', deployDefaults.billing.description)
  .addParam('token', 'Address of the token', deployDefaults.billing.params.tokenAddress)
  .addParam('gateway', 'Address of the gateway', deployDefaults.billing.params.gatewayAddress)
  .addParam('governor', 'Address of the governor, ', deployDefaults.billing.params.governor)
  .setAction(async (taskArgs, hre) => {
    const accounts = await hre.ethers.getSigners()
    await deployBilling([taskArgs.gateway, taskArgs.token, taskArgs.governor], accounts[0] as unknown as Wallet)
  })
