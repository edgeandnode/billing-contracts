export const networkConfig = {
  mnemonic: 'myth like bonus scare over problem client lizard pioneer submit female collect',
  providerUrl: 'http://localhost:8545',
  accountNumber: '0',
}

export const deployConfig = {
  billing: {
    params: {
      tokenAddress: 'todo',
      gatewayAddress: 'Todo',
      governor: 'todo',
    },
    description: 'Deploy the billing contract',
  },
  token: {
    totalSupply: '10000000000000000000000000000', // 10 billion
    description: 'Deploy the token contract',
  },
  testnet: {
    goerliDummyERC20: '0x655f2166b0709cd575202630952d71e2bb0d61af',
    goerliMaticERC20: '0x499d11e0b6eac7c0593d8fb292dcbbf815fb29ae',
    goerliMaticBridge: '0x7850ec290a2e2f40b82ed962eaf30591bb5f5c96',
    goerliERC20Bridge: '0x655f2166b0709cd575202630952d71e2bb0d61af',
    mumbaiDummyERC20: '0xfe4F5145f6e09952a5ba9e956ED0C25e3Fa4c7F1',
    mumbaiBilling: '0xccbCD50214832EA50C426631187b0b646615E92f',
  },
  mainnet: {
    ethereumGRT: '0xc944e90c64b2c07662a292be6244bdf05cda44a7',
    ethereumMaticERC20: '0x7d1afa7b718fb893db30a3abc0cfc608aacfebb0',
    ethereumMATICBridge: '', // todo
    ethereumERC20Bridge: '', // todo
    maticGRT: '0x5fe2B58c013d7601147DcdD68C143A77499f5531',
    maticBilling: '',
  },
}