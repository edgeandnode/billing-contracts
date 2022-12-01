import fs from 'fs'
import axios from 'axios'

import { BigNumber, utils } from 'ethers'
import { task } from 'hardhat/config'
import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { logger } from '../../utils/logging'
import {
  askForConfirmation,
  DEFAULT_BILLING_SUBGRAPH,
  DEFAULT_DEPOSITORS_FILE,
  DEFAULT_CONTRACT_DEPOSITORS_FILE,
} from './utils'

// This script will pull the funds from all the billing accounts and store
// them in a file (by default, `depositors.json` in the same directory as this script).
// Depositors that are contracts will not be included in this file, but instead
// will be stored in a separate file (by default, `contract-depositors.json` in the same folder)

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

function writeDepositorsToFile(depositors: Depositor[], filePath: string) {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath)
  }
  fs.writeFileSync(filePath, JSON.stringify(depositors, null, 2), { flag: 'a+' })
  const writtenDepositors = JSON.parse(fs.readFileSync(filePath).toString())
  if (writtenDepositors.length != depositors.length) {
    throw new Error('Written depositors does not equal fetched depositors')
  }
}

task('ops:pull-all', 'Execute transaction for pulling all funds from users')
  .addParam('dstAddress', 'Destination address of withdrawal')
  .addOptionalParam('depositorsFile', 'Path to EOA depositors file', DEFAULT_DEPOSITORS_FILE)
  .addOptionalParam(
    'contractDepositorsFile',
    'Path to depositors file for depositors that are contracts',
    DEFAULT_CONTRACT_DEPOSITORS_FILE,
  )
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

    const eoaDepositors: Depositor[] = []
    const contractDepositors: Depositor[] = []

    for (const depositor of depositors) {
      const code = await hre.ethers.provider.getCode(depositor.address)
      if (code == '0x') {
        eoaDepositors.push(depositor)
      } else {
        contractDepositors.push(depositor)
      }
    }

    try {
      writeDepositorsToFile(eoaDepositors, taskArgs.depositorsFile)
    } catch (e) {
      logger.log(`Error writing depositors file: \n${e}`)
      process.exit(1)
    }
    try {
      writeDepositorsToFile(contractDepositors, taskArgs.contractDepositorsFile)
    } catch (e) {
      logger.log(`Error writing contract depositors file: \n${e}`)
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
        const billing = hre.contracts.Billing
        if (!billing) {
          throw new Error('Billing contract not found')
        }
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
