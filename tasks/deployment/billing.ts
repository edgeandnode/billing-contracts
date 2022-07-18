import { Wallet } from 'ethers'
import { task } from 'hardhat/config'
import { HardhatRuntimeEnvironment } from 'hardhat/types'
import '@nomiclabs/hardhat-ethers'

import { deployBilling } from '../../utils/deploy'
import '../extendContracts'

task('deploy-billing', 'Deploy the billing contract')
  .addParam('token', 'Address of the token')
  .addParam('gateway', 'Address of the gateway')
  .addParam('governor', 'Address of the governor')
  .setAction(async (taskArgs, hre: HardhatRuntimeEnvironment) => {
    const accounts = await hre.ethers.getSigners()
    await deployBilling([taskArgs.gateway, taskArgs.token, taskArgs.governor], accounts[0] as unknown as Wallet)
  })
