import { Contract, Signer, ContractFactory, utils } from 'ethers'

import { logger } from './logging'
import { loadArtifact } from './artifacts'
import { Billing } from '../../build/typechain/contracts/Billing'
import { Token } from '../../build/typechain/contracts/Token'

// Disable logging for tests
logger.pause()

const hash = (input: string): string => utils.keccak256(`0x${input.replace(/^0x/, '')}`)

type DeployResult = {
  // TODO - might not need
  contract: Contract
  creationCodeHash: string
  runtimeCodeHash: string
  txHash: string
}

export async function deployContract(args: Array<any>, sender: Signer, name: string): Promise<Contract> {
  // Deploy
  const artifact = loadArtifact(name)
  const factory = new ContractFactory(artifact.abi, artifact.bytecode)
  const contract = await factory.connect(sender).deploy(...args)
  const txHash = contract.deployTransaction.hash
  logger.log(`> Deploy ${name}, txHash: ${txHash}`)
  await sender.provider.waitForTransaction(txHash)

  // Receipt
  const creationCodeHash = hash(factory.bytecode)
  const runtimeCodeHash = hash(await sender.provider.getCode(contract.address))
  logger.log('= CreationCodeHash: ', creationCodeHash)
  logger.log('= RuntimeCodeHash: ', runtimeCodeHash)
  logger.success(`${name} has been deployed to address: ${contract.address}`)

  return contract as unknown as Promise<Billing>
}

export async function deployBilling(args: Array<any>, sender: Signer): Promise<Billing> {
  return deployContract(args, sender, 'Billing') as unknown as Promise<Billing>
}

export async function deployToken(args: Array<any>, sender: Signer): Promise<Token> {
  return deployContract(args, sender, 'Token') as unknown as Promise<Token>
}
