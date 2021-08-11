/* 
- Raw data for users array obtained from the subgraph query below
- Will always return the same amount since it is a time travel query, thus we store it here
- Subgraph ID = QmW1idPy9b2YrJWpc8iPSkWvWSMMdXqepabd3Q2deaVhUz
- https://thegraph.com/legacy-explorer/subgraph/graphprotocol/billing?query=Users%20At%20Block

      {
        users(
          block:{number: 17803963},
          first: 1000,
          where: {billingBalance_gt: "0"},
          orderBy: billingBalance,
          orderDirection: desc
        ) {
          id
          billingBalance
        }
      }

*/

export const userData = [
  {
    billingBalance: '10000000000000000000000',
    id: '0x8d2aa089af73e788cf7afa1f94bf4cf2cde0db61',
  },
  {
    billingBalance: '8053830268950988531669',
    id: '0x42840a91540030de6e5d4b0a87664e87c4742a6a',
  },
  {
    billingBalance: '5000000000000000000000',
    id: '0xfcb576bc8ee187945fa00f0daa7bbe9c1b51b0c9',
  },
  {
    billingBalance: '5000000000000000000000',
    id: '0x84ef9d47a2b1cbfc2f011f886287ef44f08c80ab',
  },
  {
    billingBalance: '5000000000000000000000',
    id: '0x24d123ddacfed44e253559446879da7cbdfe6d92',
  },
]
