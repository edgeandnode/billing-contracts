import fs from 'fs'
import { BigNumber, utils } from 'ethers'

async function main() {
  const csv = fs.readFileSync('./tasks/ops/spreadsheet.csv').toString()
  const lines = csv.split(/\r?\n/).slice(1)

  const data = lines
    .map((line) => {
      const [balance, address] = line.split(',')

      return {
        balance: utils.parseEther(balance),
        address,
      }
    })
    .filter(({ balance }) => balance.gt(0))

  console.log('asd,', data)
  fs.writeFileSync('./tasks/ops/depositors.json', JSON.stringify(data, null, 2))
}

main()
  .then(() => process.exit())
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
