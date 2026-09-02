// Base test setup — environment-agnostic helpers loaded first by every
// Vitest project (`setupFiles[0]`). Keep this file free of `node:*` and of
// `document` / `window` / Vue: DOM/Vue helpers live in `setupBrowser.ts`.
//
// Scoped to the `interprets` corpus this workspace ships today (AGENTS
// §16.1): the interprets fixture builders and the reason-result narrower the
// suites actually import. Generic test infrastructure — recorders, recorder
// maps, error capture, unchecked invocation — comes from `@orkestrel/test`,
// which every suite imports directly. A dep-originating symbol
// (`@orkestrel/reason` / `@orkestrel/contract`) is imported from its OWN
// package here, never from `@src/core` — the barrel re-exports only local
// `interprets` modules (AGENTS §6).

import type { ReasonResult, SymbolicResult } from '@orkestrel/reason'
import type { Interpretation, Template } from '@src/core'
import { isArray } from '@orkestrel/contract'
import {
	createConstant,
	createFactorGroup,
	createFieldFactor,
	createLogicalDefinition,
	createOperation,
	createQuantitativeDefinition,
	createStaticFactor,
	createVariable,
} from '@orkestrel/reason'
import { InterpretContext } from '@src/core'
import { afterEach, vi } from 'vitest'

afterEach(() => {
	vi.restoreAllMocks()
})

// ── Reason-result narrowing (environment-agnostic) ────────────────────────────

/**
 * Narrow a `reason()` return to a `SymbolicResult` — throws on a batch array
 * or a result of another reasoning, so assertions read the narrowed result
 * with no casts (AGENTS §14).
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
 * The curated JavaScript numeric edge values the numeric-quirk tests probe — signed
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
 * The curated adversarial / unicode object keys the field-path, subject-key, id, and
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

/**
 * Build a small, neutral `Template` — a single `value` entity mapping onto a
 * one-factor quantitative definition — the shared fixture the `interprets`
 * validator, helper, stage, and orchestrator tests seed a registry with
 * instead of hand-writing the same literal repeatedly (AGENTS §16.1).
 *
 * @param overrides - Fields merged over the neutral defaults
 * @returns The built template
 */
export function buildInterpretTemplate(overrides?: Partial<Template>): Template {
	return {
		id: 'template-1',
		name: 'Arithmetic',
		domain: 'arithmetic',
		intents: ['calculate'],
		mappings: [{ entity: 'value', aliases: ['amount', 'number'], field: 'value' }],
		defaults: [],
		computations: [],
		definition: createQuantitativeDefinition('template-1', 'Arithmetic', [
			createFactorGroup('total', 'sum', [createFieldFactor('value', 'value')]),
		]),
		...overrides,
	}
}

/**
 * The neutral caller ACTION vocabulary the interprets integration corpus wires
 * into its `Extractor` (`token → action-name`). The redesign has no built-in
 * worldview (divergence ledger 6) — every domain/action word a template answers
 * to must be supplied here, not baked into core.
 */
export const INTERPRET_ACTIONS: Readonly<Record<string, string>> = Object.freeze({
	calculate: 'calculate',
	check: 'check',
	validate: 'validate',
	compute: 'compute',
})

/**
 * The neutral caller DOMAIN vocabulary the interprets integration corpus wires
 * into its `Extractor` (`domain-name → keyword-list`). Per divergence ledger 18
 * a template's own `domain` no longer auto-classifies — a caller MUST list each
 * template's domain keywords here for domain classification to fire.
 */
export const INTERPRET_DOMAINS: Readonly<Record<string, readonly string[]>> = Object.freeze({
	arithmetic: ['arithmetic'],
	insurance: ['insurance'],
	eligibility: ['eligibility', 'qualifies', 'qualify', 'eligible'],
	loan: ['loan'],
	statistics: ['statistics', 'stats'],
})

/**
 * Build the auto-insurance corpus template — the redesign's terrain-vocabulary
 * analog of scsr's `DEFAULT_TEMPLATES` insurance fixture: a required `age`
 * mapping, `accidents`/`coverage`/`deductible` defaults, and a declarative
 * `monthly = deductible / 12` computation (`createOperation('divide', …)` — the
 * closure-free `ComputedField` replacing scsr's `InferenceRule.compute`).
 *
 * @param overrides - Fields merged over the corpus defaults
 * @returns The built template
 */
export function buildInsuranceTemplate(overrides?: Partial<Template>): Template {
	return {
		id: 'insurance-auto',
		name: 'Auto Insurance',
		domain: 'insurance',
		intents: ['calculate'],
		mappings: [
			{ entity: 'age', aliases: ['years old', 'year old', 'years'], field: 'age', required: true },
			{ entity: 'accidents', aliases: ['accident', 'incidents'], field: 'accidents' },
			{ entity: 'coverage', aliases: ['plan', 'policy'], field: 'coverage' },
		],
		defaults: [
			{ field: 'accidents', value: 0 },
			{ field: 'coverage', value: 'standard' },
			{ field: 'deductible', value: 500 },
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
		...overrides,
	}
}

/**
 * Build the eligibility corpus template — two optional mappings (`age`,
 * `score`) whose aliases exercise fuzzy keyword-proximity assignment against a
 * complex sentence, over an (empty-rule) logical definition.
 *
 * @param overrides - Fields merged over the corpus defaults
 * @returns The built template
 */
export function buildEligibilityTemplate(overrides?: Partial<Template>): Template {
	return {
		id: 'eligibility',
		name: 'Eligibility',
		domain: 'eligibility',
		intents: ['check', 'validate'],
		mappings: [
			{ entity: 'age', aliases: ['years old', 'year old', 'years'], field: 'age' },
			{ entity: 'score', aliases: ['credit score', 'credit', 'rating'], field: 'score' },
		],
		defaults: [],
		computations: [],
		definition: createLogicalDefinition('eligibility', 'Eligibility', []),
		...overrides,
	}
}

/**
 * Build the personal-loan corpus template — a distinct `loan` domain used to
 * pin multi-template best-match selection (the domain/action pair that scores
 * highest wins; no arbitrary `templates[0]` fallback).
 *
 * @param overrides - Fields merged over the corpus defaults
 * @returns The built template
 */
export function buildLoanTemplate(overrides?: Partial<Template>): Template {
	return {
		id: 'loan-personal',
		name: 'Personal Loan',
		domain: 'loan',
		intents: ['calculate'],
		mappings: [{ entity: 'amount', aliases: [], field: 'amount' }],
		defaults: [],
		computations: [],
		definition: createQuantitativeDefinition('loan-personal', 'Personal Loan', [
			createFactorGroup('total', 'sum', [createFieldFactor('amount', 'amount')]),
		]),
		...overrides,
	}
}

/**
 * Build the statistics corpus template — a SINGLE `value` mapping so extraction
 * collects every number: one number lands as a scalar, several as an array the
 * `Generator` keeps as it stands. An aggregate over that array is a
 * `ComputedField` the caller declares through `overrides`.
 *
 * @param overrides - Fields merged over the corpus defaults
 * @returns The built template
 */
export function buildStatisticsTemplate(overrides?: Partial<Template>): Template {
	return {
		id: 'statistics',
		name: 'Statistics',
		domain: 'statistics',
		intents: ['compute'],
		mappings: [{ entity: 'value', aliases: [], field: 'value' }],
		defaults: [],
		computations: [],
		definition: createQuantitativeDefinition('statistics', 'Statistics', [
			createFactorGroup('total', 'sum', [createFieldFactor('value', 'value')]),
		]),
		...overrides,
	}
}

/**
 * Build a minimal, complete-shaped {@link Interpretation} literal — the fixture
 * the `InterpretContext` history/carry-over tests push without running the full
 * orchestrator (AGENTS §16.1). Its single `age` entity and `intent.domain`
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
		prompt: 'Calculate Auto Insurance with age: 25',
		stages: [],
		failures: [],
		complete: true,
		confidence: 1,
		digest: '00000000',
		...overrides,
	}
}

/**
 * Seed a REAL {@link InterpretContext} with `previous` — one `.add(...)` call per
 * given {@link Interpretation}, via the class's own public API — the canonical
 * form the `Clarifier` carry-over scenarios seed a real context with (AGENTS §16:
 * "No mocks — use real implementations"). The real `InterpretContext` flattens
 * `previous`'s entities and exposes them the way the `Clarifier` reads them.
 *
 * @param previous - The prior interpretations to seed, in order
 * @returns A real `InterpretContext`, seeded with `previous`
 */
export function seedInterpretContext(previous: readonly Interpretation[]): InterpretContext {
	const context = new InterpretContext()
	for (const interpretation of previous) context.add(interpretation)
	return context
}
