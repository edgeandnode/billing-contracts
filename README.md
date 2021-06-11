# Billing Contract

This repository contains a Billing contract to be deployed on the Polygon (previously Matic)
network. It allows Users to add tokens (GRT) into the contract for the Gateway to pull when
a billing period is up.

## Contract Design

The contract is designed with the following requirements:

- The contract is owned by the `governor`
- There is a privileged used named `gateway`
- Users add tokens into the contract by calling `add()`. It is important to note that the contract
is designed so that the users are trusting the Gateway. Once the user adds tokens, the Gateway can
pull the funds whenever it wants. The Gateway is running it's own logic, not on the blockchain, that
records what Users owe.
- The trust risk for the User is that the Gateway would pull funds before the User spent their funds, which are query fees in The Graph Network.
- The trust risk for the Gateway is that the user adds funds, spends them on queries, and then
removes their tokens before the gateway pulled the tokens. 
- These combined trust risks make for a situation that we expect both parties to act responsibly. 
It will always be recommended to keep the amount of GRT in the contract low for each user, and for
the Gateway to pull regularly. This way, if one side does not play nice, the funds lost won't be
that large. 

## Using the Polygon Bridge

The Billing contract will be deployed on Polygon. This is how users will have to use it:

- Move GRT from Ethereum Mainnet through the Polgon POS bridge. After a short 5-7 minute period, they
will get Polygon GRT on the Polygon chain.
- Users will have to get MATIC to pay for transaction fees on the Polygon network.
- If the User ever wants to move their Polygon GRT back to Ethereum, they must use the reverse bridge,
which has about a 3 hour waiting time.

## Testing in Prod
Here is how to use hardhat to quickly do some transactions:

```bash
npx hardhat console --network mumbai

accounts = await ethers.getSigners()
token = await hre.contracts.Token.connect(accounts[0])
await token.approve('0x5DE9A13C486f5aA12F4D8e5E77246F6E24dac274', '1000000000000000000000')

billing = await hre.contracts.Billing.connect(accounts[0])
await billing.setGateway('0x93606b27cB5e4c780883eC4F6b7Bed5f6572d1dd')
await billing.add('1000000000000000000')
await billing.remove('0x93606b27cB5e4c780883eC4F6b7Bed5f6572d1dd','500000000000000000')
await billing.pull('0x93606b27cB5e4c780883eC4F6b7Bed5f6572d1dd', '500000000000000000')
```