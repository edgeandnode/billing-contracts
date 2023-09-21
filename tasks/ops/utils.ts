import inquirer from 'inquirer'
import path from 'path'
import { Artifacts } from 'hardhat/internal/artifacts'
import { LinkReferences } from 'hardhat/types'
import { utils } from 'ethers'

export const DEFAULT_DEPOSITORS_FILE = './tasks/ops/depositors.json'
export const DEFAULT_BILLING_SUBGRAPH = 'https://api.thegraph.com/subgraphs/name/graphprotocol/billing'
export const DEFAULT_BATCH_SIZE = 200

export async function askForConfirmation(message: string): Promise<boolean> {
  const res = await inquirer.prompt({
    name: 'confirm',
    type: 'confirm',
    message,
  })
  return res.confirm
}

type Abi = Array<string | utils.FunctionFragment | utils.EventFragment | utils.ParamType>

type Artifact = {
  contractName: string
  abi: Abi
  bytecode: string
  deployedBytecode: string
  linkReferences?: LinkReferences
  deployedLinkReferences?: LinkReferences
}

const ARTIFACTS_PATH = path.resolve('build/artifacts')

const artifacts = new Artifacts(ARTIFACTS_PATH)

export const loadArtifact = (name: string): Artifact => {
  return artifacts.readArtifactSync(name)
}
