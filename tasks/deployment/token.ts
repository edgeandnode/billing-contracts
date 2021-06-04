import { Wallet } from 'ethers'
import { task } from 'hardhat/config'
import '@nomiclabs/hardhat-ethers'

import { deployToken } from '../../utils/deploy'
import { deployDefaults } from '../../utils/defaults'

task('deployToken', deployDefaults.token.description)
  .addParam('totalSupply', 'Total supply of the token', deployDefaults.token.totalSupply)
  .setAction(async (taskArgs, hre) => {
    const accounts = await hre.ethers.getSigners()
    await deployToken([taskArgs.totalSupply], accounts[0] as unknown as Wallet)
  })
