import { Wallet } from 'ethers'
import { task } from 'hardhat/config'
import { HardhatRuntimeEnvironment } from 'hardhat/types'

import { deployBanxaWrapper } from '../../utils/deploy'
import '../extendContracts'

import addresses from '../../addresses.json'
import { promises as fs } from 'fs'

task('deploy-banxa', 'Deploy the banxa wrapper contract (use L2 network!)')
  .addParam('billing', 'Address of the billing contract')
  .addParam('token', 'Address of the token')
  .setAction(async (taskArgs, hre: HardhatRuntimeEnvironment) => {
    const accounts = await hre.ethers.getSigners()
    const chainId = (hre.network.config.chainId as number).toString()
    const banxaWrapper = await deployBanxaWrapper([taskArgs.token, taskArgs.billing], accounts[0] as unknown as Wallet)
    addresses[chainId]['BanxaWrapper'] = banxaWrapper.address
    return fs.writeFile('addresses.json', JSON.stringify(addresses, null, 2))
  })
