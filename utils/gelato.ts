import hre from 'hardhat'
import * as deployment from './deploy'
import { Signer } from 'ethers'
import * as OpsProxyFactoryArtifact from '../build/artifacts/contracts/tests/OpsProxyFactoryMock.sol/OpsProxyFactoryMock.json'

export async function deployMockGelatoNetwork(deployer: Signer, gelato: string) {
  // Deploy Gelato Task Treasury
  const treasury = await deployment.deployTaskTreasuryMock([], deployer, true)

  // Deploy Gelato Automate contract
  const automate = await deployment.deployAutomateMock([gelato, treasury.address], deployer, true)

  // Deploy Gelato OpsProxyFactory
  // The OpsProxyFactory address hardcoded in the Automate contract so we need to copy the bytecode into target address
  const OPS_PROXY_FACTORY = '0xC815dB16D4be6ddf2685C201937905aBf338F5D7'
  await hre.network.provider.send('hardhat_setCode', [OPS_PROXY_FACTORY, OpsProxyFactoryArtifact.deployedBytecode])

  return automate
}
