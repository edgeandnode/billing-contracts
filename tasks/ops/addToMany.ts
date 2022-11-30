import fs from 'fs'
import { BigNumber, utils } from 'ethers'
import { task } from 'hardhat/config'
import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { logger } from '../../utils/logging'
import { askForConfirmation, DEFAULT_DEPOSITORS_FILE } from './utils'

task('ops:add-to-many', 'Execute a transaction depositing funds to a set of users from a JSON file')
  .addOptionalParam('depositorsFile', 'Path to depositors file', DEFAULT_DEPOSITORS_FILE)
  .setAction(async (taskArgs, hre: HardhatRuntimeEnvironment) => {
    const { contracts } = hre
    const accounts = await hre.ethers.getSigners()
    const account = accounts[0]
    const chainId = hre.network.config.chainId

    logger.log(`Getting depositors from ${taskArgs.depositorsFile}...`)
    const depositors = JSON.parse(fs.readFileSync(taskArgs.depositorsFile).toString())
    const users: string[] = depositors.map((depositor) => depositor.address)
    const balances: BigNumber[] = depositors.map((depositor) => BigNumber.from(depositor.balance))

    const totalBalance = balances.reduce((a, b) => a.add(b), BigNumber.from(0))

    logger.log(`Total balance: ${utils.formatEther(totalBalance)}`)
    logger.log(`--------------------------------`)
    for (const depositor of depositors) {
      logger.log(depositor.address, utils.formatEther(depositor.balance.hex))
    }

    if (
      await askForConfirmation(
        `Execute <addToMany> transaction? **This will execute on network with chain ID ${chainId}**`,
      )
    ) {
      try {
        logger.log('Transaction being sent')
        logger.log(`--------------------`)
        const tx = await contracts.Billing!.connect(account).addToMany(users, balances)
        const receipt = await tx.wait()
        logger.log('Receipt: ', receipt)
      } catch (e) {
        logger.log(e)
        process.exit(1)
      }
    } else {
      logger.log('Bye!')
    }
  })
