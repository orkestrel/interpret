// Base test setup — environment-agnostic helpers loaded first by every
// Vitest project (`setupFiles[0]`). Keep this file free of `node:*` and of
// `document` / `window` / Vue: DOM/Vue helpers live in `setupBrowser.ts`.
//
// Scoped to the `interprets` corpus this workspace ships today (AGENTS
// §16.1): generic recorder/error-capture infrastructure plus the interprets
// fixture builders the suites actually import. A dep-originating symbol
// (`@orkestrel/reason` / `@orkestrel/contract` / `@orkestrel/emitter`) is
// imported from its OWN package here, never from `@src/core` — the barrel
// re-exports only local `interprets` modules (AGENTS §6).

import type { EmitterInterface, EventMap } from '@orkestrel/emitter'
import type { ReasonResult, SymbolicResult } from '@orkestrel/reason'
import type { Interpretation, Template } from '@src/core'
import { isArray } from '@orkestrel/contract'
import {
	constant,
	factorGroup,
	fieldFactor,
	logicalDefinition,
	operation,
	quantitativeDefinition,
	staticFactor,
	variable,
} from '@orkestrel/reason'
import { InterpretContext } from '@src/core'
import { afterEach, vi } from 'vitest'

afterEach(() => {
	vi.restoreAllMocks()
})

// ── Recorders & error capture (generic, environment-agnostic) ─────────────────

// A real callback that records its calls — use instead of a mock when a test
// only needs to count invocations or inspect arguments.
export interface TestRecorderInterface<TArgs extends readonly unknown[]> {
	readonly calls: readonly TArgs[]
	readonly count: number
	readonly handler: (...args: TArgs) => void
	clear(): void
}

export function createRecorder<
	TArgs extends readonly unknown[] = readonly unknown[],
>(): TestRecorderInterface<TArgs> {
	const calls: TArgs[] = []
	return {
		get calls() {
			return calls
		},
		get count() {
			return calls.length
		},
		handler: (...args: TArgs) => {
			calls.push(args)
		},
		clear() {
			calls.length = 0
		},
	}
}

/** A {@link createRecorder} per listed event of an `EmitterInterface`, keyed by event name. */
export type EmitterRecorders<TMap extends EventMap, TName extends keyof TMap> = {
	readonly [K in TName]: TestRecorderInterface<TMap[K]>
}

/**
 * Wire one {@link createRecorder} onto `emitter` for each of the named events — the
 * one generic form of the per-entity `recordXEvents` bundles (AGENTS §16.1). Each
 * recorder subscribes via `emitter.on(name, recorder.handler)` and is returned keyed
 * by its event name, typed with that event's argument tuple — so a test asserts what
 * fired (`events.write.calls`) and with which payload, exactly as the local bundles did.
 *
 * @typeParam TMap - The emitter's {@link EventMap}
 * @typeParam TName - The subset of event names to record (inferred from `events`)
 * @param emitter - The emitter to subscribe the recorders to
 * @param events - The event names to record (each becomes a key of the result)
 * @returns A recorder per name, each subscribed and keyed by event name
 */
export function recordEmitterEvents<TMap extends EventMap, TName extends keyof TMap>(
	emitter: EmitterInterface<TMap>,
	events: readonly TName[],
): EmitterRecorders<TMap, TName> {
	// Accumulate into a `Partial` of the exact mapped shape — every value keeps its
	// precise per-event tuple type (a recorder is invariant in its argument tuple, so a
	// widened record won't hold it), all keys optional until assigned. Each recorder is
	// created against its event's tuple, so `on(name, handler)` is precisely typed as it
	// is wired. The dynamic key list is the untyped edge: once every listed name is
	// present we narrow `Partial` → total through a guard, never an assertion (§14).
	const recorders: Partial<EmitterRecorders<TMap, TName>> = {}
	for (const name of events) {
		const recorder = createRecorder<TMap[typeof name]>()
		emitter.on(name, recorder.handler)
		recorders[name] = recorder
	}
	if (!isTotal(recorders, events)) {
		throw new Error('recordEmitterEvents: a recorder was not wired for every event')
	}
	return recorders
}

/**
 * Narrow an accumulated `Partial<EmitterRecorders>` to its total mapped form once every
 * listed event has a recorder present — the §14 guard standing in for an assertion in
 * {@link recordEmitterEvents} (whose loop assigns one recorder per name, so this holds;
 * the explicit per-name presence check keeps the narrowing a sound guard, not a cast).
 *
 * @typeParam TMap - The emitter's {@link EventMap}
 * @typeParam TName - The subset of event names that must each have a recorder
 * @param recorders - The partially-accumulated recorder map to narrow
 * @param events - The event names that must all be present for the map to be total
 * @returns Whether every listed event has a recorder (narrowing `recorders` to total)
 */
export function isTotal<TMap extends EventMap, TName extends keyof TMap>(
	recorders: Partial<EmitterRecorders<TMap, TName>>,
	events: readonly TName[],
): recorders is EmitterRecorders<TMap, TName> {
	return events.every((name) => recorders[name] !== undefined)
}

/**
 * Run `thunk` and return the value it threw, or `undefined` if it returned normally — the
 * one shared form of the `try { …; return undefined } catch (error) { return error }` IIFE
 * the error-path tests repeat (AGENTS §16.1). Lets a caller assert on the captured fault
 * unconditionally, never inside a conditional `expect`. For a synchronous throw site; an
 * async rejection is asserted with `await expect(…).rejects` instead.
 *
 * @param thunk - The (synchronous) operation to run and capture the throw of
 * @returns The thrown value, or `undefined` when `thunk` did not throw
 */
export function captureError(thunk: () => unknown): unknown {
	try {
		thunk()
		return undefined
	} catch (error) {
		return error
	}
}

/**
 * Invoke a method with deliberately malformed arguments, bypassing its
 * compile-time parameter types — the runtime-validation idiom for feeding a
 * unit under test input its signature forbids (a malformed definition, an
 * unknown operator) WITHOUT `as` (AGENTS §1/§14). `Reflect.apply` carries the
 * raw arguments past the type system while the method's declared RETURN type is
 * kept (pass `T` explicitly for overloaded methods), so assertions on the
 * result stay typed.
 *
 * @typeParam T - The method's return type
 * @param target - The receiver (`this`) to invoke the method on
 * @param method - The method whose parameter types are bypassed
 * @param args - The raw arguments to hand it
 * @returns Whatever the method returns
 */
export function invokeRaw<T>(
	target: unknown,
	method: (...args: never[]) => T,
	args: readonly unknown[],
): T {
	return Reflect.apply(method, target, [...args])
}

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
 * key, a surrogate-pair (astral) key, a combining-sequence key, an NFC-labile key (`Å`
 * ANGSTROM SIGN, which NFC-normalizes to `Å`), and a DOTTED key (`'a.b'`) that proves a
 * single-string `FieldPath` is ONE key, never dot-split. Frozen so a test can share it
 * without risk of mutation.
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
		definition: quantitativeDefinition('template-1', 'Arithmetic', [
			factorGroup('total', 'sum', [fieldFactor('value', 'value')]),
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
 * `monthly = deductible / 12` computation (`operation('divide', …)` — the
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
			{ field: 'monthly', expression: operation('divide', variable('deductible'), constant(12)) },
		],
		definition: quantitativeDefinition('insurance-auto', 'Auto Insurance Rate', [
			factorGroup('age-group', 'product', [staticFactor('age-factor', 1)]),
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
		definition: logicalDefinition('eligibility', 'Eligibility', []),
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
		definition: quantitativeDefinition('loan-personal', 'Personal Loan', [
			factorGroup('total', 'sum', [fieldFactor('amount', 'amount')]),
		]),
		...overrides,
	}
}

/**
 * Build the statistics corpus template — a SINGLE `value` mapping so extraction
 * collects every number: one number lands as a scalar, several as an array the
 * `Generator` keeps AND augments with `Sum`/`Count`/`Average`/`Minimum`/`Maximum`.
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
		definition: quantitativeDefinition('statistics', 'Statistics', [
			factorGroup('total', 'sum', [fieldFactor('value', 'value')]),
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
		definition: quantitativeDefinition('insurance-auto', 'Auto Insurance', [
			factorGroup('total', 'sum', [fieldFactor('age', 'age')]),
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
