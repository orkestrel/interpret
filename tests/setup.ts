// Base test setup — environment-agnostic helpers loaded first by every
// Vitest project (`setupFiles[0]`). Keep this file free of `node:*` and of
// `document` / `window` / Vue: DOM/Vue helpers live in `setupBrowser.ts`.
//
// Scoped to the `interprets` corpus this workspace ships today
// (`.claude/rules/tests.md` § Test contract): the interprets fixture builders
// and the reason-result narrower the suites actually import. Generic test
// infrastructure — recorders, recorder maps, error capture, unchecked
// invocation — comes from `@orkestrel/test`, which every suite imports
// directly. A dep-originating symbol (`@orkestrel/reason` /
// `@orkestrel/contract`) is imported from its OWN package here, never from
// `@src/core` — the barrel re-exports only local `interprets` modules
// (`.claude/rules/architecture.md` § Barrel exports).

import type { ContractShape, FieldPath } from '@orkestrel/contract'
import type { Decision, ProgramDefinition, ProgramResult, Status } from '@orkestrel/program'
import type {
	Eligibility,
	Finding,
	QualificationDefinition,
	QualificationResult,
} from '@orkestrel/qualifier'
import type { RatingDefinition, RatingResult } from '@orkestrel/rater'
import type {
	Bounds,
	ChainStrategy,
	CheckState,
	Definition,
	Expression,
	FactorRange,
	InferentialDefinition,
	LogicalDefinition,
	LogicalOperator,
	MathOperation,
	QuantitativeDefinition,
	ReasonResult,
	Subject,
	SymbolicDefinition,
	SymbolicExpression,
	SymbolicResult,
} from '@orkestrel/reason'
import type {
	Account,
	AccountLine,
	Amendment,
	Entity,
	ExtractorInterface,
	ExtractResult,
	Glossary,
	Interpretation,
	RecordStamp,
	Recipe,
} from '@src/core'
import {
	arrayShape,
	booleanShape,
	dateShape,
	functionShape,
	integerShape,
	isArray,
	isRecord,
	jsonShape,
	literalShape,
	nullShape,
	numberShape,
	objectShape,
	oneOfShape,
	optionalShape,
	seededRandom,
	shapeShape,
	stringShape,
	unionShape,
} from '@orkestrel/contract'
import {
	buildNotice,
	buildProgramDefinition,
	createProgram,
	isProgramResult,
} from '@orkestrel/program'
import {
	createQualificationDefinition,
	createQualifier,
	createRuling,
	isQualificationResult,
} from '@orkestrel/qualifier'
import {
	buildLineDefinition,
	buildRatingDefinition,
	createRater,
	isRatingResult,
} from '@orkestrel/rater'
import {
	createAtom,
	createCompound,
	createConstant,
	createEquation,
	createFact,
	createFactorGroup,
	createFieldFactor,
	createInference,
	createInferentialDefinition,
	createInferentialReasoner,
	createLogicalDefinition,
	createLogicalReasoner,
	createLookupFactor,
	createOperation,
	createQuantitativeDefinition,
	createQuantitativeReasoner,
	createRangeFactor,
	createReason,
	createRule,
	createStaticFactor,
	createSymbolicDefinition,
	createSymbolicReasoner,
	createVariable,
	extractAtoms,
	formatField,
	MATH_OPERATIONS,
} from '@orkestrel/reason'
import { Extractor, Interpret, InterpretContext, RecordManager } from '@src/core'
import { createContract } from '@orkestrel/contract'
import { projectValue } from '@orkestrel/reason'
import * as surface from '@src/core'

/** Builds the standing shape/guard table from real interpretation outcomes. */
export function buildInterpretContractCases() {
	const interpret = buildCorpusInterpret()
	const positive = interpret.interpret('calculate insurance age 25')
	interpret.destroy()
	return {
		definitions: [
			{
				name: 'recipe',
				wire: surface.createRecipeContract(),
				guard: surface.isRecipe,
				positive: buildInsuranceRecipe(),
			},
			{
				name: 'entity mapping',
				wire: createContract(surface.entityMappingShape),
				guard: surface.isEntityMapping,
				positive: { entity: 'age', aliases: [], field: 'age' },
			},
			{
				name: 'number refusal',
				wire: createContract(surface.numberRefusalShape),
				guard: surface.isNumberRefusal,
				positive: { text: '3', start: 0, end: 1, reason: 'unanchored' },
			},
			{
				name: 'number refusals',
				wire: createContract(surface.numberRefusalsShape),
				guard: surface.isNumberRefusals,
				positive: { items: [], omitted: 0 },
			},
			{
				name: 'entity input',
				wire: createContract(surface.entityInputShape),
				guard: surface.isEntityInput,
				positive: { name: 'age', value: 25 },
			},
			{
				name: 'amendment',
				wire: surface.amendmentContract,
				guard: surface.isAmendment,
				positive: { entities: [{ name: 'age', value: 25 }], removed: ['term'] },
				negative: { remove: ['term'] },
			},
		].map((row) => ({ negative: {}, ...row, direction: 'is implies guard', project: undefined })),
		results: [
			{
				name: 'interpretation',
				wire: surface.interpretationContract,
				guard: surface.isInterpretation,
				positive,
				project: surface.projectInterpretation,
				direction: 'producer implies wire after projection',
				negative: {},
			},
		],
		numbers: [
			{
				name: 'read number',
				wire: createContract(surface.readNumberShape),
				positive: surface.scanNumbers('25')[0],
			},
			{
				name: 'read numbers',
				wire: surface.readNumbersContract,
				positive: surface.scanNumbers('25'),
			},
		].map((row) => ({
			...row,
			direction: 'producer implies wire after projection',
			project: projectValue,
			guard: undefined,
			negative: {},
		})),
		members: [
			{
				name: 'provenance',
				wire: createContract(surface.provenanceShape),
				guard: surface.isProvenance,
				positive: { category: 'extracted' },
			},
			{
				name: 'intent',
				wire: createContract(surface.intentShape),
				guard: surface.isIntent,
				positive: { confidence: 0 },
			},
			{
				name: 'entity',
				wire: createContract(surface.entityShape),
				guard: surface.isEntity,
				positive: { name: 'age', value: NaN, provenance: { category: 'extracted' }, confidence: 1 },
			},
			{
				name: 'field mapping',
				wire: createContract(surface.fieldMappingShape),
				guard: surface.isFieldMapping,
				positive: {
					field: 'age',
					value: NaN,
					provenance: { category: 'extracted' },
					confidence: 1,
				},
			},
			{
				name: 'ambiguity',
				wire: createContract(surface.ambiguityShape),
				guard: surface.isAmbiguity,
				positive: { field: 'age', question: 'Age?', candidates: [], required: true },
			},
			{
				name: 'stage record',
				wire: createContract(surface.stageRecordShape),
				guard: surface.isStageRecord,
				positive: { stage: 'normalize', failed: false },
			},
			{
				name: 'stage failure',
				wire: createContract(surface.stageFailureShape),
				guard: surface.isStageFailure,
				positive: { stage: 'format', code: 'FORMAT_FAILED', message: 'failed' },
			},
			{
				name: 'glossary gap',
				wire: createContract(surface.glossaryGapShape),
				guard: surface.isGlossaryGap,
				positive: { word: 'name', part: 'rule', id: 'adult' },
			},
			{
				name: 'account line',
				wire: createContract(surface.createAccountLineShape()),
				guard: surface.isAccountLine,
				positive: surface.buildAccountLine({
					role: 'reason',
					text: 'Age is not known',
					source: { check: { field: 'age', operator: 'from', value: NaN } },
				}),
			},
			{
				name: 'account',
				wire: surface.accountContract,
				guard: surface.isAccount,
				positive: {
					id: 'loan',
					name: 'Loan',
					lines: [surface.buildAccountLine({ role: 'verdict', text: 'Loan holds' })],
				},
			},
		].map((row) => ({
			...row,
			direction: 'producer implies wire after projection',
			project: projectValue,
			negative: { confidence: 'invalid' },
		})),
	}
}

/** Covers the JSON kinds a shape default can hold, including nested cloned objects. */
export const DEFAULT_RENDERINGS = [
	{ value: { nested: { enabled: true } }, rendered: 'object' },
	{ value: [{ enabled: true }], rendered: 'array' },
	{ value: 'plain text', rendered: 'plain text' },
	{ value: 42, rendered: '42' },
	{ value: true, rendered: 'true' },
	{ value: null, rendered: 'null' },
]

/** Holds the reviewer messages that must keep asking without an unstated value. */
export const REFUSAL_READINGS = [
	{
		text: '1 – 3 years',
		names: ['years'],
		items: [
			{ text: '"1"', start: 0, end: 1, reason: 'unanchored' },
			{ text: '"3"', start: 4, end: 5, reason: 'preceding-word', word: '"–"', field: 'years' },
		],
	},
	{
		text: 'amount 50000 income 120000',
		names: ['amount', 'income'],
		items: [
			{ text: '"50000"', start: 7, end: 12, reason: 'anchor-tie', field: 'income' },
			{ text: '"120000"', start: 20, end: 26, reason: 'anchor-tie', field: 'income' },
		],
	},
	{
		text: 'amount 3_000_000',
		names: ['amount'],
		items: [
			{
				text: '"3_000_000"',
				start: 7,
				end: 16,
				reason: 'unreadable',
				unreadable: 'undeclared',
				field: 'amount',
			},
		],
	},
	{
		text: 'years 3 months',
		names: ['years'],
		items: [
			{ text: '"3"', start: 6, end: 7, reason: 'following-word', word: '"months"', field: 'years' },
		],
	},
	{
		text: 'amount 3 000 000',
		names: ['amount'],
		items: [
			{
				text: '"3 000 000"',
				start: 7,
				end: 16,
				reason: 'unreadable',
				unreadable: 'grouping',
				field: 'amount',
			},
		],
	},
	{
		text: 'amount 50000 income 120000 years',
		names: ['amount', 'income', 'years'],
		items: [
			{ text: '"50000"', start: 7, end: 12, reason: 'anchor-tie', field: 'income' },
			{ text: '"120000"', start: 20, end: 26, reason: 'anchor-tie', field: 'income' },
		],
	},
	{
		text: 'value 25, sorry, 30',
		names: ['value'],
		items: [
			{ text: '"25"', start: 6, end: 8, reason: 'correction', field: 'value' },
			{ text: '"30"', start: 17, end: 19, reason: 'unanchored' },
		],
	},
	{
		text: 'not value 25',
		names: ['value'],
		items: [{ text: '"25"', start: 10, end: 12, reason: 'negation', field: 'value' }],
	},
	{
		text: 'value? 25',
		names: ['value'],
		items: [{ text: '"25"', start: 7, end: 9, reason: 'unanchored' }],
	},
	{ text: 'value 25', names: ['value'], items: [] },
	{
		text: 'values 10, 20 months',
		names: ['values'],
		collection: true,
		items: [
			{ text: '"10"', start: 7, end: 9, reason: 'following-word', word: '","', field: 'values' },
			{
				text: '"20"',
				start: 11,
				end: 13,
				reason: 'collection',
				field: 'values',
			},
		],
	},
]

export const REFUSAL_RECORDS = [
	{
		label: 'valid',
		record: {
			items: [
				{
					text: '"3"',
					start: 6,
					end: 7,
					reason: 'following-word',
					word: '"months"',
					field: 'years',
				},
			],
			omitted: 0,
		},
		valid: true,
	},
	{
		label: 'reversed span is structurally valid',
		record: { items: [{ text: '"3"', start: 7, end: 6, reason: 'unanchored' }], omitted: 0 },
		valid: true,
	},
	{
		label: 'unknown reason',
		record: { items: [{ text: '"3"', start: 6, end: 7, reason: 'invented' }], omitted: 0 },
		valid: false,
	},
	{ label: 'negative omitted', record: { items: [], omitted: -1 }, valid: false },
	{ label: 'fractional omitted', record: { items: [], omitted: 0.5 }, valid: false },
	{
		label: 'negative start',
		record: { items: [{ text: '"3"', start: -1, end: 7, reason: 'unanchored' }], omitted: 0 },
		valid: false,
	},
	{
		label: 'fractional end',
		record: { items: [{ text: '"3"', start: 6, end: 7.5, reason: 'unanchored' }], omitted: 0 },
		valid: false,
	},
	{
		label: 'over cap',
		record: {
			items: Array.from({ length: 33 }, () => ({
				text: '"3"',
				start: 6,
				end: 7,
				reason: 'unanchored',
			})),
			omitted: 0,
		},
		valid: false,
	},
]

/** Holds the mapping each refusal sentence's text is compiled against, keyed by its entity. */
export const REFUSAL_MAPPINGS = {
	rate: { entity: 'rate', aliases: [], field: 'rate' },
	years: { entity: 'years', aliases: [], field: ['plan', 'years'] },
	values: { entity: 'values', aliases: [], field: 'values' },
} as const

/** Holds, for each refusal reason, a real text, its mappings, and its sentence, with `rate` worded. */
export const REFUSAL_SENTENCES = [
	[
		'preceding-word',
		'about 5 years',
		[REFUSAL_MAPPINGS.years],
		'"5" was not taken, because the way it is written makes it uncertain (considered for plan.years)',
	],
	[
		'preceding-word',
		'the 5ish years',
		[REFUSAL_MAPPINGS.years],
		'"5ish" was not taken, because the way it is written makes it uncertain (considered for plan.years)',
	],
	[
		'preceding-word',
		'1 – 3 years',
		[REFUSAL_MAPPINGS.years],
		'"3" was not taken, because the way it is written makes it uncertain (considered for plan.years)',
	],
	[
		'following-word',
		'years 3 months',
		[REFUSAL_MAPPINGS.years],
		'"3" was not taken, because what comes after it makes it uncertain (considered for plan.years)',
	],
	[
		'unreadable',
		'rate 12 to 18',
		[REFUSAL_MAPPINGS.rate],
		'"12" was not taken, because it is part of a range or a choice (considered for the RATE)',
	],
	[
		'anchor-tie',
		'rate 5 rate 6',
		[REFUSAL_MAPPINGS.rate],
		'"5" was not taken, because it is not clear which number goes with which value (considered for the RATE)',
	],
	[
		'anchor-tie',
		'years 5 rate',
		[REFUSAL_MAPPINGS.years, REFUSAL_MAPPINGS.rate],
		'"5" was not taken, because it is not clear which number goes with which value',
	],
	[
		'anchor-conflict',
		'rate 5, rate 6',
		[REFUSAL_MAPPINGS.rate],
		'"5" was not taken, because the text gives more than one number for the same value (considered for the RATE)',
	],
	[
		'correction',
		'wait, rate 5, rate 6',
		[REFUSAL_MAPPINGS.rate],
		'"5" was not taken, because the text may be correcting or replacing it (considered for the RATE)',
	],
	[
		'negation',
		'I cannot pay rate 5',
		[REFUSAL_MAPPINGS.rate],
		'"5" was not taken, because the same part of the text holds a negation (considered for the RATE)',
	],
	[
		'unanchored',
		'7 apples',
		[REFUSAL_MAPPINGS.rate],
		'"7" was not taken, because it could not be tied to a value',
	],
	[
		'collection',
		'values 5 to 6',
		[REFUSAL_MAPPINGS.values],
		'"6" was not taken, because another number in the same list was not (considered for values)',
	],
] as const

/** Holds, for each cause the reader produces, a real text, what it refuses there, and the words. */
export const UNREADABLE_SENTENCES = [
	['undeclared', 'rate 1.2m', '1.2m', 'it is not written as a plain number'],
	['fraction', 'rate half a cup', 'half', 'it is a fraction'],
	['foreign currency', 'rate 50 cents', '50 cents', 'it is in a currency unit other than dollars'],
	[
		'grouping',
		'rate 200.000',
		'200.000',
		'its digits are grouped in a way that could mean two numbers',
	],
	['shorthand', 'rate six figures', 'six figures', 'it is written in shorthand'],
	['spoken', 'rate twelve fifty', 'twelve fifty', 'it is written the way it is spoken'],
	[
		'joined',
		'rate two thousand and five hundred',
		'two thousand',
		'its words can be joined in more than one way',
	],
	['frequency', 'rate twice a week', 'twice', 'it says how often, not how many'],
	['loose', 'rate a couple', 'couple', 'it is not an exact amount'],
	['range', 'rate 12 to 18', '12', 'it is part of a range or a choice'],
	['dimensions', 'rate 20 x 30', '20', 'it is part of a set of dimensions'],
	['overflow', 'rate 9007199254740993', '9007199254740993', 'it is too large to hold exactly'],
	[
		'precision',
		'rate 1.1234567891k',
		'1.1234567891k',
		'it has more decimal places than can be kept',
	],
] as const

/** Holds the records `explain` admits as neither a number refusal nor an audit fault. */
export const MALFORMED_RECORDS: readonly unknown[] = [
	{ reason: 'type' },
	{ reason: 'type', path: ['a'], expected: 'number' },
	{ reason: 'unanchored', text: '5', start: -1, end: 0 },
	{ reason: 'other', text: '5', start: 0, end: 1 },
	{ reason: 'toString', text: '5', start: 0, end: 1 },
	{ reason: '__proto__', path: ['a'] },
]

/** Holds records whose own text is blank, broken over lines, or a slot, with each one's sentence. */
export const STRANGE_RECORDS: ReadonlyArray<readonly [record: unknown, text: string]> = [
	[
		{ text: ' ', start: 0, end: 1, reason: 'unanchored' },
		'" " was not taken, because it could not be tied to a value',
	],
	[
		{ text: 'a\nb {{text}}', start: 0, end: 1, reason: 'unanchored', field: ['c\nd'] },
		'a b {{text}} was not taken, because it could not be tied to a value (considered for c d)',
	],
	[
		{ reason: 'type', path: ['a\nb'], expected: 'number', received: 'c\u{2028}d' },
		'a b must be a number, and c d is not',
	],
	[
		{ reason: 'type', path: [], expected: 'number', received: ' ' },
		'"" must be a number, and " " is not',
	],
	[{ reason: 'extra', path: ['__proto__'] }, '__proto__ is not expected'],
	[
		{
			reason: 'constraint',
			path: ['a'],
			expected: 'number',
			constraint: 'min',
			received: '5',
		},
		'a must be at least not known, and 5 is not',
	],
	[
		{
			reason: 'constraint',
			path: ['a'],
			expected: 'number',
			constraint: 'max',
			limit: 5,
			received: 'Infinity',
		},
		'a is not known, and must be at most 5',
	],
	[
		{ reason: 'type', path: ['a'], expected: 'number', received: 'undefined' },
		'a is not known, and must be a number',
	],
]

/** Holds one shape of each kind a subject door's fault can expect, keyed by that kind. */
export const FAULT_SHAPES = {
	string: stringShape(),
	date: dateShape(),
	number: numberShape(),
	integer: integerShape(),
	boolean: booleanShape(),
	null: nullShape(),
	literal: literalShape(['a', 'b']),
	array: arrayShape(numberShape()),
	object: objectShape({}),
	json: jsonShape(),
	shape: shapeShape(),
	function: functionShape(),
}

/** Holds what each kind of `FAULT_SHAPES` is called. */
export const FAULT_WORDS: Readonly<Record<string, string>> = {
	string: 'text',
	date: 'a date',
	number: 'a number',
	integer: 'a whole number',
	boolean: 'true or false',
	null: 'none',
	literal: 'one of its allowed values',
	array: 'a list',
	object: 'a record',
	json: 'plain data',
	shape: 'a shape description',
	function: 'a function',
}

/** Holds a field's shape, a value outside it, and the sentence, with the field worded as money. */
export const FAULT_BOUNDS: ReadonlyArray<
	readonly [shape: ContractShape, value: unknown, text: string]
> = [
	[numberShape({ min: 1250 }), 5, 'the AMOUNT must be at least $1,250.00, and $5.00 is not'],
	[numberShape({ over: 5 }), 5, 'the AMOUNT must be more than $5.00, and $5.00 is not'],
	[numberShape({ max: 5 }), 9, 'the AMOUNT must be at most $5.00, and $9.00 is not'],
	[
		numberShape({ max: 5 }),
		1e21,
		'the AMOUNT must be at most $5.00, and $1,000,000,000,000,000,000,000.00 is not',
	],
	[numberShape({ under: 5 }), 5, 'the AMOUNT must be less than $5.00, and $5.00 is not'],
	// The money format rounds to cents, so a number it would not tell from the limit prints plain.
	[numberShape({ max: 5 }), 5.001, 'the AMOUNT must be at most $5.00, and 5.001 is not'],
	[integerShape(), 1.5, 'the AMOUNT must be a whole number, and $1.50 is not'],
	[integerShape(), 1.999, 'the AMOUNT must be a whole number, and 1.999 is not'],
	[
		stringShape({ pattern: /^a+$/ }),
		'b',
		'the AMOUNT must be in the expected form, and "b" is not',
	],
	[dateShape(), '2024-02-30', 'the AMOUNT must be a valid date, and "2024-02-30" is not'],
	[stringShape({ min: 1200 }), 'a', 'the AMOUNT must have a length of at least 1200'],
	[stringShape({ max: 3 }), 'abcd', 'the AMOUNT must have a length of at most 3'],
	[arrayShape(numberShape(), { min: 2 }), [1], 'the AMOUNT must have a length of at least 2'],
	[arrayShape(numberShape(), { max: 1 }), [1, 2], 'the AMOUNT must have a length of at most 1'],
]

/** Holds a field's shape, a value of another kind, and what a reader is told it got, the field worded as money. */
export const FAULT_RECEIPTS: ReadonlyArray<
	readonly [shape: ContractShape, value: unknown, received: string]
> = [
	[arrayShape(numberShape()), 5, '$5.00'],
	[booleanShape(), -0.5, '-$0.50'],
	[literalShape([1, 2]), 1250, '$1,250.00'],
	[numberShape(), true, 'true'],
	[stringShape(), false, 'false'],
	[numberShape(), null, 'none'],
	[numberShape(), [5], 'a list'],
	[numberShape(), {}, 'a record'],
	[numberShape(), new Map(), 'a special object'],
	[numberShape(), Math.max, 'a function'],
	[arrayShape(numberShape()), '5', '"5"'],
	[numberShape(), 'array', '"array"'],
	[numberShape(), 'null', '"null"'],
	[numberShape(), 'NaN', '"NaN"'],
	[numberShape(), 5n, '5n'],
	[numberShape(), Symbol('array'), 'Symbol(array)'],
]

/** Holds each value a fault's preview names that no reader can be told. */
export const FAULT_ABSENCES: readonly unknown[] = [
	Number.NaN,
	Number.POSITIVE_INFINITY,
	Number.NEGATIVE_INFINITY,
]

/** Holds a subject whose field `f` gives a fault that expects nothing, its shape, and the sentences. */
export const FAULT_PLAIN: ReadonlyArray<
	readonly [subject: Subject, shape: ContractShape, texts: readonly string[]]
> = [
	[
		{ f: 5 },
		objectShape({ f: oneOfShape(numberShape({ min: 1 }), integerShape()) }),
		['f is not in exactly one of the allowed forms'],
	],
	[
		{ f: 5 },
		objectShape({ f: unionShape(objectShape({ a: numberShape() }), nullShape()) }),
		['f is in none of the allowed forms'],
	],
	[{ f: 5 }, objectShape({}), ['f is not expected']],
	[
		Object.defineProperty({}, 'f', { value: 1, enumerable: false }),
		objectShape({ f: numberShape() }),
		['f is not known, and must be a number', 'f is hidden and cannot be read'],
	],
]

/** Holds each operation's operands, in an order that changes its value, its English, and its value. */
export const OPERATION_READINGS = [
	['add', 7, 2, '7 + 2', 9],
	['subtract', 7, 2, '7 - 2', 5],
	['multiply', 7, 2, '7 × 2', 14],
	['divide', 7, 2, '7 ÷ 2', 3.5],
	['percentage', 200, 10, '10% of 200', 20],
	['minimum', 7, 2, 'the lower of 7 and 2', 2],
	['maximum', 7, 2, 'the higher of 7 and 2', 7],
	['average', 7, 2, 'the average of 7 and 2', 4.5],
	['power', 7, 2, '7 to the power of 2', 49],
	['round', 7.6, 2, '7.6 rounded to a whole number', 8],
	['ceil', 7.2, 2, '7.2 rounded up to a whole number', 8],
	['floor', 7.8, 2, '7.8 rounded down to a whole number', 7],
	['abs', -7, 2, 'the absolute value of -7', 7],
] as const

/** Holds each operation as a change to a value: the value, its operand, its English, and the result. */
export const TRANSFORM_READINGS = [
	['add', 7, 2, 'plus 2', 9],
	['subtract', 7, 2, 'minus 2', 5],
	['multiply', 7, 2, 'times 2', 14],
	['divide', 7, 2, 'divided by 2', 3.5],
	['percentage', 200, 10, '10% of it', 20],
	['minimum', 7, 2, 'the lower of it and 2', 2],
	['maximum', 7, 2, 'the higher of it and 2', 7],
	['average', 7, 2, 'averaged with 2', 4.5],
	['power', 7, 2, 'to the power of 2', 49],
	['round', 7.6, undefined, 'rounded to a whole number', 8],
	['ceil', 7.2, undefined, 'rounded up to a whole number', 8],
	['floor', 7.8, undefined, 'rounded down to a whole number', 7],
	['abs', -7, undefined, 'without its sign', 7],
] as const

/** Holds each operation whose operand can be left out, its English then, and its result from 7. */
export const ABSENT_OPERAND_READINGS = [
	['add', 'plus 0', 7],
	['multiply', 'times 1', 7],
	['divide', 'divided by 1', 7],
	['power', 'to the power of 1', 7],
	['percentage', '0% of it', 0],
	['minimum', 'the lower of it and 0', 0],
	['average', 'averaged with 0', 3.5],
] as const

/** Holds the reviewer messages that must keep asking without an unstated value. */
export const REVIEWER_LOAN_READINGS = [
	...[
		'3 000 000',
		"3'000'000",
		'1 trillion',
		'three trillion',
		'1 quadrillion',
		'1 tn',
		'3 mln',
		'30 lakh',
		'3 crore',
	].map((amount) => ({
		text: `loan: amount ${amount}, income 120000, years 3, collateral 50000`,
		field: 'amount',
	})),
	{ text: 'loan: amount 50000, income 120000, years 3 months, collateral 50000', field: 'years' },
	{ text: 'loan: amount 50000, income 120000, years 3 weeks, collateral 50000', field: 'years' },
	{
		text: 'loan: amount 50000 per month, income 120000, years 3, collateral 50000',
		field: 'amount',
	},
	{ text: 'loan: amount 50000 income 120000 years', field: 'years' },
]

/** Pins the reviewer messages whose unit must not disappear from a claimed value. */
export const UNSTATED_UNITS = [
	{ entity: 'years', text: 'years 3 and a half months' },
	{ entity: 'years', text: 'years 3 months' },
	{ entity: 'years', text: 'years 3 weeks' },
	{ entity: 'amount', text: 'amount 50000 per month' },
]

/** Refuses conjunctions whose next target is not an anchor. */
export const UNBOUND_LINK_READINGS = [
	{ entity: 'amount', text: 'amount 50000 and up' },
	{ entity: 'amount', text: 'amount 50000 and more' },
	{ entity: 'amount', text: 'amount 50000 and change' },
	{ entity: 'amount', text: 'amount 50000 with interest' },
	{ entity: 'income', text: 'income 120000 and rising' },
	{ entity: 'term', text: 'rate term 7 and more 900' },
	{ entity: 'years', text: 'years 3 and' },
	{ entity: 'years', text: 'years 3 with' },
	{ entity: 'years', text: 'years 3 and the' },
	{ entity: 'amount', text: 'amount 50000 and a the income 120000' },
]

/** Refuses a link followed by a numeric occurrence instead of an anchor. */
export const NUMBER_LINK_READINGS = [
	{ entity: 'amount', text: 'amount 5 of 3000000', value: 5, unclaimed: 3000000 },
	{ entity: 'amount', text: 'amount 3 and 5', value: 3, unclaimed: 5 },
	{ entity: 'amount', text: 'amount 50000 and 60000', value: 50000, unclaimed: 60000 },
	{ entity: 'amount', text: 'amount 50000 with a 20000 deposit', value: 50000, unclaimed: 20000 },
	{ entity: 'years', text: 'years 3 and 6 months', value: 3, unclaimed: 6 },
	{ entity: 'amount', text: 'amount 50000 with six', value: 50000, unclaimed: 6 },
]

/** Holds one fixture value that a tested callback replaces. */
export class InterpretFixtureValue<T> {
	#value: T

	constructor(value: T) {
		this.#value = value
	}

	get value(): T {
		return this.#value
	}

	set value(value: T) {
		this.#value = value
	}
}

/** Represents a note stored by the real registry fixture. */
export interface InterpretNoteRecord extends RecordStamp {
	readonly note: string
}

/** Creates a note registry for the generic record manager suite. */
export function createInterpretNotes(): RecordManager<string, InterpretNoteRecord> {
	return new RecordManager<string, InterpretNoteRecord>({ entity: 'Note' })
}

/** Adds a note through the real record manager. */
export function addInterpretNote(
	manager: RecordManager<string, InterpretNoteRecord>,
	id: string,
	note: string,
): InterpretNoteRecord {
	return manager.add(id, note, (stamp, value) => ({
		id: stamp.id,
		note: value,
		version: stamp.version,
		hash: stamp.hash,
	}))
}

/** Builds an interpreter over the shared extraction vocabulary and recipes. */
export function buildCorpusInterpret(recipes = [buildInsuranceRecipe()]): Interpret {
	return new Interpret({ recipes, extractor: createCorpusExtractor() })
}

/** Builds a symbolic definition whose solved total exercises the result narrower. */
export function buildInterpretSolvedDefinition(): ReturnType<typeof createSymbolicDefinition> {
	return createSymbolicDefinition(
		'proof',
		'Proof',
		[
			createEquation(
				'e1',
				createConstant(0),
				createOperation('add', createVariable('x'), createConstant(1)),
				'total',
			),
		],
		{ variables: { x: 5 } },
	)
}

/** Collects the recipes used by the interpreter corpus. */
export function collectInterpretCorpusRecipes(): readonly Recipe[] {
	return [
		buildInterpretRecipe(),
		buildInsuranceRecipe(),
		buildEligibilityRecipe(),
		buildLoanRecipe(),
		buildStatisticsRecipe(),
	]
}

/** Creates an extractor result below the configured confidence gate. */
export function createWeakInterpretExtractor(): ExtractorInterface {
	return {
		extract(): ExtractResult {
			return {
				intent: { action: 'calculate', domain: 'insurance', confidence: 0.1 },
				numbers: [25],
			}
		},
	}
}

/** Creates stage boundary failures used by the orchestrator's error scenarios. */
export function createInterpretStageFailures() {
	return {
		normalizer: {
			normalize() {
				throw new Error('boom')
			},
		},
		extractor: {
			extract() {
				throw new Error('extract boom')
			},
		},
		clarifier: {
			clarify() {
				throw new Error('clarify boom')
			},
		},
		formatter: {
			format() {
				throw new Error('format boom')
			},
		},
		generator: {
			generate() {
				throw new Error('generate boom')
			},
		},
	}
}

/** Renders the unit prefix used by the narrator's keyed formatter fixture. */
export function renderInterpretUnit(value: unknown): string {
	return `unit:${String(value)}`
}

// ── Reason-result narrowing (environment-agnostic) ────────────────────────────

/**
 * Narrows a `reason()` return to a `SymbolicResult` — throws on a batch array
 * or a result of another reasoning, so assertions read the narrowed result
 * with no casts (`.claude/rules/patterns.md` § Validation and contracts).
 *
 * @param result - The single-or-batch return of a `reason()` call
 * @returns The result, narrowed to `SymbolicResult`
 */
export function expectSymbolic(result: ReasonResult | readonly ReasonResult[]): SymbolicResult {
	if (isArray<ReasonResult>(result)) throw new Error('Expected a single result, got a batch array')
	if (result.reasoning !== 'symbolic') {
		throw new Error(`Expected a symbolic result, got "${result.reasoning}"`)
	}
	return result
}

// ── Scale & edge-case fixtures (environment-agnostic) ─────────────────────────

/**
 * Lists the curated JavaScript numeric edge values the numeric-quirk tests probe — signed
 * zero, the safe-integer and representable-magnitude bounds, `EPSILON`, an overflow-scale
 * pair, and the classic `0.1 + 0.2 !== 0.3` floats. Every entry is FINITE; the non-finite
 * cases (`NaN` / `±Infinity`) are named explicitly at their own sites, never smuggled in
 * here. Frozen so a test can share it without risk of mutation.
 */
export const EXTREME_NUMBERS: readonly number[] = Object.freeze([
	0,
	-0,
	1,
	-1,
	Number.MAX_SAFE_INTEGER,
	Number.MIN_SAFE_INTEGER,
	Number.MAX_VALUE,
	Number.MIN_VALUE,
	Number.EPSILON,
	1e308,
	-1e308,
	0.1,
	0.2,
	0.3,
])

/**
 * Lists the curated adversarial / unicode object keys the field-path, subject-key, id, and
 * lookup-table tests probe — the `Object.prototype` / prototype-pollution names, an empty
 * key, a surrogate-pair (astral) key, and two precomposed accented keys (`é` LATIN SMALL
 * LETTER E WITH ACUTE, `Å` LATIN CAPITAL LETTER A WITH RING ABOVE) that are NFC-stable but
 * NFD-labile — decomposing either produces a key the table never wrote — plus a DOTTED key
 * (`'a.b'`) that proves a single-string `FieldPath` is ONE key, never dot-split. Frozen so a
 * test can share it without risk of mutation.
 */
export const TRICKY_KEYS: readonly string[] = Object.freeze([
	'__proto__',
	'constructor',
	'prototype',
	'toString',
	'hasOwnProperty',
	'',
	'\u{1F600}',
	'é',
	'Å',
	'a.b',
])

// ── Interprets fixtures (environment-agnostic) ────────────────────────────────

/** Holds a shape no builder would make, whose default breaks its own bound, so only compiling refuses it. */
export const UNCOMPILABLE_SHAPE: ContractShape = {
	category: 'object',
	properties: {
		a: { category: 'optional', inner: { category: 'number', min: 0 }, default: -5 },
	},
}

/** Holds a shape admitting any field, for a recipe whose test is about something else. */
export const OPEN_SHAPE = objectShape({}, { additionalProperties: true })

/**
 * Builds a small, neutral `Recipe` — a single `value` entity mapping onto a
 * one-factor quantitative definition — the shared fixture the `interprets`
 * validator, helper, stage, and orchestrator tests seed a registry with
 * instead of hand-writing the same literal repeatedly
 * (`.claude/rules/tests.md` § Test contract).
 *
 * @param overrides - Fields merged over the neutral defaults
 * @returns The built recipe
 */
export function buildInterpretRecipe(overrides?: Partial<Recipe>): Recipe {
	return {
		id: 'recipe-1',
		name: 'Arithmetic',
		domain: 'arithmetic',
		intents: ['calculate'],
		mappings: [{ entity: 'value', aliases: ['amount', 'number'], field: 'value' }],
		computations: [],
		definition: createQuantitativeDefinition('recipe-1', 'Arithmetic', [
			createFactorGroup('total', 'sum', [createFieldFactor('value', 'value')]),
		]),
		shape: OPEN_SHAPE,
		...overrides,
	}
}

/**
 * Lists the neutral caller ACTION vocabulary the interprets integration corpus wires
 * into its `Extractor` (`token → action-name`). The redesign has no built-in
 * worldview — every domain/action word a recipe answers
 * to must be supplied here, not baked into core.
 */
export const INTERPRET_ACTIONS: Readonly<Record<string, string>> = Object.freeze({
	calculate: 'calculate',
	check: 'check',
	validate: 'validate',
	compute: 'compute',
})

/**
 * Lists the neutral caller DOMAIN vocabulary the interprets integration corpus wires
 * into its `Extractor` (`domain-name → keyword-list`). A recipe's own `domain`
 * no longer auto-classifies — a caller MUST list each
 * recipe's domain keywords here for domain classification to fire.
 */
export const INTERPRET_DOMAINS: Readonly<Record<string, readonly string[]>> = Object.freeze({
	arithmetic: ['arithmetic'],
	insurance: ['insurance'],
	eligibility: ['eligibility', 'qualifies', 'qualify', 'eligible'],
	loan: ['loan'],
	statistics: ['statistics', 'stats'],
})

/**
 * Creates the corpus `Extractor` every suite that drives the interprets corpus
 * wires — the one assembly of `INTERPRET_ACTIONS` and `INTERPRET_DOMAINS`, so
 * the vocabulary pair cannot drift across the suites that consume it.
 *
 * @returns A fresh `Extractor` over the corpus action and domain vocabularies
 */
export function createCorpusExtractor(): ExtractorInterface {
	return new Extractor({ actions: INTERPRET_ACTIONS, domains: INTERPRET_DOMAINS })
}

/**
 * Builds the auto-insurance corpus recipe — the redesign's terrain-vocabulary
 * analog of scsr's `DEFAULT_TEMPLATES` insurance fixture: a required `age`
 * mapping, `accidents`/`coverage`/`deductible` defaults, and a declarative
 * `monthly = deductible / 12` computation (`createOperation('divide', …)` — the
 * closure-free `ComputedField` replacing scsr's `InferenceRule.compute`).
 *
 * @param overrides - Fields merged over the corpus defaults
 * @returns The built recipe
 */
export function buildInsuranceRecipe(overrides?: Partial<Recipe>): Recipe {
	return {
		id: 'insurance-auto',
		name: 'Auto Insurance',
		domain: 'insurance',
		intents: ['calculate'],
		mappings: [
			{ entity: 'age', aliases: ['years old', 'year old', 'years'], field: 'age' },
			{ entity: 'accidents', aliases: ['accident', 'incidents'], field: 'accidents' },
			{ entity: 'coverage', aliases: ['plan', 'policy'], field: 'coverage' },
		],
		computations: [
			{
				field: 'monthly',
				expression: createOperation('divide', createVariable('deductible'), createConstant(12)),
			},
		],
		definition: createQuantitativeDefinition('insurance-auto', 'Auto Insurance Rate', [
			createFactorGroup('age-group', 'product', [createStaticFactor('age-factor', 1)]),
		]),
		shape: objectShape({
			age: numberShape(),
			accidents: optionalShape(numberShape(), { default: 0 }),
			coverage: optionalShape(stringShape(), { default: 'standard' }),
			deductible: optionalShape(numberShape(), { default: 500 }),
			monthly: optionalShape(numberShape()),
		}),
		...overrides,
	}
}

/**
 * Builds the eligibility corpus recipe — two optional mappings (`age`,
 * `score`) whose aliases exercise fuzzy keyword-proximity assignment against a
 * complex sentence, over an (empty-rule) logical definition.
 *
 * @param overrides - Fields merged over the corpus defaults
 * @returns The built recipe
 */
export function buildEligibilityRecipe(overrides?: Partial<Recipe>): Recipe {
	return {
		id: 'eligibility',
		name: 'Eligibility',
		domain: 'eligibility',
		intents: ['check', 'validate'],
		mappings: [
			{ entity: 'age', aliases: ['years old', 'year old', 'years'], field: 'age' },
			{ entity: 'score', aliases: ['credit score', 'credit', 'rating'], field: 'score' },
		],
		computations: [],
		definition: createLogicalDefinition('eligibility', 'Eligibility', []),
		shape: objectShape({
			age: optionalShape(numberShape()),
			score: optionalShape(numberShape()),
		}),
		...overrides,
	}
}

/**
 * Builds the personal-loan corpus recipe — a distinct `loan` domain used to
 * pin multi-recipe best-match selection (the domain/action pair that scores
 * highest wins; no arbitrary `recipes[0]` fallback).
 *
 * @param overrides - Fields merged over the corpus defaults
 * @returns The built recipe
 */
export function buildLoanRecipe(overrides?: Partial<Recipe>): Recipe {
	return {
		id: 'loan-personal',
		name: 'Personal Loan',
		domain: 'loan',
		intents: ['calculate'],
		mappings: [{ entity: 'amount', aliases: [], field: 'amount' }],
		computations: [],
		definition: createQuantitativeDefinition('loan-personal', 'Personal Loan', [
			createFactorGroup('total', 'sum', [createFieldFactor('amount', 'amount')]),
		]),
		shape: objectShape({ amount: numberShape() }),
		...overrides,
	}
}

/**
 * Builds the statistics corpus recipe — a SINGLE `value` mapping onto an array field,
 * so extraction collects every number and the `Generator` keeps the array as it
 * stands. An aggregate over that array is a
 * `ComputedField` the caller declares through `overrides`.
 *
 * @param overrides - Fields merged over the corpus defaults
 * @returns The built recipe
 */
export function buildStatisticsRecipe(overrides?: Partial<Recipe>): Recipe {
	return {
		id: 'statistics',
		name: 'Statistics',
		domain: 'statistics',
		intents: ['compute'],
		mappings: [{ entity: 'value', aliases: [], field: 'value' }],
		computations: [],
		definition: createQuantitativeDefinition('statistics', 'Statistics', [
			createFactorGroup('total', 'sum', [createFieldFactor('value', 'value')]),
		]),
		shape: objectShape(
			{ value: arrayShape(numberShape()) },
			{ additionalProperties: numberShape() },
		),
		...overrides,
	}
}

/**
 * Builds a minimal, complete-shaped {@link Interpretation} literal — the fixture
 * the `InterpretContext` history/carry-over tests push without running the full
 * orchestrator (`.claude/rules/tests.md` § Test contract). Its single `age`
 * entity and `intent.domain`
 * drive same-domain carry-over reads.
 *
 * @param overrides - Fields merged over the neutral defaults
 * @returns The built interpretation
 */
export function buildInterpretation(overrides?: Partial<Interpretation>): Interpretation {
	return {
		text: 'calculate insurance age 25',
		normalized: 'calculate insurance age 25',
		intent: { action: 'calculate', domain: 'insurance', confidence: 1 },
		entities: [
			{
				name: 'age',
				value: 25,
				provenance: { category: 'extracted', detail: 'keyword' },
				confidence: 1,
			},
		],
		subject: { age: 25 },
		definition: createQuantitativeDefinition('insurance-auto', 'Auto Insurance', [
			createFactorGroup('total', 'sum', [createFieldFactor('age', 'age')]),
		]),
		mappings: [
			{
				field: 'age',
				entity: 'age',
				value: 25,
				provenance: { category: 'extracted' },
				confidence: 1,
			},
		],
		ambiguities: [],
		repairs: [],
		defaulted: [],
		prompt: 'Calculate Auto Insurance with age: 25',
		stages: [],
		failures: [],
		confidence: 1,
		digest: '00000000',
		...overrides,
	}
}

/**
 * Seeds a REAL {@link InterpretContext} with `previous` — one `.add(...)` call per
 * given {@link Interpretation}, through the class's own public API — the canonical
 * form the `Clarifier` carry-over scenarios seed a real context with
 * (`.claude/rules/tests.md` § Test contract: "Use real implementations and
 * small scenarios"). The real `InterpretContext` flattens
 * `previous`'s entities and exposes them the way the `Clarifier` reads them.
 *
 * @param previous - The prior interpretations to seed, in order
 * @returns A real `InterpretContext`, seeded with `previous`
 */
export function seedInterpretContext(previous: readonly Interpretation[]): InterpretContext {
	const context = new InterpretContext({ history: previous.length })
	for (const interpretation of previous) context.add(interpretation)
	return context
}

/** Pins whole numeric forms: an exact value or an unreadable result, never a part. */
export const WHOLE_NUMBER_FORMS: ReadonlyArray<readonly [string, number | undefined]> =
	Object.freeze([
		['3', 3],
		['3,000,000', 3000000],
		['3.5', 3.5],
		['.5', 0.5],
		['3k', 3000],
		['$3m', 3000000],
		['~3', undefined],
		['3+', undefined],
		['3 thousand', 3000],
		['three thousand', 3000],
		['3 million', 3000000],
		['three million', 3000000],
		['three hundred and five', 305],
		['three point five', 3.5],
		['six and a half', 6.5],
		['3 and a half', 3.5],
		['3 and a half months', 3.5],
		['3 million and a half', undefined],
		['$3m and a half', undefined],
		['three million and a half', undefined],
		['3 million and a quarter', undefined],
		['3k and a half', undefined],
		['0', 0],
		['3 000 000', undefined],
		["3'000'000", undefined],
		['3 000 000', undefined],
		['3 000 000', undefined],
		['3,00,000', undefined],
		['3.000.000', undefined],
		['3trillion', undefined],
		['3mln', undefined],
		['1/2', undefined],
		['3/4', undefined],
		['2½', undefined],
		['3-4', undefined],
		['3 to 4', undefined],
		['3 or 4', undefined],
		['v1.2.3', undefined],
		['2024-01-02', undefined],
		['3/14/2024', undefined],
		['3m', undefined],
		['1e3', undefined],
		['1e-3', undefined],
		['-3', undefined],
		['+3', undefined],
		['−3', undefined],
		['9007199254740993', undefined],
		['one thousand million', undefined],
		['3.4.5', undefined],
	])

/** Distinguishes correction waits from anticipation before an ordinary quantity. */
export const WAIT_READINGS = Object.freeze([
	{ text: '1,861,800 copies — wait, 1,451,900', entity: 'copies', value: undefined },
	{ text: '380 watts — wait, no, 540', entity: 'watts', value: undefined },
	{ text: "I can't wait to start, 5 panels", entity: 'panels', value: 5 },
])

/** Exercises isolated messages and explicitly retained turns on one interpreter. */
export const LOAN_HISTORIES = Object.freeze([
	{ history: undefined, subject: undefined, questions: ['years'], carried: [] },
	{
		history: 16,
		subject: { amount: 50000, income: 120000, years: 5, collateral: 50000 },
		questions: [],
		carried: ['years', 'collateral'],
	},
])

/** Supplies a class-instance error context. */
export class InterpretContextFixture {
	readonly id = 'context'
}

/** Pins the undeclared forms from the reader re-audit. */
export const UNDECLARED_TOKENS = Object.freeze([
	'3lakh',
	'3z',
	'3mn',
	'3T',
	'3_000_000',
	'3|000|000',
	'3:000:000',
	'3*10^6',
	'3^6',
	'3rd',
	'3EUR',
	'3万',
	'36months',
	'50000/month',
	'3/12',
	'3+',
	'100+',
	'.5.2',
	'~3',
	'3cr',
	'3hundred',
	'3xyz',
	'3mo',
	'50000eur',
	'$ 3xyz',
	...Array.from({ length: 32 }, (_, index) => {
		const seed = Math.floor(seededRandom(index + 13)() * 0x100000000)
		const digits = String((seed % 100000) + 1)
		const unknown = String.fromCodePoint(0x400 + (seed % 0x400))
		return [`${digits}${unknown}`, `${unknown}${digits}`, `${digits}_${digits}`]
	}).flat(),
])

/** Pins neighbors outside the declared ends, anchors, and conditional links. */
export const UNDECLARED_NEIGHBORS = Object.freeze([
	'valuers',
	'revalue',
	'for income',
	'per income',
	'with values',
	'and valuable',
	'.',
	'!',
	'?',
	';',
	'. 000 . 000',
	'of 3000000',
	'and 5',
	'and six',
	'with a 20000 deposit',
	'%million',
	'%foo',
	',000,000',
	'.5',
	'5',
	'00 000',
	', 000',
	'* 1000000',
	'1/2',
	'миллиона',
	'(million)',
	'- months',
	'a million',
	'a month',
	'of them',
	'at most',
	'to start',
	'is wrong',
	'百万',
	'éléments',
	'месяца',
	'ヶ月',
	'个月',
	'años',
	'/',
	'=',
	':',
	...'trillion quadrillion quintillion sextillion septillion octillion nonillion decillion undecillion duodecillion googol tn mln lakh lac crore arab kharab'.split(
		' ',
	),
	...Array.from({ length: 32 }, (_, index) => {
		const seed = Math.floor(seededRandom(index + 13)() * 0x100000000)
		return String.fromCodePoint(0x400 + (seed % 0x400))
	}),
])

/** Crosses the neighbor law with literal, spoken, money, scaled, and percent readings. */
export const NEIGHBOR_FORMS = Object.freeze(['3', 'three', '$3', '3k', '3%', '3 million'])

/** Pins lone punctuation and numeric predecessors before an anchored number. */
export const PRECEDING_NEIGHBORS = Object.freeze([
	'1 –',
	'1 -',
	'1 —',
	'1 ~',
	'1',
	'1 /',
	'<',
	'-',
	'10 ^',
	'150',
	'150\t',
	'150\uFEFF',
	'150\u2009',
	'2 *',
	'500 +',
	'$190,000 –',
])

/** Pins exact numeric readings the admission laws must retain. */
export const ADMITTED_NUMBERS = Object.freeze([
	['3,000,000', 3000000],
	['$1.2M', 1200000],
	['50k', 50000],
	['3 mn', 3000000],
	['3 and a half', 3.5],
	['3', 3],
	['.5', 0.5],
	['6.25%', 6.25],
	...Array.from({ length: 32 }, (_, index): ReadonlyArray<readonly [string, number]> => {
		const value = Math.floor(seededRandom(index + 13)() * 999) + 1
		return [
			[String(value), value],
			[`${value}.25`, value + 0.25],
			[`${value}%`, value],
			[`${value},000`, value * 1000],
			[`${value}k`, value * 1000],
			[`$${value}M`, value * 1e6],
			[`USD ${value}bn`, value * 1e9],
			[`${value}ish`, value],
		]
	}).flat(),
] as const)

/** Pins assignments the admission laws must retain. */
export const ADMITTED_CLAIMS = Object.freeze([
	['value 3.', [3]],
	['value 3. Next', [3]],
	['value 3 and a half', [3.5]],
	['amount 50000 and income 120000', [50000, 120000]],
	['amount 50000, income 120000', [50000, 120000]],
	['amount 50000 with an income 120000', [50000, 120000]],
	['value 25, now', [25]],
] as const)

/** Supplies a callable error context. */
export function createCallableInterpretContext(): (() => void) & { readonly id: string } {
	return Object.assign(() => {}, { id: 'context' })
}

/**
 * Narrows a value generated from a contract to a record, for spreading in a lockstep test.
 *
 * @param value - The generated value
 * @returns The value as a record, or an empty one
 */
export function asRecord(value: unknown): Readonly<Record<string, unknown>> {
	return isRecord(value) ? value : {}
}

/**
 * Removes the `shape` a recipe and its definition hold.
 *
 * @remarks
 * A contract reads a nested `shape` as any JSON value and the guard reads it as a shape, so the
 * lockstep between them holds with those set aside.
 *
 * @param value - The generated value
 * @returns The value with no `shape` key on it or on its definition
 */
export function dropRecipeShapes(value: unknown): unknown {
	if (!isRecord(value)) return value
	const { shape: _shape, ...rest } = value
	if (!isRecord(rest.definition)) return rest
	const { shape: _definitionShape, ...definition } = rest.definition
	return { ...rest, definition }
}

// ── Workshop writing fixtures (environment-agnostic) ──────────────────────────
// An invented community workshop that lends a room for an activity. The definitions, subjects,
// and expectations here are what the writing side's suites run against the real `reason`
// engine; each expectation is written from reason's documented semantics and proved against the
// engine in `tests/setup.test.ts`.

/** Lists the invented activities the workshop will not lend a room for. */
export const WORKSHOP_RESTRICTED: readonly string[] = Object.freeze([
	'kiln firing',
	'torch welding',
	'axe throwing',
	'fire dancing',
	'blade forging',
	'glass blowing',
	'resin casting',
	'acid etching',
	'lead casting',
	'pyrotechnics',
	'chainsaw carving',
	'rope climbing',
	'stilt walking',
	'ice sculpting',
	'solvent painting',
	'ember smoking',
	'anvil striking',
	'lathe turning',
	'saw milling',
	'laser cutting',
	'plasma cutting',
	'bow shooting',
	'sling testing',
	'rocket building',
	'steam pressing',
	'boiler tending',
	'vat dyeing',
	'tar melting',
	'pitch boiling',
	'wax melting',
	'forge welding',
	'flint knapping',
	'cauldron stirring',
	'lantern burning',
	'spark testing',
	'powder mixing',
	'torch juggling',
	'cable swinging',
	'drum roasting',
	'crucible pouring',
])

/** Represents one booking subject with the state each workshop rule is expected to settle on. */
export interface WorkshopCase {
	readonly subject: Subject
	readonly success: boolean
	readonly states: Readonly<Record<string, CheckState>>
	readonly faults: readonly string[]
}

/** Represents one scoring subject with the success and value the engine is expected to return. */
export interface WorkshopScoreCase {
	readonly subject: Subject
	readonly success: boolean
	readonly value: number
}

/** Represents one floor subject with the success and solutions the engine is expected to return. */
export interface WorkshopAreaCase {
	readonly subject: Subject
	readonly success: boolean
	readonly solutions: Readonly<Record<string, number>>
}

/**
 * Builds the workshop booking rules: eight rules whose premises cover a listed comparison, a
 * nested path, a range, an `or`, a `not`, an `implies`, an `xor`, and a rule that reads three
 * conclusions of the others, each with an authored name and description.
 *
 * @returns A fresh logical definition with id `workshop`
 */
export function buildWorkshopRules(): LogicalDefinition {
	return createLogicalDefinition(
		'workshop',
		'Workshop booking',
		[
			createRule(
				'restricted',
				[createAtom('activity', 'any', [...WORKSHOP_RESTRICTED])],
				createAtom('restricted', 'equals', true),
				{
					name: 'Restricted activity',
					description: 'The workshop never lends a room for an activity on its restricted list.',
				},
			),
			createRule(
				'overcap',
				[createAtom(['terms', 'excess'], 'above', 0)],
				createAtom('overcap', 'equals', true),
				{
					name: 'Over capacity',
					description: 'A booking that asks for more places than the room holds is over capacity.',
				},
			),
			createRule(
				'hours',
				[createAtom('start', 'between', [8, 18])],
				createAtom('open', 'equals', true),
				{
					name: 'Opening hours',
					description: 'A booking must start while the workshop is open.',
				},
			),
			createRule(
				'trusted',
				[
					createCompound('or', [
						createAtom('member', 'equals', 'gold'),
						createAtom('score', 'from', 700),
					]),
				],
				createAtom('trusted', 'equals', true),
				{
					name: 'Trusted booker',
					description: 'A gold member, or a booker with a good score, is trusted.',
				},
			),
			createRule(
				'quiet',
				[createCompound('not', [createAtom('noise', 'above', 40)])],
				createAtom('quiet', 'equals', true),
				{
					name: 'Quiet activity',
					description: 'An activity that stays at or under the noise limit is quiet.',
				},
			),
			createRule(
				'paired',
				[
					createCompound('implies', [
						createAtom('tools', 'equals', true),
						createAtom('trained', 'equals', true),
					]),
				],
				createAtom('paired', 'equals', true),
				{
					name: 'Tools with training',
					description: 'A booking that brings tools needs a trained supervisor.',
				},
			),
			createRule(
				'single',
				[
					createCompound('xor', [
						createAtom('morning', 'equals', true),
						createAtom('evening', 'equals', true),
					]),
				],
				createAtom('single', 'equals', true),
				{
					name: 'One session',
					description: 'A booking takes the morning or the evening, never both.',
				},
			),
			createRule(
				'approve',
				[
					createAtom('trusted', 'equals', true),
					createAtom('quiet', 'equals', true),
					createCompound('not', [createAtom('restricted', 'equals', true)]),
					createAtom('cost', 'to', 1250),
				],
				createAtom('approved', 'equals', true),
				{
					name: 'Approval',
					description:
						'A trusted, quiet booking of an unrestricted activity within budget is approved.',
				},
			),
		],
		{ description: 'Decides whether a community workshop lends a room for an activity.' },
	)
}

/** Holds the booking every workshop subject varies: every rule that can hold does. */
export const WORKSHOP_BASE: Subject = {
	activity: 'pottery',
	terms: { excess: 0 },
	start: 10,
	member: 'gold',
	score: 750,
	noise: 30,
	tools: true,
	trained: true,
	morning: true,
	evening: false,
	cost: 1000,
}

/** Holds the states every rule settles on for the base booking. */
export const WORKSHOP_HELD: Readonly<Record<string, CheckState>> = {
	restricted: 'unmet',
	overcap: 'unmet',
	hours: 'met',
	trusted: 'met',
	quiet: 'met',
	paired: 'met',
	single: 'met',
	approve: 'met',
}

/**
 * Names the booking subjects of the workshop rules, each with the states reason's semantics give
 * every rule. `held` is the booking whose approving rules hold and whose two flagging rules
 * (`restricted`, `overcap`) do not, because `approve` reads `not(restricted)` and so cannot hold
 * beside a met `restricted`.
 */
export const WORKSHOP_SUBJECTS: Readonly<Record<string, WorkshopCase>> = {
	held: { subject: WORKSHOP_BASE, success: true, states: WORKSHOP_HELD, faults: [] },
	restricted: {
		subject: { ...WORKSHOP_BASE, activity: 'torch welding' },
		success: true,
		states: { ...WORKSHOP_HELD, restricted: 'met', approve: 'unmet' },
		faults: [],
	},
	overcap: {
		subject: { ...WORKSHOP_BASE, terms: { excess: 4 } },
		success: true,
		states: { ...WORKSHOP_HELD, overcap: 'met' },
		faults: [],
	},
	late: {
		subject: { ...WORKSHOP_BASE, start: 20 },
		success: true,
		states: { ...WORKSHOP_HELD, hours: 'unmet' },
		faults: [],
	},
	loud: {
		subject: { ...WORKSHOP_BASE, noise: 55 },
		success: true,
		states: { ...WORKSHOP_HELD, quiet: 'unmet', approve: 'unmet' },
		faults: [],
	},
	second: {
		subject: { ...WORKSHOP_BASE, member: 'silver', score: 750 },
		success: true,
		states: WORKSHOP_HELD,
		faults: [],
	},
	neither: {
		subject: { ...WORKSHOP_BASE, member: 'silver', score: 400 },
		success: true,
		states: { ...WORKSHOP_HELD, trusted: 'unmet', approve: 'unmet' },
		faults: [],
	},
	vacuous: {
		subject: { ...WORKSHOP_BASE, tools: false, trained: false },
		success: true,
		states: WORKSHOP_HELD,
		faults: [],
	},
	unpaired: {
		subject: { ...WORKSHOP_BASE, tools: true, trained: false },
		success: true,
		states: { ...WORKSHOP_HELD, paired: 'unmet' },
		faults: [],
	},
	double: {
		subject: { ...WORKSHOP_BASE, morning: true, evening: true },
		success: true,
		states: { ...WORKSHOP_HELD, single: 'unmet' },
		faults: [],
	},
	nocost: {
		subject: Object.fromEntries(
			Object.entries(WORKSHOP_BASE).filter(([field]) => field !== 'cost'),
		),
		success: false,
		states: { ...WORKSHOP_HELD, approve: 'unread' },
		faults: ['cost'],
	},
	nonoise: {
		subject: Object.fromEntries(
			Object.entries(WORKSHOP_BASE).filter(([field]) => field !== 'noise'),
		),
		success: false,
		states: { ...WORKSHOP_HELD, quiet: 'unread', approve: 'unread' },
		faults: ['noise'],
	},
}

/**
 * Builds the booking gates: five independent rules, none of which reads what another concludes,
 * so the definition has no goal. Each has an authored name and description.
 *
 * @returns A fresh logical definition with id `gates`
 */
export function buildWorkshopGates(): LogicalDefinition {
	return createLogicalDefinition(
		'gates',
		'Booking gates',
		[
			createRule('early', [createAtom('start', 'below', 10)], createAtom('early', 'equals', true), {
				name: 'Early start',
				description: 'Someone opens the workshop for an early booking.',
			}),
			createRule('noisy', [createAtom('noise', 'above', 40)], createAtom('noisy', 'equals', true), {
				name: 'Loud activity',
				description: 'The neighbors hear about a loud activity.',
			}),
			createRule(
				'costly',
				[createAtom('cost', 'above', 1250)],
				createAtom('costly', 'equals', true),
				{ name: 'High cost', description: 'The treasurer signs a booking with a high cost.' },
			),
			createRule(
				'visitor',
				[createAtom('member', 'equals', 'guest')],
				createAtom('visitor', 'equals', true),
				{ name: 'Visiting booker', description: 'A member stays with a visiting booker.' },
			),
			createRule(
				'crowded',
				[createAtom('guests', 'above', 30)],
				createAtom('crowded', 'equals', true),
				{ name: 'Large party', description: 'A large party takes the hall.' },
			),
		],
		{ description: 'Lists what a booking needs from the workshop.' },
	)
}

/** Holds the booking every gates subject varies: no rule applies. */
export const WORKSHOP_CALM: Subject = {
	start: 12,
	noise: 30,
	cost: 1000,
	member: 'gold',
	guests: 8,
}

/**
 * Names the gates subjects: no rule applies, the last alone applies, others apply and the last
 * does not, all five apply, and two whose missing field leaves a rule unread, the last one and
 * the first.
 */
export const WORKSHOP_GATES: Readonly<Record<string, WorkshopCase>> = {
	calm: {
		subject: WORKSHOP_CALM,
		success: true,
		states: {
			early: 'unmet',
			noisy: 'unmet',
			costly: 'unmet',
			visitor: 'unmet',
			crowded: 'unmet',
		},
		faults: [],
	},
	crowd: {
		subject: { ...WORKSHOP_CALM, guests: 31 },
		success: true,
		states: {
			early: 'unmet',
			noisy: 'unmet',
			costly: 'unmet',
			visitor: 'unmet',
			crowded: 'met',
		},
		faults: [],
	},
	dawn: {
		subject: { ...WORKSHOP_CALM, start: 9, noise: 40.5 },
		success: true,
		states: {
			early: 'met',
			noisy: 'met',
			costly: 'unmet',
			visitor: 'unmet',
			crowded: 'unmet',
		},
		faults: [],
	},
	festival: {
		subject: { start: 9, noise: 55, cost: 2000, member: 'guest', guests: 40 },
		success: true,
		states: { early: 'met', noisy: 'met', costly: 'met', visitor: 'met', crowded: 'met' },
		faults: [],
	},
	noguests: {
		subject: { start: 9, noise: 30, cost: 1000, member: 'gold' },
		success: false,
		states: {
			early: 'met',
			noisy: 'unmet',
			costly: 'unmet',
			visitor: 'unmet',
			crowded: 'unread',
		},
		faults: ['guests'],
	},
	nostart: {
		subject: { noise: 30, cost: 1000, member: 'gold', guests: 40 },
		success: false,
		states: {
			early: 'unread',
			noisy: 'unmet',
			costly: 'unmet',
			visitor: 'unmet',
			crowded: 'met',
		},
		faults: ['start'],
	},
}

/**
 * Builds the booking score: a `sum` group of fees with a field factor, a static factor, and a
 * static factor gated by a membership check, and a `maximum` group whose lookup table has no
 * entry for the `garage` room and no fallback.
 *
 * @returns A fresh quantitative definition with id `score`
 */
export function buildWorkshopScore(): QuantitativeDefinition {
	return createQuantitativeDefinition('score', 'Booking score', [
		createFactorGroup(
			'fees',
			'sum',
			[
				createFieldFactor('base', 'cost', { name: 'Base fee' }),
				createStaticFactor('service', 10, { name: 'Service charge' }),
				createStaticFactor('discount', 25, {
					name: 'Gold bonus',
					checks: [{ field: 'member', operator: 'equals', value: 'gold' }],
				}),
			],
			{ name: 'Fees' },
		),
		createFactorGroup(
			'space',
			'maximum',
			[
				createLookupFactor(
					'room',
					'room',
					{ hall: 30, studio: 20, loft: 15 },
					{ name: 'Room rate' },
				),
			],
			{ name: 'Space' },
		),
	])
}

/**
 * Names the scoring subjects of the booking score. A refused run still returns the `value` it
 * computed, which is no answer: `nocost` leaves the base fee unread and `garage` leaves the
 * `space` group with no value.
 */
export const WORKSHOP_SCORES: Readonly<Record<string, WorkshopScoreCase>> = {
	gold: { subject: { cost: 100, member: 'gold', room: 'hall' }, success: true, value: 165 },
	silver: { subject: { cost: 100, member: 'silver', room: 'studio' }, success: true, value: 130 },
	nocost: { subject: { member: 'gold', room: 'hall' }, success: false, value: 65 },
	garage: { subject: { cost: 100, member: 'gold', room: 'garage' }, success: false, value: 135 },
}

/**
 * Builds the booking fees: a `sum` group with a transformed field factor, a range factor with a
 * fallback, and a required gated factor; a `product` group with a static factor and a lookup
 * factor with a fallback; and a strict `average` group with a gated factor.
 *
 * @returns A fresh quantitative definition with id `fees`
 */
export function buildWorkshopFees(): QuantitativeDefinition {
	return createQuantitativeDefinition(
		'fees',
		'Booking fees',
		[
			createFactorGroup(
				'hire',
				'sum',
				[
					createFieldFactor('rate', ['terms', 'rate'], {
						name: 'Room rate',
						description: 'The hourly rate, for a session of two hours.',
						transforms: [{ operation: 'multiply', operand: 2 }],
					}),
					createRangeFactor(
						'crowd',
						'guests',
						[
							{ bounds: { maximum: 10 }, value: 5 },
							{ bounds: { minimum: 11, maximum: 30 }, value: 12 },
						],
						{
							name: 'Crowd charge',
							fallback: 40,
							transforms: [{ operation: 'multiply', operand: 3 }],
						},
					),
					createStaticFactor('deposit', 50, {
						name: 'Deposit',
						checks: [{ field: 'cost', operator: 'to', value: 1250 }],
						required: true,
					}),
				],
				{ name: 'Hire', description: 'What the room itself costs.' },
			),
			createFactorGroup(
				'share',
				'product',
				[
					createStaticFactor('discount', 0.9, { name: 'Discount' }),
					createLookupFactor(
						'season',
						'season',
						{ peak: 1.5, low: 0.75 },
						{ name: 'Season', fallback: 1 },
					),
				],
				{ name: 'Share' },
			),
			createFactorGroup(
				'extras',
				'average',
				[
					createStaticFactor('tools', 10, {
						name: 'Tool hire',
						checks: [
							{ field: 'tools', operator: 'equals', value: true },
							{ field: 'noise', operator: 'to', value: 40 },
						],
					}),
					createStaticFactor('towels', 20, { name: 'Towels' }),
				],
				{ name: 'Extras', strict: true },
			),
		],
		{ description: 'Prices one booking.' },
	)
}

/**
 * Names the fee subjects: one that takes every entry, one that takes both fallbacks and fails
 * the strict group's gate, one whose required factor is gated out, and one whose range reads no
 * number.
 */
export const WORKSHOP_FEES: Readonly<Record<string, WorkshopScoreCase>> = {
	peak: {
		subject: {
			terms: { rate: 20 },
			guests: 8,
			cost: 1000,
			season: 'peak',
			tools: true,
			noise: 30,
		},
		success: true,
		value: 121.35,
	},
	spare: {
		subject: { terms: { rate: 20 }, guests: 50, cost: 1000, season: 'spring', tools: false },
		success: true,
		value: 210.9,
	},
	costly: {
		subject: {
			terms: { rate: 20 },
			guests: 8,
			cost: 2000,
			season: 'peak',
			tools: true,
			noise: 30,
		},
		success: false,
		value: 71.35,
	},
	crowd: {
		subject: {
			terms: { rate: 20 },
			guests: 'many',
			cost: 1000,
			season: 'peak',
			tools: true,
			noise: 30,
		},
		success: false,
		value: 106.35,
	},
}

/**
 * Builds the floor area: one equation that solves `area` as `width` times `depth`.
 *
 * @returns A fresh symbolic definition with id `area`
 */
export function buildWorkshopArea(): SymbolicDefinition {
	return createSymbolicDefinition('area', 'Floor area', [
		createEquation(
			'area',
			createVariable('area'),
			createOperation('multiply', createVariable('width'), createVariable('depth')),
			'area',
			{ name: 'Floor area', description: 'The floor area is the width times the depth.' },
		),
	])
}

/** Names the floor subjects: one the equation solves and one that leaves `depth` unbound. */
export const WORKSHOP_AREA: Readonly<Record<string, WorkshopAreaCase>> = {
	solved: { subject: { width: 4, depth: 5 }, success: true, solutions: { area: 20 } },
	refused: { subject: { width: 4 }, success: false, solutions: {} },
}

/**
 * Builds the booking facts: a chain of three inferences over a depth of 1, so a forward run
 * derives every step and still hits the cap.
 *
 * @returns A fresh inferential definition with id `facts`
 */
export function buildWorkshopFacts(): InferentialDefinition {
	return createInferentialDefinition(
		'facts',
		'Booking facts',
		[createFact('booked', 'booked', ['hall'])],
		[
			createInference(
				'staffing',
				[createFact('staffing-premise', 'booked', ['?room'])],
				createFact('staffing-conclusion', 'staffed', ['?room']),
				{ name: 'Staffing' },
			),
			createInference(
				'cleaning',
				[createFact('cleaning-premise', 'staffed', ['?room'])],
				createFact('cleaning-conclusion', 'cleaned', ['?room']),
				{ name: 'Cleaning' },
			),
			createInference(
				'closing',
				[createFact('closing-premise', 'cleaned', ['?room'])],
				createFact('closing-conclusion', 'closed', ['?room']),
				{ name: 'Closing' },
			),
		],
		{ depth: 1 },
	)
}

/**
 * Builds the workshop quote: a strict group with a base and bounds that holds a weighted lookup with
 * a fallback, a range with overlapping bands, an open one, changes, and bounds, and a required gated
 * factor; a `maximum` group of one open band; and a base, bounds, and a precision of its own.
 *
 * @returns A fresh quantitative definition with id `quote`
 */
export function buildWorkshopQuote(): QuantitativeDefinition {
	return createQuantitativeDefinition(
		'quote',
		'Workshop quote',
		[
			createFactorGroup(
				'hire',
				'sum',
				[
					createLookupFactor(
						'material',
						'material',
						{ oak: 12.5, pine: 8 },
						{ name: 'Material rate', fallback: 6, weight: 2 },
					),
					createRangeFactor(
						'session',
						'hours',
						[
							{ bounds: { maximum: 4 }, value: 30 },
							{ bounds: { minimum: 3, maximum: 8 }, value: 50 },
							{ value: 75 },
						],
						{
							name: 'Session charge',
							transforms: [
								{ operation: 'percentage', operand: 90 },
								{ operation: 'add', operand: 0.4 },
								{ operation: 'ceil' },
							],
							bounds: { minimum: 28, maximum: 60 },
						},
					),
					createStaticFactor('deposit', 50, {
						name: 'Deposit',
						checks: [{ field: 'cost', operator: 'to', value: 1250 }],
						required: true,
					}),
				],
				{ name: 'Hire', base: 5, bounds: { maximum: 500 }, strict: true },
			),
			createFactorGroup(
				'crowd',
				'maximum',
				[
					createRangeFactor('crowd', 'guests', [{ bounds: { minimum: 20 }, value: 15.125 }], {
						name: 'Crowd charge',
						fallback: 0,
					}),
				],
				{ name: 'Crowd' },
			),
		],
		{ description: 'Quotes one booking.', base: 10, bounds: { minimum: 25 }, precision: 2 },
	)
}

/**
 * Names the quote subjects: one that takes the first of two bands that hold it, one that takes the
 * fallbacks and the open band, and one whose required factor is gated out, which leaves the strict
 * group and its base out of the total the refused run still computes.
 */
export const WORKSHOP_QUOTES: Readonly<Record<string, WorkshopScoreCase>> = {
	oak: {
		subject: { material: 'oak', hours: 3, cost: 1000, guests: 25 },
		success: true,
		value: 133.13,
	},
	ash: {
		subject: { material: 'ash', hours: 10, cost: 1000, guests: 5 },
		success: true,
		value: 137,
	},
	costly: {
		subject: { material: 'oak', hours: 3, cost: 2000, guests: 25 },
		success: false,
		value: 25.13,
	},
}

/**
 * Builds the workshop charge: a three-level equation over a seeded variable and a negative constant,
 * and an equation over what the first one solves, rounded to two places.
 *
 * @returns A fresh symbolic definition with id `charge`
 */
export function buildWorkshopCharge(): SymbolicDefinition {
	return createSymbolicDefinition(
		'charge',
		'Workshop charge',
		[
			createEquation(
				'charge',
				createVariable('charge'),
				createOperation(
					'maximum',
					createOperation(
						'divide',
						createOperation('multiply', createVariable('width'), createVariable('depth')),
						createConstant(2),
					),
					createOperation('subtract', createVariable('minimum'), createConstant(-2)),
				),
				'charge',
				{ name: 'Charge', description: 'The charge grows with the floor and has a least value.' },
			),
			createEquation(
				'deposit',
				createVariable('deposit'),
				createOperation('percentage', createVariable('charge'), createConstant(12.5)),
				'deposit',
				{ name: 'Deposit' },
			),
		],
		{ variables: { minimum: 12 }, precision: 2 },
	)
}

/** Names the charge subjects: one the floor decides, one the least charge decides, and one unread. */
export const WORKSHOP_CHARGES: Readonly<Record<string, WorkshopAreaCase>> = {
	floor: {
		subject: { width: 9, depth: 5 },
		success: true,
		solutions: { charge: 22.5, deposit: 2.81 },
	},
	least: {
		subject: { width: 4, depth: 5 },
		success: true,
		solutions: { charge: 14, deposit: 1.75 },
	},
	refused: { subject: { width: 4 }, success: false, solutions: {} },
}

/**
 * Builds the workshop kin: two parents, one less than certain, an inference over both, and one that
 * also reads the subject's `member`.
 *
 * @param strategy - How the definition's runs reason. Default: `'forward'`
 * @returns A fresh inferential definition with id `kin`
 */
export function buildWorkshopKin(strategy: ChainStrategy = 'forward'): InferentialDefinition {
	return createInferentialDefinition(
		'kin',
		'Workshop kin',
		[
			createFact('ab', 'parent', ['alice', 'bob']),
			createFact('bc', 'parent', ['bob', 'cara'], 0.9),
		],
		[
			createInference(
				'grandparent',
				[createFact('first', 'parent', ['?x', '?y']), createFact('second', 'parent', ['?y', '?z'])],
				createFact('grandparent-conclusion', 'grandparent', ['?x', '?z']),
				{ name: 'Grandparents', description: 'A parent of a parent.', confidence: 0.95 },
			),
			createInference(
				'welcome',
				[
					createFact('elder', 'grandparent', ['?x', '?z']),
					createFact('member', 'has', ['member', 'gold']),
				],
				createFact('welcome-conclusion', 'welcome', ['?x']),
				{ name: 'Welcome' },
			),
		],
		{ strategy },
	)
}

/**
 * Holds the domain words the workshop definitions need, keyed by `formatField`, so the array path
 * `['terms', 'excess']` is `terms.excess`. The `member` label keeps its odd casing on purpose, as
 * the `welcome` sentence does.
 */
export const WORKSHOP_GLOSSARY: {
	readonly labels: Readonly<Record<string, string>>
	readonly units: Readonly<Record<string, string>>
	readonly values: Readonly<Record<string, string>>
	readonly formats: Readonly<Record<string, Intl.NumberFormatOptions>>
	readonly predicates: Readonly<Record<string, string>>
} = {
	labels: {
		activity: 'activity',
		'terms.excess': 'places over capacity',
		'terms.rate': 'hourly rate',
		guests: 'guest count',
		season: 'season',
		start: 'start hour',
		member: 'wOrkshop tier',
		score: 'booking score',
		noise: 'noise level',
		tools: 'tools brought',
		trained: 'trained supervisor',
		morning: 'morning session',
		evening: 'evening session',
		cost: 'cost',
		room: 'room',
		width: 'width',
		depth: 'depth',
		area: 'floor area',
		trusted: 'trusted booker',
		quiet: 'quiet activity',
		restricted: 'restricted activity',
		material: 'material',
		hours: 'hours booked',
		charge: 'charge',
		deposit: 'deposit',
		minimum: 'least fee',
	},
	units: {
		cost: 'money',
		'terms.excess': 'money',
		'terms.rate': 'money',
		noise: 'decibel',
		start: 'plain',
		score: 'count',
		guests: 'count',
		hours: 'count',
		charge: 'money',
		deposit: 'money',
	},
	values: { score: 'count', fees: 'money', quote: 'money' },
	formats: {
		money: { style: 'currency', currency: 'USD' },
		decibel: { maximumFractionDigits: 1 },
	},
	predicates: {
		booked: '{{1}} is booked',
		staffed: '{{1}} is staffed',
		cleaned: '{{1}} is cleaned',
		closed: '{{1}} is closed',
		parent: '{{1}} is a parent of {{2}}',
		grandparent: '{{1}} is a grandparent of {{2}}',
		welcome: '{{1}} is wELCOME',
	},
}

/** Represents one connective with one operand count it allows. */
export type WorkshopShape = readonly [LogicalOperator, number]

/** Lists the connectives with each operand count they allow: `not` one, the rest two, and `and`/`or` three too. */
export const WORKSHOP_SHAPES: readonly [WorkshopShape, ...WorkshopShape[]] = [
	['not', 1],
	['implies', 2],
	['xor', 2],
	['and', 2],
	['and', 3],
	['or', 2],
	['or', 3],
]

/** Names the three fields the expression trees read, each as `field equals true`. */
export const WORKSHOP_TREE_FIELDS: readonly [string, ...string[]] = ['a', 'b', 'c']

/** Holds the seed the depth-3 expression trees are drawn under. */
export const WORKSHOP_TREE_SEED = 20260101

/** Holds how many depth-3 expression trees are drawn. */
export const WORKSHOP_TREE_DRAWS = 200

/**
 * Collects the display path of every atom an expression reads, in extraction order.
 *
 * @param expression - The expression to read
 * @returns One display path per atom
 */
export function collectExpressionFields(expression: Expression): readonly string[] {
	return extractAtoms(expression).map((atom) => formatField(atom.check.field))
}

/**
 * Collects the connective of every compound in an expression, outermost first.
 *
 * @param expression - The expression to read
 * @returns One connective per compound, repeats included
 */
export function collectConnectives(expression: Expression): readonly LogicalOperator[] {
	return expression.form === 'atom'
		? []
		: [expression.operator, ...expression.operands.flatMap(collectConnectives)]
}

/**
 * Measures how many connectives deep an expression nests.
 *
 * @param expression - The expression to measure
 * @returns Zero for an atom, otherwise one more than the deepest operand
 */
export function measureDepth(expression: Expression): number {
	return expression.form === 'atom' ? 0 : 1 + Math.max(...expression.operands.map(measureDepth))
}

/**
 * Lists the ordered operand tuples of one size over a pool, none reading a field twice.
 *
 * @param pool - The expressions an operand is drawn from
 * @param size - The operand count
 * @returns Every ordered tuple of that size whose operands read disjoint fields
 */
export function listOperandTuples(
	pool: readonly Expression[],
	size: number,
): ReadonlyArray<readonly Expression[]> {
	if (size === 0) return [[]]
	return listOperandTuples(pool, size - 1).flatMap((tuple) => {
		const used = new Set(tuple.flatMap(collectExpressionFields))
		return pool
			.filter((operand) => !collectExpressionFields(operand).some((field) => used.has(field)))
			.map((operand) => [...tuple, operand])
	})
}

/**
 * Combines a pool of expressions under every connective at every arity it allows, keeping the
 * compounds that hold at least one operand of `deep`.
 *
 * @param pool - The expressions an operand is drawn from
 * @param deep - The members of the pool a compound must hold at least one of
 * @returns Every such compound, no field read twice in one
 */
export function combineExpressions(
	pool: readonly Expression[],
	deep: readonly Expression[],
): readonly Expression[] {
	return WORKSHOP_SHAPES.flatMap(([operator, size]) =>
		listOperandTuples(pool, size)
			.filter((tuple) => tuple.some((operand) => deep.includes(operand)))
			.map((tuple) => createCompound(operator, tuple)),
	)
}

/**
 * Picks one member of a non-empty list from a random source.
 *
 * @param list - The members to pick from
 * @param next - The random source, returning values in `[0, 1)`
 * @returns The picked member
 */
export function pickMember<T>(list: readonly [T, ...T[]], next: () => number): T {
	return list[Math.floor(next() * list.length)] ?? list[0]
}

/**
 * Draws an expression of exactly the given depth over the tree fields, reading a field more than
 * once where the depth needs it.
 *
 * @param next - The random source, returning values in `[0, 1)`
 * @param depth - The number of connectives the deepest path nests
 * @returns The drawn expression
 */
export function drawExpression(next: () => number, depth: number): Expression {
	if (depth === 0) return createAtom(pickMember(WORKSHOP_TREE_FIELDS, next), 'equals', true)
	const [operator, size] = pickMember(WORKSHOP_SHAPES, next)
	return createCompound(
		operator,
		Array.from({ length: size }, (_, index) =>
			drawExpression(next, index === 0 ? depth - 1 : Math.floor(next() * depth)),
		),
	)
}

/**
 * Builds the expression trees the writing side's pairing is proved on: every tree of depth 1 and
 * 2 that reads each of three atoms at most once, then the seeded draws of depth 3, each wrapped
 * as a one-rule definition whose rule has an authored name.
 *
 * @returns The definitions, depth 1 first, then depth 2, then the draws
 */
export function buildExpressionTrees(): readonly LogicalDefinition[] {
	const atoms = WORKSHOP_TREE_FIELDS.map((field) => createAtom(field, 'equals', true))
	const first = combineExpressions(atoms, atoms)
	const second = combineExpressions([...atoms, ...first], first)
	const next = seededRandom(WORKSHOP_TREE_SEED)
	const third = Array.from({ length: WORKSHOP_TREE_DRAWS }, () => drawExpression(next, 3))
	return [...first, ...second, ...third].map((expression, index) =>
		createLogicalDefinition(`tree${String(index)}`, `Tree ${String(index)}`, [
			createRule('rule', [expression], createAtom('out', 'equals', true), {
				name: `Tree rule ${String(index)}`,
			}),
		]),
	)
}

/**
 * Collects every assignment of `a`, `b`, and `c` to `true`, `false`, or absent.
 *
 * @returns The subjects, with an absent field left off the subject
 */
export function collectTreeSubjects(): readonly Subject[] {
	const readings = [true, false, undefined]
	return Array.from({ length: readings.length ** WORKSHOP_TREE_FIELDS.length }, (_, number) =>
		Object.fromEntries(
			WORKSHOP_TREE_FIELDS.flatMap((field, index) => {
				const reading = readings[Math.floor(number / readings.length ** index) % readings.length]
				return reading === undefined ? [] : [[field, reading]]
			}),
		),
	)
}

/** Lists the operations that read no right side. */
export const SYMBOLIC_UNARY: readonly MathOperation[] = ['round', 'ceil', 'floor', 'abs']

/** Lists the leaves the symbolic trees are built of: two variables, a constant, and a negative one. */
export const SYMBOLIC_LEAVES: readonly [SymbolicExpression, ...SymbolicExpression[]] = [
	createVariable('a'),
	createVariable('b'),
	createConstant(2.5),
	createConstant(-3),
]

/**
 * Builds one operation over two operands, the second left out where the operation reads none.
 *
 * @param operator - The operation
 * @param left - The first operand
 * @param right - The second operand
 * @returns The operation
 */
export function buildSymbolicNode(
	operator: MathOperation,
	left: SymbolicExpression,
	right: SymbolicExpression,
): SymbolicExpression {
	return SYMBOLIC_UNARY.includes(operator)
		? createOperation(operator, left)
		: createOperation(operator, left, right)
}

/**
 * Measures how many operations deep a symbolic tree nests.
 *
 * @param tree - The tree to measure
 * @returns Zero for a leaf, otherwise one more than the deeper operand
 */
export function measureTree(tree: SymbolicExpression): number {
	if (tree.form !== 'operation') return 0
	const right = tree.right === undefined ? 0 : measureTree(tree.right)
	return 1 + Math.max(measureTree(tree.left), right)
}

/**
 * Draws a symbolic tree of exactly the given depth.
 *
 * @param next - The random source, returning values in `[0, 1)`
 * @param depth - The number of operations the deepest path nests
 * @returns The drawn tree
 */
export function drawSymbolicTree(next: () => number, depth: number): SymbolicExpression {
	if (depth === 0) return pickMember(SYMBOLIC_LEAVES, next)
	const operator = pickMember(MATH_OPERATIONS, next)
	const deep = drawSymbolicTree(next, depth - 1)
	const other = drawSymbolicTree(next, Math.floor(next() * depth))
	return SYMBOLIC_UNARY.includes(operator) || next() < 0.5
		? buildSymbolicNode(operator, deep, other)
		: buildSymbolicNode(operator, other, deep)
}

/**
 * Builds the trees an equation's text is proved on: each leaf, every operation over every pair of
 * leaves, every operation inside every operation on each side, and the seeded draws of depth 3.
 *
 * @returns The trees, shallowest first
 */
export function buildSymbolicTrees(): readonly SymbolicExpression[] {
	const [a, b] = [createVariable('a'), createVariable('b')]
	const first = MATH_OPERATIONS.flatMap((operator) =>
		SYMBOLIC_LEAVES.flatMap((left) =>
			SYMBOLIC_UNARY.includes(operator)
				? [createOperation(operator, left)]
				: SYMBOLIC_LEAVES.map((right) => createOperation(operator, left, right)),
		),
	)
	const second = MATH_OPERATIONS.flatMap((operator) =>
		MATH_OPERATIONS.flatMap((inner) => {
			const nested = buildSymbolicNode(inner, a, b)
			return SYMBOLIC_UNARY.includes(operator)
				? [createOperation(operator, nested)]
				: [createOperation(operator, nested, a), createOperation(operator, a, nested)]
		}),
	)
	const next = seededRandom(WORKSHOP_TREE_SEED)
	const third = Array.from({ length: WORKSHOP_TREE_DRAWS }, () => drawSymbolicTree(next, 3))
	return [...SYMBOLIC_LEAVES, ...first, ...second, ...third]
}

/** Holds each operation's English as an equation prints it, the operands captured, the left one first unless it says so. */
export const SIDE_READINGS: ReadonlyArray<
	readonly [operator: MathOperation, pattern: RegExp, swapped?: true]
> = [
	['add', /^(.+) \+ (.+)$/u],
	['subtract', /^(.+) - (.+)$/u],
	['multiply', /^(.+) × (.+)$/u],
	['divide', /^(.+) ÷ (.+)$/u],
	['percentage', /^(.+)% of (.+)$/u, true],
	['minimum', /^the lower of (.+) and (.+)$/u],
	['maximum', /^the higher of (.+) and (.+)$/u],
	['average', /^the average of (.+) and (.+)$/u],
	['power', /^(.+) to the power of (.+)$/u],
	['round', /^(.+) rounded to a whole number$/u],
	['ceil', /^(.+) rounded up to a whole number$/u],
	['floor', /^(.+) rounded down to a whole number$/u],
	['abs', /^the absolute value of (.+)$/u],
]

/**
 * Splits a text at its outermost parentheses, each group standing as `§` and its position.
 *
 * @param text - The text to split
 * @returns The text with a mark for each group, and the groups' own texts in order
 */
export function splitGroups(text: string): {
	readonly flat: string
	readonly groups: readonly string[]
} {
	const depths = [...text].map((_mark, index) => {
		const before = [...text.slice(0, index + 1)]
		return (
			before.filter((mark) => mark === '(').length - before.filter((mark) => mark === ')').length
		)
	})
	const marks = [...text]
	const opens = marks.flatMap((mark, index) => (mark === '(' && depths[index] === 1 ? [index] : []))
	const closes = marks.flatMap((mark, index) =>
		mark === ')' && depths[index] === 0 ? [index] : [],
	)
	const groups = opens.map((open, index) => text.slice(open + 1, closes[index]))
	const outside = [0, ...closes.map((close) => close + 1)].map((start, index) =>
		text.slice(start, opens[index]),
	)
	return {
		flat: outside
			.map((part, index) => (index < groups.length ? `${part}§${String(index)}` : part))
			.join(''),
		groups,
	}
}

/**
 * Parses one side of an equation's text back into its tree, sharing nothing with what wrote it.
 *
 * @param text - The side's text
 * @param names - Each variable's name by its label
 * @returns The tree, or `undefined` when the text has no reading or more than one
 */
export function parseSide(
	text: string,
	names: ReadonlyMap<string, string>,
): SymbolicExpression | undefined {
	const { flat, groups } = splitGroups(text)
	const whole = /^§(\d+)$/u.exec(flat)?.[1]
	if (whole !== undefined) return parseSide(groups[Number(whole)] ?? '', names)
	const readings = SIDE_READINGS.filter(([, pattern]) => pattern.test(flat))
	if (readings.length > 1) return undefined
	const [reading] = readings
	if (reading === undefined) {
		const name = names.get(flat)
		if (name !== undefined) return createVariable(name)
		return /^-?\d+(?:\.\d+)?$/u.test(flat) ? createConstant(Number(flat)) : undefined
	}
	const [operator, pattern, swapped] = reading
	const parts = [...(pattern.exec(flat) ?? [])].slice(1).map((part) => {
		const mark = /^§(\d+)$/u.exec(part)?.[1]
		return parseSide(mark === undefined ? part : `(${groups[Number(mark)] ?? ''})`, names)
	})
	const [left, right] = swapped === true ? parts.toReversed() : parts
	if (left === undefined) return undefined
	if (SYMBOLIC_UNARY.includes(operator)) return createOperation(operator, left)
	return right === undefined ? undefined : createOperation(operator, left, right)
}

/** Holds each change's English as a worksheet prints it, with the arithmetic the English states. */
export const CHANGE_READINGS: ReadonlyArray<
	readonly [pattern: RegExp, compute: (value: number, operand: number) => number]
> = [
	[/^plus (.+)$/u, (value, operand) => value + operand],
	[/^minus (.+)$/u, (value, operand) => value - operand],
	[/^times (.+)$/u, (value, operand) => value * operand],
	[/^divided by (.+)$/u, (value, operand) => value / operand],
	[/^(.+)% of it$/u, (value, operand) => (value * operand) / 100],
	[/^the lower of it and (.+)$/u, (value, operand) => (value < operand ? value : operand)],
	[/^the higher of it and (.+)$/u, (value, operand) => (value > operand ? value : operand)],
	[/^averaged with (.+)$/u, (value, operand) => (value + operand) / 2],
	[/^to the power of (.+)$/u, (value, operand) => value ** operand],
	[/^rounded to a whole number$/u, (value) => Math.floor(value + 0.5)],
	[/^rounded up to a whole number$/u, (value) => -Math.floor(-value)],
	[/^rounded down to a whole number$/u, (value) => -Math.ceil(-value)],
	[/^without its sign$/u, (value) => (value < 0 ? -value : value)],
]

/**
 * Computes what a worksheet's changes line says a number becomes.
 *
 * @param raw - The number before its changes
 * @param changes - The changes, joined by `, then `
 * @returns The number after them, or `NaN` when a change has no reading or more than one
 */
export function computeChanges(raw: number, changes: string): number {
	return changes.split(', then ').reduce((value, change) => {
		const readings = CHANGE_READINGS.filter(([pattern]) => pattern.test(change))
		const [reading] = readings
		if (reading === undefined || readings.length > 1) return Number.NaN
		const [pattern, compute] = reading
		return compute(value, Number(pattern.exec(change)?.[1]))
	}, raw)
}

/**
 * Parses a range's text into its inclusive ends.
 *
 * @param text - The range as a band or a bounds line prints it, its numbers plain
 * @returns The ends, an open one absent, or `undefined` when the text is no range
 */
export function parseWordedRange(text: string): Bounds | undefined {
	if (text === 'any value') return {}
	const least = /^at least (.+)$/u.exec(text)?.[1]
	if (least !== undefined) return { minimum: Number(least) }
	const most = /^at most (.+)$/u.exec(text)?.[1]
	if (most !== undefined) return { maximum: Number(most) }
	const ends = /^(.+) to (.+)$/u.exec(text)
	return ends === null ? undefined : { minimum: Number(ends[1]), maximum: Number(ends[2]) }
}

/**
 * Parses a quoted member at the start of a text, sharing nothing with what wrote it.
 *
 * @param text - The text to read
 * @param open - The mark that opens a member
 * @param close - The mark that closes one; a backslash stands before each one inside it
 * @returns The member and the text after it, or `undefined` when no closed member opens the text
 */
export function parseQuotedMember(
	text: string,
	open: string,
	close: string,
): { readonly member: string; readonly rest: string } | undefined {
	if (!text.startsWith(open)) return undefined
	const body = text.slice(open.length)
	const inner = close.replace(/[$()*+.?[\\\]^{|}]/gu, '\\$&')
	const read = new RegExp(`^((?:\\\\[\\s\\S]|(?!${inner})[^\\\\])*)${inner}`, 'u').exec(body)
	if (read === null) return undefined
	return {
		member: (read[1] ?? '').replace(/\\([\s\S])/gu, '$1'),
		rest: body.slice(read[0].length),
	}
}

/**
 * Parses a list's text back into its members, sharing nothing with what wrote it.
 *
 * @remarks
 * A list is quoted whole, or split at its joining texts where no member needed a quote. A blank
 * member is quoted in either.
 *
 * @param text - The list's text
 * @param joins - The texts the locale puts between members, longest first
 * @param open - The mark that opens a quoted member
 * @param close - The mark that closes one
 * @returns The members
 */
export function parseListText(
	text: string,
	joins: readonly string[],
	open: string,
	close: string,
): readonly string[] {
	const quoted = parseQuotedMember(text, open, close)
	const join = joins.find((entry) => quoted?.rest.startsWith(entry) === true)
	if (quoted !== undefined && quoted.rest === '') return [quoted.member]
	if (quoted !== undefined && join !== undefined) {
		return [quoted.member, ...parseListText(quoted.rest.slice(join.length), joins, open, close)]
	}
	const cuts = joins
		.map((entry) => ({ entry, at: text.indexOf(entry) }))
		.filter(({ at }) => at >= 0)
		.toSorted((a, b) => a.at - b.at || b.entry.length - a.entry.length)
	const [cut] = cuts
	if (cut === undefined) return [text]
	return [
		text.slice(0, cut.at),
		...parseListText(text.slice(cut.at + cut.entry.length), joins, open, close),
	]
}

/** Lists members a list must stay readable with: held marks, joining texts, backslashes, and blanks. */
export const QUOTED_LISTS: ReadonlyArray<readonly string[]> = [
	['"a', 'b"'],
	['a or b'],
	['a', 'b'],
	['x", "y'],
	['x', 'y'],
	['x", "y', 'z'],
	['x" or "y'],
	['bob', 'q", "r'],
	['a\\', 'b'],
	['a\\', 'b"'],
	['a\\"', 'b"'],
	['\\', '"'],
	['\\"'],
	['"'],
	['""', 'a'],
	['', 'a'],
	['', '"'],
	['a, b', 'c\\'],
	['a u otro'],
	['a', 'otro'],
	['siete u ocho', 'x'],
	['a e hijo'],
	['a oder b', 'c"'],
	['a、b', 'c"'],
	['aまたはb', 'c'],
	['»a', 'b«'],
	['a>', '<b'],
	["it's", "x', 'y"],
]

/** Lists the shipped quote and reworded ones, each with the marks that open and close a member. */
export const QUOTE_FRAMES: ReadonlyArray<readonly [frame: string, open: string, close: string]> = [
	['"{{value}}"', '"', '"'],
	['«{{value}}»', '«', '»'],
	["'{{value}}'", "'", "'"],
	['<<{{value}}>>', '<<', '>>'],
]

/** Lists the bands a drawn table is built of: two-sided, open on each side, open on both, and inverted. */
export const TABLE_BANDS: readonly [
	Pick<FactorRange, 'bounds'>,
	...Array<Pick<FactorRange, 'bounds'>>,
] = [
	{ bounds: { minimum: 0, maximum: 4 } },
	{ bounds: { minimum: 3, maximum: 8 } },
	{ bounds: { minimum: 6 } },
	{ bounds: { maximum: 2 } },
	{ bounds: { minimum: 5, maximum: 5 } },
	{ bounds: { minimum: 9, maximum: 1 } },
	{ bounds: {} },
	{},
]

/**
 * Builds the range factors the guide's table is proved on: seeded draws of up to four bands, some
 * with a fallback, each as a definition of its one factor over the field `n`.
 *
 * @returns The definitions
 */
export function buildBandTables(): readonly QuantitativeDefinition[] {
	const next = seededRandom(WORKSHOP_TREE_SEED)
	return Array.from({ length: WORKSHOP_TREE_DRAWS }, (_, number) => {
		const bands = Array.from({ length: 1 + Math.floor(next() * 4) }, (__, index) => ({
			...pickMember(TABLE_BANDS, next),
			value: 10 * (index + 1) + next(),
		}))
		return createQuantitativeDefinition(`table${String(number)}`, 'Table', [
			createFactorGroup('group', 'sum', [
				createRangeFactor('band', 'n', bands, next() < 0.5 ? { fallback: 99.5 } : {}),
			]),
		])
	})
}

// ── Family fixtures (environment-agnostic) ───────────────────────────────────
// The invented workshop's qualification, rating, and program over the real
// `@orkestrel/qualifier`, `@orkestrel/rater`, and `@orkestrel/program`. Each expectation is
// written from the packages' documented semantics and proved against the engine that owns it in
// `tests/setup.test.ts`.

/** Lists the invented activities the family workshop will not lend a room for. */
export const FAMILY_RESTRICTED: readonly string[] = Object.freeze([
	'torch welding',
	'axe throwing',
	'glass blowing',
])

/** Holds the booking every family subject varies: every ruling is unmet and every line rates. */
export const FAMILY_BASE: Subject = {
	activity: 'pottery',
	guests: 8,
	staff: 2,
	start: 10,
	noise: 30,
	tools: true,
	trained: true,
	member: 'gold',
	score: 750,
	room: 'studio',
	cost: 1000,
}

/** Holds the state each family ruling settles on for the base booking: every one unmet. */
export const FAMILY_UNMET: Readonly<Record<string, CheckState>> = {
	restricted: 'unmet',
	crowded: 'unmet',
	afterhours: 'unmet',
	noisy: 'unmet',
	untrained: 'unmet',
	visitor: 'unmet',
	unstaffed: 'unmet',
	perk: 'unmet',
}

/** Holds the scope eligibilities of a booking no met scoped ruling names: none, so every scope is open. */
export const FAMILY_OPEN: Readonly<Record<string, Eligibility>> = {}

/**
 * Copies a subject without one field, so the rules and lines that read it cannot.
 *
 * @param subject - The subject to copy
 * @param field - The field to leave out
 * @returns A fresh subject with no such field
 */
export function buildFamilyWithout(subject: Subject, field: string): Subject {
	return Object.fromEntries(Object.entries(subject).filter(([name]) => name !== field))
}

/**
 * Builds the family qualification: a quantitative `load` pass whose number the logical `gates`
 * pass reads, and eight named rules, each with a ruling. The rulings cover each effect, two
 * scopes (`rent` and `deposit`, which are also the rating's line ids), a message with a
 * `{{activity}}` slot, a rule description with a `{{guests}}` slot, and a rule under a `not` over
 * an `or`, an `or`, an `implies`, and an `xor`. No `shape` is declared.
 *
 * @returns A fresh qualification definition with id `qualification`
 */
export function buildFamilyQualification(): QualificationDefinition {
	const load = createQuantitativeDefinition(
		'load',
		'Booking load',
		[
			createFactorGroup(
				'amount',
				'sum',
				[
					createFieldFactor('guests', 'guests', { name: 'Guests' }),
					createFieldFactor('staff', 'staff', {
						name: 'Staff',
						transforms: [{ operation: 'multiply', operand: -2 }],
					}),
				],
				{ name: 'Amount' },
			),
		],
		{ description: 'Counts the guests a booking brings beyond what its staff can hold.' },
	)
	const gates = createLogicalDefinition(
		'gates',
		'Booking gates',
		[
			createRule(
				'restricted',
				[createAtom('activity', 'any', [...FAMILY_RESTRICTED])],
				createAtom('restricted', 'equals', true),
				{
					name: 'Restricted activity',
					description: 'The workshop never lends a room for an activity on its restricted list.',
				},
			),
			createRule(
				'crowded',
				[createAtom(['qualification', 'load'], 'above', 10)],
				createAtom('crowded', 'equals', true),
				{
					name: 'Crowded booking',
					description: 'A party of {{guests}} needs more hands than the room has.',
				},
			),
			createRule(
				'afterhours',
				[createAtom('start', 'above', 18)],
				createAtom('afterhours', 'equals', true),
				{ name: 'After hours', description: 'A booking that starts after the workshop closes.' },
			),
			createRule('noisy', [createAtom('noise', 'above', 40)], createAtom('noisy', 'equals', true), {
				name: 'Loud activity',
				description: 'The neighbors hear about a loud activity.',
			}),
			createRule(
				'untrained',
				[
					createCompound('not', [
						createCompound('or', [
							createAtom('trained', 'equals', true),
							createAtom('tools', 'equals', false),
						]),
					]),
				],
				createAtom('untrained', 'equals', true),
				{
					name: 'Tools without training',
					description: 'A booking that brings tools and no trained supervisor.',
				},
			),
			createRule(
				'visitor',
				[
					createCompound('or', [
						createAtom('member', 'equals', 'guest'),
						createAtom('score', 'below', 400),
					]),
				],
				createAtom('visitor', 'equals', true),
				{
					name: 'Visiting booker',
					description: 'A guest, or a booker with a low score, is a visitor.',
				},
			),
			createRule(
				'unstaffed',
				[
					createCompound('implies', [
						createAtom('guests', 'above', 0),
						createAtom('staff', 'below', 1),
					]),
				],
				createAtom('unstaffed', 'equals', true),
				{
					name: 'Guests without staff',
					description: 'Guests arrive and no staff member is there to meet them.',
				},
			),
			createRule(
				'perk',
				[
					createCompound('xor', [
						createAtom('member', 'equals', 'gold'),
						createAtom('tools', 'equals', true),
					]),
				],
				createAtom('perk', 'equals', true),
				{
					name: 'Bench slot',
					description: 'A gold member or a booking with tools, never both, takes the bench slot.',
				},
			),
		],
		{ description: 'Lists what the workshop checks in a booking.' },
	)
	return createQualificationDefinition('qualification', 'Booking qualification', [load, gates], {
		description: 'Decides whether the workshop takes a booking.',
		rulings: [
			createRuling('restricted', 'gates', 'restricted', 'restriction', {
				message: 'The workshop does not lend a room for {{activity}}.',
			}),
			createRuling('crowded', 'gates', 'crowded', 'referral'),
			createRuling('afterhours', 'gates', 'afterhours', 'restriction', {
				scope: 'rent',
				message: 'The room cannot be rented after 18:00.',
			}),
			createRuling('noisy', 'gates', 'noisy', 'condition', {
				scope: 'rent',
				message: 'Neighbours must be told.',
			}),
			createRuling('untrained', 'gates', 'untrained', 'referral', {
				scope: 'deposit',
				message: 'A person must review the deposit.',
			}),
			createRuling('visitor', 'gates', 'visitor', 'condition'),
			createRuling('unstaffed', 'gates', 'unstaffed', 'restriction', { scope: 'deposit' }),
			createRuling('perk', 'gates', 'perk', 'condition', { message: 'The bench slot is held.' }),
		],
	})
}

/**
 * Names the booking subjects of the family qualification, each with the eligibility, each scope's
 * eligibility, each finding's state, the messages of the findings that are met, whether the run
 * succeeds, the inputs it could not read, and the `load` it derives. A scope appears only
 * where a met scoped ruling names it, and a missing scope is `eligible`. `unread` leaves
 * `noisy` unread, and `refused` fails the `load` pass, so `crowded` and `unstaffed` read nothing.
 * No `shape` is declared, so no subject is refused at a door.
 */
export const FAMILY_SUBJECTS: Readonly<
	Record<
		string,
		{
			readonly subject: Subject
			readonly eligibility: Eligibility
			readonly scopes: Readonly<Record<string, Eligibility>>
			readonly states: Readonly<Record<string, CheckState>>
			readonly messages: Readonly<Record<string, string>>
			readonly success: boolean
			readonly faults: readonly string[]
			readonly load?: number
		}
	>
> = {
	standing: {
		subject: FAMILY_BASE,
		eligibility: 'eligible',
		scopes: FAMILY_OPEN,
		states: FAMILY_UNMET,
		messages: {},
		success: true,
		faults: [],
		load: 4,
	},
	restricted: {
		subject: { ...FAMILY_BASE, activity: 'torch welding' },
		eligibility: 'ineligible',
		scopes: FAMILY_OPEN,
		states: { ...FAMILY_UNMET, restricted: 'met' },
		messages: { restricted: 'The workshop does not lend a room for torch welding.' },
		success: true,
		faults: [],
		load: 4,
	},
	referred: {
		subject: { ...FAMILY_BASE, guests: 20 },
		eligibility: 'referral',
		scopes: FAMILY_OPEN,
		states: { ...FAMILY_UNMET, crowded: 'met' },
		messages: {},
		success: true,
		faults: [],
		load: 16,
	},
	loud: {
		subject: { ...FAMILY_BASE, noise: 55 },
		eligibility: 'eligible',
		scopes: { rent: 'eligible' },
		states: { ...FAMILY_UNMET, noisy: 'met' },
		messages: { noisy: 'Neighbours must be told.' },
		success: true,
		faults: [],
		load: 4,
	},
	late: {
		subject: { ...FAMILY_BASE, start: 20 },
		eligibility: 'eligible',
		scopes: { rent: 'ineligible' },
		states: { ...FAMILY_UNMET, afterhours: 'met' },
		messages: { afterhours: 'The room cannot be rented after 18:00.' },
		success: true,
		faults: [],
		load: 4,
	},
	untrained: {
		subject: { ...FAMILY_BASE, trained: false },
		eligibility: 'eligible',
		scopes: { deposit: 'referral' },
		states: { ...FAMILY_UNMET, untrained: 'met' },
		messages: { untrained: 'A person must review the deposit.' },
		success: true,
		faults: [],
		load: 4,
	},
	unstaffed: {
		subject: { ...FAMILY_BASE, staff: 0 },
		eligibility: 'eligible',
		scopes: { deposit: 'ineligible' },
		states: { ...FAMILY_UNMET, unstaffed: 'met' },
		messages: {},
		success: true,
		faults: [],
		load: 8,
	},
	visitor: {
		subject: { ...FAMILY_BASE, member: 'guest', tools: false },
		eligibility: 'eligible',
		scopes: FAMILY_OPEN,
		states: { ...FAMILY_UNMET, visitor: 'met' },
		messages: {},
		success: true,
		faults: [],
		load: 4,
	},
	perk: {
		subject: { ...FAMILY_BASE, member: 'silver' },
		eligibility: 'eligible',
		scopes: FAMILY_OPEN,
		states: { ...FAMILY_UNMET, perk: 'met' },
		messages: { perk: 'The bench slot is held.' },
		success: true,
		faults: [],
		load: 4,
	},
	unread: {
		subject: buildFamilyWithout(FAMILY_BASE, 'noise'),
		eligibility: 'referral',
		scopes: FAMILY_OPEN,
		states: { ...FAMILY_UNMET, noisy: 'unread' },
		messages: {},
		success: false,
		faults: ['noise'],
		load: 4,
	},
	refused: {
		subject: buildFamilyWithout(FAMILY_BASE, 'guests'),
		eligibility: 'referral',
		scopes: FAMILY_OPEN,
		states: { ...FAMILY_UNMET, crowded: 'unread', unstaffed: 'unread' },
		messages: {},
		success: false,
		faults: ['guests'],
	},
}

/**
 * Builds the family rating: a lookup line whose `fallback` equals its `studio` entry, a line with
 * transforms and bounds, and a line whose required factor a booking over the cost limit fails.
 * The line ids are the scopes the qualification names.
 *
 * @returns A fresh rating definition with id `rating`
 */
export function buildFamilyRating(): RatingDefinition {
	return buildRatingDefinition(
		'rating',
		'Booking rating',
		[
			buildLineDefinition(
				'rent',
				'Room rent',
				createQuantitativeDefinition('rentRate', 'Room rate', [
					createFactorGroup(
						'hire',
						'sum',
						[
							createLookupFactor(
								'room',
								'room',
								{ hall: 120, studio: 80, loft: 60 },
								{ name: 'Room rate', fallback: 80 },
							),
						],
						{ name: 'Hire' },
					),
				]),
				{ description: 'What the room costs for the booking.' },
			),
			buildLineDefinition(
				'fee',
				'Guest fee',
				createQuantitativeDefinition('feeRate', 'Guest rate', [
					createFactorGroup(
						'heads',
						'sum',
						[
							createFieldFactor('guests', 'guests', {
								name: 'Per guest',
								transforms: [
									{ operation: 'multiply', operand: 2 },
									{ operation: 'add', operand: 10 },
								],
								bounds: { minimum: 20, maximum: 100 },
							}),
						],
						{ name: 'Heads' },
					),
				]),
			),
			buildLineDefinition(
				'deposit',
				'Deposit',
				createQuantitativeDefinition('depositRate', 'Deposit rate', [
					createFactorGroup(
						'hold',
						'sum',
						[
							createStaticFactor('deposit', 50, {
								name: 'Deposit',
								checks: [{ field: 'cost', operator: 'to', value: 1250 }],
								required: true,
							}),
						],
						{ name: 'Hold' },
					),
				]),
			),
		],
		{ description: 'Prices one booking.' },
	)
}

/**
 * Names the rating subjects, each with the amount of every line that rates, the inputs it could
 * not read, and the total. A line that cannot rate has no key in `amounts`, and a total is absent
 * while any line fails. `attic` takes the lookup's fallback, which equals the `studio` entry.
 */
export const FAMILY_RATINGS: Readonly<
	Record<
		string,
		{
			readonly subject: Subject
			readonly success: boolean
			readonly amounts: Readonly<Record<string, number>>
			readonly faults: readonly string[]
			readonly total?: number
		}
	>
> = {
	standing: {
		subject: FAMILY_BASE,
		success: true,
		amounts: { rent: 80, fee: 26, deposit: 50 },
		faults: [],
		total: 156,
	},
	attic: {
		subject: { ...FAMILY_BASE, room: 'attic' },
		success: true,
		amounts: { rent: 80, fee: 26, deposit: 50 },
		faults: [],
		total: 156,
	},
	hall: {
		subject: { ...FAMILY_BASE, room: 'hall', guests: 50 },
		success: true,
		amounts: { rent: 120, fee: 100, deposit: 50 },
		faults: [],
		total: 270,
	},
	small: {
		subject: { ...FAMILY_BASE, room: 'loft', guests: 1 },
		success: true,
		amounts: { rent: 60, fee: 20, deposit: 50 },
		faults: [],
		total: 130,
	},
	costly: {
		subject: { ...FAMILY_BASE, cost: 2000 },
		success: false,
		amounts: { rent: 80, fee: 26 },
		faults: [],
	},
	noroom: {
		subject: buildFamilyWithout(FAMILY_BASE, 'room'),
		success: false,
		amounts: { fee: 26, deposit: 50 },
		faults: ['room'],
	},
}

/**
 * Builds the family program over the family qualification and rating: two notices (`closing`, and
 * `due` under the `rent` scope with a `{{room}}` slot), an authority whose `heavy` rule is a limit
 * on a rated total above 200, and no shape.
 *
 * @returns A fresh program definition with id `program`
 */
export function buildFamilyProgram(): ProgramDefinition {
	return buildProgramDefinition(
		'program',
		'Booking program',
		buildFamilyQualification(),
		buildFamilyRating(),
		{
			description: 'Takes a booking from qualification to a decision.',
			notices: [
				buildNotice('closing', 'The workshop closes at 18:00.'),
				buildNotice('due', 'Rent for {{room}} is due on arrival.', { scope: 'rent' }),
			],
			authority: createLogicalDefinition(
				'authority',
				'Booking authority',
				[
					createRule(
						'heavy',
						[
							createCompound('and', [
								createAtom(['outcome', 'rated'], 'equals', true),
								createAtom(['outcome', 'total'], 'above', 200),
							]),
						],
						createAtom('limited', 'equals', true),
						{
							name: 'Heavy booking',
							description: 'A rated total above 200 needs a manual decision.',
						},
					),
				],
				{ description: 'Decides what the workshop does with a rated booking.' },
			),
		},
	)
}

/**
 * Names the program subjects, each with the eligibility, status, decision, determinations, success,
 * rated total, and inputs it could not read. An absent `decision` is expected where the key is
 * missing. All six statuses are reached: `standing` and `heavy` are `eligible`, `denied` is
 * `ineligible`, `submitted` and `reviewed` are `referral`, `loud` and `late` are `conditional`,
 * `costly` is `unrated`, and `unread` is `incomplete`. `heavy` has a limit and so no decision,
 * `reviewed` has a scoped referral and so a decision with a `referral` status, and `unread` and
 * `costly` fail and decide nothing.
 */
export const FAMILY_PROGRAMS: Readonly<
	Record<
		string,
		{
			readonly subject: Subject
			readonly eligibility: Eligibility
			readonly status: Status
			readonly decision?: Decision
			readonly determinations: ReadonlyArray<{
				readonly id: string
				readonly effect: 'notice' | 'limit'
				readonly scope?: string
				readonly message: string
			}>
			readonly success: boolean
			readonly faults: readonly string[]
			readonly total?: number
		}
	>
> = {
	standing: {
		subject: FAMILY_BASE,
		eligibility: 'eligible',
		status: 'eligible',
		decision: 'approved',
		determinations: [
			{ id: 'closing', effect: 'notice', message: 'The workshop closes at 18:00.' },
			{
				id: 'due',
				effect: 'notice',
				scope: 'rent',
				message: 'Rent for studio is due on arrival.',
			},
		],
		success: true,
		faults: [],
		total: 156,
	},
	denied: {
		subject: { ...FAMILY_BASE, activity: 'torch welding' },
		eligibility: 'ineligible',
		status: 'ineligible',
		decision: 'denied',
		determinations: [
			{ id: 'closing', effect: 'notice', message: 'The workshop closes at 18:00.' },
			{
				id: 'due',
				effect: 'notice',
				scope: 'rent',
				message: 'Rent for studio is due on arrival.',
			},
		],
		success: true,
		faults: [],
	},
	submitted: {
		subject: { ...FAMILY_BASE, guests: 20 },
		eligibility: 'referral',
		status: 'referral',
		decision: 'submitted',
		determinations: [
			{ id: 'closing', effect: 'notice', message: 'The workshop closes at 18:00.' },
			{
				id: 'due',
				effect: 'notice',
				scope: 'rent',
				message: 'Rent for studio is due on arrival.',
			},
		],
		success: true,
		faults: [],
	},
	reviewed: {
		subject: { ...FAMILY_BASE, trained: false },
		eligibility: 'eligible',
		status: 'referral',
		decision: 'approved',
		determinations: [
			{ id: 'closing', effect: 'notice', message: 'The workshop closes at 18:00.' },
			{
				id: 'due',
				effect: 'notice',
				scope: 'rent',
				message: 'Rent for studio is due on arrival.',
			},
		],
		success: true,
		faults: [],
		total: 106,
	},
	loud: {
		subject: { ...FAMILY_BASE, noise: 55 },
		eligibility: 'eligible',
		status: 'conditional',
		decision: 'approved',
		determinations: [
			{ id: 'closing', effect: 'notice', message: 'The workshop closes at 18:00.' },
			{
				id: 'due',
				effect: 'notice',
				scope: 'rent',
				message: 'Rent for studio is due on arrival.',
			},
		],
		success: true,
		faults: [],
		total: 156,
	},
	late: {
		subject: { ...FAMILY_BASE, start: 20 },
		eligibility: 'eligible',
		status: 'conditional',
		decision: 'approved',
		determinations: [
			{ id: 'closing', effect: 'notice', message: 'The workshop closes at 18:00.' },
			{
				id: 'due',
				effect: 'notice',
				scope: 'rent',
				message: 'Rent for studio is due on arrival.',
			},
		],
		success: true,
		faults: [],
		total: 76,
	},
	costly: {
		subject: { ...FAMILY_BASE, cost: 2000 },
		eligibility: 'eligible',
		status: 'unrated',
		determinations: [
			{ id: 'closing', effect: 'notice', message: 'The workshop closes at 18:00.' },
			{
				id: 'due',
				effect: 'notice',
				scope: 'rent',
				message: 'Rent for studio is due on arrival.',
			},
		],
		success: false,
		faults: [],
	},
	unread: {
		subject: buildFamilyWithout(FAMILY_BASE, 'noise'),
		eligibility: 'referral',
		status: 'incomplete',
		determinations: [
			{ id: 'closing', effect: 'notice', message: 'The workshop closes at 18:00.' },
			{
				id: 'due',
				effect: 'notice',
				scope: 'rent',
				message: 'Rent for studio is due on arrival.',
			},
		],
		success: false,
		faults: ['noise'],
	},
	heavy: {
		subject: { ...FAMILY_BASE, room: 'hall', guests: 50, staff: 22 },
		eligibility: 'eligible',
		status: 'eligible',
		determinations: [
			{ id: 'closing', effect: 'notice', message: 'The workshop closes at 18:00.' },
			{
				id: 'due',
				effect: 'notice',
				scope: 'rent',
				message: 'Rent for hall is due on arrival.',
			},
			{
				id: 'heavy',
				effect: 'limit',
				message: 'A rated total above 200 needs a manual decision.',
			},
		],
		success: true,
		faults: [],
		total: 270,
	},
}

/**
 * Holds the domain words the family definitions need, keyed by `formatField`: a label and a unit
 * for every field the qualification, rating, and authority read, the `load` the first pass derives
 * as `qualification.load`, and the authority's `outcome.rated` and `outcome.total`; a unit for the
 * rating and each line's rate under its definition id; and a name for the `rent` scope. The
 * `deposit` scope has no entry, because the rating line of that id names it.
 */
export const FAMILY_GLOSSARY: {
	readonly labels: Readonly<Record<string, string>>
	readonly units: Readonly<Record<string, string>>
	readonly values: Readonly<Record<string, string>>
	readonly formats: Readonly<Record<string, Intl.NumberFormatOptions>>
	readonly scopes: Readonly<Record<string, string>>
} = {
	labels: {
		activity: 'activity',
		guests: 'guest count',
		staff: 'staff on hand',
		start: 'start hour',
		noise: 'noise level',
		tools: 'tools brought',
		trained: 'trained supervisor',
		member: 'workshop tier',
		score: 'booking score',
		room: 'room',
		cost: 'cost',
		'qualification.load': 'booking load',
		'outcome.rated': 'booking rated',
		'outcome.total': 'rated total',
	},
	units: {
		guests: 'count',
		staff: 'count',
		start: 'plain',
		noise: 'decibel',
		score: 'count',
		cost: 'money',
		'qualification.load': 'count',
		'outcome.total': 'money',
	},
	values: {
		rating: 'money',
		rentRate: 'money',
		feeRate: 'money',
		depositRate: 'money',
	},
	formats: {
		money: { style: 'currency', currency: 'USD' },
		decibel: { maximumFractionDigits: 1 },
	},
	scopes: { rent: 'room rent' },
}

/**
 * Qualifies every depth 1, 2, and 3 expression tree against every assignment of its three fields,
 * each tree as a one-ruling qualification whose ruling is a restriction on the tree's one rule.
 *
 * @returns Per tree and subject, the tree, the subject, and the qualifier's own finding
 */
export function collectFamilyFindings(): ReadonlyArray<{
	readonly tree: LogicalDefinition
	readonly subject: Subject
	readonly finding: Finding
}> {
	const qualifier = createQualifier()
	const subjects = collectTreeSubjects()
	const findings = buildExpressionTrees().flatMap((tree) => {
		const definition = createQualificationDefinition(`qualify-${tree.id}`, tree.name, [tree], {
			rulings: [createRuling('ruling', tree.id, 'rule', 'restriction')],
		})
		return subjects.flatMap((subject) => {
			const [finding] = qualifier.qualify(subject, definition).findings
			return finding === undefined ? [] : [{ tree, subject, finding }]
		})
	})
	qualifier.destroy()
	return findings
}

/** Names the members a result's text sits under that `FAMILY_WORDED` replaces as one string. */
export const FAMILY_WORDED_KEYS: readonly string[] = ['label', 'expression']

/** Names the members a result's list of text sits under that `FAMILY_WORDED` replaces entry by entry. */
export const FAMILY_WORDED_LISTS: readonly string[] = ['trace', 'errors']

/** Names the members of a worksheet step that `FAMILY_WORDED` replaces, the rest being data. */
export const FAMILY_WORDED_STEPS: readonly string[] = ['name', 'expression']

/** Names the members that hold the subject's own values, which `FAMILY_WORDED` leaves alone. */
export const FAMILY_KEPT_KEYS: readonly string[] = ['actual', 'expected']

/**
 * Replaces the worded members of a result's member with other text of the same shape and count.
 *
 * @param key - The member's name
 * @param member - The member's value
 * @param path - The member's path, which the replacement text names
 * @returns The member, reworded where it is worded
 */
export function buildFamilyMember(key: string, member: unknown, path: string): unknown {
	if (FAMILY_KEPT_KEYS.includes(key)) return member
	if (FAMILY_WORDED_KEYS.includes(key) && typeof member === 'string') return `reworded ${path}`
	if (FAMILY_WORDED_LISTS.includes(key) && isArray(member)) {
		return member.map((entry, index) =>
			typeof entry === 'string' ? `reworded ${path}.${String(index)}` : entry,
		)
	}
	if (key === 'steps' && isArray(member)) {
		return member.map((step, index) =>
			isRecord(step)
				? Object.fromEntries(
						Object.entries(step).map(([name, value]) => [
							name,
							FAMILY_WORDED_STEPS.includes(name) && typeof value === 'string'
								? `reworded ${path}.${String(index)}.${name}`
								: value,
						]),
					)
				: step,
		)
	}
	return buildFamilyWording(member, path)
}

/**
 * Replaces every worded member of a result, at any depth, with other text of the same shape and
 * count: each `label` and `expression`, each text of a `trace` and an `errors` list, and the
 * `name` and `expression` of each worksheet step. A subject's own `actual` and `expected` values
 * stay.
 *
 * @param value - The result, or a part of one
 * @param path - Where the value sits, which the replacement text names
 * @returns A fresh value of the same shape, with the worded members reworded
 */
export function buildFamilyWording(value: unknown, path = ''): unknown {
	if (isArray(value)) {
		return value.map((entry, index) => buildFamilyWording(entry, `${path}.${String(index)}`))
	}
	if (!isRecord(value)) return value
	return Object.fromEntries(
		Object.entries(value).map(([key, member]) => [
			key,
			buildFamilyMember(key, member, `${path}.${key}`),
		]),
	)
}

/**
 * Rewords a qualification result.
 *
 * @param result - The result to reword
 * @returns A fresh result with every worded member replaced
 */
export function buildFamilyWordedQualification(result: QualificationResult): QualificationResult {
	const worded = buildFamilyWording(result)
	if (!isQualificationResult(worded)) throw new Error('Expected a reworded qualification result')
	return worded
}

/**
 * Rewords a rating result.
 *
 * @param result - The result to reword
 * @returns A fresh result with every worded member replaced
 */
export function buildFamilyWordedRating(result: RatingResult): RatingResult {
	const worded = buildFamilyWording(result)
	if (!isRatingResult(worded)) throw new Error('Expected a reworded rating result')
	return worded
}

/**
 * Rewords a program result.
 *
 * @param result - The result to reword
 * @returns A fresh result with every worded member replaced
 */
export function buildFamilyWordedProgram(result: ProgramResult): ProgramResult {
	const worded = buildFamilyWording(result)
	if (!isProgramResult(worded)) throw new Error('Expected a reworded program result')
	return worded
}

/** Holds the reworders of the three results: each replaces every worded member and no other. */
export const FAMILY_WORDED = {
	qualification: buildFamilyWordedQualification,
	rating: buildFamilyWordedRating,
	program: buildFamilyWordedProgram,
}

/**
 * Collects every leaf of a value with the path that reaches it, so two values can be compared
 * leaf by leaf.
 *
 * @param value - The value to read
 * @param path - Where the value sits
 * @returns One pair per scalar leaf, in order
 */
export function collectFamilyLeaves(
	value: unknown,
	path = '',
): ReadonlyArray<readonly [string, unknown]> {
	if (isArray(value)) {
		return value.flatMap((entry, index) => collectFamilyLeaves(entry, `${path}.${String(index)}`))
	}
	if (isRecord(value)) {
		return Object.entries(value).flatMap(([key, member]) =>
			collectFamilyLeaves(member, `${path}.${key}`),
		)
	}
	return [[path, value]]
}

/** Matches the path of a leaf that `FAMILY_WORDED` replaces: a label, an expression, a trace or errors entry, or a step's name or expression. */
export const FAMILY_WORDED_PATH =
	/\.(label|expression)$|\.(trace|errors)\.\d+$|\.steps\.\d+\.(name|expression)$/

/**
 * Lists the distinct texts of a list, sorted.
 *
 * @param values - The texts to read
 * @returns Each text once, in sorted order
 */
export function collectFamilyUnique(values: readonly string[]): readonly string[] {
	return [...new Set(values)].toSorted()
}

/**
 * Lists the effects of the rulings that carry a scope, or of those that carry none, sorted.
 *
 * @param rulings - The rulings to read
 * @param scoped - If `true`, the rulings with a scope; if `false`, those without
 * @returns One effect per ruling, repeats included
 */
export function collectFamilyEffects(
	rulings: ReadonlyArray<{ readonly scope?: string; readonly effect: string }>,
	scoped: boolean,
): readonly string[] {
	return rulings
		.filter((ruling) => (ruling.scope !== undefined) === scoped)
		.map((ruling) => ruling.effect)
		.toSorted()
}

/**
 * Collects the connective of every compound in the premises of one rule, found by id.
 *
 * @param passes - The logical passes to search
 * @param id - The rule's id
 * @returns The connectives outermost first, or none when no pass holds the rule
 */
export function collectFamilyConnectives(
	passes: readonly LogicalDefinition[],
	id: string,
): readonly LogicalOperator[] {
	return passes.flatMap((pass) =>
		pass.rules
			.filter((rule) => rule.id === id)
			.flatMap((rule) => rule.premises.flatMap(collectConnectives)),
	)
}

/**
 * Collects the display path of every field a quantitative definition reads: each factor's source
 * and each of its checks. A logical definition reads through its atoms, so it yields none here.
 *
 * @param definition - The definition to read
 * @returns One display path per read, in order
 */
export function collectFamilySources(
	definition: QuantitativeDefinition | LogicalDefinition,
): readonly string[] {
	return definition.reasoning === 'quantitative'
		? definition.groups
				.flatMap((group) => group.factors)
				.flatMap((factor) => [
					...(factor.source.origin === 'static' ? [] : [formatField(factor.source.field)]),
					...(factor.checks ?? []).map((check) => formatField(check.field)),
				])
		: []
}

// ── Continuing and building on earlier work ───────────────────────────────────

/**
 * Freezes a value and everything it reaches, so a write anywhere under it throws.
 *
 * @param value - The value to freeze
 * @returns The same value, frozen
 */
export function freezeFixture<T>(value: T): T {
	if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value
	Object.freeze(value)
	for (const member of Object.values(value)) freezeFixture(member)
	return value
}

/** Lists the turns a continuation is read over: each corpus recipe stated, left open, and unmatched. */
export const CONTINUED_TURNS: readonly string[] = Object.freeze([
	'calculate insurance age 25',
	'calculate insurance accidents 2',
	'calculate insurance 25',
	'calculate insurance',
	'check eligibility score 720',
	'check eligibility',
	'calculate loan amount 5000',
	'calculate loan',
	'compute statistics value 10 and value 20',
	'compute statistics',
	'calculate arithmetic value 42',
	'calculate arithmetic',
	'hello there',
])

/** Holds the values each continued turn gives the turns after it; a turn named in none gives none. */
export const CONTINUED_VALUES: Readonly<Record<string, readonly unknown[]>> = {
	'calculate insurance age 25': [25],
	'calculate insurance accidents 2': [2],
	'check eligibility score 720': [720],
	'calculate loan amount 5000': [5000],
	'compute statistics value 10 and value 20': [[10, 20]],
	'calculate arithmetic value 42': [42],
}

/** Lists the turns a history holds beside a continuation, whose values it must not carry. */
export const DISTRACTING_TURNS: readonly string[] = Object.freeze([
	'calculate insurance age 99 and accidents 7',
	'check eligibility score 11 and age 12',
	'calculate loan amount 1',
	'compute statistics value 7',
	'calculate arithmetic value 8',
])

/** Holds a recipe whose shape defaults a nested field that no mapping names, and computes another. */
export function buildTermsRecipe(): Recipe {
	return buildInsuranceRecipe({
		mappings: [{ entity: 'age', aliases: [], field: 'age' }],
		computations: [
			{
				field: ['terms', 'total'],
				expression: createOperation('multiply', createVariable('terms.months'), createConstant(2)),
			},
		],
		shape: objectShape({
			age: numberShape(),
			terms: optionalShape(
				objectShape({
					months: optionalShape(numberShape(), { default: 12 }),
					total: optionalShape(numberShape()),
				}),
				{ default: { months: 12 } },
			),
		}),
	})
}

/** Builds an entity a text states, as an exact anchor assigns it. */
export function buildStatedEntity(name: string, value: unknown): Entity {
	return { name, value, provenance: { category: 'extracted', detail: 'keyword' }, confidence: 1 }
}

/** Builds an entity an amendment supplies, as the amended interpretation holds it. */
export function buildProposedEntity(name: string, value: unknown, field?: FieldPath): Entity {
	return {
		name,
		...(field === undefined ? {} : { field }),
		value,
		provenance: { category: 'proposed' },
		confidence: 1,
	}
}

/** Builds an entity a turn carried from the one before it. */
export function buildCarriedEntity(name: string, value: unknown): Entity {
	return { name, value, provenance: { category: 'carried' }, confidence: 0.7 }
}

/** Builds an entity a turn carried that an amendment of an earlier turn supplied. */
export function buildSuppliedEntity(name: string, value: unknown, field?: FieldPath): Entity {
	return {
		name,
		...(field === undefined ? {} : { field }),
		value,
		provenance: { category: 'carried', detail: 'proposed' },
		confidence: 0.7,
	}
}

/** Holds the amendment the supplied turns continue from: a mapped, a defaulted, and a computed name. */
export const SUPPLIED_AMENDMENT: Amendment = {
	entities: [
		{ name: 'accidents', value: 3 },
		{ name: 'deductible', value: 1200 },
		{ name: 'monthly', value: 55 },
	],
}

/**
 * Lists the turns continued from {@link SUPPLIED_AMENDMENT}, each with the entities it and the turn
 * after it carry, its questions with their candidates, and the subject of the turn after it.
 */
export const SUPPLIED_TURNS: ReadonlyArray<{
	readonly name: string
	readonly text: string
	readonly carried: readonly Entity[]
	readonly open: ReadonlyArray<readonly [field: FieldPath, candidates: readonly string[]]>
	readonly again: readonly Entity[]
	readonly accidents: number
}> = [
	{
		name: 'restates nothing',
		text: 'calculate insurance',
		carried: [
			buildCarriedEntity('age', 25),
			buildSuppliedEntity('accidents', 3),
			buildSuppliedEntity('deductible', 1200, ['deductible']),
			buildSuppliedEntity('monthly', 55, 'monthly'),
		],
		open: [],
		again: [
			buildCarriedEntity('age', 25),
			buildSuppliedEntity('accidents', 3),
			buildSuppliedEntity('deductible', 1200, ['deductible']),
			buildSuppliedEntity('monthly', 55, 'monthly'),
		],
		accidents: 3,
	},
	{
		name: 'restates a supplied value',
		text: 'calculate insurance accidents 1',
		carried: [
			buildCarriedEntity('age', 25),
			buildSuppliedEntity('deductible', 1200, ['deductible']),
			buildSuppliedEntity('monthly', 55, 'monthly'),
		],
		open: [],
		again: [
			buildCarriedEntity('age', 25),
			buildCarriedEntity('accidents', 1),
			buildSuppliedEntity('deductible', 1200, ['deductible']),
			buildSuppliedEntity('monthly', 55, 'monthly'),
		],
		accidents: 1,
	},
	{
		name: 'holds an unclaimed number',
		text: 'calculate insurance 7',
		carried: [
			buildCarriedEntity('age', 25),
			buildSuppliedEntity('accidents', 3),
			buildSuppliedEntity('deductible', 1200, ['deductible']),
			buildSuppliedEntity('monthly', 55, 'monthly'),
		],
		open: [
			['age', ['7']],
			['accidents', ['7']],
			['coverage', ['7']],
		],
		again: [
			buildCarriedEntity('age', 25),
			buildSuppliedEntity('accidents', 3),
			buildSuppliedEntity('deductible', 1200, ['deductible']),
			buildSuppliedEntity('monthly', 55, 'monthly'),
		],
		accidents: 3,
	},
]

/**
 * Lists the amendments, each with what clarify must be handed: the entities stated, the entities
 * left to carry, and the numbers nobody claims, all written out by hand.
 */
export const AMENDED_TURNS: ReadonlyArray<{
	readonly name: string
	readonly recipe: () => Recipe
	readonly earlier?: string
	readonly text: string
	readonly amendment: Amendment
	readonly stated: readonly Entity[]
	readonly carried: readonly Entity[]
	readonly unclaimed: ReadonlyArray<number | string>
	readonly open: readonly FieldPath[]
}> = [
	{
		name: 'nothing',
		recipe: buildInsuranceRecipe,
		text: 'calculate insurance age 25',
		amendment: {},
		stated: [buildStatedEntity('age', 25)],
		carried: [],
		unclaimed: [],
		open: [],
	},
	{
		name: 'a value replaced, whose number stays claimed',
		recipe: buildInsuranceRecipe,
		text: 'calculate insurance age 25 and accidents 2',
		amendment: { entities: [{ name: 'accidents', value: 3 }] },
		stated: [buildStatedEntity('age', 25), buildProposedEntity('accidents', 3)],
		carried: [],
		unclaimed: [],
		open: [],
	},
	{
		name: 'a value confirmed',
		recipe: buildInsuranceRecipe,
		text: 'calculate insurance age 25',
		amendment: { entities: [{ name: 'age', value: 25 }] },
		stated: [buildProposedEntity('age', 25)],
		carried: [],
		unclaimed: [],
		open: [],
	},
	{
		name: 'a defaulted value added',
		recipe: buildInsuranceRecipe,
		text: 'calculate insurance age 25',
		amendment: { entities: [{ name: 'coverage', value: 'gold' }] },
		stated: [buildStatedEntity('age', 25), buildProposedEntity('coverage', 'gold')],
		carried: [],
		unclaimed: [],
		open: [],
	},
	{
		name: 'a value withdrawn, whose number is free again',
		recipe: buildInsuranceRecipe,
		text: 'calculate insurance age 25 and accidents 2',
		amendment: { removed: ['accidents'] },
		stated: [buildStatedEntity('age', 25)],
		carried: [],
		unclaimed: [2],
		open: ['accidents', 'coverage'],
	},
	{
		name: 'a value withdrawn, whose number the reader sets aside as a person’s age',
		recipe: buildInsuranceRecipe,
		text: 'calculate insurance age 25',
		amendment: { removed: ['age'] },
		stated: [],
		carried: [],
		unclaimed: [],
		open: ['age'],
	},
	{
		name: 'a value withdrawn beside one that claims an equal number',
		recipe: buildInsuranceRecipe,
		text: 'calculate insurance age 25 and accidents 3 and coverage 3',
		amendment: { entities: [{ name: 'accidents', value: 3 }], removed: ['coverage'] },
		stated: [buildStatedEntity('age', 25), buildProposedEntity('accidents', 3)],
		carried: [],
		unclaimed: [3],
		open: ['coverage'],
	},
	{
		name: 'an open question answered by a number no anchor claimed',
		recipe: buildInsuranceRecipe,
		text: 'calculate insurance 25',
		amendment: { entities: [{ name: 'age', value: 25 }] },
		stated: [buildProposedEntity('age', 25)],
		carried: [],
		unclaimed: [],
		open: [],
	},
	{
		name: 'an open question answered by another number',
		recipe: buildInsuranceRecipe,
		text: 'calculate insurance 25',
		amendment: { entities: [{ name: 'age', value: 30 }] },
		stated: [buildProposedEntity('age', 30)],
		carried: [],
		unclaimed: [25],
		open: ['accidents', 'coverage'],
	},
	{
		name: 'a default withdrawn, which the door fills again',
		recipe: buildInsuranceRecipe,
		text: 'calculate insurance age 25',
		amendment: { removed: ['coverage'] },
		stated: [buildStatedEntity('age', 25)],
		carried: [],
		unclaimed: [],
		open: [],
	},
	{
		name: 'a computed value replaced on the field the recipe computes',
		recipe: buildTermsRecipe,
		text: 'calculate insurance age 25',
		amendment: { entities: [{ name: 'terms.total', value: 5 }] },
		stated: [
			buildStatedEntity('age', 25),
			buildProposedEntity('terms.total', 5, ['terms', 'total']),
		],
		carried: [],
		unclaimed: [],
		open: [],
	},
	{
		name: 'a value the shape refuses',
		recipe: buildInsuranceRecipe,
		text: 'calculate insurance age 25',
		amendment: { entities: [{ name: 'age', value: ['25'] }] },
		stated: [buildProposedEntity('age', ['25'])],
		carried: [],
		unclaimed: [],
		open: ['age'],
	},
	{
		name: 'a value under a name the recipe gives nothing',
		recipe: buildInsuranceRecipe,
		text: 'calculate insurance age 25',
		amendment: { entities: [{ name: 'colour', value: 'red' }] },
		stated: [buildStatedEntity('age', 25), buildProposedEntity('colour', 'red')],
		carried: [],
		unclaimed: [],
		open: [['colour']],
	},
	{
		name: 'a value beside one the turn carried',
		recipe: buildInsuranceRecipe,
		earlier: 'calculate insurance age 25',
		text: 'calculate insurance',
		amendment: { entities: [{ name: 'coverage', value: 'gold' }] },
		stated: [buildProposedEntity('coverage', 'gold')],
		carried: [buildCarriedEntity('age', 25)],
		unclaimed: [],
		open: [],
	},
	{
		name: 'a carried value withdrawn',
		recipe: buildInsuranceRecipe,
		earlier: 'calculate insurance age 25',
		text: 'calculate insurance',
		amendment: { removed: ['age'] },
		stated: [],
		carried: [],
		unclaimed: [],
		open: ['age'],
	},
	{
		name: 'a carried value replaced',
		recipe: buildInsuranceRecipe,
		earlier: 'calculate insurance age 25',
		text: 'calculate insurance accidents 2',
		amendment: { entities: [{ name: 'age', value: 31 }] },
		stated: [buildStatedEntity('accidents', 2), buildProposedEntity('age', 31)],
		carried: [],
		unclaimed: [],
		open: [],
	},
	{
		name: 'a collected array replaced',
		recipe: buildStatisticsRecipe,
		text: 'compute statistics value 10 and value 20',
		amendment: { entities: [{ name: 'value', value: [10, 30] }] },
		stated: [buildProposedEntity('value', [10, 30])],
		carried: [],
		unclaimed: [],
		open: [],
	},
]

/**
 * Composes clarify, format, and generate by hand over what an amendment states, into the
 * interpretation those stages give.
 *
 * @param source - The interpretation amended
 * @param recipe - The recipe it was read against
 * @param stated - The entities stated
 * @param carried - The entities left to carry
 * @param unclaimed - The numbers nobody claims
 * @returns The composed interpretation
 */
export function composeInterpretation(
	source: Interpretation,
	recipe: Recipe,
	stated: readonly Entity[],
	carried: readonly Entity[],
	unclaimed: ReadonlyArray<number | string>,
): Interpretation {
	const { text, normalized, intent, version } = source
	const context = seedInterpretContext([{ ...source, entities: carried }])
	const clarified = new surface.Clarifier().clarify(stated, recipe, context, intent, unclaimed)
	const { entities, ambiguities, repairs, defaulted } = clarified
	const formatted = new surface.Formatter().format(intent, recipe, entities, ambiguities)
	const generated =
		ambiguities.length > 0 ? undefined : new surface.Generator().generate(entities, recipe)
	return {
		...(source.refusals === undefined ? {} : { refusals: source.refusals }),
		text,
		normalized,
		intent,
		recipe: recipe.id,
		...(version === undefined ? {} : { version }),
		entities,
		...(generated === undefined ? {} : { subject: generated.subject }),
		definition: recipe.definition,
		mappings: generated?.mappings ?? [],
		ambiguities,
		repairs,
		defaulted,
		prompt: formatted.prompt,
		stages: [
			...source.stages.slice(0, 2),
			{ stage: 'clarify', input: stated, output: clarified, failed: false },
			{
				stage: 'format',
				input: { intent, entities, ambiguities },
				output: formatted,
				failed: false,
			},
			{
				stage: 'generate',
				input: generated === undefined ? undefined : entities,
				output: generated,
				failed: false,
			},
		],
		failures: [],
		confidence: generated?.confidence ?? 0,
		digest: surface.digestValue({
			text,
			recipeId: recipe.id,
			version,
			subject: generated?.subject,
			definition: recipe.definition,
		}),
	}
}

/**
 * Builds a chain of rules, each concluding what the next one reads, so an account of it nests one
 * level for each rule.
 *
 * @param length - How many rules the chain holds
 * @returns A fresh logical definition
 */
export function buildRuleChain(length: number): LogicalDefinition {
	return createLogicalDefinition(
		'chain',
		'Chain',
		Array.from({ length }, (_, index) =>
			createRule(
				`r${String(index)}`,
				[createAtom(index === 0 ? 'seed' : `k${String(index - 1)}`, 'equals', true)],
				createAtom(`k${String(index)}`, 'equals', true),
			),
		),
		{ depth: length * 2 },
	)
}

/**
 * Measures how many levels of lines an account's lines nest.
 *
 * @param lines - The lines of the first level
 * @returns The number of levels, none for no line
 */
export function measureLines(lines: readonly AccountLine[]): number {
	return lines.length === 0 ? 0 : 1 + Math.max(...lines.map((line) => measureLines(line.lines)))
}

/** Lists the values a check or a subject can hold that plain JSON holds otherwise, or not at all. */
export const EVIDENCE_VALUES: readonly unknown[] = [
	Number.NaN,
	Number.POSITIVE_INFINITY,
	undefined,
	null,
	1n,
	new Date(0),
	new Map([['a', 1]]),
	[undefined, Number.NaN, 'a'],
	{ kept: 1, dropped: undefined, nested: { count: Number.NEGATIVE_INFINITY } },
]

/** Collects every fixture's account: each result's and each guide, in the shipped words and its own. */
export function collectFixtureAccounts(): readonly Account[] {
	const engine = createReason({
		reasoners: [
			createLogicalReasoner(),
			createQuantitativeReasoner(),
			createSymbolicReasoner(),
			createInferentialReasoner(),
		],
	})
	const runs: ReadonlyArray<readonly [Definition, readonly Subject[]]> = [
		[buildWorkshopRules(), Object.values(WORKSHOP_SUBJECTS).map((row) => row.subject)],
		[buildWorkshopGates(), Object.values(WORKSHOP_GATES).map((row) => row.subject)],
		[buildWorkshopScore(), Object.values(WORKSHOP_SCORES).map((row) => row.subject)],
		[buildWorkshopFees(), Object.values(WORKSHOP_FEES).map((row) => row.subject)],
		[buildWorkshopQuote(), Object.values(WORKSHOP_QUOTES).map((row) => row.subject)],
		[buildWorkshopArea(), Object.values(WORKSHOP_AREA).map((row) => row.subject)],
		[buildWorkshopCharge(), Object.values(WORKSHOP_CHARGES).map((row) => row.subject)],
		[buildWorkshopFacts(), [{}]],
		[buildWorkshopKin(), [{ member: 'gold' }]],
		[buildWorkshopKin('backward'), [{ member: 'gold' }]],
		[buildRuleChain(40), [{ seed: true }, {}]],
		...buildBandTables()
			.slice(0, 12)
			.map((table) => [table, [{ n: 1 }, {}]] as const),
		...buildExpressionTrees()
			.slice(0, 12)
			.map((tree) => [tree, collectTreeSubjects().slice(0, 2)] as const),
	]
	const qualification = buildFamilyQualification()
	const rating = buildFamilyRating()
	const program = buildFamilyProgram()
	const qualifier = createQualifier()
	const rater = createRater()
	const programmer = createProgram(program)
	const accounts = [
		new surface.Narrator(),
		new surface.Narrator({ glossary: WORKSHOP_GLOSSARY }),
		new surface.Narrator({ glossary: FAMILY_GLOSSARY }),
	].flatMap((narrator) => [
		...runs.flatMap(([definition, subjects]) => [
			narrator.describe(definition),
			...subjects.map((subject) =>
				narrator.narrate(definition, engine.reason(subject, definition)),
			),
		]),
		...[qualification, rating, program].map((definition) => narrator.describe(definition)),
		...Object.values(FAMILY_SUBJECTS).map(({ subject }) =>
			narrator.narrate(qualification, qualifier.qualify(subject, qualification)),
		),
		...Object.values(FAMILY_RATINGS).map(({ subject }) =>
			narrator.narrate(rating, rater.rate(rating, subject)),
		),
		...Object.values(FAMILY_PROGRAMS).map(({ subject }) =>
			narrator.narrate(program, programmer.execute(subject)),
		),
	])
	qualifier.destroy()
	rater.destroy()
	programmer.destroy()
	return accounts
}

/** Collects an account for each {@link EVIDENCE_VALUES} value, held by the check and by the subject. */
export function collectEvidenceAccounts(): readonly Account[] {
	const reasoner = createLogicalReasoner()
	const narrator = new surface.Narrator()
	return EVIDENCE_VALUES.flatMap((value) => {
		const definition = createLogicalDefinition('evidence', 'Evidence', [
			createRule('r', [createAtom('n', 'equals', value)], createAtom('x', 'equals', true)),
		])
		return [
			narrator.describe(definition),
			...[{ n: value }, { n: 3 }].map((subject) =>
				narrator.narrate(definition, reasoner.reason(subject, definition)),
			),
		]
	})
}

/** Lists the words of a glossary merge: each table's word on either side alone, and on both. */
export const MERGED_GLOSSARY: {
	readonly base: Glossary
	readonly incoming: Glossary
	readonly merged: Glossary
} = {
	base: {
		labels: { cost: 'Cost', age: 'Age' },
		units: { cost: 'dollar', age: 'year' },
		values: { quote: 'dollar', area: 'foot' },
		formats: {
			dollar: { style: 'currency', currency: 'USD' },
			foot: { maximumFractionDigits: 1 },
		},
		predicates: { parent: '{{1}} is a parent of {{2}}', ready: '{{1}} is ready' },
		scopes: { rent: 'Rent', food: 'Food' },
		phrases: { tiers: { gold: 'Gold', base: 'Base' }, moods: { calm: 'Calm' } },
		templates: { intro: 'Hello {{name}}', close: 'Goodbye' },
	},
	incoming: {
		labels: { cost: 'Price', guests: 'Guests' },
		units: { cost: 'euro', guests: 'person' },
		values: { quote: 'euro', charge: 'euro' },
		formats: { dollar: { minimumFractionDigits: 2 }, euro: { style: 'currency', currency: 'EUR' } },
		predicates: { parent: '{{1}} raised {{2}}', open: '{{1}} is open' },
		scopes: { rent: 'Hire', drink: 'Drink' },
		phrases: { tiers: { gold: 'Top', silver: 'Silver' }, sizes: { small: 'Small' } },
		templates: { intro: 'Welcome {{name}}', thanks: 'Thank you' },
	},
	merged: {
		labels: { cost: 'Price', age: 'Age', guests: 'Guests' },
		units: { cost: 'euro', age: 'year', guests: 'person' },
		values: { quote: 'euro', area: 'foot', charge: 'euro' },
		formats: {
			dollar: { minimumFractionDigits: 2 },
			foot: { maximumFractionDigits: 1 },
			euro: { style: 'currency', currency: 'EUR' },
		},
		predicates: {
			parent: '{{1}} raised {{2}}',
			ready: '{{1}} is ready',
			open: '{{1}} is open',
		},
		scopes: { rent: 'Hire', food: 'Food', drink: 'Drink' },
		phrases: {
			tiers: { gold: 'Top', base: 'Base', silver: 'Silver' },
			moods: { calm: 'Calm' },
			sizes: { small: 'Small' },
		},
		templates: { intro: 'Welcome {{name}}', close: 'Goodbye', thanks: 'Thank you' },
	},
}
