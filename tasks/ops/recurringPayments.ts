import { BigNumber, ethers } from 'ethers'
import { task, types } from 'hardhat/config'
import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { RecurringPayments } from '../../build/types'

import { loadArtifact } from './utils'
import addresses from '../../addresses.json'

task('rp:register', 'Register a payment type')
  .addParam('name', 'Payment type name')
  .addParam('minimumRecurringAmount', 'Minimum recurring amount for the payment type', '100000000000000000000')
  .addParam('address', 'Payment type contract address')
  .addParam('tokenAddress', 'Token address for the payment type')
  .addParam('requiresAccountCreation', 'Wether or not the payment type requires account creation', false, types.boolean)
  .setAction(async (taskArgs, hre: HardhatRuntimeEnvironment) => {
    const chainId = (hre.network.config.chainId as number).toString()
    const rpAddress = addresses[chainId]['RecurringPayments']

    const artifact = loadArtifact('RecurringPayments')
    const recurringPayments = new ethers.Contract(rpAddress, artifact.abi, hre.ethers.provider) as RecurringPayments

    const accounts = await hre.ethers.getSigners()

    console.log('Registering payment type ...')

    const tx = await recurringPayments
      .connect(accounts[0])
      .registerPaymentType(
        taskArgs.name,
        taskArgs.minimumRecurringAmount,
        taskArgs.address,
        taskArgs.tokenAddress,
        taskArgs.requiresAccountCreation,
      )
    const receipt = await tx.wait()
    console.log('Registered payment type with tx hash:', receipt.transactionHash)
  })

task('rp:deposit', 'Deposit eth into Gelato treasury')
  .addParam('amount', 'Amount of ETH to deposit')
  .setAction(async (taskArgs, hre: HardhatRuntimeEnvironment) => {
    const chainId = (hre.network.config.chainId as number).toString()
    const rpAddress = addresses[chainId]['RecurringPayments']

    const artifact = loadArtifact('RecurringPayments')
    const recurringPayments = new ethers.Contract(rpAddress, artifact.abi, hre.ethers.provider) as RecurringPayments

    const accounts = await hre.ethers.getSigners()

    console.log(`Depositing ${taskArgs.amount} ETH ...`)
    const tx = await recurringPayments.connect(accounts[0]).deposit({ value: ethers.utils.parseEther(taskArgs.amount) })
    const receipt = await tx.wait()
    console.log('Deposited with tx hash:', receipt.transactionHash)
  })

const ERC20_APPROVE_ABI = [
  {
    inputs: [
      {
        internalType: 'address',
        name: 'spender',
        type: 'address',
      },
      {
        internalType: 'uint256',
        name: 'amount',
        type: 'uint256',
      },
    ],
    name: 'approve',
    outputs: [
      {
        internalType: 'bool',
        name: '',
        type: 'bool',
      },
    ],
    stateMutability: 'nonpayable',
    type: 'function',
  },
]

task('rp:setup', 'Create a recurring payment')
  .addParam('type', 'Name of the payment type')
  .addParam('initialAmount', 'Initial amount')
  .addParam('recurringAmount', 'Recurring amount')
  .addOptionalParam('createAmount', 'Create amount')
  .addParam('privateKey', 'Account private key')
  .addParam('approveToken', 'token address to grant allowance')
  .setAction(async (taskArgs, hre: HardhatRuntimeEnvironment) => {
    const chainId = (hre.network.config.chainId as number).toString()
    const rpAddress = addresses[chainId]['RecurringPayments']

    const artifact = loadArtifact('RecurringPayments')
    const recurringPayments = new ethers.Contract(rpAddress, artifact.abi, hre.ethers.provider) as RecurringPayments
    const token = new ethers.Contract(taskArgs.approveToken, ERC20_APPROVE_ABI, hre.ethers.provider)

    const account = new ethers.Wallet(taskArgs.privateKey, hre.ethers.provider)

    const initialAmount = ethers.utils.parseEther(taskArgs.initialAmount)
    const recurringAmount = ethers.utils.parseEther(taskArgs.recurringAmount)
    const createAmount = taskArgs.createAmount ? ethers.utils.parseEther(taskArgs.initialAmount) : BigNumber.from(0)
    const createData = ethers.utils.defaultAbiCoder.encode([], [])

    console.log(`Setting allowance on the token contract`)
    console.log(`  - account: ${account.address}`)
    console.log(`  - token: ${taskArgs.approveToken}`)
    const approveTx = await token.connect(account).approve(rpAddress, ethers.constants.MaxUint256)
    const approveReceipt = await approveTx.wait()
    console.log('Approved with tx hash:', approveReceipt.transactionHash)

    console.log(`Creating a recurring payment with:`)
    console.log(`  - account: ${account.address}`)
    console.log(`  - type: ${taskArgs.type}`)
    console.log(`  - initial amount: ${taskArgs.initialAmount}`)
    console.log(`  - recurring amount: ${taskArgs.recurringAmount}`)
    console.log(`  - create amount: ${taskArgs.createAmount}`)
    console.log(`  - create data: ${createData}`)

    const tx = await recurringPayments
      .connect(account)
      .create(taskArgs.type, initialAmount, recurringAmount, createAmount, createData)
    const receipt = await tx.wait()

    console.log('Created with tx hash:', receipt.transactionHash)
  })
