import { ethers } from 'ethers'

export function getPaymentTypeId(paymentType: string): string {
  const encoder = new ethers.utils.AbiCoder()
  return ethers.utils.keccak256(encoder.encode(['string'], [paymentType]))
}
