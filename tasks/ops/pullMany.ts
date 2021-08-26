import fs from 'fs'
import axios from 'axios'
import inquirer from 'inquirer'
import { BigNumber, utils, Contract } from 'ethers'
import { task } from 'hardhat/config'
import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { logger } from '../../utils/logging'
import { BillingV1 } from '../../upgrades/BillingV1'
import { addresses } from '../../utils/addresses'

const BILLING_SUBGRAPH = 'https://api.thegraph.com/subgraphs/name/graphprotocol/billing'

interface Depositor {
  address: string
  balance: BigNumber
}

export async function getAllDepositors(): Promise<Depositor[]> {
  const query = `{
    users(
      first: 1000,
      where: {billingBalance_gt: "0"},
      orderBy: billingBalance,
      orderDirection: desc
    ) {
        id
        billingBalance
      }
    }
  `
  const response = await axios.post(BILLING_SUBGRAPH, { query })
  logger.log(`Found: ${response.data.data.users.length}`)
  return response.data.data.users.map((user) => {
    return {
      address: user.id,
      balance: BigNumber.from(user.billingBalance),
    }
  })
}

export async function ask(message: string): Promise<boolean> {
  const res = await inquirer.prompt({
    name: 'confirm',
    type: 'confirm',
    message,
  })
  return res.confirm
}

task('ops:pull-many:tx', 'Generate transaction data for pulling all funds from users')
  .addParam('dstAddress', 'Destination address of withdrawal')
  .setAction(async (taskArgs, hre: HardhatRuntimeEnvironment) => {
    const accounts = await hre.ethers.getSigners()
    const gateway = accounts[0]

    logger.log('Getting depositors...')
    const depositors = await getAllDepositors()
    const users = []
    const balances = []

    try {
      const path = './tasks/ops/depositors.json'
      if (fs.existsSync(path)) fs.unlinkSync(path)
      fs.writeFileSync('./tasks/ops/depositors.json', JSON.stringify(depositors, null, 2), { flag: 'a+' })
    } catch (e) {
      console.log(`Error saving artifacts: ${e.message}`)
    }

    // console.log(depositors)

    depositors.forEach((depositor) => {
      users.push(depositor.address)
      balances.push(depositor.balance)
    })
    const totalBalance = balances.reduce((a, b) => a.add(b), BigNumber.from(0))

    logger.log(`Balance: ${utils.formatEther(totalBalance)}`)
    logger.log(`--------------------------------`)
    for (const depositor of depositors) {
      logger.log(depositor.address, utils.formatEther(depositor.balance))
    }

    // Setup old billing
    const oldBilling = new Contract(addresses.mainnet.maticBillingOld, BillingV1)

    if (taskArgs.dstAddress != '0x76c00f71f4dace63fd83ec80dbc8c30a88b2891c') {
      logger.error('Wrong gateway address')
      process.exit()
    }

    if (await ask('Execute <pullMany> transaction? **This will execute on mainnet matic**')) {
      logger.log('Transaction being sent')
      logger.log(`--------------------`)
      const tx = await oldBilling.connect(gateway).pullMany(users, balances, taskArgs.dstAddress)
      const receipt = await tx.wait()
      logger.log(receipt)
    } else {
      logger.log('Bye!')
    }
  })
