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
import type { ReasonResult, SymbolicResult } from '@orkestrel/reason'
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
	stringShape,
} from '@orkestrel/contract'
import {
	createConstant,
	createEquation,
	createFactorGroup,
	createFieldFactor,
	createLogicalDefinition,
	createOperation,
	createQuantitativeDefinition,
	createStaticFactor,
	createSymbolicDefinition,
	createVariable,
} from '@orkestrel/reason'
import { Extractor, Interpret, InterpretContext, RecordManager } from '@src/core'

/** Covers the JSON kinds a shape default can hold, including nested cloned objects. */
export const DEFAULT_RENDERINGS = [
	{ value: { nested: { enabled: true } }, rendered: 'object' },
	{ value: [{ enabled: true }], rendered: 'array' },
	{ value: 'plain text', rendered: 'plain text' },
	{ value: 42, rendered: '42' },
	{ value: true, rendered: 'true' },
	{ value: null, rendered: 'null' },
]

/** Pins the reviewer messages whose unit must not disappear from a claimed value. */
export const UNSTATED_UNITS = [
	{ entity: 'years', text: 'years 3 months' },
	{ entity: 'years', text: 'years 3 weeks' },
	{ entity: 'amount', text: 'amount 50000 per month' },
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
		['~3', 3],
		['3+', 3],
		['3 thousand', 3000],
		['three thousand', 3000],
		['3 million', 3000000],
		['three million', 3000000],
		['three hundred and five', 305],
		['three point five', 3.5],
		['six and a half', 6.5],
		['0', 0],
		['3 000 000', undefined],
		["3'000'000", undefined],
		['3 000 000', undefined],
		['3 000 000', undefined],
		['3,00,000', undefined],
		['3.000.000', undefined],
		['1 trillion', undefined],
		['three trillion', undefined],
		['1 quadrillion', undefined],
		['three quadrillion', undefined],
		['1 tn', undefined],
		['3 mln', undefined],
		['30 lakh', undefined],
		['three lakh', undefined],
		['3 crore', undefined],
		['three crore', undefined],
		['3trillion', undefined],
		['3mln', undefined],
		['1 quintillion', undefined],
		['three sextillion', undefined],
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
