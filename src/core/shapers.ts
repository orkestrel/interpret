import type { ContractShape } from '@orkestrel/contract'
import {
	arrayShape,
	booleanShape,
	jsonShape,
	literalShape,
	numberShape,
	objectShape,
	optionalShape,
	stringShape,
} from '@orkestrel/contract'
import {
	createDefinitionShape,
	createSymbolicExpressionShape,
	faultShape,
	fieldPathShape,
} from '@orkestrel/reason'
import {
	INTERPRET_ERROR_CODES,
	INTERPRET_STAGES,
	NUMBER_FOREIGN_KINDS,
	NUMBER_UNREADABLE_REASONS,
	PROVENANCE_CATEGORIES,
} from './constants.js'

// A recipe and an interpretation as shapes, so they reach an LLM, a tool, and MCP as JSON Schema.
// An interpretation is shaped in its JSON projection, where a non-finite number is `null`.

/** Describes a number `scanNumbers` read. */
export const readNumberShape: ContractShape = objectShape({
	raw: stringShape(),
	start: numberShape(),
	end: numberShape(),
	value: optionalShape(numberShape()),
	unreadable: optionalShape(literalShape(NUMBER_UNREADABLE_REASONS)),
	foreign: optionalShape(literalShape(NUMBER_FOREIGN_KINDS)),
	money: optionalShape(booleanShape()),
	percent: optionalShape(booleanShape()),
	scaled: optionalShape(booleanShape()),
	word: optionalShape(booleanShape()),
	hedged: optionalShape(booleanShape()),
	suspect: optionalShape(booleanShape()),
	changed: optionalShape(booleanShape()),
	composite: optionalShape(booleanShape()),
	loose: optionalShape(booleanShape()),
	magnitude: optionalShape(booleanShape()),
	weak: optionalShape(booleanShape()),
	tail: optionalShape(booleanShape()),
	yearish: optionalShape(booleanShape()),
	phone: optionalShape(booleanShape()),
	reference: optionalShape(stringShape()),
	unit: optionalShape(stringShape()),
	sentence: numberShape(),
	segment: numberShape(),
})

/** Describes an `EntityMapping`. */
export const entityMappingShape: ContractShape = objectShape({
	entity: stringShape(),
	aliases: arrayShape(stringShape()),
	field: fieldPathShape,
})

/**
 * Creates the shape of a `Recipe`.
 *
 * @remarks
 * A function because a definition's shape is recursive and costs at import. `shape` is any
 * JSON value here. A `ContractShape` is recursive too, so the guard reads it.
 *
 * @returns The recipe's shape
 *
 * @example
 * ```ts
 * import { createContract } from '@orkestrel/contract'
 * import { createRecipeShape } from '@orkestrel/interpret'
 *
 * createContract(createRecipeShape()).is({ id: 'r' }) // false
 * ```
 */
export function createRecipeShape(): ContractShape {
	return objectShape({
		id: stringShape(),
		name: stringShape(),
		domain: stringShape(),
		intents: arrayShape(stringShape()),
		mappings: arrayShape(entityMappingShape),
		computations: arrayShape(
			objectShape({ field: fieldPathShape, expression: createSymbolicExpressionShape() }),
		),
		definition: createDefinitionShape(),
		shape: jsonShape(),
	})
}

/** Describes a `Provenance`. */
export const provenanceShape: ContractShape = objectShape({
	category: literalShape(PROVENANCE_CATEGORIES),
	detail: optionalShape(stringShape()),
})

/** Describes an `Intent`. */
export const intentShape: ContractShape = objectShape({
	action: optionalShape(stringShape()),
	domain: optionalShape(stringShape()),
	confidence: numberShape(),
})

/** Describes an `Entity` in its JSON projection. */
export const entityShape: ContractShape = objectShape({
	name: stringShape(),
	field: optionalShape(fieldPathShape),
	value: optionalShape(jsonShape()),
	provenance: provenanceShape,
	confidence: numberShape(),
})

/** Describes an `Ambiguity`. */
export const ambiguityShape: ContractShape = objectShape({
	field: fieldPathShape,
	question: stringShape(),
	candidates: arrayShape(stringShape()),
	required: booleanShape(),
	fault: optionalShape(faultShape),
})

/** Describes a `FieldMapping` in its JSON projection. */
export const fieldMappingShape: ContractShape = objectShape({
	field: fieldPathShape,
	entity: optionalShape(stringShape()),
	value: optionalShape(jsonShape()),
	provenance: provenanceShape,
	confidence: numberShape(),
})

/** Describes a `StageRecord` in its JSON projection. */
export const stageRecordShape: ContractShape = objectShape({
	stage: literalShape(INTERPRET_STAGES),
	input: optionalShape(jsonShape()),
	output: optionalShape(jsonShape()),
	failed: booleanShape(),
	error: optionalShape(stringShape()),
})

/** Describes a `StageFailure`. */
export const stageFailureShape: ContractShape = objectShape({
	stage: literalShape(INTERPRET_STAGES),
	code: literalShape(INTERPRET_ERROR_CODES),
	message: stringShape(),
})

/** Describes an `Interpretation` in its JSON projection. */
export const interpretationShape: ContractShape = objectShape({
	text: stringShape(),
	normalized: stringShape(),
	intent: intentShape,
	recipe: optionalShape(stringShape()),
	version: optionalShape(numberShape()),
	entities: arrayShape(entityShape),
	subject: optionalShape(jsonShape()),
	definition: optionalShape(jsonShape()),
	mappings: arrayShape(fieldMappingShape),
	ambiguities: arrayShape(ambiguityShape),
	repairs: arrayShape(faultShape),
	defaulted: arrayShape(fieldPathShape),
	prompt: stringShape(),
	stages: arrayShape(stageRecordShape),
	failures: arrayShape(stageFailureShape),
	confidence: numberShape(),
	digest: stringShape(),
})
