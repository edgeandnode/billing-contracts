import { Wallet } from 'ethers'
import { task } from 'hardhat/config'
import { HardhatRuntimeEnvironment } from 'hardhat/types'
import '@nomiclabs/hardhat-ethers'

import { deployToken } from '../../utils/deploy'
import { deployConfig } from '../../utils/config'
import { loadContracts } from '../../utils/contracts'

task('deployToken', deployConfig.token.description)
  .addParam('totalSupply', 'Total supply of the token', deployConfig.token.totalSupply)
  .setAction(async (taskArgs, hre: HardhatRuntimeEnvironment) => {
    await loadContracts('abc', 'def')
    const accounts = await hre.ethers.getSigners()
    await deployToken([taskArgs.totalSupply], accounts[0] as unknown as Wallet)
  })
