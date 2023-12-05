import { expect } from 'chai'
import hre from 'hardhat'
import '@nomicfoundation/hardhat-chai-matchers'
import { setBalance } from '@nomicfoundation/hardhat-network-helpers'
import { Contract } from 'ethers'

import { deployMockGelatoNetwork } from '../../utils/gelato'
import * as deployment from '../../utils/deploy'
import { getAccounts, Account, toGRT } from '../../utils/helpers'
import { getPaymentTypeId } from '../../utils/recurring'

import { RecurringPayments } from '../../build/types/contracts/RecurringPayments'
import { PaymentMock } from '../../build/types'
import { addMonths, createRP } from './helpers'

const { ethers } = hre

describe('RecurringPayments: Contract', () => {
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
  const ONE_DAY_IN_SECONDS = 60 * 60 * 24
  const initialExecutionInterval = 30 * ONE_DAY_IN_SECONDS
  const initialExpirationInterval = 90 * ONE_DAY_IN_SECONDS
  const newExecutionInterval = 60 * ONE_DAY_IN_SECONDS
  const newExpirationInterval = 120 * ONE_DAY_IN_SECONDS

  beforeEach(async function () {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[me, governor, user1] = await getAccounts()

    createData = ethers.utils.defaultAbiCoder.encode(['address', 'uint256'], [user1.address, oneHundred])

    token = await deployment.deployToken([tenBillion], me.signer, true)

    automate = await deployMockGelatoNetwork(me.signer)

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

  describe('constructor', function () {
    it('should set executionInterval', async function () {
      expect(await recurringPayments.executionInterval()).to.eq(initialExecutionInterval)
    })

    it('should set expirationInterval', async function () {
      expect(await recurringPayments.expirationInterval()).to.eq(initialExpirationInterval)
    })
  })

  describe('setters', function () {
    beforeEach(async function () {
      const paymentTypeName = 'Billing1.0'

      await recurringPayments
        .connect(governor.signer)
        .registerPaymentType(paymentTypeName, ten, payment.address, token.address, true)
    })

    it('should set the executionInterval', async function () {
      // Create recurring payment, need to check executionInterval stays the same after updating the global value
      await token.connect(user1.signer).approve(recurringPayments.address, oneHundred)
      await createRP(
        user1,
        user1.address,
        recurringPayments,
        token,
        'Billing1.0',
        zero,
        oneHundred,
        oneHundred,
        createData,
      )
      const beforeExecutionInterval = await recurringPayments.executionInterval()

      const tx = recurringPayments.connect(governor.signer).setExecutionInterval(newExecutionInterval)

      await expect(tx).to.emit(recurringPayments, 'ExecutionIntervalSet').withArgs(newExecutionInterval)
      expect(await recurringPayments.executionInterval()).to.eq(newExecutionInterval)

      const recurringPayment = await recurringPayments.recurringPayments(user1.address)
      expect(recurringPayment.executionInterval).to.eq(beforeExecutionInterval)
    })

    it('should prevent setting an executionInterval >= expirationInterval', async function () {
      const expirationInterval = await recurringPayments.expirationInterval()
      const newExecutionInterval = expirationInterval.add(30 * ONE_DAY_IN_SECONDS)

      const tx = recurringPayments.connect(governor.signer).setExecutionInterval(newExecutionInterval)
      await expect(tx).to.be.revertedWithCustomError(recurringPayments, 'InvalidIntervalValue')
    })

    it('should set the expirationInterval', async function () {
      const tx = recurringPayments.connect(governor.signer).setExpirationInterval(newExpirationInterval)

      await expect(tx).to.emit(recurringPayments, 'ExpirationIntervalSet').withArgs(newExpirationInterval)
      expect(await recurringPayments.expirationInterval()).to.eq(newExpirationInterval)
    })

    it('should prevent setting an expirationInterval <= expirationInterval', async function () {
      const executionInterval = await recurringPayments.executionInterval()
      const newExpirationInterval = executionInterval.sub(1)

      const tx = recurringPayments.connect(governor.signer).setExpirationInterval(newExpirationInterval)
      await expect(tx).to.be.revertedWithCustomError(recurringPayments, 'InvalidIntervalValue')
    })
  })

  describe('getters', function () {
    it('should return the payment type id', async function () {
      const paymentTypeName = 'AGreatPaymentTypeName'
      const paymentTypeId = getPaymentTypeId(paymentTypeName)

      expect(await recurringPayments.getPaymentTypeId(paymentTypeName)).to.eq(paymentTypeId)
    })

    describe('getNextExecutionTime()', function () {
      it('should revert if user has no recurring payment', async function () {
        const tx = recurringPayments.connect(user1.signer).getNextExecutionTime(user1.address)
        await expect(tx).to.be.revertedWithCustomError(recurringPayments, 'NoRecurringPaymentFound')
      })

      it('should return the next execution time', async function () {
        const paymentTypeName = 'Billing1.0'

        await recurringPayments
          .connect(governor.signer)
          .registerPaymentType(paymentTypeName, ten, payment.address, token.address, true)

        // Create recurring payment
        await token.connect(user1.signer).approve(recurringPayments.address, oneHundred)
        await createRP(
          user1,
          user1.address,
          recurringPayments,
          token,
          paymentTypeName,
          zero,
          oneHundred,
          oneHundred,
          createData,
        )

        // Get next execution time
        const nextExecutionTime = await recurringPayments.getNextExecutionTime(user1.address)

        // Calculate next execution time
        const recurringPayment = await recurringPayments.recurringPayments(user1.address)
        const executionInterval = await recurringPayments.executionInterval()
        const calcNextExecutionTime = addMonths(recurringPayment.lastExecutedAt, executionInterval.toNumber())

        expect(nextExecutionTime).to.eq(calcNextExecutionTime)
      })
    })

    describe('getExpirationTime()', function () {
      it('should revert if user has no recurring payment', async function () {
        const tx = recurringPayments.connect(user1.signer).getExpirationTime(user1.address)
        await expect(tx).to.be.revertedWithCustomError(recurringPayments, 'NoRecurringPaymentFound')
      })

      it('should return the expiration time', async function () {
        const paymentTypeName = 'Billing1.0'

        await recurringPayments
          .connect(governor.signer)
          .registerPaymentType(paymentTypeName, ten, payment.address, token.address, true)

        // Create recurring payment
        await token.connect(user1.signer).approve(recurringPayments.address, oneHundred)
        await createRP(
          user1,
          user1.address,
          recurringPayments,
          token,
          paymentTypeName,
          zero,
          oneHundred,
          oneHundred,
          createData,
        )

        // Get expiration time
        const expirationTime = await recurringPayments.getExpirationTime(user1.address)

        // Calculate expiration time
        const recurringPayment = await recurringPayments.recurringPayments(user1.address)
        const expirationInterval = await recurringPayments.expirationInterval()
        const calcExpirationTime = addMonths(recurringPayment.lastExecutedAt, expirationInterval.toNumber())

        expect(expirationTime).to.eq(calcExpirationTime)
      })
    })
  })

  describe('payment types', function () {
    describe('registerPaymentType()', function () {
      it('should prevent registering payment types if contract address is not a contract', async function () {
        const tx = recurringPayments
          .connect(governor.signer)
          .registerPaymentType('Billing1.0', ten, me.address, token.address, true)
        await expect(tx).to.be.revertedWithCustomError(recurringPayments, 'AddressNotAContract')
      })

      it('should prevent registering payment types if token address is not a contract', async function () {
        const tx = recurringPayments
          .connect(governor.signer)
          .registerPaymentType('Billing1.0', ten, payment.address, me.address, true)
        await expect(tx).to.be.revertedWithCustomError(recurringPayments, 'AddressNotAContract')
      })

      it('should prevent unauthorized parties to register a payment type', async function () {
        const tx = recurringPayments
          .connect(me.signer)
          .registerPaymentType('Billing1.0', ten, payment.address, token.address, true)
        await expect(tx).to.be.revertedWith('Only Governor can call')
      })

      it('should allow the governor to to register a payment type', async function () {
        const paymentTypeName = 'Billing1.0'
        const paymentTypeId = getPaymentTypeId(paymentTypeName)

        const tx = recurringPayments
          .connect(governor.signer)
          .registerPaymentType(paymentTypeName, ten, payment.address, token.address, true)

        await expect(tx)
          .to.emit(recurringPayments, 'PaymentTypeRegistered')
          .withArgs(paymentTypeId, ten, paymentTypeName, payment.address, token.address)

        // Check RP contract state
        const paymentType = await recurringPayments.paymentTypes(paymentTypeId)
        expect(paymentType.id).to.equal(paymentTypeId)
        expect(paymentType.minimumRecurringAmount).to.equal(ten)
        expect(paymentType.name).to.equal(paymentTypeName)
        expect(paymentType.contractAddress).to.equal(payment.address)
        expect(paymentType.tokenAddress).to.equal(token.address)

        // Check RP contract allowance
        const rpAllowance = await token.allowance(recurringPayments.address, payment.address)
        expect(rpAllowance).to.equal(ethers.constants.MaxUint256)
      })

      it('should not allow registering the same payment type twice', async function () {
        const paymentTypeName = 'Billing1.0'
        const paymentTypeId = getPaymentTypeId(paymentTypeName)

        const tx = recurringPayments
          .connect(governor.signer)
          .registerPaymentType(paymentTypeName, ten, payment.address, token.address, true)
        await expect(tx)
          .to.emit(recurringPayments, 'PaymentTypeRegistered')
          .withArgs(paymentTypeId, ten, paymentTypeName, payment.address, token.address)

        const tx2 = recurringPayments
          .connect(governor.signer)
          .registerPaymentType(paymentTypeName, ten, payment.address, token.address, true)
        await expect(tx2).to.be.revertedWithCustomError(recurringPayments, 'PaymentTypeAlreadyRegistered')
      })
    })
    describe('unregisterPaymentType()', function () {
      it('should prevent unauthorized parties to unregister a payment type', async function () {
        const tx = recurringPayments.connect(me.signer).unregisterPaymentType('Billing1.0')
        await expect(tx).to.be.revertedWith('Only Governor can call')
      })

      it('should revert when unregistering a non existing payment type', async function () {
        const tx = recurringPayments.connect(governor.signer).unregisterPaymentType('Billing7.0')
        await expect(tx).to.be.revertedWithCustomError(recurringPayments, 'PaymentTypeDoesNotExist')
      })

      it('should prevent unauthorized parties to unregister a payment type', async function () {
        const paymentTypeName = 'Billing1.0'
        const paymentTypeId = getPaymentTypeId(paymentTypeName)

        // Register
        await recurringPayments
          .connect(governor.signer)
          .registerPaymentType(paymentTypeName, ten, payment.address, token.address, true)

        // Unregister
        const tx = recurringPayments.connect(governor.signer).unregisterPaymentType(paymentTypeName)
        await expect(tx).to.emit(recurringPayments, 'PaymentTypeUnregistered').withArgs(paymentTypeId, paymentTypeName)

        // Check RP contract state
        const paymentType = await recurringPayments.paymentTypes(paymentTypeId)
        expect(paymentType.id).to.equal(0)
        expect(paymentType.minimumRecurringAmount).to.equal(0)
        expect(paymentType.name).to.equal('')
        expect(paymentType.contractAddress).to.equal(ethers.constants.AddressZero)
        expect(paymentType.tokenAddress).to.equal(ethers.constants.AddressZero)

        // Check RP allowance
        const rpAllowance = await token.allowance(recurringPayments.address, payment.address)
        expect(rpAllowance).to.equal(0)
      })
    })

    describe('setMinimumRecurringAmount()', function () {
      it('should prevent unauthorized parties to change the minimum recurring amount', async function () {
        const tx = recurringPayments.connect(me.signer).setMinimumRecurringAmount('Billing1.0', oneHundred)
        await expect(tx).to.be.revertedWith('Only Governor can call')
      })

      it('should allow governor to change the minimum recurring amount', async function () {
        const paymentTypeName = 'Billing1.0'
        const paymentTypeId = getPaymentTypeId(paymentTypeName)
        const newMinimumRecurringAmount = oneHundred

        // Register
        await recurringPayments
          .connect(governor.signer)
          .registerPaymentType(paymentTypeName, ten, payment.address, token.address, true)

        // Change minimum recurring amount
        const tx = recurringPayments
          .connect(governor.signer)
          .setMinimumRecurringAmount(paymentTypeName, newMinimumRecurringAmount)
        await expect(tx)
          .to.emit(recurringPayments, 'MinimumRecurringAmountSet')
          .withArgs(paymentTypeId, paymentTypeName, newMinimumRecurringAmount)

        // Check RP contract state
        const paymentType = await recurringPayments.paymentTypes(paymentTypeId)
        expect(paymentType.minimumRecurringAmount).to.eq(newMinimumRecurringAmount)
      })
    })
  })
})
