import type { ContractInterface } from '@orkestrel/contract'
import { createContract } from '@orkestrel/contract'
import { arrayShape } from '@orkestrel/contract'
import { accountShape, amendmentShape, interpretationShape, readNumberShape } from './shapers.js'

/** Publishes an `Interpretation`'s JSON projection as a contract, read through `projectInterpretation`. */
export const interpretationContract: ContractInterface<unknown> =
	createContract(interpretationShape)

/** Publishes an `Account`'s JSON projection as a contract, read through `projectAccount`. */
export const accountContract: ContractInterface<unknown> = createContract(accountShape)

/** Publishes an `Amendment` as a contract, which `amend` admits one through. */
export const amendmentContract: ContractInterface<unknown> = createContract(amendmentShape)

/** Publishes what `scanNumbers` returns as a contract. */
export const readNumbersContract: ContractInterface<unknown> = createContract(
	arrayShape(readNumberShape),
)
