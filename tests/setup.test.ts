// The shared test infrastructure's own proof. `tests/setup.ts` is the fixture module every
// Vitest project of this workspace loads first, so its reason-result narrower, its numeric and
// key case tables, its `interprets` corpus builders, and its context seeder are the ground the
// `src:core` suites stand on. Each contract below is asserted against a hand-written
// expectation or against a second mechanism the module does not share — the language's own
// numeric constants, `Object.hasOwn` against `in`, `Object.keys` against a dotted key, the
// engine's own result object — so a fixture that drifts cannot agree with itself here.
//
// `tests/setup.ts` is host-independent by construction: it imports no `node:*` module, no DOM,
// and no Vue. The whole of its contract is therefore reachable in the Node `setup` project and
// no half of it is deferred to another suite.
//
// What the package DOES with these fixtures is proved by the suites that consume them. This
// file drives no stage, no manager, and no narrator: it asserts only what the fixtures are.

import type { Template } from '@src/core'
import { resolveField } from '@orkestrel/contract'
import {
	createConstant,
	createLogicalReasoner,
	createReason,
	createSymbolicReasoner,
	createEquation,
	createLogicalDefinition,
	createOperation,
	createSymbolicDefinition,
	createVariable,
} from '@orkestrel/reason'
import { describe, expect, it } from 'vitest'
import {
	buildEligibilityTemplate,
	buildInsuranceTemplate,
	buildInterpretation,
	buildInterpretTemplate,
	buildLoanTemplate,
	buildStatisticsTemplate,
	EXTREME_NUMBERS,
	expectSymbolic,
	INTERPRET_ACTIONS,
	INTERPRET_DOMAINS,
	seedInterpretContext,
	TRICKY_KEYS,
} from './setup.js'

/**
 * A one-equation symbolic definition solving `total = x + 1` from a seeded `x`, so a real
 * engine run yields a real `SymbolicResult` for the narrower to accept.
 */
function buildSolvedDefinition(): ReturnType<typeof createSymbolicDefinition> {
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

/** Build the whole `interprets` corpus the workspace's suites seed a registry from. */
function collectCorpusTemplates(): readonly Template[] {
	return [
		buildInterpretTemplate(),
		buildInsuranceTemplate(),
		buildEligibilityTemplate(),
		buildLoanTemplate(),
		buildStatisticsTemplate(),
	]
}

describe('expectSymbolic', () => {
	it("returns the engine's own result, narrowed enough to read a solution without a cast", () => {
		const result = createSymbolicReasoner().reason({}, buildSolvedDefinition())

		expect(expectSymbolic(result)).toBe(result)
		expect(expectSymbolic(result).solutions.total).toBe(6)
	})

	it('refuses a batch, so a suite never reads element zero as if it were one result', () => {
		const engine = createReason({ reasoners: [createSymbolicReasoner()] })

		expect(() => expectSymbolic(engine.reason([{}, {}], buildSolvedDefinition()))).toThrow(
			'Expected a single result, got a batch array',
		)
	})

	it('refuses a result of another reasoning, naming the reasoning it got', () => {
		const result = createLogicalReasoner().reason({}, createLogicalDefinition('gate', 'Gate', []))

		expect(() => expectSymbolic(result)).toThrow('Expected a symbolic result, got "logical"')
	})
})

describe('EXTREME_NUMBERS', () => {
	it('is frozen, so a suite that probes it cannot corrupt the next one', () => {
		expect(Object.isFrozen(EXTREME_NUMBERS)).toBe(true)
	})

	it('carries finite values only, leaving NaN and the infinities to their own sites', () => {
		expect(EXTREME_NUMBERS.filter((value) => !Number.isFinite(value))).toEqual([])
	})

	it('carries both signed zeros, which an equality read cannot tell apart', () => {
		expect(EXTREME_NUMBERS.some((value) => Object.is(value, 0))).toBe(true)
		expect(EXTREME_NUMBERS.some((value) => Object.is(value, -0))).toBe(true)
		expect(EXTREME_NUMBERS.indexOf(-0)).toBe(EXTREME_NUMBERS.indexOf(0))
	})

	it('spans past the safe-integer bounds and below the epsilon step', () => {
		expect(Math.max(...EXTREME_NUMBERS)).toBeGreaterThan(Number.MAX_SAFE_INTEGER)
		expect(Math.min(...EXTREME_NUMBERS)).toBeLessThan(Number.MIN_SAFE_INTEGER)
		expect(EXTREME_NUMBERS.some((value) => value > 0 && value < Number.EPSILON)).toBe(true)
	})

	it('carries the decimal triple whose float sum contradicts a decimal read', () => {
		expect(EXTREME_NUMBERS).toContain(0.1)
		expect(EXTREME_NUMBERS).toContain(0.2)
		expect(EXTREME_NUMBERS).toContain(0.3)
		expect(0.1 + 0.2).not.toBe(0.3)
	})
})

describe('TRICKY_KEYS', () => {
	it('is frozen and lists each key once, so a case matrix over it runs each case once', () => {
		expect(Object.isFrozen(TRICKY_KEYS)).toBe(true)
		expect(new Set(TRICKY_KEYS).size).toBe(TRICKY_KEYS.length)
	})

	it('carries prototype names a bare `in` read answers for while no object owns them', () => {
		const inherited = TRICKY_KEYS.filter((key) => key in {})

		expect(inherited).toContain('__proto__')
		expect(inherited).toContain('toString')
		expect(inherited.filter((key) => Object.hasOwn({}, key))).toEqual([])
	})

	it('carries an empty key and an astral key a code-unit length miscounts', () => {
		const astral = TRICKY_KEYS.filter((key) => [...key].length < key.length)

		expect(TRICKY_KEYS).toContain('')
		expect(astral).not.toEqual([])
		expect(astral.filter((key) => [...key].length !== 1)).toEqual([])
	})

	// The stored table holds its accented keys precomposed, so the labile direction is NFD: a
	// consumer that decomposes a key before a lookup gets a key the table never wrote.
	it('carries a key decomposition rewrites, so a normalizing lookup misses it', () => {
		const labile = TRICKY_KEYS.filter((key) => key.normalize('NFD') !== key)

		expect(labile).not.toEqual([])
		expect(labile.filter((key) => Object.hasOwn({ [key]: 1 }, key.normalize('NFD')))).toEqual([])
	})

	it('carries a dotted key that is one key, never a two-segment path', () => {
		const dotted = TRICKY_KEYS.filter((key) => key.includes('.'))

		expect(dotted).toContain('a.b')
		expect(dotted.filter((key) => Object.keys({ [key]: 1 }).length !== 1)).toEqual([])
	})
})

describe('INTERPRET_ACTIONS', () => {
	it('is frozen, so a suite that wires it into an extractor cannot edit it', () => {
		expect(Object.isFrozen(INTERPRET_ACTIONS)).toBe(true)
	})

	it('names an action for every intent the corpus templates declare', () => {
		const names = Object.values(INTERPRET_ACTIONS)
		const intents = collectCorpusTemplates().flatMap((template) => [...template.intents])

		expect(intents).not.toEqual([])
		expect(intents.filter((intent) => !names.includes(intent))).toEqual([])
	})
})

describe('INTERPRET_DOMAINS', () => {
	it('is frozen, so a suite that wires it into an extractor cannot edit it', () => {
		expect(Object.isFrozen(INTERPRET_DOMAINS)).toBe(true)
	})

	it('keys a keyword list by every domain the corpus templates claim', () => {
		const templates = collectCorpusTemplates()

		expect(
			templates.filter((template) => !Object.hasOwn(INTERPRET_DOMAINS, template.domain)),
		).toEqual([])
		expect(
			templates.filter(
				(template) => !(INTERPRET_DOMAINS[template.domain] ?? []).includes(template.domain),
			),
		).toEqual([])
	})

	it('lists lower-case non-empty keywords, matching text a classifier has normalized', () => {
		const keywords = Object.values(INTERPRET_DOMAINS).flat()

		expect(keywords).not.toEqual([])
		expect(keywords.filter((keyword) => keyword !== keyword.toLowerCase())).toEqual([])
		expect(keywords.filter((keyword) => keyword.length === 0)).toEqual([])
	})
})

describe('the interprets corpus builders', () => {
	it('return a fresh graph on every call, so one suite cannot reach another', () => {
		const first = buildInsuranceTemplate()
		const second = buildInsuranceTemplate()

		expect(first).not.toBe(second)
		expect(first.mappings).not.toBe(second.mappings)
		expect(first.defaults).not.toBe(second.defaults)
		expect(first).toEqual(second)
	})

	it('replace an overridden field wholesale and leave the rest at the corpus default', () => {
		const base = buildInsuranceTemplate()
		const overridden = buildInsuranceTemplate({ intents: ['check'], mappings: [] })

		expect(overridden.intents).toEqual(['check'])
		expect(overridden.mappings).toEqual([])
		expect(overridden.id).toBe(base.id)
		expect(overridden.defaults).toEqual(base.defaults)
		expect(overridden.definition).toEqual(base.definition)
	})

	it('identify each template with its own definition, under an id no sibling repeats', () => {
		const templates = collectCorpusTemplates()

		expect(templates.filter((template) => template.definition.id !== template.id)).toEqual([])
		expect(new Set(templates.map((template) => template.id)).size).toBe(templates.length)
	})

	it('give the insurance template a default no mapping can supply', () => {
		const template = buildInsuranceTemplate()
		const mapped = new Set(template.mappings.map((mapping) => mapping.field))

		expect(
			template.defaults.filter((entry) => !mapped.has(entry.field)).map((entry) => entry.field),
		).toContain('deductible')
		expect(template.computations.map((computation) => computation.field)).toContain('monthly')
	})

	it('require the insurance age and nothing in the eligibility template', () => {
		const insurance = buildInsuranceTemplate()
		const eligibility = buildEligibilityTemplate()

		expect(
			insurance.mappings.filter((mapping) => mapping.required === true).map((m) => m.entity),
		).toEqual(['age'])
		expect(eligibility.mappings.filter((mapping) => mapping.required === true)).toEqual([])
	})

	it('give the eligibility template multi-word aliases, so proximity has something to score', () => {
		const aliases = buildEligibilityTemplate().mappings.flatMap((mapping) => [...mapping.aliases])

		expect(aliases.filter((alias) => alias.includes(' '))).not.toEqual([])
	})

	it('give the loan template a domain no other corpus template claims', () => {
		const loan = buildLoanTemplate()
		const others = collectCorpusTemplates().filter((template) => template.id !== loan.id)

		expect(others.map((template) => template.domain)).not.toContain(loan.domain)
	})

	it('give the statistics template one alias-free mapping, so every number lands in one field', () => {
		const mappings = buildStatisticsTemplate().mappings

		expect(mappings.map((mapping) => mapping.field)).toEqual(['value'])
		expect(mappings.flatMap((mapping) => [...mapping.aliases])).toEqual([])
	})
})

describe('buildInterpretation', () => {
	it('builds a completed turn whose entities, mappings, and subject agree', () => {
		const interpretation = buildInterpretation()

		expect(interpretation.complete).toBe(true)
		expect(interpretation.failures).toEqual([])
		expect(interpretation.entities.map((entity) => entity.name)).toEqual(
			interpretation.mappings.map((mapping) => mapping.entity),
		)
		expect(
			interpretation.mappings.filter(
				(mapping) => resolveField(interpretation.subject ?? {}, mapping.field) !== mapping.value,
			),
		).toEqual([])
	})

	it('merges an override over the default turn and returns a fresh graph each call', () => {
		const overridden = buildInterpretation({ text: 'second turn', complete: false })

		expect(overridden.text).toBe('second turn')
		expect(overridden.complete).toBe(false)
		expect(overridden.intent).toEqual(buildInterpretation().intent)
		expect(buildInterpretation().entities).not.toBe(buildInterpretation().entities)
	})
})

describe('seedInterpretContext', () => {
	// The history cap, the entity flattening, and teardown are the `InterpretContext` suite's
	// subject. The claim here is only that the seeder adds every given turn, in the given order.
	it('adds every given turn to a real context, in order', () => {
		const turns = [buildInterpretation({ text: 'first' }), buildInterpretation({ text: 'second' })]

		expect(seedInterpretContext(turns).previous()).toEqual(turns)
	})

	it('returns a distinct empty context when given no turns', () => {
		const context = seedInterpretContext([])

		expect(context.previous()).toEqual([])
		expect(context).not.toBe(seedInterpretContext([]))
	})
})
