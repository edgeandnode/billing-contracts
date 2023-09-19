import { expect } from 'chai'
import hre from 'hardhat'
import '@nomicfoundation/hardhat-chai-matchers'
import { setBalance, time } from '@nomicfoundation/hardhat-network-helpers'
import { BigNumber, Contract } from 'ethers'

import { deployMockGelatoNetwork } from '../../../utils/gelato'
import * as deployment from '../../../utils/deploy'
import { getAccounts, Account, toGRT } from '../../../utils/helpers'

import { RecurringPayments } from '../../../build/types/contracts/RecurringPayments'
import { PaymentMockNoTransferOnAddTo } from '../../../build/types'
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
  let payment: PaymentMockNoTransferOnAddTo

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
    payment = await deployment.deployPaymentMockNoTransferOnAddTo([token.address], me.signer, true)

    await token.connect(me.signer).transfer(user1.address, oneBillion)
    await setBalance(me.address, oneHundred)
    await setBalance(governor.address, oneHundred)
  })

  describe('Payment type: Payment mock no transfer', function () {
    const paymentTypeName = 'MockNoTx'

    beforeEach(async function () {
      await recurringPayments
        .connect(governor.signer)
        .registerPaymentType(paymentTypeName, ten, payment.address, token.address, true)
    })

    describe('execute()', function () {
      it('should revert if RP contract balance changes unexpectedly', async function () {
        const createData = ethers.utils.defaultAbiCoder.encode(['address', 'uint256'], [user1.address, ten])
        const initialAmount = zero
        const recurringAmount = oneHundred

        // Create RP
        await token.connect(user1.signer).approve(recurringPayments.address, recurringAmount.add(ten))
        await createRP(
          user1,
          user1.address,
          recurringPayments,
          token,
          paymentTypeName,
          initialAmount,
          recurringAmount,
          ten,
          createData,
        )

        await time.increaseTo(await recurringPayments.getNextExecutionTime(user1.address))
        const tx = recurringPayments.connect(user1.signer).execute(user1.address)
        await expect(tx).to.be.revertedWithCustomError(recurringPayments, 'BalanceMismatch')
      })
    })
  })
})
