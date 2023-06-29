import { task } from 'hardhat/config'
import 'hardhat-storage-layout'

task('contracts:layout', 'Display storage layout').setAction(async (_, hre) => {
  await hre.storageLayout.export()
})
