import { expect } from 'chai'
import hre from 'hardhat'
import '@nomicfoundation/hardhat-chai-matchers'
import { setBalance, time } from '@nomicfoundation/hardhat-network-helpers'
import { BigNumber, Contract } from 'ethers'

import { deployMockGelatoNetwork } from '../../../utils/gelato'
import * as deployment from '../../../utils/deploy'
import { getAccounts, Account, toGRT } from '../../../utils/helpers'

import { RecurringPayments } from '../../../build/types/contracts/RecurringPayments'
import { Billing, PaymentMock, Subscriptions } from '../../../build/types'
import { addMonths, buildCheckExecPayload, createRP, executeRP, latestBlockTimestamp } from '../helpers'

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
  let payment: PaymentMock
  let billing: Billing
  let subscriptions: Subscriptions
  let recurringPayments: RecurringPayments

  let createData: string
  let subsData: string
  const emptyData = ethers.utils.defaultAbiCoder.encode([], [])

  const zero = toGRT('0')
  const five = toGRT('5')
  const ten = toGRT('10')
  const oneHundred = toGRT('100')
  const oneMillion = toGRT('1000000')
  const hundredMillion = toGRT('100000000')
  const oneBillion = toGRT('1000000000')
  const tenBillion = toGRT('10000000000')

  const initialMaxGasPrice = ethers.utils.parseUnits('3.5', 'gwei')
  const ONE_DAY_IN_SECONDS = 60 * 60 * 24
  const initialExecutionInterval = 30 * ONE_DAY_IN_SECONDS
  const initialExpirationInterval = 90 * ONE_DAY_IN_SECONDS
  const tooDamnHighGasPrice = ethers.utils.parseUnits('100', 'gwei')
  const subscriptionsEpochSeconds = BigNumber.from(100)

  const testPaymentTypes = [
    {
      name: 'PaymentMock',
      contractAddress: '',
      requiresCreate: true,
      createData: createData,
      createAmount: toGRT(0),
    },
    {
      name: 'Billing1.0',
      contractAddress: '',
      requiresCreate: false,
      createData: emptyData,
      createAmount: toGRT(0),
    },
    {
      name: 'Billing2.0',
      contractAddress: '',
      requiresCreate: true,
      createData: subsData,
      createApproval: BigNumber.from(0),
      createAmount: BigNumber.from(0),
      recurringAmount: BigNumber.from(0),
    },
  ]

  beforeEach(async function () {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[me, governor, gelatoNetwork, user1, collector1, l2TokenGatewayMock] = await getAccounts()
    const now = await latestBlockTimestamp()
    const start = now
    const end = addMonths(start, 30 * ONE_DAY_IN_SECONDS)
    const rate = toGRT('5')
    subsData = ethers.utils.defaultAbiCoder.encode(['uint64', 'uint64', 'uint128'], [start, end, rate])
    token = await deployment.deployToken([tenBillion], me.signer, true)

    automate = await deployMockGelatoNetwork(me.signer, gelatoNetwork.address)

    // Deploy RecurringPayments contract
    recurringPayments = await deployment.deployRecurringPayments(
      [automate.address, governor.address, initialMaxGasPrice, initialExecutionInterval, initialExpirationInterval],
      me.signer,
      true,
    )

    // Deploy payment contracts
    payment = await deployment.deployPaymentMock([token.address], me.signer, true)

    billing = await deployment.deployBilling(
      [collector1.address, token.address, governor.address, l2TokenGatewayMock.address],
      me.signer,
      true,
    )

    subscriptions = await deployment.deploySubscriptions(
      [token.address, subscriptionsEpochSeconds, recurringPayments.address],
      me.signer,
      true,
    )

    // Airdrop
    await token.connect(me.signer).transfer(user1.address, oneBillion)
    await setBalance(me.address, oneHundred)
    await setBalance(governor.address, oneHundred)

    // Init payment type array
    createData = ethers.utils.defaultAbiCoder.encode(['address', 'uint256'], [user1.address, ten])
    testPaymentTypes[0].createData = createData
    testPaymentTypes[0].createAmount = ten
    testPaymentTypes[0].contractAddress = payment.address
    testPaymentTypes[1].contractAddress = billing.address
    testPaymentTypes[2].contractAddress = subscriptions.address
    testPaymentTypes[2].createData = subsData
    testPaymentTypes[2].recurringAmount = rate.mul(end.sub(start))
    testPaymentTypes[2].createAmount = rate.mul(end.sub(start))
    testPaymentTypes[2].createApproval = rate.mul(end.sub(start))
  })

  for (const testPaymentType of testPaymentTypes) {
    describe(`Payment type: ${testPaymentType.name}`, function () {
      beforeEach(async function () {
        await recurringPayments
          .connect(governor.signer)
          .registerPaymentType(
            testPaymentType.name,
            ten,
            testPaymentType.contractAddress,
            token.address,
            testPaymentType.requiresCreate,
          )
      })

      describe('create()', function () {
        it('should revert if recurring amount is zero', async function () {
          const tx = recurringPayments.connect(user1.signer).create(testPaymentType.name, zero, zero, zero, emptyData)
          await expect(tx).to.be.revertedWithCustomError(recurringPayments, 'InvalidZeroAmount')
        })

        it('should revert if payment type does not exist', async function () {
          const tx = recurringPayments.connect(user1.signer).create('Billing100.0', zero, oneHundred, zero, emptyData)
          await expect(tx).to.be.revertedWithCustomError(recurringPayments, 'PaymentTypeDoesNotExist')
        })

        it('should revert if recurring amount is too low', async function () {
          const tx = recurringPayments.connect(user1.signer).create(testPaymentType.name, zero, five, zero, emptyData)
          await expect(tx).to.be.revertedWithCustomError(recurringPayments, 'RecurringAmountTooLow')
        })

        it('should create a recurring payment with no initial amount', async function () {
          const initialAmount = zero
          const recurringAmount = oneHundred

          // Create RP
          await token
            .connect(user1.signer)
            .approve(recurringPayments.address, initialAmount.add(testPaymentType.createAmount))

          await createRP(
            user1,
            user1.address,
            recurringPayments,
            token,
            testPaymentType.name,
            initialAmount,
            recurringAmount,
            testPaymentType.createAmount,
            testPaymentType.createData,
          )
        })

        it('should create a recurring payment with an initial amount', async function () {
          const initialAmount = ten
          const recurringAmount = oneHundred

          // Create RP
          await token
            .connect(user1.signer)
            .approve(recurringPayments.address, initialAmount.add(testPaymentType.createAmount))
          await createRP(
            user1,
            user1.address,
            recurringPayments,
            token,
            testPaymentType.name,
            initialAmount,
            recurringAmount,
            testPaymentType.createAmount,
            testPaymentType.createData,
          )
        })

        it('should revert if user already has a recurring payment', async function () {
          const initialAmount = zero
          const recurringAmount = oneHundred
          // Create RP
          await token
            .connect(user1.signer)
            .approve(recurringPayments.address, initialAmount.add(testPaymentType.createAmount))
          await createRP(
            user1,
            user1.address,
            recurringPayments,
            token,
            testPaymentType.name,
            initialAmount,
            recurringAmount,
            testPaymentType.createAmount,
            testPaymentType.createData,
          )

          const tx = recurringPayments
            .connect(user1.signer)
            .create(
              testPaymentType.name,
              initialAmount,
              recurringAmount,
              testPaymentType.createAmount,
              testPaymentType.createData,
            )

          await expect(tx).to.be.revertedWithCustomError(recurringPayments, 'RecurringPaymentAlreadyExists')
        })
      })

      describe('cancel()', function () {
        it('should revert when cancelling a non existent recurring payment', async function () {
          const tx = recurringPayments.connect(user1.signer)['cancel()']()
          await expect(tx).to.be.revertedWithCustomError(recurringPayments, 'NoRecurringPaymentFound')
        })

        it('should allow a user to cancel their recurring payment', async function () {
          const initialAmount = zero
          // Create RP
          await token
            .connect(user1.signer)
            .approve(recurringPayments.address, initialAmount.add(testPaymentType.createAmount))
          await createRP(
            user1,
            user1.address,
            recurringPayments,
            token,
            testPaymentType.name,
            initialAmount,
            oneHundred,
            testPaymentType.createAmount,
            testPaymentType.createData,
          )

          const beforeRecurringPayment = await recurringPayments.recurringPayments(user1.address)

          // Cancel RP
          const tx = recurringPayments.connect(user1.signer)['cancel()']()
          await expect(tx)
            .to.emit(recurringPayments, 'RecurringPaymentCancelled')
            .withArgs(user1.address, beforeRecurringPayment.taskId, false)

          // Check RP contract state
          const afterRecurringPayment = await recurringPayments.recurringPayments(user1.address)
          expect(afterRecurringPayment.recurringAmount).to.equal(0)
          expect(afterRecurringPayment.createdAt).to.equal(0)
          expect(afterRecurringPayment.lastExecutedAt).to.equal(0)
          expect(afterRecurringPayment.paymentType.id).to.equal(0)
          expect(afterRecurringPayment.paymentType.name).to.equal('')
          expect(afterRecurringPayment.paymentType.contractAddress).to.equal(ethers.constants.AddressZero)
          expect(afterRecurringPayment.paymentType.tokenAddress).to.equal(ethers.constants.AddressZero)
        })

        it('should prevent third parties to cancel an arbitrary recurring payment', async function () {
          const initialAmount = zero
          // Create RP
          await token
            .connect(user1.signer)
            .approve(recurringPayments.address, initialAmount.add(testPaymentType.createAmount))
          await createRP(
            user1,
            user1.address,
            recurringPayments,
            token,
            testPaymentType.name,
            initialAmount,
            oneHundred,
            testPaymentType.createAmount,
            testPaymentType.createData,
          )

          // Cancel RP
          const tx = recurringPayments.connect(collector1.signer)['cancel(address)'](user1.address)
          await expect(tx).to.be.revertedWith('Only Governor can call')
        })

        it('should allow the governor to cancel any recurring payment', async function () {
          const initialAmount = zero
          // Create RP
          await token
            .connect(user1.signer)
            .approve(recurringPayments.address, initialAmount.add(testPaymentType.createAmount))
          await createRP(
            user1,
            user1.address,
            recurringPayments,
            token,
            testPaymentType.name,
            initialAmount,
            oneHundred,
            testPaymentType.createAmount,
            testPaymentType.createData,
          )

          const beforeRecurringPayment = await recurringPayments.recurringPayments(user1.address)

          // Cancel RP
          const tx = recurringPayments.connect(governor.signer)['cancel(address)'](user1.address)
          await expect(tx)
            .to.emit(recurringPayments, 'RecurringPaymentCancelled')
            .withArgs(user1.address, beforeRecurringPayment.taskId, false)

          // Check RP contract state
          const afterRecurringPayment = await recurringPayments.recurringPayments(user1.address)
          expect(afterRecurringPayment.recurringAmount).to.equal(0)
          expect(afterRecurringPayment.createdAt).to.equal(0)
          expect(afterRecurringPayment.lastExecutedAt).to.equal(0)
          expect(afterRecurringPayment.paymentType.id).to.equal(0)
          expect(afterRecurringPayment.paymentType.name).to.equal('')
          expect(afterRecurringPayment.paymentType.contractAddress).to.equal(ethers.constants.AddressZero)
          expect(afterRecurringPayment.paymentType.tokenAddress).to.equal(ethers.constants.AddressZero)
        })
      })

      describe('execute()', function () {
        beforeEach(async function () {
          const recurringAmount = testPaymentType.recurringAmount ?? oneHundred
          await token
            .connect(user1.signer)
            .approve(recurringPayments.address, recurringAmount.add(testPaymentType.createAmount))
          await createRP(
            user1,
            user1.address,
            recurringPayments,
            token,
            testPaymentType.name,
            zero,
            recurringAmount,
            testPaymentType.createAmount,
            testPaymentType.createData,
          )
        })

        it('should revert if gas price is too high', async function () {
          const tx = recurringPayments.connect(me.signer).execute(user1.address, { gasPrice: tooDamnHighGasPrice })
          await expect(tx).to.be.revertedWithCustomError(recurringPayments, 'GasPriceTooHigh')
        })

        it('should revert if user has no recurring payment', async function () {
          await recurringPayments.connect(user1.signer)['cancel()']()

          const tx = recurringPayments.connect(me.signer).execute(user1.address)
          await expect(tx).to.be.revertedWithCustomError(recurringPayments, 'NoRecurringPaymentFound')
        })

        it('should allow execution by any party if executionInterval has passed', async function () {
          const times = 5
          const recurringAmount = testPaymentType.recurringAmount ?? oneHundred
          await token.connect(user1.signer).approve(recurringPayments.address, recurringAmount.mul(times + 1))

          // Time travel to next execution time and execute it a few times
          for (let index = 0; index < times; index++) {
            await time.increaseTo(await recurringPayments.getNextExecutionTime(user1.address))
            await executeRP(me, user1.address, recurringPayments, token)
          }
        })

        it('should prevent early execution from third parties', async function () {
          const recurringAmount = testPaymentType.recurringAmount ?? oneHundred
          await token.connect(user1.signer).approve(recurringPayments.address, recurringAmount)

          const tx = recurringPayments.connect(me.signer).execute(user1.address)
          await expect(tx).to.be.revertedWithCustomError(recurringPayments, 'RecurringPaymentInCooldown')
        })

        it('should allow early execution if the caller is the RP owner', async function () {
          const recurringAmount = testPaymentType.recurringAmount ?? oneHundred
          await token.connect(user1.signer).approve(recurringPayments.address, recurringAmount.mul(2))

          await executeRP(user1, user1.address, recurringPayments, token)
        })

        it('should cancel the recurring payment if expiration time has passed', async function () {
          const recurringAmount = testPaymentType.recurringAmount ?? oneHundred
          await token.connect(user1.signer).approve(recurringPayments.address, recurringAmount)

          const recurringPayment = await recurringPayments.recurringPayments(user1.address)

          await time.increaseTo(await recurringPayments.getExpirationTime(user1.address))
          const tx = recurringPayments.connect(me.signer).execute(user1.address)
          await expect(tx)
            .to.emit(recurringPayments, 'RecurringPaymentCancelled')
            .withArgs(user1.address, recurringPayment.taskId, true)

          const afterRecurringPayment = await recurringPayments.recurringPayments(user1.address)
          expect(afterRecurringPayment.createdAt).to.equal(0)
        })

        it('should not cancel the recurring payment if expiration time has passed but the caller is the owner', async function () {
          const recurringAmount = testPaymentType.recurringAmount ?? oneHundred
          await token.connect(user1.signer).approve(recurringPayments.address, recurringAmount.mul(2))

          await time.increaseTo(await recurringPayments.getExpirationTime(user1.address))
          try {
            await executeRP(user1, user1.address, recurringPayments, token)
          } catch (error) {}

          const recurringPayment = await recurringPayments.recurringPayments(user1.address)
          expect(recurringPayment.createdAt).not.to.equal(0)
        })
      })

      describe('check()', function () {
        beforeEach(async function () {
          await token.connect(user1.signer).approve(recurringPayments.address, zero.add(testPaymentType.createAmount))
          await createRP(
            user1,
            user1.address,
            recurringPayments,
            token,
            testPaymentType.name,
            zero,
            oneHundred,
            testPaymentType.createAmount,
            testPaymentType.createData,
          )
          await token.connect(user1.signer).approve(recurringPayments.address, oneMillion)
        })

        it('should not allow execution if user has no recurring payment', async function () {
          await recurringPayments.connect(user1.signer)['cancel()']()

          const [canExec, execPayload] = await recurringPayments.connect(me.signer).check(user1.address)
          expect(canExec).to.be.false
          expect(execPayload).to.eq('0x')
        })

        it('should allow execution when executionInterval has passed', async function () {
          await time.increaseTo(await recurringPayments.getNextExecutionTime(user1.address))

          const [canExec, execPayload] = await recurringPayments.connect(me.signer).check(user1.address)
          expect(canExec).to.be.true
          expect(execPayload).to.eq(buildCheckExecPayload(user1.address))
        })

        it('should not allow execution when executionInterval has not passed', async function () {
          const [canExec, execPayload] = await recurringPayments.connect(me.signer).check(user1.address)
          expect(canExec).to.be.false
          expect(execPayload).to.eq('0x')
        })

        it('should not allow execution if user allowance is not enough', async function () {
          await token.connect(user1.signer).approve(recurringPayments.address, zero)

          const [canExec, execPayload] = await recurringPayments.connect(me.signer).check(user1.address)
          expect(canExec).to.be.false
          expect(execPayload).to.eq('0x')
        })

        it('should not allow execution if user balance is not enough', async function () {
          const userBalance = await token.balanceOf(user1.address)
          await token.connect(user1.signer).transfer(governor.address, userBalance)

          const [canExec, execPayload] = await recurringPayments.connect(me.signer).check(user1.address)
          expect(canExec).to.be.false
          expect(execPayload).to.eq('0x')
        })
      })
    })
  }
})
