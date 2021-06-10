import { providers, Signer, Contract } from 'ethers'
import { logger } from './logging'
import { loadArtifact } from './artifacts'
import { Billing } from '../build/typechain/contracts/Billing'
import { Token } from '../build/typechain/contracts/Token'

export interface BillingContracts {
  Billing: Billing
  Token: Token
}

export const getContractAt = (
  name: string,
  address: string,
  signerOrProvider?: Signer | providers.Provider,
): Contract => {
  return new Contract(address, loadArtifact(name).abi, signerOrProvider)
}

export const loadContracts = (
  billingAddress: string,
  tokenAddress: string,
  signerOrProvider?: Signer | providers.Provider,
): BillingContracts => {
  const contracts = {}
  try {
    const billing = getContractAt('Billing', billingAddress)
    const token = getContractAt('Token', tokenAddress)
    contracts['Billing'] = billing
    contracts['Token'] = token
    if (signerOrProvider) {
      contracts['Billing'] = contracts['Billing'].connect(signerOrProvider)
      contracts['Token'] = contracts['Token'].connect(signerOrProvider)
    }
  } catch (err) {
    logger.warn(`Could not load contracts`)
  }
  return contracts as BillingContracts
}
