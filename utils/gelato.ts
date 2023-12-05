import * as deployment from './deploy'
import { Signer } from 'ethers'

export async function deployMockGelatoNetwork(deployer: Signer) {
  // Deploy Gelato
  const gelato = await deployment.deployGelatoMock([], deployer, true)

  // Deploy Gelato OpsProxyFactory
  const opsProxyFactory = await deployment.deployOpsProxyFactoryMock([], deployer, true)

  // Deploy Gelato Proxy module contract
  const proxyModule = await deployment.deployProxyModuleMock([opsProxyFactory.address], deployer, true)

  // Deploy Gelato Automate contract
  return await deployment.deployAutomateMock([gelato.address, proxyModule.address], deployer, true)
}
