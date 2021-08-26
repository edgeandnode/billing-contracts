import fs from 'fs'
import { BigNumber, utils } from 'ethers'
import { task } from 'hardhat/config'
import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { logger } from '../../utils/logging'
import { ask } from './pullMany'

task('ops:add-to-many:tx', 'Generate transaction data for pulling all funds from users').setAction(
  async (taskArgs, hre: HardhatRuntimeEnvironment) => {
    const { contracts } = hre
    const accounts = await hre.ethers.getSigners()
    const gateway = accounts[0]

    logger.log('Getting depositors...')
    const users = []
    const balances = []
    const path = './tasks/ops/depositors.json'
    const depositors = JSON.parse(fs.readFileSync(path).toString())

    depositors.forEach((depositor) => {
      users.push(depositor.address)
      balances.push(depositor.balance)
    })
    const totalBalance = balances.reduce((a, b) => a.add(b), BigNumber.from(0))

    logger.log(`Balance: ${utils.formatEther(totalBalance)}`)
    logger.log(`--------------------------------`)
    for (const depositor of depositors) {
      logger.log(depositor.address, utils.formatEther(depositor.balance.hex))
    }

    if (await ask('Execute <addToMany> transaction? **This will execute on mainnet matic**')) {
      try {
        logger.log('Transaction being sent')
        logger.log(`--------------------`)
        const tx = await contracts.Billing.connect(gateway).addToMany(users, balances)
        const receipt = await tx.wait()
        logger.log('Receipt: ', receipt)
      } catch (e) {
        logger.log(e)
      }
    } else {
      logger.log('Bye!')
    }
  },
)
