import { expect } from 'chai'
import { BigNumber } from 'ethers'
import * as deployment from '../utils/deploy'
import { getAccounts, Account, toGRT } from '../utils/helpers'

import { Billing } from '../build/types/Billing'
import { Token } from '../build/types/Token'

// Upgrade works by doing the following :
// - Deploy a new billing contract
// - pullMany() from existing billing contract for all users
// - addTo() to all of the exact same users for the new billing contract

describe('Upgrade Billing', () => {
  let governor: Account
  let gateway: Account
  let user1: Account
  let user2: Account
  let user3: Account
  let user4: Account
  let user5: Account
  let user6: Account
  let user7: Account
  let user8: Account
  let user9: Account
  let user10: Account
  let user11: Account
  let user12: Account
  let user13: Account
  let user14: Account
  let user15: Account
  let billing: Billing
  let billing2: Billing
  let token: Token
  let users: Account[]

  before(async function () {
    ;[
      governor,
      gateway,
      user1,
      user2,
      user3,
      user4,
      user5,
      user6,
      user7,
      user8,
      user9,
      user10,
      user11,
      user12,
      user13,
      user14,
      user15,
    ] = await getAccounts()
    users = [
      user1,
      user2,
      user3,
      user4,
      user5,
      user6,
      user7,
      user8,
      user9,
      user10,
      user11,
      user12,
      user13,
      user14,
      user15,
    ]
  })

  const tenBillion = toGRT('10000000000')
  const oneHundred = toGRT('100')

  async function setupUsers(users: Account[]): Promise<void> {
    for (let i = 0; i < users.length; i++) {
      await token.connect(governor.signer).transfer(users[i].address, oneHundred)
      await token.connect(users[i].signer).approve(billing.address, oneHundred)
    }
  }

  beforeEach(async function () {
    token = await deployment.deployToken([tenBillion], governor.signer, true)
    billing = await deployment.deployBilling([gateway.address, token.address, governor.address], governor.signer, true)
    billing2 = await deployment.deployBilling([gateway.address, token.address, governor.address], governor.signer, true)
    await setupUsers(users)
  })

  it('should upgrade ', async function () {
    const beforeGatewayBalance = await token.balanceOf(gateway.address)

    // add()
    for (let i = 0; i < users.length; i++) {
      const beforeAdd = await billing.userBalances(users[i].address)
      const beforeBalance = await token.balanceOf(users[i].address)
      const tx = billing.connect(users[i].signer).add(oneHundred)
      await expect(tx).emit(billing, 'TokensAdded').withArgs(users[i].address, oneHundred)
      const afterAdd = await billing.userBalances(users[i].address)
      const afterBalance = await token.balanceOf(users[i].address)
      expect(beforeAdd.eq(afterAdd.sub(oneHundred)))
      expect(beforeBalance.eq(afterBalance.sub(oneHundred)))
    }

    // pullMany()
    const userAddresses: string[] = []
    const oneHundreds: BigNumber[] = []
    users.forEach((signer) => {
      userAddresses.push(signer.address)
      oneHundreds.push(oneHundred)
    })
    const user1Before = await billing.userBalances(user1.address)
    await billing.connect(gateway.signer).pullMany(userAddresses, oneHundreds, gateway.address)
    const user1After = await billing.userBalances(user1.address)
    expect(user1Before.eq(user1After.sub(oneHundred)))

    // gate must approve billing2
    await token.connect(gateway.signer).approve(billing2.address, tenBillion)

    // addTo() for all
    for (let i = 0; i < users.length; i++) {
      const beforeAddTo = await billing2.userBalances(users[i].address)
      const tx = billing2.connect(gateway.signer).addTo(users[i].address, oneHundred)
      await expect(tx).emit(billing2, 'TokensAdded').withArgs(users[i].address, oneHundred)
      const afterAddToBilling2 = await billing2.userBalances(users[i].address)
      expect(beforeAddTo.eq(afterAddToBilling2.sub(oneHundred)))
    }

    // should be equal
    const afterGatewayBalance = await token.balanceOf(gateway.address)
    expect(beforeGatewayBalance.eq(afterGatewayBalance))
  })
})
