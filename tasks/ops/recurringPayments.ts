import { BigNumber, ethers } from 'ethers'
import { task, types } from 'hardhat/config'
import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { RecurringPayments } from '../../build/types'

import { loadArtifact } from './utils'
import addresses from '../../addresses.json'

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

const ONE_BALANCE_ABI = [
  {
    inputs: [{ internalType: 'address', name: '_sponsor', type: 'address' }],
    name: 'depositNative',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: '_sponsor', type: 'address' },
      { internalType: 'contract IERC20', name: '_token', type: 'address' },
      { internalType: 'uint256', name: '_amount', type: 'uint256' },
    ],
    name: 'depositToken',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
]

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

// Gelato 1Balance system
// For testnet deposit ETH on goerli
// For production deposit USDC on polygon
task('rp:deposit', 'Deposit funds into Gelato 1Balance')
  .addParam('amount', 'Amount of ETH/USDC to deposit')
  .addParam('recurringPayments', 'Address of the recurring payments contract')
  .setAction(async (taskArgs, hre: HardhatRuntimeEnvironment) => {
    const chainId = (hre.network.config.chainId as number).toString()
    const accounts = await hre.ethers.getSigners()

    if (!['5', '137'].includes(chainId)) {
      throw new Error('Gelato 1Balance only supports Goerli and Polygon chains')
    }

    const oneBalanceAddress = addresses[chainId]['Gelato1Balance']
    const oneBalance = new ethers.Contract(oneBalanceAddress, ONE_BALANCE_ABI, hre.ethers.provider)

    let tx
    if (chainId === '5') {
      // Goerli accepts ETH only
      console.log(`Depositing ${taskArgs.amount} ETH on Goerli ...`)
      tx = await oneBalance.connect(accounts[0]).depositNative(taskArgs.recurringPayments, { value: taskArgs.amount })
    } else {
      // Polygon accepts USDC only
      console.log(`Depositing ${taskArgs.amount} USDC on Polygon ...`)
      const usdcAddress = addresses[chainId]['USDC']
      const usdc = new ethers.Contract(usdcAddress, ERC20_APPROVE_ABI, hre.ethers.provider)
      await usdc.connect(accounts[0]).approve(oneBalanceAddress, taskArgs.amount)
      tx = await oneBalance.connect(accounts[0]).depositToken(taskArgs.recurringPayments, usdcAddress, taskArgs.amount)
    }

    const receipt = await tx.wait()
    console.log('Deposited with tx hash:', receipt.transactionHash)
  })

// TODO: implement 1Balance 2 step withdraw
task('rp:withdraw', 'Withdraw all funds from Gelato treasury').setAction(
  async (taskArgs, hre: HardhatRuntimeEnvironment) => {
    throw new Error('Not implemented yet')
  },
)

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

task('rp:cancel', 'Cancel a recurring payment')
  .addParam('privateKey', 'Account private key')
  .setAction(async (taskArgs, hre: HardhatRuntimeEnvironment) => {
    const chainId = (hre.network.config.chainId as number).toString()
    const rpAddress = addresses[chainId]['RecurringPayments']

    const artifact = loadArtifact('RecurringPayments')
    const recurringPayments = new ethers.Contract(rpAddress, artifact.abi, hre.ethers.provider) as RecurringPayments

    const account = new ethers.Wallet(taskArgs.privateKey, hre.ethers.provider)

    console.log(`Cancelling recurring payment`)
    console.log(`  - account: ${account.address}`)

    const tx = await recurringPayments.connect(account)['cancel()']()
    const receipt = await tx.wait()

    console.log('Cancelled with tx hash:', receipt.transactionHash)
  })

task('rp:execute', 'Execute a recurring payment. Only owner can call.')
  .addParam('privateKey', 'Account private key')
  .setAction(async (taskArgs, hre: HardhatRuntimeEnvironment) => {
    const chainId = (hre.network.config.chainId as number).toString()
    const rpAddress = addresses[chainId]['RecurringPayments']

    const artifact = loadArtifact('RecurringPayments')
    const recurringPayments = new ethers.Contract(rpAddress, artifact.abi, hre.ethers.provider) as RecurringPayments

    const account = new ethers.Wallet(taskArgs.privateKey, hre.ethers.provider)

    const nextExecutionTime = await recurringPayments.getNextExecutionTime(account.address)

    console.log(`Executing recurring payment`)
    console.log(`  - account: ${account.address}`)
    console.log(`  - next execution time: ${new Date(nextExecutionTime.toNumber() * 1000)}`)

    const tx = await recurringPayments.connect(account).execute(account.address)
    const receipt = await tx.wait()

    console.log('Executed with tx hash:', receipt.transactionHash)

    const newNextExecutionTime = await recurringPayments.getNextExecutionTime(account.address)
    console.log(`Next execution time is now: ${new Date(newNextExecutionTime.toNumber() * 1000)}`)
  })
