import '@nomicfoundation/hardhat-chai-matchers'

import { expect } from 'chai'
import { constants, Contract } from 'ethers'
import * as deployment from '../utils/deploy'
import { getAccounts, Account, toGRT, toBN } from '../utils/helpers'

import { BanxaWrapper } from '../build/types/contracts/BanxaWrapper'
import { Billing } from '../build/types/contracts/Billing'

const { AddressZero } = constants

describe('BanxaWrapper', () => {
  // Accounts
  let me: Account
  let collector1: Account
  let user1: Account
  let governor: Account
  let l2TokenGatewayMock: Account
  let banxaFulfillmentService: Account

  // Contracts
  let banxaWrapper: BanxaWrapper
  let billing: Billing
  let token: Contract

  before(async function () {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[me, collector1, user1, governor, l2TokenGatewayMock, banxaFulfillmentService] = await getAccounts()
  })

  const tenBillion = toGRT('10000000000')
  const oneHundred = toGRT('100')
  const oneMillion = toGRT('1000000')

  beforeEach(async function () {
    token = await deployment.deployToken([tenBillion], me.signer, true)
    billing = await deployment.deployBilling(
      [collector1.address, token.address, governor.address, l2TokenGatewayMock.address],
      me.signer,
      true,
    )
    banxaWrapper = await deployment.deployBanxaWrapper([token.address, billing.address], me.signer, true)

    await token.connect(me.signer).transfer(banxaFulfillmentService.address, oneMillion)
    await token.connect(banxaFulfillmentService.signer).approve(banxaWrapper.address, oneMillion)
  })

  describe('constructor', function () {
    it('should set the token address', async function () {
      expect(await banxaWrapper.graphToken()).to.eq(token.address)
    })

    it('should set the billing address', async function () {
      expect(await banxaWrapper.billing()).to.eq(billing.address)
    })
  })

  describe('fulfil', function () {
    it('should fulfil orders', async function () {
      const beforeBillingBalance = await billing.userBalances(user1.address)
      const beforeServiceBalance = await token.balanceOf(banxaFulfillmentService.address)

      const tx = banxaWrapper.connect(banxaFulfillmentService.signer).fulfil(user1.address, oneHundred)
      await expect(tx)
        .emit(banxaWrapper, 'OrderFulfilled')
        .withArgs(banxaFulfillmentService.address, user1.address, oneHundred)

      const afterBillingBalance = await billing.userBalances(user1.address)
      const afterServiceBalance = await token.balanceOf(banxaFulfillmentService.address)

      expect(afterBillingBalance).eq(beforeBillingBalance.add(oneHundred))
      expect(afterServiceBalance).eq(beforeServiceBalance.sub(oneHundred))
    })

    it('should fail to fulfil orders for address(0)', async function () {
      const tx = banxaWrapper.connect(banxaFulfillmentService.signer).fulfil(AddressZero, oneHundred)
      await expect(tx).revertedWithCustomError(banxaWrapper, 'InvalidZeroAddress')
    })

    it('should fail to fulfil orders with zero tokens', async function () {
      const tx = banxaWrapper.connect(banxaFulfillmentService.signer).fulfil(user1.address, toBN(0))
      await expect(tx).revertedWithCustomError(banxaWrapper, 'InvalidZeroAmount')
    })
  })
})
