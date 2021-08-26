import axios from 'axios'
import inquirer from 'inquirer'
import { BigNumber, utils, Contract, providers } from 'ethers'
import { task } from 'hardhat/config'
import { HardhatRuntimeEnvironment } from 'hardhat/types'
import '@nomiclabs/hardhat-ethers'

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

async function ask(message: string): Promise<boolean> {
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
    const { contracts } = hre

    // TEST FORK
    const provider = contracts.Billing.provider as providers.JsonRpcProvider
    await provider.send('hardhat_impersonateAccount', ['0x76c00f71f4dace63fd83ec80dbc8c30a88b2891c'])
    const sender = await provider.getSigner('0x76c00f71f4dace63fd83ec80dbc8c30a88b2891c')

    // REAL THING
    // const accounts = await hre.ethers.getSigners()
    // const sender = accounts[0]

    logger.log('Getting depositors...')
    const depositors = await getAllDepositors()
    const users = []
    const balances = []

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

    // Transaction data for pullMany
    logger.log(`Pulling funds to -> ${taskArgs.dstAddress}`)
    if (await ask('Print <pullMany> transaction data?')) {
      logger.log('Transaction payload')
      logger.log(`--------------------`)
      const tx = await oldBilling.connect(sender).pullMany(users, balances, taskArgs.dstAddress, { gasLimit: 12000000 })
      logger.log(tx)
    } else {
      logger.log('Bye!')
    }

    // Transaction data for addToMany
    if (await ask('Print <addToMany> transaction data?')) {
      logger.log('Transaction payload')
      logger.log(`--------------------`)
      const tx = await contracts.Billing.connect(sender).addToMany(users, balances)
      logger.log(tx)
    } else {
      logger.log('Bye!')
    }
  })
