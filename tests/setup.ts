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

import type { ContractShape } from '@orkestrel/contract'
import type {
	CheckState,
	Expression,
	InferentialDefinition,
	LogicalDefinition,
	LogicalOperator,
	QuantitativeDefinition,
	ReasonResult,
	Subject,
	SymbolicDefinition,
	SymbolicResult,
} from '@orkestrel/reason'
import type {
	ExtractorInterface,
	ExtractResult,
	Interpretation,
	RecordStamp,
	Recipe,
} from '@src/core'
import {
	arrayShape,
	isArray,
	isRecord,
	numberShape,
	objectShape,
	optionalShape,
	seededRandom,
	stringShape,
} from '@orkestrel/contract'
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
	createLogicalDefinition,
	createLookupFactor,
	createOperation,
	createQuantitativeDefinition,
	createRule,
	createStaticFactor,
	createSymbolicDefinition,
	createVariable,
	extractAtoms,
	formatField,
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
		].map((row) => ({ ...row, direction: 'is implies guard', project: undefined, negative: {} })),
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
 * Holds the domain words the workshop definitions need, keyed by `formatField`, so the array path
 * `['terms', 'excess']` is `terms.excess`. The `member` label keeps its odd casing on purpose.
 */
export const WORKSHOP_GLOSSARY: {
	readonly labels: Readonly<Record<string, string>>
	readonly units: Readonly<Record<string, string>>
	readonly values: Readonly<Record<string, string>>
	readonly formats: Readonly<Record<string, Intl.NumberFormatOptions>>
} = {
	labels: {
		activity: 'activity',
		'terms.excess': 'places over capacity',
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
	},
	units: {
		cost: 'money',
		'terms.excess': 'money',
		noise: 'decibel',
		start: 'plain',
		score: 'count',
	},
	values: { score: 'count' },
	formats: {
		money: { style: 'currency', currency: 'USD' },
		decibel: { maximumFractionDigits: 1 },
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
