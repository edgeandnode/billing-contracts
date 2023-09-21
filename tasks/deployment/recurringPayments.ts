import { BigNumber, Wallet } from 'ethers'
import { task } from 'hardhat/config'
import { HardhatRuntimeEnvironment } from 'hardhat/types'

import { deployRecurringPayments } from '../../utils/deploy'
import addresses from '../../addresses.json'
import { promises as fs } from 'fs'

const ONE_DAY_IN_SECONDS = 60 * 60 * 24

task('deploy-recurring-payments', 'Deploy the recurring payments contract (use L2 network!)')
  .addParam('governor', 'Address of the governor')
  .addParam('maxGasPrice', 'Max gas price for the recurring payments', '1000000000')
  .addParam('executionInterval', 'Execution interval for the recurring payments (in days)')
  .addParam('expirationInterval', 'Expiration interval for the recurring payments (in days)')
  .setAction(async (taskArgs, hre: HardhatRuntimeEnvironment) => {
    // Constructor parameters
    const chainId = (hre.network.config.chainId as number).toString()
    const automate = addresses[chainId]['GelatoAutomate']
    const maxGasPrice = BigNumber.from(taskArgs.maxGasPrice)

    const accounts = await hre.ethers.getSigners()
    const recurringPayments = await deployRecurringPayments(
      [
        automate,
        taskArgs.governor,
        maxGasPrice,
        taskArgs.executionInterval * ONE_DAY_IN_SECONDS,
        taskArgs.expirationInterval * ONE_DAY_IN_SECONDS,
      ],
      accounts[0] as unknown as Wallet,
    )
    addresses[chainId]['RecurringPayments'] = recurringPayments.address
    return fs.writeFile('addresses.json', JSON.stringify(addresses, null, 2))
  })
