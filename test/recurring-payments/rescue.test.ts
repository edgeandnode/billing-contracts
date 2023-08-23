import { expect } from 'chai'
import hre from 'hardhat'
import '@nomicfoundation/hardhat-chai-matchers'

import { RecurringPayments } from '../../build/types/contracts/RecurringPayments'

import { deployMockGelatoNetwork } from '../../utils/gelato'
import * as deployment from '../../utils/deploy'
import { getAccounts, Account, toGRT, toBN } from '../../utils/helpers'
import { Contract } from 'ethers'

const { ethers } = hre
const { AddressZero } = ethers.constants

describe('RecurringPayments: Rescueable', () => {
  let me: Account
  let governor: Account
  let gelatoNetwork: Account
  let user1: Account

  let token: Contract
  let automate: Contract
  let recurringPayments: RecurringPayments

  const tenBillion = toGRT('10000000000')
  const oneMillion = toGRT('1000000')

  beforeEach(async function () {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[me, governor, gelatoNetwork, user1] = await getAccounts()

    token = await deployment.deployToken([tenBillion], me.signer, true)

    automate = await deployMockGelatoNetwork(me.signer, gelatoNetwork.address)

    // Deploy RecurringPayments contract
    recurringPayments = await deployment.deployRecurringPayments(
      [automate.address, governor.address, ethers.utils.parseUnits('3.5', 'gwei'), 1, 6],
      me.signer,
      true,
    )

    await token.connect(me.signer).transfer(user1.address, oneMillion)
  })

  describe('rescue', function () {
    it('should rescue tokens', async function () {
      // deploy token2 and accidentally send to the RP contract
      const token2 = await deployment.deployToken([tenBillion], me.signer, true)
      await token2.connect(me.signer).transfer(user1.address, oneMillion)
      await token2.connect(user1.signer).transfer(recurringPayments.address, oneMillion)

      // the bad transfer of GRT
      await token.connect(user1.signer).transfer(recurringPayments.address, oneMillion)

      const tokenBeforeUser = await token.balanceOf(user1.address)
      const token2BeforeUser = await token2.balanceOf(user1.address)
      const tokenBeforeRP = await token.balanceOf(recurringPayments.address)
      const token2BeforeRP = await token2.balanceOf(recurringPayments.address)

      const tx = await recurringPayments.connect(governor.signer).rescueTokens(user1.address, token.address, oneMillion)
      await expect(tx).emit(recurringPayments, 'TokensRescued').withArgs(user1.address, token.address, oneMillion)
      await recurringPayments.connect(governor.signer).rescueTokens(user1.address, token2.address, oneMillion)

      const tokenAfterUser = await token.balanceOf(user1.address)
      const token2AfterUser = await token2.balanceOf(user1.address)
      const tokenAfterRP = await token.balanceOf(recurringPayments.address)
      const token2AfterRP = await token2.balanceOf(recurringPayments.address)

      expect(tokenAfterUser).eq(tokenBeforeUser.add(oneMillion))
      expect(token2AfterUser).eq(token2BeforeUser.add(oneMillion))
      expect(tokenAfterRP).eq(tokenBeforeRP.sub(oneMillion))
      expect(token2AfterRP).eq(token2BeforeRP.sub(oneMillion))
    })

    it('should fail rescue tokens when not the governor', async function () {
      // the bad transfer of GRT
      await token.connect(user1.signer).transfer(recurringPayments.address, oneMillion)
      const tx = recurringPayments.connect(user1.signer).rescueTokens(user1.address, token.address, oneMillion)
      await expect(tx).revertedWith('Only Governor can call')
    })

    it('should fail when trying to send to address zero', async function () {
      // the bad transfer of GRT
      await token.connect(user1.signer).transfer(recurringPayments.address, oneMillion)
      const tx = recurringPayments.connect(governor.signer).rescueTokens(AddressZero, token.address, oneMillion)
      await expect(tx).revertedWith('Cannot send to address(0)')
    })

    it('should fail when trying to send zero tokens', async function () {
      // the bad transfer of GRT
      await token.connect(user1.signer).transfer(recurringPayments.address, oneMillion)
      const tx = recurringPayments.connect(governor.signer).rescueTokens(user1.address, token.address, toBN(0))
      await expect(tx).revertedWith('Cannot rescue 0 tokens')
    })
  })
})
