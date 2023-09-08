import { expect } from 'chai'
import hre from 'hardhat'
import '@nomicfoundation/hardhat-chai-matchers'
import { setBalance, time } from '@nomicfoundation/hardhat-network-helpers'
import { BigNumber, Contract } from 'ethers'

import { deployMockGelatoNetwork } from '../../../utils/gelato'
import * as deployment from '../../../utils/deploy'
import { getAccounts, Account, toGRT } from '../../../utils/helpers'

import { RecurringPayments } from '../../../build/types/contracts/RecurringPayments'
import { Subscriptions } from '../../../build/types'
import { addMonths, createRP, executeRP, latestBlockTimestamp } from '../helpers'

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
  let subscriptions: Subscriptions

  const zero = toGRT('0')
  const ten = toGRT('10')
  const oneHundred = toGRT('100')
  const hundredMillion = toGRT('100000000')
  const oneBillion = toGRT('1000000000')
  const tenBillion = toGRT('10000000000')

  const initialMaxGasPrice = ethers.utils.parseUnits('3.5', 'gwei')
  const initialExecutionInterval = 1
  const initialExpirationInterval = 6
  const tooDamnHighGasPrice = ethers.utils.parseUnits('100', 'gwei')
  const subscriptionsEpochSeconds = BigNumber.from(100)

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
    subscriptions = await deployment.deploySubscriptions(
      [token.address, subscriptionsEpochSeconds, recurringPayments.address],
      me.signer,
      true,
    )

    await token.connect(me.signer).transfer(user1.address, oneBillion)
    await setBalance(me.address, oneHundred)
    await setBalance(governor.address, oneHundred)
  })

  describe('Payment type: Subscriptions', function () {
    const paymentTypeName = 'Subscriptions'

    beforeEach(async function () {
      await recurringPayments
        .connect(governor.signer)
        .registerPaymentType(paymentTypeName, subscriptions.address, token.address, true)
    })

    describe('create()', function () {
      it('should revert if no createData is provided', async function () {
        await expect(
          recurringPayments.connect(user1.signer).create(paymentTypeName, zero, oneHundred, zero, []),
        ).to.be.revertedWithoutReason()
      })

      it('should revert if incorrect createAmount is provided', async function () {
        const now = await latestBlockTimestamp()
        const start = now.add(10)
        const end = addMonths(now, 1)
        const rate = toGRT('5')
        const createData = ethers.utils.defaultAbiCoder.encode(['uint64', 'uint64', 'uint128'], [start, end, rate])

        const initialAmount = zero
        const recurringAmount = rate.mul(end.sub(start))
        const createAmount = zero

        await expect(
          recurringPayments
            .connect(user1.signer)
            .create(paymentTypeName, initialAmount, recurringAmount, createAmount, createData),
        ).to.be.revertedWith('ERC20: transfer amount exceeds balance')
      })

      it('should create a recurring payment with no initial amount', async function () {
        const now = await latestBlockTimestamp()
        const start = now.add(10)
        const end = addMonths(now, 1)
        const rate = toGRT('5')
        const createData = ethers.utils.defaultAbiCoder.encode(['uint64', 'uint64', 'uint128'], [start, end, rate])

        const initialAmount = zero
        const recurringAmount = rate.mul(end.sub(start))
        const createAmount = rate.mul(end.sub(start))

        // Before state
        const beforeSubscriptionsBalance = await token.balanceOf(subscriptions.address)
        const beforeSubscription = await subscriptions.subscriptions(user1.address)
        expect(beforeSubscription.start).to.equal(zero)

        // Create RP
        await token.connect(user1.signer).approve(recurringPayments.address, createAmount)
        await createRP(
          user1,
          user1.address,
          recurringPayments,
          token,
          paymentTypeName,
          initialAmount,
          recurringAmount,
          createAmount,
          createData,
        )

        // After state
        const afterSubscriptionsBalance = await token.balanceOf(subscriptions.address)
        const afterSubscription = await subscriptions.subscriptions(user1.address)

        // Subscription state
        expect(afterSubscriptionsBalance).to.equal(beforeSubscriptionsBalance.add(createAmount))
        expect(afterSubscription.start).to.equal(start)
        expect(afterSubscription.end).to.equal(end)
        expect(afterSubscription.rate).to.equal(rate)
      })

      it('should create a recurring payment with an initial amount', async function () {
        const now = await latestBlockTimestamp()
        const start = now.add(10)
        const end = addMonths(now, 1)
        const rate = toGRT('5')
        const createData = ethers.utils.defaultAbiCoder.encode(['uint64', 'uint64', 'uint128'], [start, end, rate])

        const initialAmount = oneHundred
        const recurringAmount = oneHundred
        const createAmount = rate.mul(end.sub(start))

        const newEnd = end.add(initialAmount.div(rate))

        // Before state
        const beforeSubscriptionsBalance = await token.balanceOf(subscriptions.address)
        const beforeSubscription = await subscriptions.subscriptions(user1.address)
        expect(beforeSubscription.start).to.equal(zero)

        // Create RP
        await token.connect(user1.signer).approve(recurringPayments.address, createAmount.add(initialAmount))
        await createRP(
          user1,
          user1.address,
          recurringPayments,
          token,
          paymentTypeName,
          initialAmount,
          recurringAmount,
          createAmount,
          createData,
        )

        // After state
        const afterSubscriptionsBalance = await token.balanceOf(subscriptions.address)
        const afterSubscription = await subscriptions.subscriptions(user1.address)

        // Subscription state
        expect(afterSubscriptionsBalance).to.equal(beforeSubscriptionsBalance.add(createAmount).add(initialAmount))
        expect(afterSubscription.start).to.equal(start)
        expect(afterSubscription.end).to.equal(newEnd)
        expect(afterSubscription.rate).to.equal(rate)
      })
    })

    describe('execute()', function () {
      beforeEach(async function () {
        const now = await latestBlockTimestamp()
        const start = now
        const end = addMonths(start, 1)
        const rate = toGRT('5')
        const createData = ethers.utils.defaultAbiCoder.encode(['uint64', 'uint64', 'uint128'], [start, end, rate])
        const createAmount = rate.mul(end.sub(start))
        const recurringAmount = createAmount

        await token.connect(user1.signer).approve(recurringPayments.address, hundredMillion)
        await createRP(
          user1,
          user1.address,
          recurringPayments,
          token,
          paymentTypeName,
          zero,
          recurringAmount,
          createAmount,
          createData,
        )
      })

      it('should allow execution by any party if executionInterval has passed', async function () {
        // Execute once to set lastExecutedAt to a non-zero value
        await executeRP(me, user1.address, recurringPayments, token)

        const recurringPayment = await recurringPayments.recurringPayments(user1.address)

        // Time travel to next execution time and execute it a few times
        for (let index = 0; index < 5; index++) {
          // Before state
          const beforeSubscription = await subscriptions.subscriptions(user1.address)

          await time.increaseTo(await recurringPayments.getNextExecutionTime(user1.address))
          await executeRP(me, user1.address, recurringPayments, token)

          // After state
          const afterSubscription = await subscriptions.subscriptions(user1.address)

          // Check
          expect(afterSubscription.rate).to.equal(beforeSubscription.rate)
          expect(afterSubscription.start).to.equal(beforeSubscription.start)
          expect(afterSubscription.end).to.equal(
            beforeSubscription.end.add(recurringPayment.recurringAmount.div(beforeSubscription.rate)),
          )
        }
      })
    })
  })
})
