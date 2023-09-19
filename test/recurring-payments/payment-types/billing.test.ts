import { expect } from 'chai'
import hre from 'hardhat'
import '@nomicfoundation/hardhat-chai-matchers'
import { setBalance, time } from '@nomicfoundation/hardhat-network-helpers'
import { Contract } from 'ethers'

import { deployMockGelatoNetwork } from '../../../utils/gelato'
import * as deployment from '../../../utils/deploy'
import { getAccounts, Account, toGRT } from '../../../utils/helpers'

import { RecurringPayments } from '../../../build/types/contracts/RecurringPayments'
import { Billing } from '../../../build/types'
import { createRP, executeRP } from '../helpers'

const { ethers } = hre

describe('RecurringPayments: payment types', () => {
  let me: Account
  let governor: Account
  let gelatoNetwork: Account
  let user1: Account
  let collector1: Account
  let l2TokenGatewayMock: Account

  let token: Contract
  let automate: Contract
  let recurringPayments: RecurringPayments
  let billing: Billing

  const createData = ethers.utils.defaultAbiCoder.encode([], [])

  const zero = toGRT('0')
  const ten = toGRT('10')
  const oneHundred = toGRT('100')
  const oneMillion = toGRT('1000000')
  const tenBillion = toGRT('10000000000')

  const initialMaxGasPrice = ethers.utils.parseUnits('3.5', 'gwei')
  const initialExecutionInterval = 2
  const initialExpirationInterval = 13
  const tooDamnHighGasPrice = ethers.utils.parseUnits('100', 'gwei')

  beforeEach(async function () {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[me, governor, gelatoNetwork, user1, collector1, l2TokenGatewayMock] = await getAccounts()

    token = await deployment.deployToken([tenBillion], me.signer, true)

    automate = await deployMockGelatoNetwork(me.signer, gelatoNetwork.address)

    // Deploy RecurringPayments contract
    recurringPayments = await deployment.deployRecurringPayments(
      [automate.address, governor.address, initialMaxGasPrice, initialExecutionInterval, initialExpirationInterval],
      me.signer,
      true,
    )

    // Deploy payment contracts
    billing = await deployment.deployBilling(
      [collector1.address, token.address, governor.address, l2TokenGatewayMock.address],
      me.signer,
      true,
    )

    await token.connect(me.signer).transfer(user1.address, oneMillion)
    await setBalance(me.address, oneHundred)
    await setBalance(governor.address, oneHundred)
  })

  describe('Payment type: Billing 1.0', function () {
    const paymentTypeName = 'Billing1.0'
    const emptyData = ethers.utils.defaultAbiCoder.encode([], [])

    beforeEach(async function () {
      await recurringPayments
        .connect(governor.signer)
        .registerPaymentType(paymentTypeName, ten, billing.address, token.address, false)
    })

    describe('create()', function () {
      it('should create a recurring payment with no initial amount', async function () {
        const initialAmount = zero
        const recurringAmount = oneHundred

        // Before state
        const beforeUserBillingBalance = await billing.userBalances(user1.address)

        // Create RP
        await createRP(
          user1,
          user1.address,
          recurringPayments,
          token,
          paymentTypeName,
          initialAmount,
          recurringAmount,
          zero,
          createData,
        )

        // After state
        const afterUserBillingBalance = await billing.userBalances(user1.address)

        expect(afterUserBillingBalance).to.equal(beforeUserBillingBalance)
      })

      it('should create a recurring payment with an initial amount', async function () {
        const initialAmount = ten
        const recurringAmount = oneHundred

        // Before state
        const beforeUserBillingBalance = await billing.userBalances(user1.address)

        // Create RP
        await token.connect(user1.signer).approve(recurringPayments.address, initialAmount)
        await createRP(
          user1,
          user1.address,
          recurringPayments,
          token,
          paymentTypeName,
          initialAmount,
          recurringAmount,
          zero,
          createData,
        )

        // After state
        const afterUserBillingBalance = await billing.userBalances(user1.address)

        expect(afterUserBillingBalance).to.equal(beforeUserBillingBalance.add(initialAmount))
      })
    })

    describe('execute()', function () {
      beforeEach(async function () {
        await createRP(
          user1,
          user1.address,
          recurringPayments,
          token,
          paymentTypeName,
          zero,
          oneHundred,
          zero,
          createData,
        )
        await token.connect(user1.signer).approve(recurringPayments.address, oneMillion)
      })

      it('should allow execution by any party if executionInterval has passed', async function () {
        const recurringPayment = await recurringPayments.recurringPayments(user1.address)

        // Time travel to next execution time and execute it a few times
        for (let index = 0; index < 5; index++) {
          // Before state
          const beforeUserBillingBalance = await billing.userBalances(user1.address)

          await time.increaseTo(await recurringPayments.getNextExecutionTime(user1.address))
          await executeRP(me, user1.address, recurringPayments, token)

          // After state
          const afterUserBillingBalance = await billing.userBalances(user1.address)

          expect(afterUserBillingBalance).to.equal(beforeUserBillingBalance.add(recurringPayment.recurringAmount))
        }
      })
    })
  })
})
