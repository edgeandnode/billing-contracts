import axios from 'axios'
import { utils } from 'ethers'
import { task } from 'hardhat/config'
import { HardhatRuntimeEnvironment } from 'hardhat/types'

task('ops:pullMany', 'Build payload for pullMany()')
  .addParam('dstAddress', 'Destination address of withdrawal')
  .setAction(async (taskArgs, hre: HardhatRuntimeEnvironment) => {
    // Get indexers from subgraph
    const query = `{
    users(first: 1000, where: {billingBalance_not: "0"}) {
      id
      billingBalance
    }
  }
  `
    const url = 'https://api.thegraph.com/subgraphs/name/graphprotocol/billing'
    const res = await axios.post(url, { query })
    const usersAndBalances = res.data.data.users
    const users = []
    const balances = []

    usersAndBalances.forEach((ubs) => {
      users.push(ubs['id'])
      balances.push(ubs['billingBalance'])
    })

    const { contracts } = hre

    // console.log(users)
    // console.log(balances)

    const payload = await contracts.Billing.populateTransaction.pullMany(users, balances, taskArgs.dstAddress)

    console.log(payload)
  })
