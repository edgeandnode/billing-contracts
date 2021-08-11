import '@nomiclabs/hardhat-waffle'

import hre from 'hardhat'
import { expect } from 'chai'
import { BigNumber, providers, Signer, Contract } from 'ethers'
import { Account } from '../utils/helpers'
import { deployConfig } from '../utils/config'
import { addresses } from '../utils/addresses'
import { Billing } from '../build/types/Billing'
import { Token } from '../build/types/Token'
import { BillingV1 } from './BillingV1'
import { userData } from './userData'

const { contracts } = hre

describe('Billing matic-fork upgrade', () => {
  let gateway: Account
  let billing: Billing
  let token: Token
  const users: string[] = []
  const amounts: BigNumber[] = []
  let totalAmount: BigNumber

  before(async function () {
    for (let i = 0; i < userData.length; i++) {
      users.push(userData[i].id)
      amounts.push(BigNumber.from(userData[i].billingBalance))
    }
    totalAmount = amounts.reduce((a, b) => a.add(b), BigNumber.from(0))

    const provider = new providers.JsonRpcProvider()
    await provider.send('hardhat_impersonateAccount', [deployConfig.billing.params.gatewayAddress])
    const signer: Signer = await provider.getSigner(deployConfig.billing.params.gatewayAddress)
    const address = await signer.getAddress()
    gateway = { signer, address }

    billing = contracts.Billing
    token = contracts.Token
  })

  describe('addToMany() & pullMany()', function () {
    it('should pull many from old billing', async function () {
      // setup
      const oldBilling = new Contract(addresses.mainnet.maticBillingOld, BillingV1, gateway.signer)
      const beforeGatewayGRT = await token.balanceOf(gateway.address)
      const beforeOldBillingGRT = await token.balanceOf(oldBilling.address)
      const beforeUserBalances: BigNumber[] = []
      for (let i = 0; i < users.length; i++) {
        beforeUserBalances.push(await oldBilling.userBalances(users[i]))
      }

      // Pull to the gateway address
      await oldBilling.pullMany(users, amounts, gateway.address)

      // confirm
      const afterGatewayGRT = await token.balanceOf(gateway.address)
      const afterOldBillingGRT = await token.balanceOf(oldBilling.address)
      expect(beforeGatewayGRT.eq(afterGatewayGRT.add(totalAmount)))
      expect(beforeOldBillingGRT.eq(afterOldBillingGRT.sub(totalAmount)))
      for (let i = 0; i < users.length; i++) {
        const afterUserBalance = await oldBilling.userBalances(users[i])
        expect(afterUserBalance).eq(beforeUserBalances[i].sub(amounts[i]))
      }
    })
    it('should add many to new billing', async function () {
      // setup
      await token.connect(gateway.signer).approve(billing.address, totalAmount)
      const beforeGatewayGRT = await token.balanceOf(gateway.address)
      const beforeBillingGRT = await token.balanceOf(billing.address)
      const beforeUserBalances: BigNumber[] = []
      for (let i = 0; i < users.length; i++) {
        beforeUserBalances.push(await billing.userBalances(users[i]))
      }

      // Add to many users
      await billing.connect(gateway.signer).addToMany(users, amounts)

      // confirm
      const afterGatewayGRT = await token.balanceOf(gateway.address)
      const afterBillingGRT = await token.balanceOf(billing.address)
      expect(afterGatewayGRT).eq(beforeGatewayGRT.sub(totalAmount))
      expect(afterBillingGRT).eq(beforeBillingGRT.add(totalAmount))
      for (let i = 0; i < users.length; i++) {
        const afterUserBalance = await billing.connect(gateway.signer).userBalances(users[i])
        expect(afterUserBalance).eq(beforeUserBalances[i].add(amounts[i]))
      }
    })
  })
})
