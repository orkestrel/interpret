import type { ContractInterface } from '@orkestrel/contract'
import { createContract } from '@orkestrel/contract'
import { interpretationShape } from './shapers.js'

/** Publishes an `Interpretation`'s JSON projection as a contract, read through `projectInterpretation`. */
export const interpretationContract: ContractInterface<unknown> =
	createContract(interpretationShape)
