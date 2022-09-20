import { Wallet } from 'ethers'
import { task } from 'hardhat/config'
import { HardhatRuntimeEnvironment } from 'hardhat/types'
import '@nomiclabs/hardhat-ethers'

import { deployBilling, deployBillingConnector } from '../../utils/deploy'
import '../extendContracts'

task('deploy-billing', 'Deploy the billing contract (use L2 network!)')
  .addParam('collector', 'Address of the collector')
  .addParam('token', 'Address of the token')
  .addParam('governor', 'Address of the governor')
  .addParam('tokenGateway', 'Address of the L2GraphTokenGateway')
  .setAction(async (taskArgs, hre: HardhatRuntimeEnvironment) => {
    const accounts = await hre.ethers.getSigners()
    await deployBilling(
      [taskArgs.collector, taskArgs.token, taskArgs.governor, taskArgs.tokenGateway],
      accounts[0] as unknown as Wallet,
    )
  })

task('deploy-billing-connector', 'Deploy the billing connector contract (use L1 network!)')
  .addParam('tokenGateway', 'Address of the L1GraphTokenGateway')
  .addParam('billing', 'Address of the Billing contract on L2')
  .addParam('token', 'Address of the token')
  .addParam('governor', 'Address of the governor')
  .setAction(async (taskArgs, hre: HardhatRuntimeEnvironment) => {
    const accounts = await hre.ethers.getSigners()
    await deployBillingConnector(
      [taskArgs.tokenGateway, taskArgs.billing, taskArgs.token, taskArgs.governor],
      accounts[0] as unknown as Wallet,
    )
  })
