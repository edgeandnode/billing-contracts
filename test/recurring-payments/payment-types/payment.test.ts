import { expect } from 'chai'
import hre from 'hardhat'
import '@nomicfoundation/hardhat-chai-matchers'
import { setBalance, time } from '@nomicfoundation/hardhat-network-helpers'
import { Contract } from 'ethers'

import { deployMockGelatoNetwork } from '../../../utils/gelato'
import * as deployment from '../../../utils/deploy'
import { getAccounts, Account, toGRT } from '../../../utils/helpers'

import { RecurringPayments } from '../../../build/types/contracts/RecurringPayments'
import { PaymentMock } from '../../../build/types'
import { buildCheckExecPayload, createRP, executeRP } from '../lib'

const { ethers } = hre

describe('RecurringPayments: payment types', () => {
  let me: Account
  let governor: Account
  let gelatoNetwork: Account
  let user1: Account

  let token: Contract
  let automate: Contract
  let payment: PaymentMock
  let recurringPayments: RecurringPayments

  let createData: string

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
    ;[me, governor, gelatoNetwork, user1] = await getAccounts()

    createData = ethers.utils.defaultAbiCoder.encode(['address'], [user1.address])

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

    await token.connect(me.signer).transfer(user1.address, oneMillion)
    await setBalance(me.address, oneHundred)
    await setBalance(governor.address, oneHundred)
  })

  describe('Payment type: Mock Payment', function () {
    const paymentTypeName = 'Billing1.0'
    const emptyData = ethers.utils.defaultAbiCoder.encode([], [])

    beforeEach(async function () {
      await recurringPayments
        .connect(governor.signer)
        .registerPaymentType(paymentTypeName, payment.address, token.address, true)
    })

    describe('create()', function () {
      it('should revert if recurring amount is zero', async function () {
        const tx = recurringPayments.connect(user1.signer).create(paymentTypeName, zero, zero, emptyData)
        await expect(tx).to.be.revertedWithCustomError(recurringPayments, 'InvalidZeroAmount')
      })

      it('should revert if payment type does not exist', async function () {
        const tx = recurringPayments.connect(user1.signer).create('Billing100.0', zero, oneHundred, emptyData)
        await expect(tx).to.be.revertedWithCustomError(recurringPayments, 'PaymentTypeDoesNotExist')
      })

      it('should create a recurring payment with no initial amount', async function () {
        const initialAmount = zero
        const recurringAmount = oneHundred

        // Create RP
        await createRP(
          user1,
          user1.address,
          recurringPayments,
          token,
          paymentTypeName,
          initialAmount,
          recurringAmount,
          createData,
        )
      })

      it('should create a recurring payment with an initial amount', async function () {
        const initialAmount = ten
        const recurringAmount = oneHundred

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
          createData,
        )
      })

      it('should revert if user already has a recurring payment', async function () {
        const initialAmount = zero
        const recurringAmount = oneHundred
        // Create RP
        await createRP(
          user1,
          user1.address,
          recurringPayments,
          token,
          paymentTypeName,
          initialAmount,
          recurringAmount,
          createData,
        )

        const tx = recurringPayments
          .connect(user1.signer)
          .create(paymentTypeName, initialAmount, recurringAmount, createData)

        await expect(tx).to.be.revertedWithCustomError(recurringPayments, 'RecurringPaymentAlreadyExists')
      })
    })

    describe('cancel()', function () {
      it('should revert when cancelling a non existent recurring payment', async function () {
        const tx = recurringPayments.connect(user1.signer).cancel()
        await expect(tx).to.be.revertedWithCustomError(recurringPayments, 'NoRecurringPaymentFound')
      })

      it('should allow a user to cancel their recurring payment', async function () {
        // Create RP
        await createRP(user1, user1.address, recurringPayments, token, paymentTypeName, zero, oneHundred, createData)

        const beforeRecurringPayment = await recurringPayments.recurringPayments(user1.address)

        // Cancel RP
        const tx = recurringPayments.connect(user1.signer).cancel()
        await expect(tx)
          .to.emit(recurringPayments, 'RecurringPaymentCancelled')
          .withArgs(user1.address, beforeRecurringPayment.taskId, false)

        // Check RP contract state
        const afterRecurringPayment = await recurringPayments.recurringPayments(user1.address)
        expect(afterRecurringPayment.initialAmount).to.equal(0)
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
        await createRP(user1, user1.address, recurringPayments, token, paymentTypeName, zero, oneHundred, createData)
        await token.connect(user1.signer).approve(recurringPayments.address, oneMillion)
      })

      it('should revert if gas price is too high', async function () {
        const tx = recurringPayments.connect(me.signer).execute(user1.address, { gasPrice: tooDamnHighGasPrice })
        await expect(tx).to.be.revertedWithCustomError(recurringPayments, 'GasPriceTooHigh')
      })

      it('should revert if user has no recurring payment', async function () {
        await recurringPayments.connect(user1.signer).cancel()

        const tx = recurringPayments.connect(me.signer).execute(user1.address)
        await expect(tx).to.be.revertedWithCustomError(recurringPayments, 'NoRecurringPaymentFound')
      })

      it('should allow execution by any party if executionInterval has passed', async function () {
        // Execute once to set lastExecutedAt to a non-zero value
        await executeRP(me, user1.address, recurringPayments, token)

        // Time travel to next execution time and execute it a few times
        for (let index = 0; index < 5; index++) {
          await time.increaseTo(await recurringPayments.getNextExecutionTime(user1.address))
          await executeRP(me, user1.address, recurringPayments, token)
        }
      })

      it('should prevent early execution from third parties', async function () {
        // Execute once to set lastExecutedAt to a non-zero value
        await executeRP(me, user1.address, recurringPayments, token)

        const tx = recurringPayments.connect(me.signer).execute(user1.address)
        await expect(tx).to.be.revertedWithCustomError(recurringPayments, 'RecurringPaymentInCooldown')
      })

      it('should allow early execution if the caller is the RP owner', async function () {
        // Execute once to set lastExecutedAt to a non-zero value
        await executeRP(me, user1.address, recurringPayments, token)
        await executeRP(user1, user1.address, recurringPayments, token)
      })

      it('should cancel the recurring payment if expiration time has passed', async function () {
        // Execute once to set lastExecutedAt to a non-zero value
        await executeRP(me, user1.address, recurringPayments, token)

        const recurringPayment = await recurringPayments.recurringPayments(user1.address)

        await time.increaseTo(await recurringPayments.getExpirationTime(user1.address))
        const tx = recurringPayments.connect(governor.signer).execute(user1.address)
        await expect(tx)
          .to.emit(recurringPayments, 'RecurringPaymentCancelled')
          .withArgs(user1.address, recurringPayment.taskId, true)
      })

      it('should not cancel the recurring payment if expiration time has passed but the caller is the owner', async function () {
        // Execute once to set lastExecutedAt to a non-zero value
        await executeRP(me, user1.address, recurringPayments, token)

        await time.increaseTo(await recurringPayments.getExpirationTime(user1.address))
        await executeRP(user1, user1.address, recurringPayments, token)
      })
    })
    describe('check()', function () {
      beforeEach(async function () {
        await createRP(user1, user1.address, recurringPayments, token, paymentTypeName, zero, oneHundred, createData)
        await token.connect(user1.signer).approve(recurringPayments.address, oneMillion)
      })

      it('should revert if user has no recurring payment', async function () {
        await recurringPayments.connect(user1.signer).cancel()

        const tx = recurringPayments.connect(me.signer).check(user1.address)
        await expect(tx).to.be.revertedWithCustomError(recurringPayments, 'NoRecurringPaymentFound')
      })

      it('should allow execution when executionInterval has passed', async function () {
        // Execute once to set lastExecutedAt to a non-zero value
        await executeRP(me, user1.address, recurringPayments, token)
        await time.increaseTo(await recurringPayments.getExpirationTime(user1.address))

        const [canExec, execPayload] = await recurringPayments.connect(me.signer).check(user1.address)
        expect(canExec).to.be.true
        expect(execPayload).to.eq(buildCheckExecPayload(user1.address))
      })

      it('should not allow execution when executionInterval has not passed', async function () {
        // Execute once to set lastExecutedAt to a non-zero value
        await executeRP(me, user1.address, recurringPayments, token)

        const [canExec, execPayload] = await recurringPayments.connect(me.signer).check(user1.address)
        expect(canExec).to.be.false
        expect(execPayload).to.eq(buildCheckExecPayload(user1.address))
      })
    })
  })
})
