export const networkConfig = {
  mnemonic: 'myth like bonus scare over problem client lizard pioneer submit female collect',
  providerUrl: 'http://localhost:8545',
  accountNumber: '0',
}

export const deployConfig = {
  billing: {
    params: {
      tokenAddress: '0x5fe2B58c013d7601147DcdD68C143A77499f5531',
      gatewayAddress: '0x76C00F71F4dACE63fd83eC80dBc8c30a88B2891c',
      governor: '0xeF38F892E4722152fD8eDb50cD84a96344FD47Ce',
    },
    description: 'Deploy the billing contract',
  },
  token: {
    params: {
      totalSupply: '10000000000000000000000000000', // 10 billion
    },
    description: 'Deploy the token contract',
  },
}
