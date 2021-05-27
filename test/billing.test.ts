import { expect } from 'chai'
import * as deployment from './lib/deployment'
import { getAccounts, Account, toGRT } from './lib/testHelpers'

import { Billing } from '../build/typechain/contracts/Billing'
import { Token } from '../build/typechain/contracts/Token'

describe('Billing', () => {
  let me: Account
  let gateway1: Account
  let gateway2: Account
  let user1: Account
  let user2: Account
  let user3: Account
  let governor: Account

  let billing: Billing

  let token: Token

  before(async function () {
    ;[me, gateway1, gateway2, user1, user2, user3, governor] = await getAccounts()
  })

  const tenBillion = toGRT('10000000000')
  const oneHundred = toGRT('100')
  const oneMillion = toGRT('1000000')

  beforeEach(async function () {
    token = await deployment.deployToken([tenBillion], me.signer)
    billing = await deployment.deployBilling([gateway1.address, token.address, governor.address], me.signer)
    await token.connect(me.signer).transfer(user1.address, oneMillion)
    await token.connect(me.signer).transfer(user2.address, oneMillion)
    await token.connect(user1.signer).approve(billing.address, oneMillion)
    await token.connect(user2.signer).approve(billing.address, oneMillion)
  })

  it('should set `gateway`', async function () {
    expect(await billing.gateway()).eq(gateway1.address)
    const tx = billing.connect(governor.signer).setGateway(gateway2.address)
    await expect(tx).emit(billing, 'GatewayUpdated').withArgs(gateway2.address)
    expect(await billing.gateway()).eq(gateway2.address)
  })

  it('should fail set `gateway` if not governor', async function () {
    const tx = billing.connect(me.signer).setGateway(gateway2.address)
    await expect(tx).revertedWith('Only Governor can call')
  })

  it('should deposit', async function () {
    const beforeDeposit = await billing.users(user1.address)
    const beforeBalance = await token.balanceOf(user1.address)

    const tx = billing.connect(user1.signer).deposit(oneHundred)
    await expect(tx).emit(billing, 'Deposit').withArgs(user1.address, oneHundred)

    const afterDeposit = await billing.users(user1.address)
    const afterBalance = await token.balanceOf(user1.address)
    expect(beforeDeposit.eq(afterDeposit.sub(oneHundred)))
    expect(beforeBalance.eq(afterBalance.sub(oneHundred)))
  })

  it('should deposit to', async function () {
    const beforeDeposit2 = await billing.users(user2.address)
    const beforeBalance1 = await token.balanceOf(user1.address)

    const tx = billing.connect(user1.signer).depositTo(user2.address, oneHundred)
    await expect(tx).emit(billing, 'Deposit').withArgs(user2.address, oneHundred)

    const afterDeposit2 = await billing.users(user2.address)
    const afterBalance1 = await token.balanceOf(user1.address)
    expect(beforeDeposit2.eq(afterDeposit2.sub(oneHundred)))
    expect(beforeBalance1.eq(afterBalance1.sub(oneHundred)))
  })

  it('should fail on deposit if no tokens held by user', async function () {
    const tx = billing.connect(user3.signer).deposit(oneHundred)
    await expect(tx).revertedWith('transfer amount exceeds balance')
  })

  it('should withdraw', async function () {
    await billing.connect(user1.signer).deposit(oneHundred)
    const beforeWithdraw = await billing.users(user1.address)
    const tx = billing.connect(user1.signer).withdraw(user1.address, oneHundred)
    await expect(tx).emit(billing, 'Withdraw').withArgs(user1.address, user1.address, oneHundred)
    const afterWithdraw = await billing.users(user1.address)
    expect(beforeWithdraw.eq(afterWithdraw.sub(oneHundred)))
  })
  it('should fail on withdrawing too much', async function () {
    await billing.connect(user1.signer).deposit(oneHundred)
    const tx = billing.connect(user1.signer).withdraw(user1.address, oneMillion)
    await expect(tx).revertedWith('Too much withdrawn')
  })
  it('should pull deposit', async function () {
    const gatewayBalanceBefore = await token.balanceOf(gateway1.address)
    const depositBefore = await billing.users(user1.address)

    await billing.connect(user1.signer).deposit(oneHundred)
    const tx = billing.connect(gateway1.signer).pullDeposit(user1.address, oneHundred)
    await expect(tx).emit(billing, 'DepositPulled').withArgs(user1.address, oneHundred)

    const gatewayBalanceAfter = await token.balanceOf(gateway1.address)
    const depositAfter = await billing.users(user1.address)
    expect(gatewayBalanceBefore.eq(gatewayBalanceAfter.add(oneHundred)))
    expect(depositBefore.eq(depositAfter.sub(oneHundred)))
  })
  it('should pull deposits', async function () {
    await billing.connect(user1.signer).deposit(oneHundred)
    await billing.connect(user2.signer).deposit(oneHundred)
    const depositBefore1 = await billing.users(user1.address)
    const depositBefore2 = await billing.users(user2.address)
    const gatewayBalanceBefore = await token.balanceOf(gateway1.address)

    await billing.connect(gateway1.signer).pullDeposits([user1.address, user2.address], [oneHundred, oneHundred])

    const depositAfter1 = await billing.users(user1.address)
    const depositAfter2 = await billing.users(user2.address)
    const gatewayBalanceAfter = await token.balanceOf(gateway1.address)

    expect(gatewayBalanceBefore.eq(gatewayBalanceAfter.add(oneHundred).add(oneHundred)))
    expect(depositBefore1.eq(depositAfter1.sub(oneHundred)))
    expect(depositBefore2.eq(depositAfter2.sub(oneHundred)))
  })
  it('should fail pull deposits on lengths not equal', async function () {
    await billing.connect(user1.signer).deposit(oneHundred)
    await billing.connect(user2.signer).deposit(oneHundred)
    const tx = billing.connect(gateway1.signer).pullDeposits([user1.address], [oneHundred, oneHundred])
    await expect(tx).revertedWith('Lengths not equal')
  })
  it('should fail on pull when not gateway', async function () {
    await billing.connect(user1.signer).deposit(oneHundred)
    const tx = billing.connect(me.signer).pullDeposit(user1.address, oneHundred)
    await expect(tx).revertedWith('!gateway')
  })
  it('should fail too much pulled', async function () {
    await billing.connect(user1.signer).deposit(oneHundred)
    const tx = billing.connect(gateway1.signer).pullDeposit(user1.address, oneMillion)
    await expect(tx).revertedWith('Too much pulled')
  })
})
