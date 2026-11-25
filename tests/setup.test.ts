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

import { buildAccountLine, collectShapeDefaults, Extractor, isGlossary } from '@src/core'
import { createContract as contractOf, resolveField } from '@orkestrel/contract'
import { createProgram, STATUSES } from '@orkestrel/program'
import { createQualifier, findMessageTokens, findRule } from '@orkestrel/qualifier'
import { createRater } from '@orkestrel/rater'
import {
	applyOperation,
	collectVariables,
	createAtom,
	createCompound,
	createConstant,
	createDeductiveReasoner,
	createLogicalDefinition,
	createLogicalReasoner,
	createOperation,
	createQuantitativeReasoner,
	createReason,
	createRule,
	createSymbolicReasoner,
	createVariable,
	extractAtoms,
	formatField,
	isDefinition,
	isDeductiveResult,
	isLogicalResult,
	isQuantitativeResult,
	isSymbolicResult,
	MATH_OPERATIONS,
} from '@orkestrel/reason'
import { requireValue } from '@orkestrel/test'
import { describe, expect, it } from 'vitest'
import {
	AMENDED_TURNS,
	buildBandTables,
	buildCarriedEntity,
	buildProposedEntity,
	buildRuleChain,
	buildStatedEntity,
	buildSuppliedEntity,
	SUPPLIED_AMENDMENT,
	SUPPLIED_TURNS,
	buildTermsRecipe,
	buildFamilyParts,
	buildGatedQuote,
	buildRefusedQuote,
	buildRefusedRuns,
	buildRefusedTier,
	collectEvidenceAccounts,
	buildFamilyWording,
	collectWrittenTexts,
	createAnsweringEvaluator,
	createAnsweringReasoner,
	renderFamilyMessage,
	FAMILY_PARTS,
	REFUSED_GLOSSARY,
	collectFixtureAccounts,
	composeInterpretation,
	CONTINUED_TURNS,
	CONTINUED_VALUES,
	DISTRACTING_TURNS,
	EVIDENCE_VALUES,
	freezeFixture,
	measureLines,
	MERGED_GLOSSARY,
	buildEligibilityRecipe,
	buildExpressionTrees,
	buildFamilyProgram,
	buildFamilyQualification,
	buildFamilyRating,
	buildInsuranceRecipe,
	buildInterpretation,
	buildInterpretSolvedDefinition,
	buildLoanRecipe,
	buildStatisticsRecipe,
	buildSymbolicTrees,
	buildWorkshopArea,
	buildWorkshopCharge,
	buildWorkshopFacts,
	buildWorkshopFees,
	buildWorkshopGates,
	buildWorkshopKin,
	buildWorkshopQuote,
	buildWorkshopRules,
	buildWorkshopScore,
	collectConnectives,
	collectExpressionFields,
	collectFamilyConnectives,
	collectFamilyEffects,
	collectFamilyAccounts,
	collectFamilyExecuted,
	collectFamilyFindings,
	collectFamilyLeaves,
	collectFamilyPairs,
	collectFamilyQualified,
	collectFamilySources,
	collectFamilyUnique,
	collectInterpretCorpusRecipes,
	collectTreeSubjects,
	computeChanges,
	createCorpusExtractor,
	EXTREME_NUMBERS,
	expectSymbolic,
	FAMILY_GLOSSARY,
	FAMILY_PROGRAMS,
	FAMILY_RATINGS,
	FAMILY_SUBJECTS,
	FAMILY_WORDED_PATH,
	INTERPRET_ACTIONS,
	INTERPRET_DOMAINS,
	measureDepth,
	measureTree,
	parseWordedRange,
	parseListText,
	parseQuotedMember,
	parseSide,
	QUOTED_LISTS,
	seedInterpretContext,
	SIDE_READINGS,
	splitGroups,
	TABLE_BANDS,
	TRANSFORM_READINGS,
	TRICKY_KEYS,
	WORKSHOP_AREA,
	WORKSHOP_CHARGES,
	WORKSHOP_FEES,
	WORKSHOP_GATES,
	WORKSHOP_GLOSSARY,
	WORKSHOP_QUOTES,
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

		expect([cost.success, cost.conclusion, cost.refusals]).toEqual([false, 'unread', []])
		expect([noise.success, noise.conclusion, noise.refusals]).toEqual([false, 'unread', []])
	})

	it('carries a restricted subject whose activity is on the list and a held one whose is not', () => {
		expect(WORKSHOP_RESTRICTED).toContain(WORKSHOP_SUBJECTS.restricted?.subject.activity)
		expect(WORKSHOP_RESTRICTED).not.toContain(WORKSHOP_SUBJECTS.held?.subject.activity)
	})
})

describe('buildWorkshopGates', () => {
	it('is a valid definition of five named, described rules', () => {
		const definition = buildWorkshopGates()

		expect(createLogicalReasoner().validate(definition)).toEqual({
			valid: true,
			errors: [],
			warnings: [],
		})
		expect(definition.rules.map((rule) => rule.name)).toEqual([
			'Early start',
			'Loud activity',
			'High cost',
			'Visiting booker',
			'Large party',
		])
		expect(definition.rules.filter((rule) => (rule.description ?? '').trim() === '')).toEqual([])
	})

	it('holds rules that read nothing another concludes', () => {
		const rules = buildWorkshopGates().rules
		const concluded = rules.flatMap((rule) => collectExpressionFields(rule.conclusion))
		const reads = rules.flatMap((rule) => rule.premises.flatMap(collectExpressionFields))

		expect(concluded).toEqual(['early', 'noisy', 'costly', 'visitor', 'crowded'])
		expect(reads).toEqual(['start', 'noise', 'cost', 'member', 'guests'])
	})
})

describe('WORKSHOP_GATES', () => {
	it.each(Object.entries(WORKSHOP_GATES))(
		'settles the %s booking on the expected states, as the real engine reads it',
		(_name, expected) => {
			const result = createLogicalReasoner().reason(expected.subject, buildWorkshopGates())
			if (!isLogicalResult(result)) throw new Error('Expected a logical result')

			expect(Object.fromEntries(result.rules.map((rule) => [rule.id, rule.state]))).toEqual(
				expected.states,
			)
			expect(result.success).toBe(expected.success)
			expect(result.faults.map((fault) => formatField(fault.path))).toEqual(expected.faults)
		},
	)

	it('concludes the state of its last rule alone, whatever the others settle on', () => {
		const conclusions = Object.values(WORKSHOP_GATES).map(({ subject }) => {
			const result = createLogicalReasoner().reason(subject, buildWorkshopGates())
			if (!isLogicalResult(result)) throw new Error('Expected a logical result')
			return [result.conclusion, result.count]
		})

		expect(conclusions).toEqual([
			['unmet', 0],
			['met', 1],
			['unmet', 2],
			['met', 5],
			['unread', 1],
			['unread', 1],
		])
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
		expect(discount?.checks?.map((check) => [formatField(check.check.field), check.state])).toEqual(
			[['member', 'unmet']],
		)
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
		expect(room.refusals).toEqual([
			{ cause: 'source', group: 'space', factor: 'room', field: 'room', actual: 'garage' },
		])
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
		expect(costly.refusals).toEqual([{ cause: 'required', group: 'hire', factor: 'deposit' }])
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
	it('holds a chain of three deductions over a depth of 1', () => {
		const definition = buildWorkshopFacts()

		expect(definition.depth).toBe(1)
		expect(definition.deductions.map((deduction) => deduction.name)).toEqual([
			'Staffing',
			'Cleaning',
			'Closing',
		])
	})

	it('derives the whole chain and still refuses at the cap', () => {
		const result = createDeductiveReasoner().reason({}, buildWorkshopFacts())
		if (!isDeductiveResult(result)) throw new Error('Expected a deductive result')

		expect(result.derived.map((fact) => fact.predicate)).toEqual(['staffed', 'cleaned', 'closed'])
		expect(result.success).toBe(false)
		expect(result.refusals).toEqual([{ cause: 'depth', depth: 1 }])
	})

	it('settles the same chain once the depth allows it, so the cap is the only cause', () => {
		const result = createDeductiveReasoner().reason({}, { ...buildWorkshopFacts(), depth: 10 })
		if (!isDeductiveResult(result)) throw new Error('Expected a deductive result')

		expect(result.derived).toHaveLength(3)
		expect(result.success).toBe(true)
	})
})

describe('buildWorkshopQuote', () => {
	const reasoner = createQuantitativeReasoner()

	it('is a valid definition that authors every setting it names', () => {
		const definition = buildWorkshopQuote()
		const factors = definition.groups.flatMap((group) => group.factors)

		expect(reasoner.validate(definition).valid).toBe(true)
		expect([definition.base, definition.bounds, definition.precision]).toEqual([
			10,
			{ minimum: 25 },
			2,
		])
		expect(definition.groups.map(({ strict, base }) => [strict, base])).toEqual([
			[true, 5],
			[undefined, undefined],
		])
		expect(factors.map(({ weight, fallback, required }) => [weight, fallback, required])).toEqual([
			[2, 6, undefined],
			[undefined, undefined, undefined],
			[undefined, undefined, true],
			[undefined, 0, undefined],
		])
	})

	it.each(Object.entries(WORKSHOP_QUOTES))(
		'prices the %s subject as expected, as the real engine reads it',
		(_name, expected) => {
			const result = reasoner.reason(expected.subject, buildWorkshopQuote())
			if (!isQuantitativeResult(result)) throw new Error('Expected a quantitative result')

			expect(result.success).toBe(expected.success)
			expect(result.value).toBeCloseTo(expected.value, 9)
		},
	)

	it('leaves a strict group and its base out of the total where a factor did not apply', () => {
		const result = reasoner.reason(WORKSHOP_QUOTES.costly?.subject ?? {}, buildWorkshopQuote())
		if (!isQuantitativeResult(result)) throw new Error('Expected a quantitative result')

		expect(result.groups.map(({ id, applied, value }) => [id, applied, value])).toEqual([
			['hire', false, 5],
			['crowd', true, 15.125],
		])
		expect(result.count).toBe(1)
	})
})

describe('buildWorkshopCharge', () => {
	it('is a valid definition whose first equation nests three operations', () => {
		const definition = buildWorkshopCharge()
		const [charge] = definition.equations

		expect(createSymbolicReasoner().validate(definition).valid).toBe(true)
		expect(collectVariables(charge?.right ?? createConstant(0))).toEqual([
			'width',
			'depth',
			'minimum',
		])
		expect(measureTree(charge?.right ?? createConstant(0))).toBe(3)
	})

	it.each(Object.entries(WORKSHOP_CHARGES))(
		'reads the %s subject as expected, as the real engine reads it',
		(_name, expected) => {
			const result = createSymbolicReasoner().reason(expected.subject, buildWorkshopCharge())
			if (!isSymbolicResult(result)) throw new Error('Expected a symbolic result')

			expect(result.success).toBe(expected.success)
			expect(result.solutions).toEqual(expected.solutions)
		},
	)
})

describe('buildWorkshopKin', () => {
	it('derives each fact with the product of its confidences, going forward', () => {
		const definition = buildWorkshopKin()
		const result = createDeductiveReasoner().reason({ member: 'gold' }, definition)
		if (!isDeductiveResult(result)) throw new Error('Expected a deductive result')

		expect(createDeductiveReasoner().validate(definition).valid).toBe(true)
		expect(result.success).toBe(true)
		expect(
			result.derived.map(({ predicate, terms, confidence }) => [predicate, terms, confidence]),
		).toEqual([
			['grandparent', ['alice', 'cara'], 0.855],
			['welcome', ['alice'], 0.855],
		])
	})

	it('proves the fact forward derives first, with the facts its premises matched, going backward', () => {
		const result = createDeductiveReasoner().reason({}, buildWorkshopKin('backward'))
		if (!isDeductiveResult(result)) throw new Error('Expected a deductive result')

		expect(
			result.derived.map(({ predicate, terms, confidence }) => [predicate, terms, confidence]),
		).toEqual([['grandparent', ['alice', 'cara'], 0.855]])
		expect(result.proof?.map((step) => step.deduction)).toEqual(['grandparent'])
		expect(result.proof?.[0]?.premises.map((fact) => fact.id)).toEqual(['ab', 'bc'])
	})
})

describe('buildSymbolicTrees', () => {
	const trees = buildSymbolicTrees()

	it('holds the leaves, every depth 1 and 2 shape, and the draws of depth 3, counted by hand', () => {
		const counts = [0, 1, 2, 3].map(
			(depth) => trees.filter((tree) => measureTree(tree) === depth).length,
		)

		expect(counts).toEqual([4, 160, 286, 200])
		expect(trees).toHaveLength(650)
	})

	it('nests every operation inside every operation', () => {
		const pairs = trees
			.slice(164, 450)
			.flatMap((tree) =>
				tree.form !== 'operation'
					? []
					: [tree.left, tree.right].flatMap((side) =>
							side?.form === 'operation' ? [`${tree.operator} ${side.operator}`] : [],
						),
			)

		expect(new Set(pairs).size).toBe(MATH_OPERATIONS.length ** 2)
	})

	it('leaves a right side out of the operations that read none, and of no other', () => {
		const pending = [...trees]
		for (const node of pending) {
			if (node.form !== 'operation') continue
			pending.push(node.left, ...(node.right === undefined ? [] : [node.right]))
		}

		expect(
			pending.filter(
				(node) =>
					node.form === 'operation' &&
					(node.right === undefined) !== ['round', 'ceil', 'floor', 'abs'].includes(node.operator),
			),
		).toEqual([])
	})
})

describe('parseSide', () => {
	const names = new Map([
		['a label', 'a'],
		['b', 'b'],
	])

	it('reads a text back into its tree, and a swapped operand back into its place', () => {
		expect(parseSide('a label', names)).toEqual(createVariable('a'))
		expect(parseSide('-2.5', names)).toEqual(createConstant(-2.5))
		expect(parseSide('10% of (a label + (-3))', names)).toEqual(
			createOperation(
				'percentage',
				createOperation('add', createVariable('a'), createConstant(-3)),
				createConstant(10),
			),
		)
		expect(parseSide('(a label) rounded to a whole number', names)).toEqual(
			createOperation('round', createVariable('a')),
		)
	})

	it('has no reading of a text with two, of an unknown name, or of a blank', () => {
		expect(parseSide('a label + b × b', names)).toBeUndefined()
		expect(parseSide('c', names)).toBeUndefined()
		expect(parseSide('', names)).toBeUndefined()
		expect(parseSide('a label + c', names)).toBeUndefined()
	})

	it('reads each operation the engine has once', () => {
		expect(SIDE_READINGS.map(([operator]) => operator)).toEqual([...MATH_OPERATIONS])
	})
})

describe('splitGroups', () => {
	it('marks each outermost group, and keeps its own text', () => {
		expect(splitGroups('(a (b)) + (c)')).toEqual({ flat: '§0 + §1', groups: ['a (b)', 'c'] })
		expect(splitGroups('a + b')).toEqual({ flat: 'a + b', groups: [] })
	})
})

describe('computeChanges', () => {
	it('computes each change the engine has, as the engine computes it', () => {
		for (const [operation, value, operand, text, changed] of TRANSFORM_READINGS) {
			expect([operation, computeChanges(value, text)]).toEqual([operation, changed])
			expect(applyOperation(operation, value, operand ?? 0)).toBe(changed)
		}
		expect(computeChanges(2, 'plus 3, then times 4')).toBe(20)
	})

	it('has no answer for a change it cannot read', () => {
		expect(computeChanges(2, 'plus')).toBeNaN()
		expect(computeChanges(2, '')).toBeNaN()
	})
})

describe('parseWordedRange', () => {
	it('reads every form a range prints in, and no other text', () => {
		expect(parseWordedRange('any value')).toEqual({})
		expect(parseWordedRange('at least 5')).toEqual({ minimum: 5 })
		expect(parseWordedRange('at most -2.5')).toEqual({ maximum: -2.5 })
		expect(parseWordedRange('3 to 8')).toEqual({ minimum: 3, maximum: 8 })
		expect(parseWordedRange('near 5')).toBeUndefined()
	})
})

describe('parseQuotedMember', () => {
	it('reads to the first closing mark with no backslash before it', () => {
		expect(parseQuotedMember('"a\\"b\\\\" or x', '"', '"')).toEqual({
			member: 'a"b\\',
			rest: ' or x',
		})
		expect(parseQuotedMember('<<a\\>>>b', '<<', '>>')).toEqual({ member: 'a>', rest: 'b' })
		expect(parseQuotedMember('a"', '"', '"')).toBeUndefined()
		expect(parseQuotedMember('"a\\"', '"', '"')).toBeUndefined()
	})
})

describe('parseListText', () => {
	it('reads a quoted list whole, and any other at its joining texts', () => {
		const joins = [', or ', ' or ', ', ']
		expect(parseListText('"a, b", "c", or "d"', joins, '"', '"')).toEqual(['a, b', 'c', 'd'])
		expect(parseListText('a, b, or c', joins, '"', '"')).toEqual(['a', 'b', 'c'])
		expect(parseListText('a or ""', joins, '"', '"')).toEqual(['a', ''])
		expect(parseListText('"q", "r"', joins, '"', '"')).toEqual(['q', 'r'])
		expect(parseListText('"q\\", \\"r"', joins, '"', '"')).toEqual(['q", "r'])
	})
})

describe('QUOTED_LISTS', () => {
	it('lists each list once, the pairs a quote with no mark would read alike among them', () => {
		expect(new Set(QUOTED_LISTS.map((list) => JSON.stringify(list))).size).toBe(QUOTED_LISTS.length)
		expect(QUOTED_LISTS.slice(0, 2)).toEqual([['"a', 'b"'], ['a or b']])
	})
})

describe('buildBandTables', () => {
	it('draws valid tables that hold every band, some with a fallback and some with none', () => {
		const tables = buildBandTables()
		const factors = tables.flatMap((table) => table.groups.flatMap((group) => group.factors))
		const bands = factors.flatMap(({ source }) => (source.origin === 'range' ? source.ranges : []))
		const reasoner = createQuantitativeReasoner()

		expect(tables.filter((table) => !reasoner.validate(table).valid)).toEqual([])
		expect(new Set(bands.map(({ bounds }) => JSON.stringify(bounds)))).toEqual(
			new Set(TABLE_BANDS.map(({ bounds }) => JSON.stringify(bounds))),
		)
		expect(new Set(factors.map(({ fallback }) => fallback))).toEqual(new Set([undefined, 99.5]))
	})
})

describe('WORKSHOP_GLOSSARY', () => {
	const compared = ['above', 'below', 'from', 'to', 'between', 'outside']

	it('labels every field path the definitions read, keyed by the display path', () => {
		const logical = [...buildWorkshopRules().rules, ...buildWorkshopGates().rules].flatMap((rule) =>
			rule.premises.flatMap(collectExpressionFields),
		)
		const quantitative = buildWorkshopScore()
			.groups.flatMap((group) => group.factors)
			.flatMap((factor) => [
				...(factor.source.origin === 'static' ? [] : [formatField(factor.source.field)]),
				...(factor.checks ?? []).map((check) => formatField(check.field)),
			])
		const symbolic = [buildWorkshopArea(), buildWorkshopCharge()]
			.flatMap((definition) => definition.equations)
			.flatMap((equation) => [
				...collectVariables(equation.left),
				...collectVariables(equation.right),
				equation.target,
			])
		const fees = [buildWorkshopFees(), buildWorkshopQuote()]
			.flatMap((definition) => definition.groups)
			.flatMap((group) => group.factors)
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
		const numeric = [...buildWorkshopRules().rules, ...buildWorkshopGates().rules].flatMap((rule) =>
			rule.premises
				.flatMap((premise) => extractAtoms(premise))
				.filter((atom) => compared.includes(atom.check.operator))
				.map((atom) => formatField(atom.check.field)),
		)

		expect(numeric).toEqual([
			...['terms.excess', 'start', 'score', 'noise', 'cost'],
			...['start', 'noise', 'cost', 'guests'],
		])
		expect(numeric.filter((field) => !Object.hasOwn(WORKSHOP_GLOSSARY.units, field))).toEqual([])
		expect(WORKSHOP_GLOSSARY.units).toEqual({
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
		})
		expect(WORKSHOP_GLOSSARY.values).toEqual({ score: 'count', fees: 'money', quote: 'money' })
	})

	it('gives a sentence to every predicate the deductive definitions name, but the subject one', () => {
		const named = [buildWorkshopFacts(), buildWorkshopKin()].flatMap(({ facts, deductions }) => [
			...facts,
			...deductions.flatMap(({ premises, conclusion }) => [...premises, conclusion]),
		])

		expect(
			[...new Set(named.map(({ predicate }) => predicate))]
				.filter((predicate) => predicate !== 'has')
				.toSorted(),
		).toEqual(Object.keys(WORKSHOP_GLOSSARY.predicates).toSorted())
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

// ── Family fixtures ──────────────────────────────────────────────────────────
// Each expectation in `FAMILY_*` is asserted against the engine that owns it: the real
// qualifier, rater, and program. The trees' findings are compared with the logical engine's own
// rule states, a second mechanism the qualifier's finding does not share.

describe('buildFamilyQualification', () => {
	const definition = buildFamilyQualification()
	const gates = definition.passes.flatMap((pass) => (pass.reasoning === 'logical' ? [pass] : []))
	const rules = gates.flatMap((pass) => pass.rules)
	const rulings = definition.rulings ?? []

	it('runs a quantitative pass before a logical one, and the rules read the number it derives', () => {
		expect(definition.passes.map((pass) => pass.reasoning)).toEqual(['quantitative', 'logical'])
		expect(definition.passes.map((pass) => pass.id)).toEqual(['load', 'gates'])
		expect(rules.flatMap((rule) => rule.premises.flatMap(collectExpressionFields))).toContain(
			'qualification.load',
		)
	})

	it('names at least eight rules, each with an authored name and a ruling', () => {
		expect(rules.length).toBeGreaterThanOrEqual(8)
		expect(rules.filter((rule) => rule.name === rule.id || rule.name === '')).toEqual([])
		expect(rulings.map((ruling) => ruling.rule).toSorted()).toEqual(
			rules.map((rule) => rule.id).toSorted(),
		)
		expect(
			rulings.filter((ruling) => !gates.some((pass) => findRule(pass, ruling.rule) !== undefined)),
		).toEqual([])
	})

	it('validates against the real qualifier', () => {
		const qualifier = createQualifier()
		const validation = qualifier.validate(definition)
		qualifier.destroy()

		expect(validation.errors).toEqual([])
		expect(validation.valid).toBe(true)
	})

	it('covers each effect with and without a scope, in two scopes, with and without a message', () => {
		expect(collectFamilyEffects(rulings, false)).toEqual([
			'condition',
			'condition',
			'referral',
			'restriction',
		])
		expect(collectFamilyEffects(rulings, true)).toEqual([
			'condition',
			'referral',
			'restriction',
			'restriction',
		])
		expect(collectFamilyUnique(rulings.flatMap((ruling) => ruling.scope ?? []))).toEqual([
			'deposit',
			'rent',
		])
		expect(
			rulings.filter((ruling) => ruling.message === undefined).map((ruling) => ruling.id),
		).toEqual(['crowded', 'visitor', 'unstaffed'])
		expect(rulings.filter((ruling) => ruling.message !== undefined)).toHaveLength(5)
	})

	it('holds one slot in a message and one in a rule description, each a token the qualifier fills', () => {
		const messages = rulings.filter((ruling) => findMessageTokens(ruling.message ?? '').length > 0)
		const described = rules.filter((rule) => findMessageTokens(rule.description ?? '').length > 0)

		expect(messages.map((ruling) => [ruling.id, findMessageTokens(ruling.message ?? '')])).toEqual([
			['restricted', ['activity']],
		])
		expect(described.map((rule) => [rule.id, findMessageTokens(rule.description ?? '')])).toEqual([
			['crowded', ['guests']],
		])
	})

	it('points rulings at a `not` over a compound, an `or`, an `implies`, and an `xor`', () => {
		expect(collectFamilyConnectives(gates, 'untrained')).toEqual(['not', 'or'])
		expect(collectFamilyConnectives(gates, 'visitor')).toEqual(['or'])
		expect(collectFamilyConnectives(gates, 'unstaffed')).toEqual(['implies'])
		expect(collectFamilyConnectives(gates, 'perk')).toEqual(['xor'])
		expect(
			rulings
				.filter((ruling) => !['untrained', 'visitor', 'unstaffed', 'perk'].includes(ruling.id))
				.flatMap((ruling) => collectFamilyConnectives(gates, ruling.rule)),
		).toEqual([])
	})
})

describe('FAMILY_SUBJECTS', () => {
	const qualifier = createQualifier()
	const definition = buildFamilyQualification()

	it.each(Object.entries(FAMILY_SUBJECTS))(
		'%s settles as the qualifier documents',
		(_name, expected) => {
			const result = qualifier.qualify(expected.subject, definition)
			expect(result.eligibility).toBe(expected.eligibility)
			expect(result.scopes).toEqual(expected.scopes)
			expect(
				Object.fromEntries(result.findings.map((finding) => [finding.id, finding.state])),
			).toEqual(expected.states)
			expect(
				Object.fromEntries(
					result.findings.flatMap((finding) =>
						finding.state === 'met' && finding.message !== undefined
							? [[finding.id, renderFamilyMessage(finding.message)]]
							: [],
					),
				),
			).toEqual(expected.messages)
			expect(result.success).toBe(expected.success)
			expect(result.refusals).toEqual([])
			expect(result.faults.map((fault) => formatField(fault.path))).toEqual(expected.faults)
			expect(
				result.derivations.flatMap((entry) =>
					entry.id === 'load' && entry.success ? [entry.value] : [],
				),
			).toEqual(expected.load === undefined ? [] : [expected.load])
		},
	)

	it('reaches every eligibility, effect, scope outcome, and finding state the definition names', () => {
		const results = collectFamilyQualified()
		const findings = results.flatMap(([, result]) => result.findings)
		expect(collectFamilyUnique(results.map(([, result]) => result.eligibility))).toEqual([
			'eligible',
			'ineligible',
			'referral',
		])
		expect(
			collectFamilyUnique(
				findings.flatMap((finding) => (finding.state === 'met' ? [finding.effect] : [])),
			),
		).toEqual(['condition', 'referral', 'restriction'])
		expect(
			collectFamilyUnique(results.flatMap(([, result]) => Object.values(result.scopes))),
		).toEqual(['eligible', 'ineligible', 'referral'])
		expect(
			collectFamilyUnique(
				findings.flatMap((finding) =>
					finding.state === 'met' && finding.scope !== undefined ? [finding.scope] : [],
				),
			),
		).toEqual(['deposit', 'rent'])
		expect(collectFamilyUnique(findings.map((finding) => finding.state))).toEqual([
			'met',
			'unmet',
			'unread',
		])
		for (const ruling of definition.rulings ?? []) {
			const own = findings.filter((finding) => finding.id === ruling.id)
			expect(own.some((finding) => finding.state === 'met')).toBe(true)
			expect(own.some((finding) => finding.state === 'unmet')).toBe(true)
		}
	})

	it('splits each message at its slots, each with the value its field holds', () => {
		const messages = collectFamilyQualified().flatMap(([, result]) =>
			result.findings.flatMap((finding) =>
				finding.message === undefined ? [] : [finding.message],
			),
		)

		expect(
			messages.flat().filter((part) => typeof part === 'string' && part.includes('{{')),
		).toEqual([])
		expect(messages).toContainEqual([
			'The workshop does not lend a room for ',
			{ field: ['activity'], actual: 'torch welding' },
			'.',
		])
		expect(renderFamilyMessage(['a ', { field: 'b', actual: 5 }, '.'])).toBe('a 5.')
	})

	it('reads every text of an account, and answers as another reasoner does but where told', () => {
		const line = buildAccountLine({ role: 'step', text: 'inner', summary: 'inner, whole' })
		const lines = [buildAccountLine({ role: 'verdict', text: 'outer', lines: [line] })]
		expect(collectWrittenTexts({ id: 'a', name: 'A', lines })).toEqual([
			'outer',
			'outer',
			'inner',
			'inner, whole',
		])
		const score = buildWorkshopScore()
		const answering = createAnsweringReasoner(createQuantitativeReasoner(), { success: false })
		expect(answering.supports(score)).toBe(true)
		expect(answering.validate(score).valid).toBe(true)
		expect(answering.reason(WORKSHOP_SCORES.gold?.subject ?? {}, score)).toEqual({
			...createQuantitativeReasoner().reason(WORKSHOP_SCORES.gold?.subject ?? {}, score),
			success: false,
		})
	})

	it('refuses two runs and refers one finding to a person, and a clean run refuses none', () => {
		const results = collectFamilyQualified()
		const refused = results.filter(([, result]) => !result.success).map(([name]) => name)

		expect(refused).toEqual(['unread', 'refused'])
		expect(
			results.find(([name]) => name === 'refused')?.[1].derivations.map((entry) => entry.success),
		).toEqual([false])
		qualifier.destroy()
	})
})

describe('buildFamilyRating', () => {
	const definition = buildFamilyRating()
	const factors = definition.lines.map((line) => line.rate.groups.flatMap((group) => group.factors))

	it('has a lookup line whose fallback equals one of its entries', () => {
		const lookup = factors[0]?.[0]

		expect(definition.lines.map((line) => line.id)).toEqual(['rent', 'fee', 'deposit'])
		expect(lookup?.source.origin).toBe('lookup')
		expect(lookup?.source.origin === 'lookup' ? Object.values(lookup.source.table) : []).toContain(
			lookup?.fallback,
		)
	})

	it('has a line with transforms and bounds, and a line with a required factor', () => {
		const field = factors[1]?.[0]
		const required = factors[2]?.[0]

		expect(field?.transforms).toHaveLength(2)
		expect(field?.bounds).toEqual({ minimum: 20, maximum: 100 })
		expect(required?.required).toBe(true)
		expect(required?.checks).toHaveLength(1)
	})

	it.each(Object.entries(FAMILY_RATINGS))('%s rates as the rater documents', (_name, expected) => {
		const rater = createRater()
		const result = rater.rate(definition, expected.subject)
		rater.destroy()

		expect(result.success).toBe(expected.success)
		expect(
			Object.fromEntries(
				result.lines.flatMap((line) => (line.amount === undefined ? [] : [[line.id, line.amount]])),
			),
		).toEqual(expected.amounts)
		expect(result.total).toBe(expected.total)
		expect(result.faults.map((fault) => formatField(fault.path))).toEqual(expected.faults)
	})

	it('tells the fallback from the entry it equals, and fails the required line without a fault', () => {
		const rater = createRater()
		const [studio, attic, costly] = ['standing', 'attic', 'costly'].map((name) =>
			rater.rate(definition, FAMILY_RATINGS[name]?.subject ?? {}),
		)
		rater.destroy()

		expect(studio?.lines[0]?.amount).toBe(80)
		expect(attic?.lines[0]?.amount).toBe(studio?.lines[0]?.amount)
		expect(costly?.lines[2]?.amount).toBeUndefined()
		expect(
			[studio, attic].map((rated) => rated?.lines[0]?.worksheet.groups[0]?.factors[0]?.fallback),
		).toEqual([false, true])
		expect(costly?.lines[2]?.worksheet.refusals).toEqual([
			{ cause: 'required', group: 'hold', factor: 'deposit' },
		])
		expect(costly?.refusals).toEqual([
			{ cause: 'required', path: ['deposit'], group: 'hold', factor: 'deposit' },
		])
		expect(costly?.faults).toEqual([])
		expect(costly?.total).toBeUndefined()
	})
})

describe('buildFamilyProgram', () => {
	const definition = buildFamilyProgram()
	const program = createProgram(definition)

	it('is valid, and holds the family qualification and rating, two notices, and an authority', () => {
		expect(program.validate().errors).toEqual([])
		expect(program.validate().valid).toBe(true)
		expect(definition.qualification).toEqual(buildFamilyQualification())
		expect(definition.rating).toEqual(buildFamilyRating())
		expect(definition.notices?.map((notice) => [notice.id, notice.scope])).toEqual([
			['closing', undefined],
			['due', 'rent'],
		])
		expect(definition.notices?.flatMap((notice) => findMessageTokens(notice.message))).toEqual([
			'room',
		])
		expect(definition.authority?.rules.map((rule) => rule.id)).toEqual(['heavy'])
	})

	it.each(Object.entries(FAMILY_PROGRAMS))(
		'%s executes as the program documents',
		(_name, expected) => {
			const result = program.execute(expected.subject)
			expect(result.eligibility).toBe(expected.eligibility)
			expect(result.status).toBe(expected.status)
			expect(result.disposition).toBe(expected.disposition)
			expect(
				result.determinations.map((determination) => ({
					id: determination.id,
					effect: determination.effect,
					...(determination.scope === undefined ? {} : { scope: determination.scope }),
					message: renderFamilyMessage(determination.message ?? []),
				})),
			).toEqual(expected.determinations)
			expect(
				result.determinations.filter((determination) => determination.state !== 'met'),
			).toEqual([])
			expect(result.success).toBe(expected.success)
			expect(result.faults.map((fault) => formatField(fault.path))).toEqual(expected.faults)
			expect(result.rating?.total).toBe(expected.total)
		},
	)

	it('reaches each of the six statuses, the three dispositions and none, and a limit', () => {
		const results = collectFamilyExecuted()
		expect(collectFamilyUnique(results.map(([, result]) => result.status))).toEqual(
			[...STATUSES].toSorted(),
		)
		expect(collectFamilyUnique(results.flatMap(([, result]) => result.disposition ?? []))).toEqual([
			'approved',
			'denied',
			'submitted',
		])
		expect(
			results.filter(([, result]) => result.disposition === undefined).map(([name]) => name),
		).toEqual(['costly', 'unread', 'heavy'])
		expect(
			results.flatMap(([, result]) =>
				result.determinations.filter((determination) => determination.effect === 'limit'),
			),
		).toHaveLength(1)
		expect(results.filter(([, result]) => !result.success).map(([name]) => name)).toEqual([
			'costly',
			'unread',
		])
		program.destroy()
	})
})

describe('FAMILY_GLOSSARY', () => {
	const qualification = buildFamilyQualification()
	const rating = buildFamilyRating()
	const program = buildFamilyProgram()
	const compared = ['above', 'below', 'from', 'to', 'between', 'outside']
	const atoms = qualification.passes
		.flatMap((pass) => (pass.reasoning === 'logical' ? pass.rules : []))
		.concat(program.authority?.rules ?? [])
		.flatMap((rule) => rule.premises.flatMap((premise) => extractAtoms(premise)))
	const reads = [
		...qualification.passes.flatMap(collectFamilySources),
		...rating.lines.flatMap((line) => collectFamilySources(line.rate)),
		...atoms.map((atom) => formatField(atom.check.field)),
	]

	it('labels every field read, the derived number, and the authority outcome, and nothing else', () => {
		expect([...new Set(reads)].toSorted()).toEqual(Object.keys(FAMILY_GLOSSARY.labels).toSorted())
		expect(reads).toContain('qualification.load')
		expect(reads).toContain('outcome.total')
		expect(Object.values(FAMILY_GLOSSARY.labels).filter((label) => label.trim() === '')).toEqual([])
	})

	it('gives a unit to every field compared as a number or summed, and a format to each unit it ships', () => {
		const numeric = [
			...atoms
				.filter((atom) => compared.includes(atom.check.operator))
				.map((atom) => formatField(atom.check.field)),
			// `room` is a lookup key, text rather than a number, so it takes no unit.
			...rating.lines
				.flatMap((line) => collectFamilySources(line.rate))
				.filter((field) => field !== 'room'),
		]
		const unshipped = Object.values(FAMILY_GLOSSARY.units).filter(
			(unit) => unit !== 'plain' && unit !== 'count',
		)

		expect(numeric.filter((field) => !Object.hasOwn(FAMILY_GLOSSARY.units, field))).toEqual([])
		expect(
			Object.keys(FAMILY_GLOSSARY.units).filter(
				(field) => !Object.hasOwn(FAMILY_GLOSSARY.labels, field),
			),
		).toEqual([])
		expect(unshipped.filter((unit) => !Object.hasOwn(FAMILY_GLOSSARY.formats, unit))).toEqual([])
		expect(new Intl.NumberFormat('en-US', FAMILY_GLOSSARY.formats.money).format(1250)).toBe(
			'$1,250.00',
		)
	})

	it('gives a unit to the rating and to each line by its definition id', () => {
		expect(Object.keys(FAMILY_GLOSSARY.values).toSorted()).toEqual(
			[rating.id, ...rating.lines.map((line) => line.rate.id)].toSorted(),
		)
	})

	it('names the scope no rating line names, and leaves the one a line names to the line', () => {
		const scopes = [
			...new Set([
				...(qualification.rulings ?? []).flatMap((ruling) => ruling.scope ?? []),
				...(program.notices ?? []).flatMap((notice) => notice.scope ?? []),
			]),
		].toSorted()

		expect(scopes).toEqual(['deposit', 'rent'])
		expect(scopes.filter((scope) => !rating.lines.some((line) => line.id === scope))).toEqual([])
		expect(Object.keys(FAMILY_GLOSSARY.scopes)).toEqual(['rent'])
		expect(rating.lines.find((line) => line.id === 'deposit')?.name).toBe('Deposit')
	})
})

describe('the continuation fixtures', () => {
	it('freezeFixture freezes everything a value reaches, and gives the same value', () => {
		const value = { list: [{ name: 'a' }], none: null, count: 1 }
		const frozen = freezeFixture(value)
		expect(frozen).toBe(value)
		expect([value, value.list, ...value.list].every((member) => Object.isFrozen(member))).toBe(true)
		const cycle: { self?: unknown } = {}
		cycle.self = cycle
		expect(Object.isFrozen(freezeFixture(cycle))).toBe(true)
		expect(freezeFixture('text')).toBe('text')
	})

	it('the continued turns name every corpus domain and one that none holds', () => {
		const extractor = createCorpusExtractor()
		const domains = CONTINUED_TURNS.map((text) => extractor.extract(text).intent.domain)
		expect(new Set(domains)).toEqual(new Set([...Object.keys(INTERPRET_DOMAINS), undefined]))
		expect(new Set(DISTRACTING_TURNS.map((text) => extractor.extract(text).intent.domain))).toEqual(
			new Set(Object.keys(INTERPRET_DOMAINS)),
		)
		expect(DISTRACTING_TURNS.filter((text) => CONTINUED_TURNS.includes(text))).toEqual([])
		expect(Object.keys(CONTINUED_VALUES).filter((text) => !CONTINUED_TURNS.includes(text))).toEqual(
			[],
		)
	})

	it('each amended turn has its own name, and states every entity it supplies as proposed', () => {
		expect(new Set(AMENDED_TURNS.map((turn) => turn.name)).size).toBe(AMENDED_TURNS.length)
		for (const { amendment, stated } of AMENDED_TURNS) {
			for (const { name, value } of amendment.entities ?? []) {
				expect(stated.filter((entity) => entity.name === name)).toMatchObject([
					{ value, provenance: { category: 'proposed' } },
				])
			}
			const names = stated.map((entity) => entity.name)
			expect((amendment.removed ?? []).filter((name) => names.includes(name))).toEqual([])
		}
	})

	it('builds an entity of each provenance an amendment meets', () => {
		expect(
			[
				buildStatedEntity('age', 25),
				buildProposedEntity('age', 25),
				buildCarriedEntity('age', 25),
			].map((entity) => [entity.name, entity.value, entity.provenance.category]),
		).toEqual([
			['age', 25, 'extracted'],
			['age', 25, 'proposed'],
			['age', 25, 'carried'],
		])
		expect(Object.hasOwn(buildProposedEntity('age', 25), 'field')).toBe(false)
		expect(buildProposedEntity('a.b', 1, ['a', 'b']).field).toEqual(['a', 'b'])
		expect(buildSuppliedEntity('a.b', 1, ['a', 'b'])).toEqual({
			...buildCarriedEntity('a.b', 1),
			field: ['a', 'b'],
			provenance: { category: 'carried', detail: 'proposed' },
		})
		expect(Object.hasOwn(buildSuppliedEntity('age', 25), 'field')).toBe(false)
	})

	it('the supplied amendment names a mapped, a defaulted, and a computed entity of the corpus', () => {
		const recipe = buildInsuranceRecipe()
		const names = (SUPPLIED_AMENDMENT.entities ?? []).map((entity) => entity.name)
		const mapped = recipe.mappings.map((mapping) => mapping.entity)
		const defaulted = collectShapeDefaults(recipe.shape).map((entry) => formatField(entry.field))
		const computed = recipe.computations.map((entry) => formatField(entry.field))
		expect(names).toEqual(['accidents', 'deductible', 'monthly'])
		expect(names.filter((name) => mapped.includes(name))).toEqual(['accidents'])
		expect(names.filter((name) => defaulted.includes(name) && !mapped.includes(name))).toEqual([
			'deductible',
		])
		expect(names.filter((name) => computed.includes(name))).toEqual(['monthly'])
		expect(SUPPLIED_TURNS.map((turn) => turn.open.length > 0)).toEqual([false, false, true])
	})

	it('the terms recipe defaults and computes nested fields that no mapping names', () => {
		const recipe = buildTermsRecipe()
		expect(collectShapeDefaults(recipe.shape).map((entry) => entry.field)).toEqual([['terms']])
		expect(recipe.computations.map((entry) => entry.field)).toEqual([['terms', 'total']])
		expect(recipe.mappings.map((entry) => entry.entity)).toEqual(['age'])
	})

	it('the rule chain nests one level of lines for each rule, under the verdict', () => {
		const chain = buildRuleChain(5)
		expect(chain.rules.map((rule) => rule.id)).toEqual(['r0', 'r1', 'r2', 'r3', 'r4'])
		const result = createLogicalReasoner().reason({ seed: true }, chain)
		expect(isLogicalResult(result) && result.conclusion).toBe('met')
		expect(measureLines([])).toBe(0)
	})

	it('the refused runs each refuse, under a name of their own', () => {
		const runs = buildRefusedRuns()
		expect(new Set(runs.map((run) => run.name)).size).toBe(runs.length)
		expect(runs.filter((run) => run.result.success).map((run) => run.name)).toEqual([])
		expect(runs.filter((run) => run.result.faults.length > 0).map((run) => run.name)).toEqual([])
		expect(runs.filter((run) => run.sentences.length !== run.result.refusals.length)).toEqual([])
		expect(runs.filter((run) => isDefinition(run.definition) !== run.admitted)).toEqual([])
		expect(isGlossary(REFUSED_GLOSSARY)).toBe(true)
		expect(createAnsweringEvaluator(() => 5).batch([], {})).toBe(5)
		expect(buildRefusedQuote([]).groups.map((group) => group.name)).toEqual(['Fees'])
		expect(buildGatedQuote('from', true).groups[0]?.factors[0]?.required).toBe(true)
		expect(buildRefusedTier('equals', 'group').rules).toHaveLength(2)
	})

	it('the family parts hold every member their guards read', () => {
		const { result, rating, line, group, factor, finding, slot } = FAMILY_PARTS
		expect(buildFamilyParts()).toEqual(FAMILY_PARTS)
		expect(result.rating).toEqual(rating)
		expect(rating.lines).toEqual([line])
		expect(line.worksheet.groups).toEqual([group])
		expect(group.factors).toEqual([factor])
		expect(finding.message).toContainEqual(slot)
	})

	it('collects an account of every family definition', () => {
		const ids = new Set(collectFamilyAccounts().map((account) => account.id))
		expect([...ids].toSorted()).toEqual(['program', 'qualification', 'rating'])
	})

	it('collects an account of every definition kind, and of each value', () => {
		const accounts = collectFixtureAccounts()
		const ids = new Set(accounts.map((account) => account.id))
		const definitions = [
			buildWorkshopRules(),
			buildWorkshopGates(),
			buildWorkshopScore(),
			buildWorkshopFees(),
			buildWorkshopQuote(),
			buildWorkshopArea(),
			buildWorkshopCharge(),
			buildWorkshopFacts(),
			buildWorkshopKin(),
		]
		expect(definitions.map((definition) => definition.id).filter((id) => !ids.has(id))).toEqual([])
		expect(new Set(accounts.map((account) => account.success))).toEqual(
			new Set([undefined, true, false]),
		)
		expect(collectEvidenceAccounts()).toHaveLength(EVIDENCE_VALUES.length * 3)
	})

	it('the merged glossary gives each table a word of either side alone, and one of both', () => {
		const { base, incoming, merged } = MERGED_GLOSSARY
		expect(Object.keys(base)).toEqual(Object.keys(incoming))
		expect(Object.keys(base)).toEqual(Object.keys(merged))
	})

	it('composes the stages after the two records the source holds, over what it is given', () => {
		const source = buildInterpretation()
		const composed = composeInterpretation(
			source,
			buildInsuranceRecipe(),
			[buildStatedEntity('accidents', 2)],
			[buildCarriedEntity('age', 40)],
			[],
		)
		expect(composed.subject).toMatchObject({ age: 40, accidents: 2 })
		expect(composed.stages.map((record) => record.stage)).toEqual(['clarify', 'format', 'generate'])
		expect(source.entities).toEqual([buildStatedEntity('age', 25)])
	})
})

describe('collectFamilyFindings', () => {
	const started = performance.now()
	const found = collectFamilyFindings()
	const elapsed = performance.now() - started
	const trees = buildExpressionTrees()

	it('pairs every tree with the finding for each of the twenty-seven subjects, in under ten seconds', () => {
		expect(found).toHaveLength(trees.length * collectTreeSubjects().length)
		expect(elapsed).toBeLessThan(10_000)
		expect(new Set(found.map((entry) => entry.tree.id)).size).toBe(trees.length)
	})

	it('cites one ruling on the tree rule, as a restriction', () => {
		expect(
			found.filter(
				(entry) =>
					entry.finding.id !== 'ruling' ||
					entry.finding.rule !== 'rule' ||
					entry.finding.pass !== entry.tree.id ||
					entry.finding.effect !== 'restriction',
			),
		).toEqual([])
	})

	it('settles each finding on the state the logical engine gives the tree rule', () => {
		const reasoner = createLogicalReasoner()
		const disagree = found.filter((entry) => {
			const result = reasoner.reason(entry.subject, entry.tree)
			return !isLogicalResult(result) || result.rules[0]?.state !== entry.finding.state
		})

		expect(disagree).toEqual([])
		expect([...new Set(found.map((entry) => entry.finding.state))].toSorted()).toEqual([
			'met',
			'unmet',
			'unread',
		])
	})
})

describe('FAMILY_WORDED', () => {
	it.each([0, 1, 2])(
		'rewords only worded members of result %i, keeping its shape and count',
		(position) => {
			const [, before, after] = requireValue(collectFamilyPairs()[position])
			const left = collectFamilyLeaves(before)
			const right = collectFamilyLeaves(after)

			expect(right.map(([path]) => path)).toEqual(left.map(([path]) => path))
			const changed = right.filter(
				([path, value], index) => !Object.is(value, left[index]?.[1]) && path !== '',
			)
			expect(changed.length).toBeGreaterThan(0)
			expect(changed.filter(([path]) => !FAMILY_WORDED_PATH.test(path))).toEqual([])
			expect(
				left.filter(
					([path], index) =>
						FAMILY_WORDED_PATH.test(path) && Object.is(left[index]?.[1], right[index]?.[1]),
				),
			).toEqual([])
			expect(after).not.toEqual(before)
		},
	)

	it('reaches a step and a trace entry among the results, and no text the packages gave up', () => {
		const pairs = collectFamilyPairs()
		const paths = pairs.flatMap(([, before]) => collectFamilyLeaves(before).map(([path]) => path))

		expect(paths.some((path) => /\.steps\.\d+\.name$/.test(path))).toBe(true)
		expect(paths.some((path) => /\.trace\.\d+$/.test(path))).toBe(true)
		expect(
			paths.filter((path) => /\.(label|expression|description)$|\.errors\./.test(path)),
		).toEqual([])
		const thrown = { cause: 'thrown', message: 'clock stopped' }
		expect(buildFamilyWording({ refusals: [thrown], trace: ['a'] })).toEqual({
			refusals: [thrown],
			trace: ['reworded .trace.0'],
		})
	})
})
