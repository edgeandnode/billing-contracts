# Billing Contract

This repository contains a Billing contract. It allows users to add tokens (GRT) into the contract for an agent to pull when
a billing period is up.

## Contract Design

The contract is designed with the following requirements:

- The contract is owned by the `governor`.
- There is a privileged role named `gateway` that has a special permission to pull user funds.
- Users add tokens into the contract by calling `add()`. It is important to note that the contract
  is designed so that the users are trusting the Gateway. Once the user adds tokens, the Gateway can
  pull the funds whenever it wants.
- The trust risk for the User is that the Gateway would pull funds before the User spent their funds, which are query fees in The Graph Network.
- The trust risk for the Gateway is that the user adds funds, spends them on queries, and then
  removes their tokens before the gateway pulled the tokens.
- These combined trust risks make for a situation that we expect both parties to act responsibly.
  It will always be recommended to keep the amount of GRT in the contract low for each user, and for
  the Gateway to pull regularly. This way, if one side does not play nice, the funds lost won't be
  that large.

## Testing

Run the test suite with:

```bash
yarn test
```

## Using the console

Here is how to use hardhat to quickly do some transactions:

```bash
hh console --network polygon

accounts = await ethers.getSigners()
token = await hre.contracts.Token.connect(accounts[0])
await token.approve('0x5DE9A13C486f5aA12F4D8e5E77246F6E24dac274', '1000000000000000000000')

billing = await hre.contracts.Billing.connect(accounts[0])
await billing.add('1000000000000000000')
```

## Deploy instructions

To deploy, see these instructions:

```
hh deploy-billing --network <NETWORK_NAME> \
    --governor <GOVERNOR_ADDRESS> \
    --gateway <GATEWAY_ADDRESS> \
    --token <GRT_ADDRESS>
```

Then run:

```
hh verify --network <NETWORK_NAME> \
    <NEW_DEPLOYED_ADDRESS> \
    <GOVERNOR_ADDRESS> \
    <GATEWAY_ADDRESS> \
    <GRT_ADDRESS>
```
