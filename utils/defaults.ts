export const networkDefaults = {
  mnemonic: 'myth like bonus scare over problem client lizard pioneer submit female collect',
  providerUrl: 'http://localhost:8545',
  accountNumber: '0',
}

export const deployDefaults = {
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
  force: {
    alias: 'force',
    description: "Deploy contract even if it's already deployed",
    type: 'boolean',
    default: false,
  },
  testing: {
    mumbaiDummyERC20: '0xfe4F5145f6e09952a5ba9e956ED0C25e3Fa4c7F1',
  },
}
