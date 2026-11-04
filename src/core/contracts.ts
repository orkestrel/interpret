import type { ContractInterface } from '@orkestrel/contract'
import { createContract } from '@orkestrel/contract'
import { arrayShape } from '@orkestrel/contract'
import { interpretationShape, readNumberShape } from './shapers.js'

/** Publishes an `Interpretation`'s JSON projection as a contract, read through `projectInterpretation`. */
export const interpretationContract: ContractInterface<unknown> =
	createContract(interpretationShape)

/** Publishes what `readNumbers` returns as a contract. */
export const readNumbersContract: ContractInterface<unknown> = createContract(
	arrayShape(readNumberShape),
)
