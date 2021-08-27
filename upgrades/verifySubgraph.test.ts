import '@nomiclabs/hardhat-waffle'
import { expect } from 'chai'
import { BigNumber, Contract } from 'ethers'
import { Account, getAccounts } from '../utils/helpers'
import { addresses } from '../utils/addresses'
import { BillingV1 } from './BillingV1'
import { getAllDepositors } from '../tasks/ops/pullMany'
import { logger } from '../utils/logging'

describe('Subgraph - Confirm subgraph matches contract data', () => {
  let me: Account
  let oldBilling: Contract
  const contractUsers: string[] = []
  const contractAmounts: BigNumber[] = []
  let subgraphUsers: any

  before(async function () {
    this.timeout(0) // takes up to 2 min per test, so we remove timeout
    ;[me] = await getAccounts()
    oldBilling = new Contract(addresses.mainnet.maticBillingOld, BillingV1, me.signer)
    subgraphUsers = await getAllDepositors()
    logger.log(`Querying the blockchain for ${subgraphUsers.length} account balances. This may take a while....`)
    for (let i = 0; i < subgraphUsers.length; i++) {
      const contractBalance = await oldBilling.userBalances(subgraphUsers[i].address)
      contractUsers.push(subgraphUsers[i].address)
      contractAmounts.push(contractBalance)
      if (i % 10 == 0) logger.log(`${i} user balances received...`)
    }
    logger.log(`Done getting all balances!`)
  })
  it('should test all users', async function () {
    for (let i = 0; i < subgraphUsers.length; i++) {
      expect(subgraphUsers[i].balance).eq(contractAmounts[i])
    }
  })
})
