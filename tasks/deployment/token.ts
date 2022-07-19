import { Wallet } from 'ethers'
import { task } from 'hardhat/config'
import { HardhatRuntimeEnvironment } from 'hardhat/types'
import '@nomiclabs/hardhat-ethers'

import { deployToken } from '../../utils/deploy'
import '../extendContracts'

task('deploy-token', 'Deploy the token contract')
  .addParam('totalSupply', 'Total supply of the token')
  .setAction(async (taskArgs, hre: HardhatRuntimeEnvironment) => {
    const accounts = await hre.ethers.getSigners()
    await deployToken([taskArgs.totalSupply], accounts[0] as unknown as Wallet)
  })
