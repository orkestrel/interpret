import type { ContractShape } from '@orkestrel/contract'
import {
	arrayShape,
	auditFaultShape,
	booleanShape,
	jsonShape,
	literalShape,
	numberShape,
	objectShape,
	optionalShape,
	recordShape,
	shapeShape,
	stringShape,
} from '@orkestrel/contract'
import {
	CHECK_STATES,
	checkResultShape,
	createDefinitionShape,
	createSymbolicExpressionShape,
	fieldPathShape,
	reasonRefusalShape,
} from '@orkestrel/reason'
import {
	ACCOUNT_ROLES,
	ACCOUNT_SHAPE_DEPTH,
	GAP_PARTS,
	GAP_WORDS,
	INTERPRET_ERROR_CODES,
	INTERPRET_STAGES,
	NUMBER_FOREIGN_KINDS,
	NUMBER_UNREADABLE_REASONS,
	NUMBER_REFUSAL_REASONS,
	NUMBER_REFUSAL_LIMIT,
	PROVENANCE_CATEGORIES,
} from './constants.js'

// A recipe, an interpretation, an amendment, and an account as shapes, so they reach an LLM, a tool,
// and MCP as JSON Schema. An interpretation and an account are shaped in their JSON projections,
// where a non-finite number is `null`.

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

/** Describes one refusal record with structurally valid, unordered nonnegative integer positions. */
export const numberRefusalShape: ContractShape = objectShape({
	text: stringShape(),
	start: numberShape({ min: 0, integer: true }),
	end: numberShape({ min: 0, integer: true }),
	reason: literalShape(NUMBER_REFUSAL_REASONS),
	unreadable: optionalShape(literalShape(NUMBER_UNREADABLE_REASONS)),
	word: optionalShape(stringShape()),
	field: optionalShape(fieldPathShape),
})

/** Describes bounded refusal items and a nonnegative integer omitted count. */
export const numberRefusalsShape: ContractShape = objectShape({
	items: arrayShape(numberRefusalShape, { max: NUMBER_REFUSAL_LIMIT }),
	omitted: numberShape({ min: 0, integer: true }),
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
 * A function because a definition's shape is recursive and costs at import.
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
		shape: shapeShape(),
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
	fault: optionalShape(auditFaultShape()),
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

/** Describes a `GlossaryGap`. */
export const glossaryGapShape: ContractShape = objectShape({
	word: literalShape(GAP_WORDS),
	field: optionalShape(fieldPathShape),
	unit: optionalShape(stringShape()),
	part: optionalShape(literalShape(GAP_PARTS)),
	id: optionalShape(stringShape()),
})

/**
 * Describes an `AccountSource` in its JSON projection.
 *
 * @remarks
 * A check's `value` and an `actual` are arbitrary data, so each is what `projectAccount` projects
 * of it: a non-finite number as `null`, and a value with no JSON form absent. A check's `operator`
 * is any string, because a run that refuses an unknown one carries it as authored.
 */
export const accountSourceShape: ContractShape = objectShape({
	rule: optionalShape(stringShape()),
	group: optionalShape(stringShape()),
	factor: optionalShape(stringShape()),
	equation: optionalShape(stringShape()),
	deduction: optionalShape(stringShape()),
	fact: optionalShape(stringShape()),
	finding: optionalShape(stringShape()),
	scope: optionalShape(stringShape()),
	line: optionalShape(stringShape()),
	pass: optionalShape(stringShape()),
	check: optionalShape(
		objectShape({
			field: fieldPathShape,
			operator: stringShape(),
			value: optionalShape(jsonShape()),
		}),
	),
	result: optionalShape(checkResultShape),
	fault: optionalShape(auditFaultShape()),
	refusal: optionalShape(reasonRefusalShape),
})

/**
 * Creates the shape of an `AccountLine` in its JSON projection, spelling out `depth` levels of lines.
 *
 * @remarks
 * A line at the last level holds any JSON values under `lines`, because a shape refuses cycles and
 * an account nests as deep as its rules chain. `isAccountLine` reads every level.
 *
 * @param depth - How many levels to spell out. Default: `ACCOUNT_SHAPE_DEPTH`
 * @returns The line's shape
 *
 * @example
 * ```ts
 * import { createContract } from '@orkestrel/contract'
 * import { buildAccountLine, createAccountLineShape } from '@orkestrel/interpret'
 *
 * const line = createContract(createAccountLineShape(1))
 * line.is(buildAccountLine({ role: 'step', text: 'Loan holds' })) // true
 * line.is({ role: 'step' }) // false
 * ```
 */
export function createAccountLineShape(depth: number = ACCOUNT_SHAPE_DEPTH): ContractShape {
	return objectShape({
		role: literalShape(ACCOUNT_ROLES),
		state: optionalShape(literalShape(CHECK_STATES)),
		decisive: booleanShape(),
		text: stringShape(),
		summary: stringShape(),
		source: accountSourceShape,
		gaps: arrayShape(glossaryGapShape),
		lines: arrayShape(depth <= 1 ? jsonShape() : createAccountLineShape(depth - 1)),
	})
}

/** Describes an `Account` in its JSON projection, which `projectAccount` gives. */
export const accountShape: ContractShape = objectShape({
	id: stringShape(),
	name: stringShape(),
	success: optionalShape(booleanShape()),
	lines: arrayShape(createAccountLineShape()),
})

/** Describes an `EntityInput`. */
export const entityInputShape: ContractShape = objectShape({
	name: stringShape(),
	value: jsonShape(),
})

/** Describes an `Amendment`. */
export const amendmentShape: ContractShape = objectShape({
	entities: optionalShape(arrayShape(entityInputShape)),
	removed: optionalShape(arrayShape(stringShape())),
})

/** Describes a `StageFailure`. */
export const stageFailureShape: ContractShape = objectShape({
	stage: literalShape(INTERPRET_STAGES),
	code: literalShape(INTERPRET_ERROR_CODES),
	message: stringShape(),
})

/** Describes an `Interpretation` in its JSON projection. */
export const interpretationShape: ContractShape = objectShape({
	refusals: optionalShape(numberRefusalsShape),
	text: stringShape(),
	normalized: stringShape(),
	intent: intentShape,
	recipe: optionalShape(stringShape()),
	version: optionalShape(numberShape()),
	entities: arrayShape(entityShape),
	subject: optionalShape(recordShape(jsonShape())),
	definition: optionalShape(recordShape(jsonShape())),
	mappings: arrayShape(fieldMappingShape),
	ambiguities: arrayShape(ambiguityShape),
	repairs: arrayShape(auditFaultShape()),
	defaulted: arrayShape(fieldPathShape),
	prompt: stringShape(),
	stages: arrayShape(stageRecordShape),
	failures: arrayShape(stageFailureShape),
	confidence: numberShape(),
	digest: stringShape(),
})
