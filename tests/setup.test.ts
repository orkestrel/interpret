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

import { collectShapeDefaults, Extractor } from '@src/core'
import { createContract as contractOf, resolveField } from '@orkestrel/contract'
import {
	collectVariables,
	createAtom,
	createCompound,
	createInferentialReasoner,
	createLogicalDefinition,
	createLogicalReasoner,
	createQuantitativeReasoner,
	createReason,
	createRule,
	createSymbolicReasoner,
	extractAtoms,
	formatField,
	isInferentialResult,
	isLogicalResult,
	isQuantitativeResult,
	isSymbolicResult,
} from '@orkestrel/reason'
import { describe, expect, it } from 'vitest'
import {
	buildEligibilityRecipe,
	buildExpressionTrees,
	buildInsuranceRecipe,
	buildInterpretation,
	buildInterpretSolvedDefinition,
	buildLoanRecipe,
	buildStatisticsRecipe,
	buildWorkshopArea,
	buildWorkshopFacts,
	buildWorkshopFees,
	buildWorkshopRules,
	buildWorkshopScore,
	collectConnectives,
	collectExpressionFields,
	collectInterpretCorpusRecipes,
	collectTreeSubjects,
	createCorpusExtractor,
	EXTREME_NUMBERS,
	expectSymbolic,
	INTERPRET_ACTIONS,
	INTERPRET_DOMAINS,
	measureDepth,
	seedInterpretContext,
	TRICKY_KEYS,
	WORKSHOP_AREA,
	WORKSHOP_FEES,
	WORKSHOP_GLOSSARY,
	WORKSHOP_RESTRICTED,
	WORKSHOP_SCORES,
	WORKSHOP_SUBJECTS,
	WORKSHOP_TREE_FIELDS,
} from './setup.js'

describe('expectSymbolic', () => {
	it("returns the engine's own result, narrowed enough to read a solution without a cast", () => {
		const result = createSymbolicReasoner().reason({}, buildInterpretSolvedDefinition())

		expect(expectSymbolic(result)).toBe(result)
		expect(expectSymbolic(result).solutions.total).toBe(6)
	})

	it('refuses a batch, so a suite never reads element zero as if it were one result', () => {
		const engine = createReason({ reasoners: [createSymbolicReasoner()] })

		expect(() => expectSymbolic(engine.reason([{}, {}], buildInterpretSolvedDefinition()))).toThrow(
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

	it('names an action for every intent the corpus recipes declare', () => {
		const names = Object.values(INTERPRET_ACTIONS)
		const intents = collectInterpretCorpusRecipes().flatMap((recipe) => [...recipe.intents])

		expect(intents).not.toEqual([])
		expect(intents.filter((intent) => !names.includes(intent))).toEqual([])
	})
})

describe('INTERPRET_DOMAINS', () => {
	it('is frozen, so a suite that wires it into an extractor cannot edit it', () => {
		expect(Object.isFrozen(INTERPRET_DOMAINS)).toBe(true)
	})

	it('keys a keyword list by every domain the corpus recipes claim', () => {
		const recipes = collectInterpretCorpusRecipes()

		expect(recipes.filter((recipe) => !Object.hasOwn(INTERPRET_DOMAINS, recipe.domain))).toEqual([])
		expect(
			recipes.filter((recipe) => !(INTERPRET_DOMAINS[recipe.domain] ?? []).includes(recipe.domain)),
		).toEqual([])
	})

	it('lists lower-case non-empty keywords, matching text a classifier has normalized', () => {
		const keywords = Object.values(INTERPRET_DOMAINS).flat()

		expect(keywords).not.toEqual([])
		expect(keywords.filter((keyword) => keyword !== keyword.toLowerCase())).toEqual([])
		expect(keywords.filter((keyword) => keyword.length === 0)).toEqual([])
	})
})

describe('createCorpusExtractor', () => {
	it('returns a real Extractor, distinct per call, so one suite cannot reach another', () => {
		const extractor = createCorpusExtractor()

		expect(extractor).toBeInstanceOf(Extractor)
		expect(extractor).not.toBe(createCorpusExtractor())
	})
})

describe('the interprets corpus builders', () => {
	it('return a fresh graph on every call, so one suite cannot reach another', () => {
		const first = buildInsuranceRecipe()
		const second = buildInsuranceRecipe()

		expect(first).not.toBe(second)
		expect(first.mappings).not.toBe(second.mappings)
		expect(first.shape).not.toBe(second.shape)
		expect(first).toEqual(second)
	})

	it('replace an overridden field wholesale and leave the rest at the corpus default', () => {
		const base = buildInsuranceRecipe()
		const overridden = buildInsuranceRecipe({ intents: ['check'], mappings: [] })

		expect(overridden.intents).toEqual(['check'])
		expect(overridden.mappings).toEqual([])
		expect(overridden.id).toBe(base.id)
		expect(overridden.shape).toEqual(base.shape)
		expect(overridden.definition).toEqual(base.definition)
	})

	it('identify each recipe with its own definition, under an id no sibling repeats', () => {
		const recipes = collectInterpretCorpusRecipes()

		expect(recipes.filter((recipe) => recipe.definition.id !== recipe.id)).toEqual([])
		expect(new Set(recipes.map((recipe) => recipe.id)).size).toBe(recipes.length)
	})

	it('give the insurance recipe a default no mapping can supply', () => {
		const recipe = buildInsuranceRecipe()
		const mapped = new Set(recipe.mappings.map((mapping) => formatField(mapping.field)))
		const filled = collectShapeDefaults(recipe.shape).map((entry) => formatField(entry.field))

		expect(filled.filter((field) => !mapped.has(field))).toContain('deductible')
		expect(recipe.computations.map((computation) => computation.field)).toContain('monthly')
	})

	it('require the insurance age and nothing in the eligibility recipe', () => {
		const insurance = buildInsuranceRecipe()
		const eligibility = buildEligibilityRecipe()

		expect(
			contractOf(insurance.shape)
				.explain({})
				.map((fault) => fault.path),
		).toEqual([['age']])
		expect(contractOf(eligibility.shape).explain({})).toEqual([])
	})

	it('give the eligibility recipe multi-word aliases, so proximity has something to score', () => {
		const aliases = buildEligibilityRecipe().mappings.flatMap((mapping) => [...mapping.aliases])

		expect(aliases.filter((alias) => alias.includes(' '))).not.toEqual([])
	})

	it('give the loan recipe a domain no other corpus recipe claims', () => {
		const loan = buildLoanRecipe()
		const others = collectInterpretCorpusRecipes().filter((recipe) => recipe.id !== loan.id)

		expect(others.map((recipe) => recipe.domain)).not.toContain(loan.domain)
	})

	it('give the statistics recipe one alias-free mapping, so every number lands in one field', () => {
		const mappings = buildStatisticsRecipe().mappings

		expect(mappings.map((mapping) => mapping.field)).toEqual(['value'])
		expect(mappings.flatMap((mapping) => [...mapping.aliases])).toEqual([])
	})
})

describe('buildInterpretation', () => {
	it('builds a completed turn whose entities, mappings, and subject agree', () => {
		const interpretation = buildInterpretation()

		expect(interpretation.ambiguities).toEqual([])
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
		const overridden = buildInterpretation({ text: 'second turn', confidence: 0 })

		expect(overridden.text).toBe('second turn')
		expect(overridden.confidence).toBe(0)
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

describe('WORKSHOP_RESTRICTED', () => {
	it('lists forty distinct, trimmed, non-empty activity names', () => {
		expect(WORKSHOP_RESTRICTED).toHaveLength(40)
		expect(new Set(WORKSHOP_RESTRICTED).size).toBe(40)
		expect(WORKSHOP_RESTRICTED.filter((name) => name.length === 0 || name !== name.trim())).toEqual(
			[],
		)
	})
})

describe('buildWorkshopRules', () => {
	it('lists the eight rules in order under the workshop id and name', () => {
		const definition = buildWorkshopRules()

		expect([definition.id, definition.name]).toEqual(['workshop', 'Workshop booking'])
		expect(definition.rules.map((rule) => rule.id)).toEqual([
			'restricted',
			'overcap',
			'hours',
			'trusted',
			'quiet',
			'paired',
			'single',
			'approve',
		])
	})

	it('authors a name that differs from its id and a description on every rule', () => {
		const rules = buildWorkshopRules().rules

		expect(rules.filter((rule) => rule.name === rule.id || rule.name.trim() === '')).toEqual([])
		expect(rules.filter((rule) => (rule.description ?? '').trim() === '')).toEqual([])
		expect(new Set(rules.map((rule) => rule.name)).size).toBe(rules.length)
	})

	it('reads the fields, comparisons, and connectives the design names, through a second mechanism', () => {
		const rules = buildWorkshopRules().rules
		const reads = rules.map((rule) =>
			rule.premises.flatMap((premise) =>
				extractAtoms(premise).map(
					(atom) => `${formatField(atom.check.field)} ${atom.check.operator}`,
				),
			),
		)

		expect(reads).toEqual([
			['activity any'],
			['terms.excess above'],
			['start between'],
			['member equals', 'score from'],
			['noise above'],
			['tools equals', 'trained equals'],
			['morning equals', 'evening equals'],
			['trusted equals', 'quiet equals', 'restricted equals', 'cost to'],
		])
		expect(rules.map((rule) => rule.premises.flatMap(collectConnectives))).toEqual([
			[],
			[],
			[],
			['or'],
			['not'],
			['implies'],
			['xor'],
			['not'],
		])
		expect(rules.map((rule) => collectExpressionFields(rule.conclusion))).toEqual([
			['restricted'],
			['overcap'],
			['open'],
			['trusted'],
			['quiet'],
			['paired'],
			['single'],
			['approved'],
		])
	})

	it('keeps the nested path an array, which formats as a dotted display key only', () => {
		const overcap = buildWorkshopRules().rules.find((rule) => rule.id === 'overcap')
		const atoms = (overcap?.premises ?? []).flatMap((premise) => extractAtoms(premise))

		expect(atoms.map((atom) => atom.check.field)).toEqual([['terms', 'excess']])
		expect(atoms.map((atom) => formatField(atom.check.field))).toEqual(['terms.excess'])
	})

	it('validates against the real logical reasoner', () => {
		expect(createLogicalReasoner().validate(buildWorkshopRules())).toEqual({
			valid: true,
			errors: [],
			warnings: [],
		})
	})
})

describe('WORKSHOP_SUBJECTS', () => {
	it('names at least eight subjects, including every situation the design lists', () => {
		const names = Object.keys(WORKSHOP_SUBJECTS)

		expect(names.length).toBeGreaterThanOrEqual(8)
		expect(names).toEqual(
			expect.arrayContaining([
				'held',
				'restricted',
				'overcap',
				'loud',
				'second',
				'neither',
				'vacuous',
				'nocost',
				'nonoise',
			]),
		)
	})

	it('expects each rule to settle on every state somewhere across the subjects', () => {
		const states = Object.values(WORKSHOP_SUBJECTS).flatMap((one) => Object.entries(one.states))

		expect(
			['met', 'unmet'].flatMap((state) =>
				buildWorkshopRules()
					.rules.filter((rule) => !states.some(([id, value]) => id === rule.id && value === state))
					.map((rule) => `${rule.id} ${state}`),
			),
		).toEqual([])
		expect(states.filter(([, state]) => state === 'unread').map(([id]) => id)).toEqual([
			'approve',
			'quiet',
			'approve',
		])
	})

	it.each(Object.entries(WORKSHOP_SUBJECTS))(
		'settles the %s booking on the expected states, as the real engine reads it',
		(_name, expected) => {
			const result = createLogicalReasoner().reason(expected.subject, buildWorkshopRules())
			if (!isLogicalResult(result)) throw new Error('Expected a logical result')

			expect(Object.fromEntries(result.rules.map((rule) => [rule.id, rule.state]))).toEqual(
				expected.states,
			)
			expect(result.success).toBe(expected.success)
			expect(result.faults.map((fault) => formatField(fault.path))).toEqual(expected.faults)
		},
	)

	it('reads an `or` met by its second operand: the first check is unmet, the second met', () => {
		const result = createLogicalReasoner().reason(
			WORKSHOP_SUBJECTS.second?.subject ?? {},
			buildWorkshopRules(),
		)
		if (!isLogicalResult(result)) throw new Error('Expected a logical result')
		const trusted = result.rules.find((rule) => rule.id === 'trusted')

		expect(trusted?.checks.map((check) => check.state)).toEqual(['unmet', 'met'])
		expect(trusted?.state).toBe('met')
	})

	it('reads an `or` with both operands unmet as unmet', () => {
		const result = createLogicalReasoner().reason(
			WORKSHOP_SUBJECTS.neither?.subject ?? {},
			buildWorkshopRules(),
		)
		if (!isLogicalResult(result)) throw new Error('Expected a logical result')
		const trusted = result.rules.find((rule) => rule.id === 'trusted')

		expect(trusted?.checks.map((check) => check.state)).toEqual(['unmet', 'unmet'])
		expect(trusted?.state).toBe('unmet')
	})

	it('reads an `implies` met because its first operand is unmet, while its second is unmet too', () => {
		const result = createLogicalReasoner().reason(
			WORKSHOP_SUBJECTS.vacuous?.subject ?? {},
			buildWorkshopRules(),
		)
		if (!isLogicalResult(result)) throw new Error('Expected a logical result')
		const paired = result.rules.find((rule) => rule.id === 'paired')

		expect(paired?.checks.map((check) => check.state)).toEqual(['unmet', 'unmet'])
		expect(paired?.state).toBe('met')
	})

	it('reads a `not` that fails: its operand check is met, so the rule is unmet', () => {
		const result = createLogicalReasoner().reason(
			WORKSHOP_SUBJECTS.loud?.subject ?? {},
			buildWorkshopRules(),
		)
		if (!isLogicalResult(result)) throw new Error('Expected a logical result')
		const quiet = result.rules.find((rule) => rule.id === 'quiet')

		expect(quiet?.checks.map((check) => check.state)).toEqual(['met'])
		expect(quiet?.state).toBe('unmet')
	})

	it('refuses a missing `cost` and a missing `noise`, naming each field and no other', () => {
		const reasoner = createLogicalReasoner()
		const cost = reasoner.reason(WORKSHOP_SUBJECTS.nocost?.subject ?? {}, buildWorkshopRules())
		const noise = reasoner.reason(WORKSHOP_SUBJECTS.nonoise?.subject ?? {}, buildWorkshopRules())
		if (!isLogicalResult(cost) || !isLogicalResult(noise))
			throw new Error('Expected logical results')

		expect([cost.success, cost.conclusion, cost.errors]).toEqual([
			false,
			'unread',
			['cost: missing; expected number'],
		])
		expect([noise.success, noise.conclusion, noise.errors]).toEqual([
			false,
			'unread',
			['noise: missing; expected number'],
		])
	})

	it('carries a restricted subject whose activity is on the list and a held one whose is not', () => {
		expect(WORKSHOP_RESTRICTED).toContain(WORKSHOP_SUBJECTS.restricted?.subject.activity)
		expect(WORKSHOP_RESTRICTED).not.toContain(WORKSHOP_SUBJECTS.held?.subject.activity)
	})
})

describe('buildWorkshopScore', () => {
	it('authors a name that differs from its id on the definition, every group, and every factor', () => {
		const definition = buildWorkshopScore()
		const parts = [
			definition,
			...definition.groups,
			...definition.groups.flatMap((group) => group.factors),
		]

		expect([definition.id, definition.name]).toEqual(['score', 'Booking score'])
		expect(parts.filter((part) => part.name === part.id || part.name.trim() === '')).toEqual([])
		expect(definition.groups.map((group) => group.aggregation)).toEqual(['sum', 'maximum'])
	})

	it('gates one factor by a check on `member` and reads the lookup with no fallback', () => {
		const groups = buildWorkshopScore().groups
		const factors = groups.flatMap((group) => group.factors)
		const gated = factors.filter((factor) => (factor.checks ?? []).length > 0)
		const lookup = factors.find((factor) => factor.source.origin === 'lookup')

		expect(gated.map((factor) => factor.id)).toEqual(['discount'])
		expect(gated.flatMap((factor) => factor.checks ?? [])).toEqual([
			{ field: 'member', operator: 'equals', value: 'gold' },
		])
		expect(lookup?.fallback).toBeUndefined()
	})

	it.each(Object.entries(WORKSHOP_SCORES))(
		'scores the %s subject as expected, as the real engine reads it',
		(_name, expected) => {
			const result = createQuantitativeReasoner().reason(expected.subject, buildWorkshopScore())
			if (!isQuantitativeResult(result)) throw new Error('Expected a quantitative result')

			expect(result.success).toBe(expected.success)
			expect(result.value).toBe(expected.value)
		},
	)

	it('leaves the gated factor unapplied for a subject that fails its check, naming that check', () => {
		const result = createQuantitativeReasoner().reason(
			WORKSHOP_SCORES.silver?.subject ?? {},
			buildWorkshopScore(),
		)
		if (!isQuantitativeResult(result)) throw new Error('Expected a quantitative result')
		const discount = result.groups
			.flatMap((group) => group.factors)
			.find((factor) => factor.id === 'discount')

		expect(discount?.applied).toBe(false)
		expect(discount?.checks?.map((check) => [formatField(check.field), check.state])).toEqual([
			['member', 'unmet'],
		])
	})

	it('refuses a missing `cost` on its field and a missing table entry on its room', () => {
		const reasoner = createQuantitativeReasoner()
		const cost = reasoner.reason(WORKSHOP_SCORES.nocost?.subject ?? {}, buildWorkshopScore())
		const room = reasoner.reason(WORKSHOP_SCORES.garage?.subject ?? {}, buildWorkshopScore())
		if (!isQuantitativeResult(cost) || !isQuantitativeResult(room)) {
			throw new Error('Expected quantitative results')
		}

		expect(cost.faults.map((fault) => formatField(fault.path))).toEqual(['cost'])
		expect(room.faults).toEqual([])
		expect(room.errors).toEqual(['Factor "room" has no value for "garage"'])
	})
})

describe('buildWorkshopFees', () => {
	it('is a valid definition that takes every source, aggregation, and gate it names', () => {
		const definition = buildWorkshopFees()
		const factors = definition.groups.flatMap((group) => group.factors)

		expect(createQuantitativeReasoner().validate(definition).valid).toBe(true)
		expect(definition.groups.map((group) => group.aggregation)).toEqual([
			'sum',
			'product',
			'average',
		])
		expect([...new Set(factors.map((factor) => factor.source.origin))]).toEqual([
			'field',
			'range',
			'static',
			'lookup',
		])
		expect(factors.filter((factor) => factor.required === true).map(({ id }) => id)).toEqual([
			'deposit',
		])
	})

	it.each(Object.entries(WORKSHOP_FEES))(
		'prices the %s subject as expected, as the real engine reads it',
		(_name, expected) => {
			const result = createQuantitativeReasoner().reason(expected.subject, buildWorkshopFees())
			if (!isQuantitativeResult(result)) throw new Error('Expected a quantitative result')

			expect(result.success).toBe(expected.success)
			expect(result.value).toBeCloseTo(expected.value, 9)
		},
	)

	it('refuses a gated required factor with no fault, and an unread range on its field', () => {
		const reasoner = createQuantitativeReasoner()
		const costly = reasoner.reason(WORKSHOP_FEES.costly?.subject ?? {}, buildWorkshopFees())
		const crowd = reasoner.reason(WORKSHOP_FEES.crowd?.subject ?? {}, buildWorkshopFees())

		expect(costly.faults).toEqual([])
		expect(costly.errors).toHaveLength(1)
		expect(crowd.faults.map((fault) => formatField(fault.path))).toEqual(['guests'])
	})

	it('leaves the strict group unapplied where one of its factors is gated out', () => {
		const result = createQuantitativeReasoner().reason(
			WORKSHOP_FEES.spare?.subject ?? {},
			buildWorkshopFees(),
		)
		if (!isQuantitativeResult(result)) throw new Error('Expected a quantitative result')

		expect(result.groups.map((group) => [group.id, group.applied])).toEqual([
			['hire', true],
			['share', true],
			['extras', false],
		])
	})
})

describe('buildWorkshopArea', () => {
	it('authors a name that differs from its id on the equation', () => {
		const definition = buildWorkshopArea()

		expect([definition.id, definition.name]).toEqual(['area', 'Floor area'])
		expect(definition.equations.map((equation) => [equation.id, equation.name])).toEqual([
			['area', 'Floor area'],
		])
		expect((definition.equations[0]?.description ?? '').length).toBeGreaterThan(0)
	})

	it.each(Object.entries(WORKSHOP_AREA))(
		'reads the %s subject as expected, as the real engine reads it',
		(_name, expected) => {
			const result = createSymbolicReasoner().reason(expected.subject, buildWorkshopArea())
			if (!isSymbolicResult(result)) throw new Error('Expected a symbolic result')

			expect(result.success).toBe(expected.success)
			expect(result.solutions).toEqual(expected.solutions)
		},
	)

	it('names the unbound variable of the refused subject', () => {
		const result = createSymbolicReasoner().reason(
			WORKSHOP_AREA.refused?.subject ?? {},
			buildWorkshopArea(),
		)
		if (!isSymbolicResult(result)) throw new Error('Expected a symbolic result')

		expect(result.faults.map((fault) => formatField(fault.path))).toEqual(['depth'])
	})
})

describe('buildWorkshopFacts', () => {
	it('holds a chain of three inferences over a depth of 1', () => {
		const definition = buildWorkshopFacts()

		expect(definition.depth).toBe(1)
		expect(definition.inferences.map((inference) => inference.name)).toEqual([
			'Staffing',
			'Cleaning',
			'Closing',
		])
	})

	it('derives the whole chain and still refuses at the cap', () => {
		const result = createInferentialReasoner().reason({}, buildWorkshopFacts())
		if (!isInferentialResult(result)) throw new Error('Expected an inferential result')

		expect(result.derived.map((fact) => fact.predicate)).toEqual(['staffed', 'cleaned', 'closed'])
		expect(result.success).toBe(false)
		expect(result.errors).toEqual(['Forward chaining did not settle within depth 1'])
	})

	it('settles the same chain once the depth allows it, so the cap is the only cause', () => {
		const result = createInferentialReasoner().reason({}, { ...buildWorkshopFacts(), depth: 10 })
		if (!isInferentialResult(result)) throw new Error('Expected an inferential result')

		expect(result.derived).toHaveLength(3)
		expect(result.success).toBe(true)
	})
})

describe('WORKSHOP_GLOSSARY', () => {
	const compared = ['above', 'below', 'from', 'to', 'between', 'outside']

	it('labels every field path the definitions read, keyed by the display path', () => {
		const logical = buildWorkshopRules().rules.flatMap((rule) =>
			rule.premises.flatMap(collectExpressionFields),
		)
		const quantitative = buildWorkshopScore()
			.groups.flatMap((group) => group.factors)
			.flatMap((factor) => [
				...(factor.source.origin === 'static' ? [] : [formatField(factor.source.field)]),
				...(factor.checks ?? []).map((check) => formatField(check.field)),
			])
		const symbolic = buildWorkshopArea().equations.flatMap((equation) => [
			...collectVariables(equation.left),
			...collectVariables(equation.right),
			equation.target,
		])
		const fees = buildWorkshopFees()
			.groups.flatMap((group) => group.factors)
			.flatMap(({ source, checks }) => [
				...(source.origin === 'static' ? [] : [formatField(source.field)]),
				...(checks ?? []).map((check) => formatField(check.field)),
			])
		const reads = [...logical, ...quantitative, ...fees, ...symbolic]

		expect(reads).toContain('terms.excess')
		expect(reads).toContain('terms.rate')
		expect(reads.filter((field) => !Object.hasOwn(WORKSHOP_GLOSSARY.labels, field))).toEqual([])
		expect(Object.values(WORKSHOP_GLOSSARY.labels).filter((label) => label.trim() === '')).toEqual(
			[],
		)
	})

	it('gives a unit to every field the rules compare as a number', () => {
		const numeric = buildWorkshopRules().rules.flatMap((rule) =>
			rule.premises
				.flatMap((premise) => extractAtoms(premise))
				.filter((atom) => compared.includes(atom.check.operator))
				.map((atom) => formatField(atom.check.field)),
		)

		expect(numeric).toEqual(['terms.excess', 'start', 'score', 'noise', 'cost'])
		expect(numeric.filter((field) => !Object.hasOwn(WORKSHOP_GLOSSARY.units, field))).toEqual([])
		expect(WORKSHOP_GLOSSARY.units).toEqual({
			cost: 'money',
			'terms.excess': 'money',
			'terms.rate': 'money',
			noise: 'decibel',
			start: 'plain',
			score: 'count',
		})
		expect(WORKSHOP_GLOSSARY.values).toEqual({ score: 'count', fees: 'money' })
	})

	it('formats each unit past the shipped plain and count with a real Intl format', () => {
		const unshipped = Object.values(WORKSHOP_GLOSSARY.units).filter(
			(unit) => unit !== 'plain' && unit !== 'count',
		)
		const money = new Intl.NumberFormat('en-US', WORKSHOP_GLOSSARY.formats.money)
		const decibel = new Intl.NumberFormat('en-US', WORKSHOP_GLOSSARY.formats.decibel)

		expect(unshipped.filter((unit) => !Object.hasOwn(WORKSHOP_GLOSSARY.formats, unit))).toEqual([])
		expect(WORKSHOP_GLOSSARY.formats.money?.currency).toBe('USD')
		expect(money.format(1250)).toBe('$1,250.00')
		expect(decibel.format(40.26)).toBe('40.3')
	})

	it('keeps one label in odd casing, which no case fold reproduces', () => {
		const odd = Object.values(WORKSHOP_GLOSSARY.labels).filter(
			(label) => label !== label.toLowerCase() && label !== label.toUpperCase(),
		)

		expect(odd).toEqual(['wOrkshop tier'])
	})
})

describe('buildExpressionTrees', () => {
	const expressions = buildExpressionTrees().flatMap((definition) =>
		definition.rules.flatMap((rule) => rule.premises),
	)

	it('holds one rule with an authored name and one premise in every definition', () => {
		const trees = buildExpressionTrees()

		expect(trees.filter((tree) => tree.rules.length !== 1)).toEqual([])
		expect(trees.filter((tree) => tree.rules.some((rule) => rule.premises.length !== 1))).toEqual(
			[],
		)
		expect(
			trees.filter((tree) => tree.rules.some((rule) => rule.name === rule.id || rule.name === '')),
		).toEqual([])
		expect(new Set(trees.map((tree) => tree.id)).size).toBe(trees.length)
	})

	it('holds thirty-nine trees of depth 1, 579 of depth 2, and 200 of depth 3, counted by hand', () => {
		const counts = [1, 2, 3].map(
			(depth) => expressions.filter((expression) => measureDepth(expression) === depth).length,
		)

		expect(counts).toEqual([39, 579, 200])
		expect(expressions).toHaveLength(818)
		expect(expressions.map(measureDepth)).toEqual([
			...Array.from({ length: 39 }, () => 1),
			...Array.from({ length: 579 }, () => 2),
			...Array.from({ length: 200 }, () => 3),
		])
	})

	it('lists no tree of depth 1 or 2 twice, and reads each field at most once in one', () => {
		const exact = expressions.slice(0, 618)

		expect(new Set(exact.map((expression) => JSON.stringify(expression))).size).toBe(618)
		expect(
			exact.filter((expression) => {
				const fields = collectExpressionFields(expression)
				return new Set(fields).size !== fields.length
			}),
		).toEqual([])
	})

	it('reads only the three fields, and the draws read one more than once', () => {
		const fields = expressions.flatMap(collectExpressionFields)

		expect([...new Set(fields)].toSorted()).toEqual([...WORKSHOP_TREE_FIELDS])
		expect(
			expressions.slice(618).some((expression) => {
				const read = collectExpressionFields(expression)
				return new Set(read).size !== read.length
			}),
		).toBe(true)
	})

	it('uses all five connectives, at every arity each allows', () => {
		const connectives = expressions.flatMap(collectConnectives)

		const arities = expressions.flatMap((expression) =>
			expression.form === 'compound'
				? [`${expression.operator} ${String(expression.operands.length)}`]
				: [],
		)

		expect([...new Set(connectives)].toSorted()).toEqual(['and', 'implies', 'not', 'or', 'xor'])
		expect([...new Set(arities)].toSorted()).toEqual([
			'and 2',
			'and 3',
			'implies 2',
			'not 1',
			'or 2',
			'or 3',
			'xor 2',
		])
	})

	it('validates every tree, and refuses a `not` with two operands as a control', () => {
		const reasoner = createLogicalReasoner()
		const invalid = buildExpressionTrees().filter((tree) => !reasoner.validate(tree).valid)
		const control = createLogicalDefinition('control', 'Control', [
			createRule(
				'rule',
				[createCompound('not', [createAtom('a', 'equals', true), createAtom('b', 'equals', true)])],
				createAtom('out', 'equals', true),
				{ name: 'Control rule' },
			),
		])

		expect(invalid).toEqual([])
		expect(reasoner.validate(control).valid).toBe(false)
	})

	it('draws the same trees on every call, from the fixed seed', () => {
		expect(buildExpressionTrees()).toEqual(buildExpressionTrees())
	})

	it('reads a spot-checked tree as the documented connectives give, against the real engine', () => {
		const reasoner = createLogicalReasoner()
		const first = buildExpressionTrees()[0]
		const states = [{ a: true }, { a: false }, {}].map((subject) => {
			const result = first === undefined ? undefined : reasoner.reason(subject, first)
			return result !== undefined && isLogicalResult(result) ? result.rules[0]?.state : undefined
		})

		expect(first?.rules[0]?.premises.flatMap(collectConnectives)).toEqual(['not'])
		expect(states).toEqual(['unmet', 'met', 'unread'])
	})

	it('evaluates every tree against every subject that reads all three fields', () => {
		const reasoner = createLogicalReasoner()
		const full = collectTreeSubjects().filter((subject) => Object.keys(subject).length === 3)
		const failed = buildExpressionTrees().flatMap((tree) =>
			full.filter((subject) => !reasoner.reason(subject, tree).success),
		)

		expect(failed).toEqual([])
	})
})

describe('collectTreeSubjects', () => {
	const subjects = collectTreeSubjects()

	it('lists all twenty-seven assignments once each', () => {
		expect(subjects).toHaveLength(27)
		expect(new Set(subjects.map((subject) => JSON.stringify(subject))).size).toBe(27)
	})

	it('assigns each field true, false, or leaves it absent, and nothing else', () => {
		const values = subjects.flatMap((subject) => Object.values(subject))

		expect(values.filter((value) => value !== true && value !== false)).toEqual([])
		expect(
			subjects.filter((subject) =>
				Object.keys(subject).some((key) => !WORKSHOP_TREE_FIELDS.includes(key)),
			),
		).toEqual([])
		expect(subjects.filter((subject) => Object.keys(subject).length === 3)).toHaveLength(8)
		expect(subjects.filter((subject) => Object.keys(subject).length === 0)).toEqual([{}])
	})
})
