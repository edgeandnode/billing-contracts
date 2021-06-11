import { expect } from 'chai'
import * as deployment from '../utils/deploy'
import { getAccounts, Account, toGRT } from '../utils/helpers'

import { Billing } from '../build/types/Billing'
import { Token } from '../build/types/Token'

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
    token = await deployment.deployToken([tenBillion], me.signer, true)
    billing = await deployment.deployBilling([gateway1.address, token.address, governor.address], me.signer, true)
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

  it('should add', async function () {
    const beforeAdd = await billing.userBalances(user1.address)
    const beforeBalance = await token.balanceOf(user1.address)

    const tx = billing.connect(user1.signer).add(oneHundred)
    await expect(tx).emit(billing, 'TokensAdded').withArgs(user1.address, oneHundred)

    const afterAdd = await billing.userBalances(user1.address)
    const afterBalance = await token.balanceOf(user1.address)
    expect(beforeAdd.eq(afterAdd.sub(oneHundred)))
    expect(beforeBalance.eq(afterBalance.sub(oneHundred)))
  })

  it('should add to', async function () {
    const beforeAdd2 = await billing.userBalances(user2.address)
    const beforeBalance1 = await token.balanceOf(user1.address)

    const tx = billing.connect(user1.signer).addTo(user2.address, oneHundred)
    await expect(tx).emit(billing, 'TokensAdded').withArgs(user2.address, oneHundred)

    const afterAdd2 = await billing.userBalances(user2.address)
    const afterBalance1 = await token.balanceOf(user1.address)
    expect(beforeAdd2.eq(afterAdd2.sub(oneHundred)))
    expect(beforeBalance1.eq(afterBalance1.sub(oneHundred)))
  })

  it('should fail on built in solidity 0.8 safe math', async function () {
    const beforeAdd = await billing.userBalances(user1.address)
    const beforeBalance = await token.balanceOf(user1.address)

    const tx = billing.connect(user1.signer).add(oneHundred)
    await expect(tx).emit(billing, 'TokensAdded').withArgs(user1.address, oneHundred)

    const afterAdd = await billing.userBalances(user1.address)
    const afterBalance = await token.balanceOf(user1.address)
    expect(beforeAdd.eq(afterAdd.sub(oneHundred)))
    expect(beforeBalance.eq(afterBalance.sub(oneHundred)))
  })

  it('should fail on add if no tokens held by user', async function () {
    const tx = billing.connect(user3.signer).add(oneHundred)
    await expect(tx).revertedWith('transfer amount exceeds balance')
  })

  it('should remove', async function () {
    await billing.connect(user1.signer).add(oneHundred)
    const beforeRemove = await billing.userBalances(user1.address)
    const tx = billing.connect(user1.signer).remove(user1.address, oneHundred)
    await expect(tx).emit(billing, 'TokensRemoved').withArgs(user1.address, user1.address, oneHundred)
    const afterRemove = await billing.userBalances(user1.address)
    expect(beforeRemove.eq(afterRemove.sub(oneHundred)))
  })
  it('should fail on removing too much', async function () {
    await billing.connect(user1.signer).add(oneHundred)
    const tx = billing.connect(user1.signer).remove(user1.address, oneMillion)
    await expect(tx).revertedWith('Too much removed')
  })
  it('should pull', async function () {
    const gatewayBalanceBefore = await token.balanceOf(gateway1.address)
    const addBefore = await billing.userBalances(user1.address)

    await billing.connect(user1.signer).add(oneHundred)
    const tx = billing.connect(gateway1.signer).pull(user1.address, oneHundred)
    await expect(tx).emit(billing, 'TokensPulled').withArgs(user1.address, oneHundred)

    const gatewayBalanceAfter = await token.balanceOf(gateway1.address)
    const addAfter = await billing.userBalances(user1.address)
    expect(gatewayBalanceBefore.eq(gatewayBalanceAfter.add(oneHundred)))
    expect(addBefore.eq(addAfter.sub(oneHundred)))
  })
  it('should pull many', async function () {
    await billing.connect(user1.signer).add(oneHundred)
    await billing.connect(user2.signer).add(oneHundred)
    const addBefore1 = await billing.userBalances(user1.address)
    const addBefore2 = await billing.userBalances(user2.address)
    const gatewayBalanceBefore = await token.balanceOf(gateway1.address)

    await billing.connect(gateway1.signer).pullMany([user1.address, user2.address], [oneHundred, oneHundred])

    const addAfter1 = await billing.userBalances(user1.address)
    const addAfter2 = await billing.userBalances(user2.address)
    const gatewayBalanceAfter = await token.balanceOf(gateway1.address)

    expect(gatewayBalanceBefore.eq(gatewayBalanceAfter.add(oneHundred).add(oneHundred)))
    expect(addBefore1.eq(addAfter1.sub(oneHundred)))
    expect(addBefore2.eq(addAfter2.sub(oneHundred)))
  })
  it('should fail pull on lengths not equal', async function () {
    await billing.connect(user1.signer).add(oneHundred)
    await billing.connect(user2.signer).add(oneHundred)
    const tx = billing.connect(gateway1.signer).pullMany([user1.address], [oneHundred, oneHundred])
    await expect(tx).revertedWith('Lengths not equal')
  })
  it('should fail on pull when not gateway', async function () {
    await billing.connect(user1.signer).add(oneHundred)
    const tx = billing.connect(me.signer).pull(user1.address, oneHundred)
    await expect(tx).revertedWith('!gateway')
  })
})
