import { expect } from 'chai'
import hre from 'hardhat'
import '@nomicfoundation/hardhat-chai-matchers'
import { anyValue } from '@nomicfoundation/hardhat-chai-matchers/withArgs'
import { BigNumber, BigNumberish, Contract } from 'ethers'

import { getPaymentTypeId } from '../../utils/recurring'
import { Account } from '../../utils/helpers'
import { RecurringPayments } from '../../build/types'

const { ethers } = hre

export async function createRP(
  signer: Account,
  user: string,
  recurringPayments: RecurringPayments,
  token: Contract,
  paymentTypeName: string,
  initialAmount: BigNumberish,
  recurringAmount: BigNumberish,
  createAmount: BigNumberish,
  createData: string,
) {
  // Before token state
  const beforeUserBalance = await token.balanceOf(user)
  const beforeRPBalance = await token.balanceOf(recurringPayments.address)

  // Tx
  const paymentType = await recurringPayments.paymentTypes(getPaymentTypeId(paymentTypeName))
  const tx = recurringPayments
    .connect(signer.signer)
    .create(paymentTypeName, initialAmount, recurringAmount, createAmount, createData)

  await expect(tx)
    .to.emit(recurringPayments, 'RecurringPaymentCreated')
    .withArgs(
      user,
      anyValue,
      paymentType.id,
      paymentType.name,
      paymentType.contractAddress,
      paymentType.tokenAddress,
      initialAmount,
      recurringAmount,
      createAmount,
      createData,
    )

  const receipt = await (await tx).wait()
  const receiptTimestamp = (await ethers.provider.getBlock(receipt.blockNumber)).timestamp

  // RP contract state
  const recurringPayment = await recurringPayments.recurringPayments(user)

  expect(recurringPayment.recurringAmount).to.equal(recurringAmount)
  expect(recurringPayment.createdAt).to.equal(receiptTimestamp)
  expect(recurringPayment.lastExecutedAt).to.equal(0)
  expect(recurringPayment.paymentType.id).to.equal(paymentType.id)
  expect(recurringPayment.paymentType.name).to.equal(paymentType.name)
  expect(recurringPayment.paymentType.contractAddress).to.equal(paymentType.contractAddress)
  expect(recurringPayment.paymentType.tokenAddress).to.equal(paymentType.tokenAddress)

  // After token state
  const afterUserBalance = await token.balanceOf(user)
  const afterRPBalance = await token.balanceOf(recurringPayments.address)

  expect(afterUserBalance).to.eq(beforeUserBalance.sub(initialAmount).sub(createAmount))
  expect(afterRPBalance).to.eq(beforeRPBalance)
}

export async function executeRP(signer: Account, user: string, recurringPayments: RecurringPayments, token: Contract) {
  // State before
  const beforeRecurringPayment = await recurringPayments.recurringPayments(user)
  const beforeUserBalance = await token.balanceOf(user)
  const beforeRPBalance = await token.balanceOf(recurringPayments.address)

  // Tx
  const tx = recurringPayments.connect(signer.signer).execute(user)
  await expect(tx).to.emit(recurringPayments, 'RecurringPaymentExecuted').withArgs(user, beforeRecurringPayment.taskId)

  const receipt = await (await tx).wait()
  const receiptTimestamp = (await ethers.provider.getBlock(receipt.blockNumber)).timestamp

  // State after
  const afterRecurringPayment = await recurringPayments.recurringPayments(user)
  const afterUserBalance = await token.balanceOf(user)
  const afterRPBalance = await token.balanceOf(recurringPayments.address)
  const afterNextExecutionTime = await recurringPayments.getNextExecutionTime(user)
  const afterExpirationTime = await recurringPayments.getExpirationTime(user)

  expect(afterRecurringPayment.recurringAmount).to.equal(beforeRecurringPayment.recurringAmount)
  expect(afterRecurringPayment.createdAt).to.equal(beforeRecurringPayment.createdAt)
  expect(afterRecurringPayment.lastExecutedAt).to.equal(receiptTimestamp)
  expect(afterRecurringPayment.paymentType.id).to.equal(beforeRecurringPayment.paymentType.id)
  expect(afterRecurringPayment.paymentType.name).to.equal(beforeRecurringPayment.paymentType.name)
  expect(afterRecurringPayment.paymentType.contractAddress).to.equal(beforeRecurringPayment.paymentType.contractAddress)
  expect(afterRecurringPayment.paymentType.tokenAddress).to.equal(beforeRecurringPayment.paymentType.tokenAddress)

  expect(afterRPBalance).to.equal(beforeRPBalance)
  expect(afterUserBalance).to.equal(beforeUserBalance.sub(beforeRecurringPayment.recurringAmount))

  expect(afterNextExecutionTime).to.equal(
    addMonths(afterRecurringPayment.lastExecutedAt, (await recurringPayments.executionInterval()).toNumber()),
  )
  expect(afterExpirationTime).to.equal(
    addMonths(afterRecurringPayment.lastExecutedAt, (await recurringPayments.expirationInterval()).toNumber()),
  )
}

export function buildCheckExecPayload(address: string) {
  return ethers.utils.solidityPack(
    ['bytes', 'bytes'],
    [ethers.utils.id('execute(address)').substring(0, 10), ethers.utils.defaultAbiCoder.encode(['address'], [address])],
  )
}

export const latestBlockTimestamp = async () => {
  const block = await hre.network.provider.send('eth_getBlockByNumber', ['latest', false])
  return BigNumber.from(block.timestamp)
}

// https://github.com/bokkypoobah/BokkyPooBahsDateTimeLibrary#addmonths
export const addMonths = (timestamp: BigNumber, months: number): BigNumber => {
  const date = new Date(timestamp.toNumber() * 1000)

  let month = date.getUTCMonth() + months
  let day = date.getUTCDate()

  const year = Math.floor((month - 1) / 12) + date.getUTCFullYear()

  month = ((month - 1) % 12) + 1

  const daysInMonth = new Date(year, month + 1, 0).getUTCDate()
  if (day > daysInMonth) {
    day = daysInMonth
  }

  const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000
  const MILLISECONDS_PER_MINUTE = 60 * 1000
  const adjustedDate = new Date(year, month, day)

  const newTimestamp = Math.floor(
    (adjustedDate.getTime() -
      adjustedDate.getTimezoneOffset() * MILLISECONDS_PER_MINUTE +
      (date.getTime() % MILLISECONDS_PER_DAY)) /
      1000,
  )
  return BigNumber.from(newTimestamp)
}
