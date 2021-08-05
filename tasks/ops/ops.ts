import axios from 'axios'
import inquirer from 'inquirer'
import { BigNumber, utils } from 'ethers'
import { task } from 'hardhat/config'
import { HardhatRuntimeEnvironment } from 'hardhat/types'

const BILLING_SUBGRAPH = 'https://api.thegraph.com/subgraphs/name/graphprotocol/billing'

interface Depositor {
  address: string
  balance: BigNumber
}

async function getAllDepositors(): Promise<Depositor[]> {
  const query = `{
    users(first: 1000, where: {billingBalance_gt: "0"}) {
      id
      billingBalance
    }
  }
  `
  const response = await axios.post(BILLING_SUBGRAPH, { query })
  return response.data.data.users.map((user) => {
    return {
      address: user.id,
      balance: BigNumber.from(user.billingBalance),
    }
  })
}

task('ops:pull-many:tx', 'Generate transaction data for pulling all funds from users')
  .addParam('dstAddress', 'Destination address of withdrawal')
  .setAction(async (taskArgs, hre: HardhatRuntimeEnvironment) => {
    const { contracts } = hre

    console.log('Getting depositors...')
    const depositors = await getAllDepositors()
    const users = []
    const balances = []

    depositors.forEach((depositor) => {
      users.push(depositor.address)
      balances.push(depositor.balance)
    })
    const totalBalance = balances.reduce((a, b) => a.add(b), BigNumber.from(0))

    console.log(`Found: ${depositors.length}`)
    console.log(`Balance: ${utils.formatEther(totalBalance)}`)
    console.log(`--------------------------------`)
    for (const depositor of depositors) {
      console.log(depositor.address, utils.formatEther(depositor.balance))
    }

    // Transaction data
    const res = await inquirer.prompt({
      name: 'confirm',
      type: 'confirm',
      message: `Print transaction data?`,
    })
    if (res.confirm) {
      console.log('Transaction payload')
      console.log(`--------------------`)
      const payload = await contracts.Billing.populateTransaction.pullMany(users, balances, taskArgs.dstAddress)
      console.log(payload)
    } else {
      console.log('Bye!')
    }
  })
