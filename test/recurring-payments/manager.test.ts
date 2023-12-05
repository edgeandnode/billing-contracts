import { expect } from 'chai'
import hre from 'hardhat'
import '@nomicfoundation/hardhat-chai-matchers'
import { setBalance } from '@nomicfoundation/hardhat-network-helpers'
import { RecurringPayments } from '../../build/types/contracts/RecurringPayments'

import { deployMockGelatoNetwork } from '../../utils/gelato'
import * as deployment from '../../utils/deploy'
import { getAccounts, Account, toGRT } from '../../utils/helpers'
import { Contract } from 'ethers'

import { it } from 'mocha'

const { ethers } = hre

describe('RecurringPayments: Gelato Manager', () => {
  let me: Account
  let governor: Account
  let gelatoNetwork: Account
  let user1: Account

  let token: Contract
  let automate: Contract
  let recurringPayments: RecurringPayments

  const tenBillion = toGRT('10000000000')
  const oneHundred = toGRT('100')
  const ten = toGRT('10')
  const oneMillion = toGRT('1000000')

  const initialMaxGasPrice = ethers.utils.parseUnits('3.5', 'gwei')
  const newMaxGasPrice = ethers.utils.parseUnits('4.2', 'gwei')
  const tooDamnHighGasPrice = ethers.utils.parseUnits('100', 'gwei')

  beforeEach(async function () {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[me, governor, gelatoNetwork, user1] = await getAccounts()

    token = await deployment.deployToken([tenBillion], me.signer, true)

    automate = await deployMockGelatoNetwork(me.signer, gelatoNetwork.address)

    // Deploy RecurringPayments contract
    recurringPayments = await deployment.deployRecurringPayments(
      [automate.address, governor.address, initialMaxGasPrice, 1, 6],
      me.signer,
      true,
    )

    await token.connect(me.signer).transfer(user1.address, oneMillion)
    await setBalance(me.address, oneHundred)
    await setBalance(governor.address, oneHundred)
  })

  describe('constructor', function () {
    it('should set gelato automate contract address', async function () {
      expect(await recurringPayments.automate()).to.eq(automate.address)
    })

    it('should set governor address', async function () {
      expect(await recurringPayments.governor()).to.eq(governor.address)
    })

    it('should set the maxGasPrice', async function () {
      expect(await recurringPayments.maxGasPrice()).to.eq(initialMaxGasPrice)
    })
  })

  describe('gas price', function () {
    it('setMaxGasPrice() should set the maxGasPrice', async function () {
      const tx = recurringPayments.connect(governor.signer).setMaxGasPrice(newMaxGasPrice)

      await expect(tx).to.emit(recurringPayments, 'MaxGasPriceSet').withArgs(newMaxGasPrice)
      expect(await recurringPayments.maxGasPrice()).to.eq(newMaxGasPrice)
    })

    it('setMaxGasPrice() should revert if new maxGasPrice is 0', async function () {
      await expect(recurringPayments.connect(governor.signer).setMaxGasPrice(0)).to.be.revertedWithCustomError(
        recurringPayments,
        'GasPriceCannotBeZero',
      )
    })

    it('setMaxGasPrice() should revert if not called by governor', async function () {
      await expect(recurringPayments.connect(user1.signer).setMaxGasPrice(1)).to.be.revertedWith(
        'Only Governor can call',
      )
    })

    it('gasPrice() should revert if gas is too high', async function () {
      await expect(recurringPayments.checkGasPrice({ gasPrice: tooDamnHighGasPrice })).to.be.revertedWithCustomError(
        recurringPayments,
        'GasPriceTooHigh',
      )
    })

    it('gasPrice() should not revert if gas is not high', async function () {
      await expect(recurringPayments.checkGasPrice({ gasPrice: initialMaxGasPrice })).not.to.be.reverted
    })
  })
})
