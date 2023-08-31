import { expect } from 'chai'
import hre from 'hardhat'
import '@nomicfoundation/hardhat-chai-matchers'
import { anyValue } from '@nomicfoundation/hardhat-chai-matchers/withArgs'
import { BigNumberish, Contract } from 'ethers'

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
  createData: string,
) {
  // Before token state
  const beforeUserBalance = await token.balanceOf(user)
  const beforeRPBalance = await token.balanceOf(recurringPayments.address)

  // Tx
  const paymentType = await recurringPayments.paymentTypes(getPaymentTypeId(paymentTypeName))
  const tx = recurringPayments
    .connect(signer.signer)
    .create(paymentTypeName, initialAmount, recurringAmount, createData)

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
    )

  const receipt = await (await tx).wait()
  const receiptTimestamp = (await ethers.provider.getBlock(receipt.blockNumber)).timestamp

  // RP contract state
  const recurringPayment = await recurringPayments.recurringPayments(user)

  expect(recurringPayment.initialAmount).to.equal(initialAmount)
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

  expect(afterUserBalance).to.eq(beforeUserBalance.sub(initialAmount))
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

  expect(afterRecurringPayment.initialAmount).to.equal(beforeRecurringPayment.initialAmount)
  expect(afterRecurringPayment.recurringAmount).to.equal(beforeRecurringPayment.recurringAmount)
  expect(afterRecurringPayment.createdAt).to.equal(beforeRecurringPayment.createdAt)
  expect(afterRecurringPayment.lastExecutedAt).to.equal(receiptTimestamp)
  expect(afterRecurringPayment.paymentType.id).to.equal(beforeRecurringPayment.paymentType.id)
  expect(afterRecurringPayment.paymentType.name).to.equal(beforeRecurringPayment.paymentType.name)
  expect(afterRecurringPayment.paymentType.contractAddress).to.equal(beforeRecurringPayment.paymentType.contractAddress)
  expect(afterRecurringPayment.paymentType.tokenAddress).to.equal(beforeRecurringPayment.paymentType.tokenAddress)

  expect(afterRPBalance).to.equal(beforeRPBalance)
  expect(afterUserBalance).to.equal(beforeUserBalance.sub(beforeRecurringPayment.recurringAmount))
}

export function buildCheckExecPayload(address: string) {
  return ethers.utils.solidityPack(
    ['bytes', 'bytes'],
    [ethers.utils.id('execute(address)').substring(0, 10), ethers.utils.defaultAbiCoder.encode(['address'], [address])],
  )
}
