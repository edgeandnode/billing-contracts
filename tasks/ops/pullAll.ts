import fs from 'fs'
import axios from 'axios'

import { BigNumber, Contract, utils } from 'ethers'
import { task } from 'hardhat/config'
import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { logger } from '../../utils/logging'
import { askForConfirmation, DEFAULT_BILLING_SUBGRAPH, DEFAULT_DEPOSITORS_FILE } from './utils'

// This script will pull the funds from all the billing accounts and store
// them in a file (by default, `depositors.json` in the same directory as this script).

interface Depositor {
  address: string
  balance: BigNumber
}

export async function getAllDepositors(billingSubgraphUrl: string): Promise<Depositor[]> {
  const query = `{
    users(
      where: {billingBalance_gt: "0"},
      orderBy: billingBalance,
      orderDirection: desc
    ) {
        id
        billingBalance
      }
    }
  `
  const response = await axios.post(billingSubgraphUrl, { query })
  logger.log(`Found: ${response.data.data.users.length} users`)
  return response.data.data.users.map((user) => {
    return {
      address: user.id,
      balance: BigNumber.from(user.billingBalance),
    }
  })
}

task('ops:pull-all', 'Execute transaction for pulling all funds from users')
  .addParam('dstAddress', 'Destination address of withdrawal')
  .addOptionalParam('depositorsFile', 'Path to depositors file', DEFAULT_DEPOSITORS_FILE)
  .addOptionalParam('billingSubgraphUrl', 'Billing subgraph URL', DEFAULT_BILLING_SUBGRAPH)
  .setAction(async (taskArgs, hre: HardhatRuntimeEnvironment) => {
    const accounts = await hre.ethers.getSigners()
    const collector = accounts[0]
    const chainId = hre.network.config.chainId
    logger.log('Getting depositors...')
    const depositors = await getAllDepositors(taskArgs.billingSubgraphUrl)
    if (depositors.length == 0) {
      logger.log('No depositors found')
      process.exit()
    }
    const users: string[] = depositors.map((depositor) => depositor.address)
    const balances: BigNumber[] = depositors.map((depositor) => depositor.balance)

    try {
      const path = taskArgs.depositorsFile
      if (fs.existsSync(path)) {
        fs.unlinkSync(path)
      }
      fs.writeFileSync(path, JSON.stringify(depositors, null, 2), { flag: 'a+' })
      const writeDepositors = JSON.parse(fs.readFileSync(path).toString())
      if (writeDepositors.length != depositors.length) {
        throw new Error('Written depositors does not equal fetched depositors')
      }
    } catch (e) {
      logger.log(`Error writing depositors file: \n${e}`)
      process.exit(1)
    }

    const totalBalance = balances.reduce((a, b) => a.add(b), BigNumber.from(0))

    logger.log(`Balance: ${utils.formatEther(totalBalance)}`)
    logger.log(`--------------------------------`)
    for (const depositor of depositors) {
      logger.log(depositor.address, utils.formatEther(depositor.balance))
    }

    if (
      await askForConfirmation(
        `Execute <pullMany> transaction? **This will execute on network with chain ID ${chainId}**`,
      )
    ) {
      logger.log('Transaction being sent')
      logger.log(`--------------------`)
      try {
        const billing = hre.contracts.Billing!
        const tx = await billing.connect(collector).pullMany(users, balances, taskArgs.dstAddress)
        const receipt = await tx.wait()
        logger.log('Receipt: ', receipt)
      } catch (e) {
        logger.log(e)
        process.exit(1)
      }
    } else {
      logger.log('Bye!')
    }
  })
