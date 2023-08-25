import { expect } from 'chai'
import { it } from 'mocha'
import hre from 'hardhat'
import '@nomicfoundation/hardhat-chai-matchers'
import { setBalance } from '@nomicfoundation/hardhat-network-helpers'
import { Contract } from 'ethers'

import { deployMockGelatoNetwork } from '../../utils/gelato'
import * as deployment from '../../utils/deploy'
import { getAccounts, Account, toGRT } from '../../utils/helpers'
import { getPaymentTypeId } from '../../utils/recurring'

import { Billing } from '../../build/types'
import { RecurringPayments } from '../../build/types/contracts/RecurringPayments'

const { ethers } = hre

describe('RecurringPayments: Contract', () => {
  let me: Account
  let governor: Account
  let gelatoNetwork: Account
  let user1: Account
  let collector: Account
  let l2TokenGatewayMock: Account

  let token: Contract
  let automate: Contract
  let recurringPayments: RecurringPayments
  let billing: Billing

  const tenBillion = toGRT('10000000000')
  const oneHundred = toGRT('100')
  const ten = toGRT('10')
  const oneMillion = toGRT('1000000')

  const initialMaxGasPrice = ethers.utils.parseUnits('3.5', 'gwei')
  const newMaxGasPrice = ethers.utils.parseUnits('4.2', 'gwei')
  const tooDamnHighGasPrice = ethers.utils.parseUnits('100', 'gwei')
  const initialExecutionInterval = 2
  const initialExpirationInterval = 13
  const newExecutionInterval = 1
  const newExpirationInterval = 6

  beforeEach(async function () {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[me, governor, gelatoNetwork, user1, collector, l2TokenGatewayMock] = await getAccounts()

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
      [collector.address, token.address, governor.address, l2TokenGatewayMock.address],
      me.signer,
      true,
    )

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
    it('should set the executionInterval', async function () {
      const tx = recurringPayments.connect(governor.signer).setExecutionInterval(newExecutionInterval)

      await expect(tx).to.emit(recurringPayments, 'ExecutionIntervalSet').withArgs(newExecutionInterval)
      expect(await recurringPayments.executionInterval()).to.eq(newExecutionInterval)
    })

    it('should set the expirationInterval', async function () {
      const tx = recurringPayments.connect(governor.signer).setExpirationInterval(newExpirationInterval)

      await expect(tx).to.emit(recurringPayments, 'ExpirationIntervalSet').withArgs(newExpirationInterval)
      expect(await recurringPayments.expirationInterval()).to.eq(newExpirationInterval)
    })
  })

  describe('getters', function () {
    it('should return the payment type id', async function () {
      const paymentTypeName = 'Billing1.0'
      const paymentTypeId = getPaymentTypeId(paymentTypeName)

      expect(await recurringPayments.getPaymentTypeId(paymentTypeName)).to.eq(paymentTypeId)
    })

    it.skip('should properly test getNextExecutionTime()')
    it.skip('should properly test getExpirationTime()')
  })

  describe('payment types', function () {
    it('should prevent registering payment types if contract address is not a contract', async function () {
      const tx = recurringPayments.connect(governor.signer).registerPaymentType('Billing1.0', me.address, token.address)
      await expect(tx).to.be.revertedWithCustomError(recurringPayments, 'AddressNotAContract')
    })

    it('should prevent registering payment types if token address is not a contract', async function () {
      const tx = recurringPayments
        .connect(governor.signer)
        .registerPaymentType('Billing1.0', billing.address, me.address)
      await expect(tx).to.be.revertedWithCustomError(recurringPayments, 'AddressNotAContract')
    })

    it('should prevent unauthorized parties to register a payment type', async function () {
      const tx = recurringPayments.connect(me.signer).registerPaymentType('Billing1.0', billing.address, token.address)
      await expect(tx).to.be.revertedWith('Only Governor can call')
    })

    it('should allow the governor to to register a payment type', async function () {
      const paymentTypeName = 'Billing1.0'
      const paymentTypeId = getPaymentTypeId(paymentTypeName)

      const tx = recurringPayments
        .connect(governor.signer)
        .registerPaymentType(paymentTypeName, billing.address, token.address)
      await expect(tx)
        .to.emit(recurringPayments, 'PaymentTypeRegistered')
        .withArgs(paymentTypeId, paymentTypeName, billing.address, token.address)

      // Check RP contract state
      const paymentType = await recurringPayments.paymentTypes(paymentTypeId)
      expect(paymentType.id).to.equal(paymentTypeId)
      expect(paymentType.name).to.equal(paymentTypeName)
      expect(paymentType.contractAddress).to.equal(billing.address)
      expect(paymentType.tokenAddress).to.equal(token.address)

      // Check RP contract allowance
      const rpAllowance = await token.allowance(recurringPayments.address, billing.address)
      expect(rpAllowance).to.equal(ethers.constants.MaxUint256)
    })

    it('should not allow registering the same payment type twice', async function () {
      const paymentTypeName = 'Billing1.0'
      const paymentTypeId = getPaymentTypeId(paymentTypeName)

      const tx = recurringPayments
        .connect(governor.signer)
        .registerPaymentType(paymentTypeName, billing.address, token.address)
      await expect(tx)
        .to.emit(recurringPayments, 'PaymentTypeRegistered')
        .withArgs(paymentTypeId, paymentTypeName, billing.address, token.address)

      const tx2 = recurringPayments
        .connect(governor.signer)
        .registerPaymentType(paymentTypeName, billing.address, token.address)
      await expect(tx2).to.be.revertedWithCustomError(recurringPayments, 'PaymentTypeAlreadyRegistered')
    })

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
        .registerPaymentType(paymentTypeName, billing.address, token.address)

      // Unregister
      const tx = recurringPayments.connect(governor.signer).unregisterPaymentType(paymentTypeName)
      await expect(tx).to.emit(recurringPayments, 'PaymentTypeUnregistered').withArgs(paymentTypeId, paymentTypeName)

      // Check RP contract state
      const paymentType = await recurringPayments.paymentTypes(paymentTypeId)
      expect(paymentType.id).to.equal(0)
      expect(paymentType.name).to.equal('')
      expect(paymentType.contractAddress).to.equal(ethers.constants.AddressZero)
      expect(paymentType.tokenAddress).to.equal(ethers.constants.AddressZero)

      // Check RP allowance
      const rpAllowance = await token.allowance(recurringPayments.address, billing.address)
      expect(rpAllowance).to.equal(0)
    })
  })

  describe('recurring payments', function () {
    it.skip('should test create flows')
    it.skip('should test cancel flows')
    it.skip('should test execute flows')
    it.skip('should test check flows')
  })

  // describe('task management', function () {
  //   it('should allow anyone set automate contract address', async function () {
  //     expect(await recurringPayments.automate()).to.eq(automate.address)

  //     await recurringPayments.connect(governor.signer).registerPaymentType('Billing1.0', billing.address, token.address)
  //     await recurringPayments.connect(me.signer).create('Billing1.0', toGRT(0), toGRT(100))
  //     console.log('---------------------------------------------------')
  //     console.log(await billing.userBalances(me.address))
  //     console.log(await recurringPayments.connect(me.signer).recurringPayments(me.address))

  //     await token.connect(me.signer).approve(recurringPayments.address, toGRT(100))
  //     const tx = await recurringPayments.connect(me.signer).execute(me.address)
  //     const receipt = await tx.wait()
  //     console.log(`Gas used in execute tx: ${receipt.gasUsed.toString()}`)
  //     const erc20Tx = await token.connect(me.signer).transfer(collector.address, toGRT(100))
  //     const erc20Receipt = await erc20Tx.wait()
  //     console.log(`Gas used in ERC20 tx: ${erc20Receipt.gasUsed.toString()}`)
  //     console.log('---------------------------------------------------')
  //     console.log(await billing.userBalances(me.address))
  //     console.log(await recurringPayments.connect(me.signer).recurringPayments(me.address))
  //   })
  // })
})
