import { Contract, Signer, ContractFactory, utils } from 'ethers'

import { logger } from './logging'
import { loadArtifact } from './artifacts'
import { Billing } from '../build/types/contracts/Billing'

const hash = (input: string): string => utils.keccak256(`0x${input.replace(/^0x/, '')}`)

async function deployContract(
  args: Array<string>,
  sender: Signer,
  name: string,
  disableLogging?: boolean,
): Promise<Contract> {
  // Disable logging for tests
  if (disableLogging) logger.pause()

  // Deploy
  const artifact = loadArtifact(name)
  const factory = new ContractFactory(artifact.abi, artifact.bytecode)
  const contract = await factory.connect(sender).deploy(...args)
  const txHash = contract.deployTransaction.hash
  logger.log(`> Deploy ${name}, txHash: ${txHash}`)

  // Receipt
  const creationCodeHash = hash(factory.bytecode)
  const runtimeCodeHash = hash(await sender.provider.getCode(contract.address))
  logger.log('= CreationCodeHash: ', creationCodeHash)
  logger.log('= RuntimeCodeHash: ', runtimeCodeHash)
  logger.success(`${name} has been deployed to address: ${contract.address}`)

  return contract as unknown as Promise<Contract>
}

// Pass the args in order to this func
export async function deployBilling(args: Array<string>, sender: Signer, disableLogging?: boolean): Promise<Billing> {
  return deployContract(args, sender, 'Billing', disableLogging) as unknown as Promise<Billing>
}

// Pass the args in order to this func
export async function deployBillingConnector(
  args: Array<string>,
  sender: Signer,
  disableLogging?: boolean,
): Promise<Billing> {
  return deployContract(args, sender, 'BillingConnector', disableLogging) as unknown as Promise<Billing>
}

// Pass the args in order to this func
export async function deployToken(args: Array<string>, sender: Signer, disableLogging?: boolean): Promise<Contract> {
  return deployContract(args, sender, 'Token', disableLogging) as unknown as Promise<Contract>
}

// Pass the args in order to this func
export async function deployL1TokenGatewayMock(
  args: Array<string>,
  sender: Signer,
  disableLogging?: boolean,
): Promise<Contract> {
  return deployContract(args, sender, 'L1TokenGatewayMock', disableLogging) as unknown as Promise<Contract>
}
