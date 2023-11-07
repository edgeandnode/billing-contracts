import { Contract, Signer, ContractFactory, utils, BigNumber } from 'ethers'

import { logger } from './logging'
import { loadArtifact } from './artifacts'
import { Billing } from '../build/types/contracts/Billing'
import { BanxaWrapper } from '../build/types/contracts/BanxaWrapper'
import { RecurringPayments } from '../build/types/contracts/RecurringPayments'
import {
  AutomateMock,
  OpsProxyFactoryMock,
  PaymentMock,
  SimplePaymentMock,
  Subscriptions,
  TaskTreasuryMock,
} from '../build/types'

const hash = (input: string): string => utils.keccak256(`0x${input.replace(/^0x/, '')}`)

async function deployContract(
  args: Array<string | BigNumber | number>,
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
export async function deployBilling(
  args: Array<string | BigNumber>,
  sender: Signer,
  disableLogging?: boolean,
): Promise<Billing> {
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
export async function deployToken(
  args: Array<string | BigNumber>,
  sender: Signer,
  disableLogging?: boolean,
): Promise<Contract> {
  return deployContract(args, sender, 'Token', disableLogging) as unknown as Promise<Contract>
}

// Pass the args in order to this func
export async function deployBanxaWrapper(
  args: Array<string | BigNumber>,
  sender: Signer,
  disableLogging?: boolean,
): Promise<BanxaWrapper> {
  return deployContract(args, sender, 'BanxaWrapper', disableLogging) as unknown as Promise<BanxaWrapper>
}

// Pass the args in order to this func
export async function deployL1TokenGatewayMock(
  args: Array<string | BigNumber>,
  sender: Signer,
  disableLogging?: boolean,
): Promise<Contract> {
  return deployContract(args, sender, 'L1TokenGatewayMock', disableLogging) as unknown as Promise<Contract>
}

// Pass the args in order to this func
export async function deployInboxMock(
  args: Array<string | BigNumber>,
  sender: Signer,
  disableLogging?: boolean,
): Promise<Contract> {
  return deployContract(args, sender, 'InboxMock', disableLogging) as unknown as Promise<Contract>
}

// Pass the args in order to this func
export async function deployBridgeMock(
  args: Array<string | BigNumber>,
  sender: Signer,
  disableLogging?: boolean,
): Promise<Contract> {
  return deployContract(args, sender, 'BridgeMock', disableLogging) as unknown as Promise<Contract>
}

// Pass the args in order to this func
export async function deployAutomateMock(
  args: Array<string | BigNumber>,
  sender: Signer,
  disableLogging?: boolean,
): Promise<AutomateMock> {
  return deployContract(args, sender, 'AutomateMock', disableLogging) as unknown as Promise<AutomateMock>
}

// Pass the args in order to this func
export async function deployTaskTreasuryMock(
  args: Array<string | BigNumber>,
  sender: Signer,
  disableLogging?: boolean,
): Promise<TaskTreasuryMock> {
  return deployContract(args, sender, 'TaskTreasuryMock', disableLogging) as unknown as Promise<TaskTreasuryMock>
}

// Pass the args in order to this func
export async function deployOpsProxyFactoryMock(
  args: Array<string | BigNumber>,
  sender: Signer,
  disableLogging?: boolean,
): Promise<OpsProxyFactoryMock> {
  return deployContract(args, sender, 'OpsProxyFactoryMock', disableLogging) as unknown as Promise<OpsProxyFactoryMock>
}

// Pass the args in order to this func
export async function deployPaymentMock(
  args: Array<string | BigNumber>,
  sender: Signer,
  disableLogging?: boolean,
): Promise<PaymentMock> {
  return deployContract(args, sender, 'PaymentMock', disableLogging) as unknown as Promise<PaymentMock>
}

// Pass the args in order to this func
export async function deployPaymentMockNoTransferOnCreate(
  args: Array<string | BigNumber>,
  sender: Signer,
  disableLogging?: boolean,
): Promise<PaymentMock> {
  return deployContract(
    args,
    sender,
    'PaymentMockNoTransferOnCreate',
    disableLogging,
  ) as unknown as Promise<PaymentMock>
}

// Pass the args in order to this func
export async function deployPaymentMockNoTransferOnAddTo(
  args: Array<string | BigNumber>,
  sender: Signer,
  disableLogging?: boolean,
): Promise<PaymentMock> {
  return deployContract(args, sender, 'PaymentMockNoTransferOnAddTo', disableLogging) as unknown as Promise<PaymentMock>
}

// Pass the args in order to this func
export async function deploySimplePaymentMock(
  args: Array<string | BigNumber>,
  sender: Signer,
  disableLogging?: boolean,
): Promise<SimplePaymentMock> {
  return deployContract(args, sender, 'SimplePaymentMock', disableLogging) as unknown as Promise<SimplePaymentMock>
}

// Pass the args in order to this func
export async function deployRecurringPayments(
  args: Array<string | BigNumber | number>,
  sender: Signer,
  disableLogging?: boolean,
): Promise<RecurringPayments> {
  return deployContract(args, sender, 'RecurringPayments', disableLogging) as unknown as Promise<RecurringPayments>
}

// Pass the args in order to this func
export async function deploySubscriptions(
  args: Array<string | BigNumber | number>,
  sender: Signer,
  disableLogging?: boolean,
): Promise<Subscriptions> {
  return deployContract(args, sender, 'Subscriptions', disableLogging) as unknown as Promise<Subscriptions>
}
