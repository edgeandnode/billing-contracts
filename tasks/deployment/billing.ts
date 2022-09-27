import { Wallet } from 'ethers'
import { task } from 'hardhat/config'
import { HardhatRuntimeEnvironment } from 'hardhat/types'
import '@nomiclabs/hardhat-ethers'

import { deployBilling } from '../../utils/deploy'
import '../extendContracts'

import { logger } from '../../utils/logging'

import addresses from '../../addresses.json'
import { getContractAt } from '../../utils/contracts'
import { Billing } from '../../build/types'

task('deploy-billing', 'Deploy the billing contract (use L2 network!)')
  .addParam('collector', 'Address of the collector')
  .addParam('token', 'Address of the token')
  .addParam('governor', 'Address of the governor, leave empty to use the deployer')
  .addParam('tokenGateway', 'Address of the L2GraphTokenGateway')
  .setAction(async (taskArgs, hre: HardhatRuntimeEnvironment) => {
    const accounts = await hre.ethers.getSigners()
    await deployBilling(
      [taskArgs.collector, taskArgs.token, taskArgs.governor ?? accounts[0].address, taskArgs.tokenGateway],
      accounts[0] as unknown as Wallet,
    )
  })

task(
  'configure-billing',
  'Configure the billing contract to set billing connector address and transfer ownership to the governor (use L2 network!)',
)
  .addParam('governor', 'Address of the governor')
  .addParam('billingConnector', 'Address of the BillingConnector on L1')
  .setAction(async (taskArgs, hre: HardhatRuntimeEnvironment) => {
    const accounts = await hre.ethers.getSigners()
    const chainId = hre.network.config.chainId
    const addressBook = addresses[chainId as number]
    const wallet = accounts[0] as unknown as Wallet
    const billing = getContractAt('Billing', addressBook[chainId]['Billing'], wallet) as unknown as Billing

    logger.log(`Setting billing connector address to ${taskArgs.billingConnector}`)
    const tx1 = await billing.connect(wallet).setL1BillingConnector(taskArgs.billingConnector)
    const receipt1 = await tx1.wait()
    logger.log(`> Done. Tx hash: ${receipt1.transactionHash}`)

    logger.log(`Transferring Billing contract ownership to ${taskArgs.governor}`)
    const tx2 = await billing.connect(wallet).transferOwnership(taskArgs.governor)
    const receipt2 = await tx2.wait()
    logger.log(`> Done. Tx hash: ${receipt2.transactionHash}`)
  })
