import inquirer from 'inquirer'

export const DEFAULT_DEPOSITORS_FILE = './tasks/ops/depositors.json'
export const DEFAULT_CONTRACT_DEPOSITORS_FILE = './tasks/ops/contract-depositors.json'
export const DEFAULT_BILLING_SUBGRAPH = 'https://api.thegraph.com/subgraphs/name/graphprotocol/billing'

export async function askForConfirmation(message: string): Promise<boolean> {
  const res = await inquirer.prompt({
    name: 'confirm',
    type: 'confirm',
    message,
  })
  return res.confirm
}
