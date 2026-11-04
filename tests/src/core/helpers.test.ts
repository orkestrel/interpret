import type { Entity } from '@src/core'
import {
	arrayShape,
	nullableShape,
	numberShape,
	objectShape,
	optionalShape,
} from '@orkestrel/contract'
import {
	createConstant,
	createEquation,
	createOperation,
	createSymbolicDefinition,
	createSymbolicReasoner,
	createVariable,
} from '@orkestrel/reason'
import {
	applyReplacements,
	assertRecipe,
	assignEntities,
	buildSubject,
	canonicalize,
	canonicalizeNode,
	classifyIntent,
	collapseWhitespace,
	collectRequiredFields,
	collectShapeDefaults,
	createNarrator,
	describeRecipeShape,
	digestValue,
	extractNumbers,
	findEntityField,
	findAnchoredNumber,
	findFieldDescription,
	findForeignNumbers,
	findUnclaimedNumbers,
	isArrayField,
	isFieldFilled,
	isInterpretError,
	matchAlias,
	matchRecipe,
	renderSubject,
	resolveExpression,
	scoreSimilarity,
	scoreRecipe,
	setField,
	settleEntities,
	SubjectManager,
	tokenize,
	variablesOf,
} from '@src/core'
import { captureError } from '@orkestrel/test'
import { describe, expect, it } from 'vitest'
import {
	buildInterpretRecipe,
	EXTREME_NUMBERS,
	InterpretFixtureValue,
	OPEN_SHAPE,
	UNCOMPILABLE_SHAPE,
} from '../../setup.js'

// The interprets pure leaves — every function is referentially transparent
// (same inputs → same outputs, `.claude/rules/tests.md` § Test contract), so
// most tests double-invoke to
// pin run-twice determinism directly.

describe('applyReplacements / collapseWhitespace / tokenize', () => {
	it('replaces whole-word matches only, case-insensitively', () => {
		expect(applyReplacements("can't stop", { "can't": 'cannot' })).toBe('cannot stop')
		expect(applyReplacements('information', { in: 'IN' })).toBe('information')
		expect(applyReplacements('IN the room', { in: 'inside' })).toBe('inside the room')
	})

	it('matches a key holding regex metacharacters literally', () => {
		expect(applyReplacements('11 and 1+1', { '1+1': 'two' })).toBe('11 and two')
		expect(applyReplacements('egg and e.g', { 'e.g': 'for example' })).toBe('egg and for example')
	})

	it('collapses runs of whitespace and trims', () => {
		expect(collapseWhitespace('  a   b\t c ')).toBe('a b c')
		expect(collapseWhitespace('')).toBe('')
	})

	it('tokenizes lowercase, strips punctuation outside the numeric-safe allowlist', () => {
		expect(tokenize('The rate is 85%.')).toEqual(['the', 'rate', 'is', '85%.'])
		expect(tokenize('Hello, World!')).toEqual(['hello', 'world'])
		expect(tokenize('  ')).toEqual([])
	})
})

describe('extractNumbers', () => {
	it('extracts currency, thousands-comma, decimal, and percent forms', () => {
		expect(extractNumbers('income was $50,000, age 25')).toEqual([50000, 25])
		expect(extractNumbers('rate is 8.5%')).toEqual([8.5])
		expect(extractNumbers('no numbers here')).toEqual([])
	})

	it('extracts the plain-decimal-representable EXTREME_NUMBERS values (sign and exponent notation are out of contract)', () => {
		const plainDecimal = [0, 1, Number.MAX_SAFE_INTEGER, 0.1, 0.2, 0.3]
		for (const value of plainDecimal) {
			expect(EXTREME_NUMBERS).toContain(value)
			expect(extractNumbers(`value ${value}`)).toEqual([value])
		}
	})

	it('drops a leading minus sign — numbers-only extraction has no negation parsing', () => {
		expect(extractNumbers('delta is -1')).toEqual([1])
	})

	it('is deterministic across repeated calls', () => {
		const text = 'income was $50,000, age 25'
		expect(extractNumbers(text)).toEqual(extractNumbers(text))
	})
})

describe('assignEntities', () => {
	it('single mapping onto an array field collects every number, one included', () => {
		const mappings = [{ entity: 'readings', aliases: [], field: 'readings' }]
		const shape = objectShape({ readings: arrayShape(numberShape()) })
		expect(assignEntities([10, 20, 30], mappings, 'values 10 20 30', 0.8, shape)).toEqual([
			{
				name: 'readings',
				value: [10, 20, 30],
				provenance: { category: 'extracted', detail: 'collect' },
				confidence: 0.9,
			},
		])
		expect(assignEntities([42], mappings, 'value 42', 0.8, shape)).toEqual([
			{
				name: 'readings',
				value: [42],
				provenance: { category: 'extracted', detail: 'collect' },
				confidence: 0.9,
			},
		])
	})

	it('single mapping onto a scalar field takes an anchored number and collects none', () => {
		const mappings = [{ entity: 'age', aliases: [], field: 'age' }]
		const shape = objectShape({ age: numberShape() })
		expect(assignEntities([1, 2], mappings, 'one 1 two 2', 0.8, shape)).toEqual([])
		expect(assignEntities([25, 1], mappings, 'age 25 and one 1', 0.8, shape)).toEqual([
			{
				name: 'age',
				value: 25,
				provenance: { category: 'extracted', detail: 'keyword' },
				confidence: 1,
			},
		])
	})

	it('a number on an array field among many mappings lands as an array of one', () => {
		const mappings = [
			{ entity: 'age', aliases: [], field: 'age' },
			{ entity: 'scores', aliases: [], field: 'scores' },
		]
		const shape = objectShape({ age: numberShape(), scores: arrayShape(numberShape()) })
		const entities = assignEntities([25, 7], mappings, 'age 25, scores 7', 0.8, shape)
		expect(entities.find((entity) => entity.name === 'scores')?.value).toEqual([7])
		expect(entities.find((entity) => entity.name === 'age')?.value).toBe(25)
	})

	it('keyword-proximity: exact entity-name token wins at CONFIDENCE_EXACT', () => {
		const mappings = [
			{ entity: 'rate', aliases: ['value'], field: 'rate' },
			{ entity: 'score', aliases: ['credit score'], field: 'score' },
		]
		const entities = assignEntities(
			[0.85, 720],
			mappings,
			'the rate is 0.85 and the score is 720',
			0.8,
			OPEN_SHAPE,
		)
		const rate = entities.find((entity) => entity.name === 'rate')
		expect(rate?.value).toBe(0.85)
		expect(rate?.confidence).toBe(1)
		expect(rate?.provenance).toEqual({ category: 'extracted', detail: 'keyword' })
	})

	it('load-bearing corpus pin: "score 85 near \'score\'" assigns to the score field', () => {
		const mappings = [{ entity: 'score', aliases: ['credit score'], field: 'score' }]
		const entities = assignEntities([85], mappings, 'the score is 85', 0.8, OPEN_SHAPE)
		expect(entities).toEqual([
			{
				name: 'score',
				value: 85,
				provenance: { category: 'extracted', detail: 'keyword' },
				confidence: 1,
			},
		])
	})

	it('load-bearing corpus pin: "age…is 25" / "income was $50,000" — two mappings, keyword proximity', () => {
		const mappings = [
			{ entity: 'age', aliases: ['years old'], field: 'age' },
			{ entity: 'income', aliases: [], field: 'income' },
		]
		const entities = assignEntities(
			[25, 50000],
			mappings,
			'age is 25, income was $50,000',
			0.8,
			OPEN_SHAPE,
		)
		expect(entities.find((entity) => entity.name === 'age')?.value).toBe(25)
		expect(entities.find((entity) => entity.name === 'income')?.value).toBe(50000)
	})

	it('locates an entity token holding a regex metacharacter literally', () => {
		const mappings = [
			{ entity: 'net.pay', aliases: [], field: 'pay' },
			{ entity: 'other', aliases: [], field: 'other' },
		]
		const entities = assignEntities(
			[100, 200, 5],
			mappings,
			'net.pay 100 then netxpay 200 other 5',
			0.8,
			OPEN_SHAPE,
		)
		expect(entities.find((entity) => entity.name === 'net.pay')).toEqual({
			name: 'net.pay',
			value: 100,
			provenance: { category: 'extracted', detail: 'keyword' },
			confidence: 1,
		})
	})

	it('no anchor fills no field, because position is a guess', () => {
		const mappings = [
			{ entity: 'width', aliases: [], field: 'width' },
			{ entity: 'height', aliases: [], field: 'height' },
		]
		expect(assignEntities([4, 8], mappings, 'dimensions 4 8', 0.8, OPEN_SHAPE)).toEqual([])
	})

	it('an anchor claims nothing across a clause, nor from a tie', () => {
		const mappings = [
			{ entity: 'rate', aliases: [], field: 'rate' },
			{ entity: 'term', aliases: [], field: 'term' },
		]
		expect(
			assignEntities([7], mappings, 'the rate, then term 7', 0.8, OPEN_SHAPE).map(
				(entity) => entity.name,
			),
		).toEqual(['term'])
		expect(assignEntities([5, 7], mappings, '5 rate 7', 0.8, OPEN_SHAPE)).toEqual([])
		expect(
			assignEntities([5, 7], mappings, '5  rate 7', 0.8, OPEN_SHAPE).map((entity) => entity.value),
		).toEqual([7])
	})

	it('a number goes to the anchor nearest it, and a farther one takes no other', () => {
		const mappings = [
			{ entity: 'rate', aliases: [], field: 'rate' },
			{ entity: 'term', aliases: [], field: 'term' },
		]
		const entities = assignEntities([7, 900], mappings, 'rate term 7 and more 900', 0.8, OPEN_SHAPE)
		expect(entities.map((entity) => entity.name)).toEqual(['term'])
		expect(entities[0]?.value).toBe(7)
	})

	it('a number two anchors sit equally close to goes to neither', () => {
		const mappings = [
			{ entity: 'rate', aliases: [], field: 'rate' },
			{ entity: 'term', aliases: [], field: 'term' },
		]
		expect(assignEntities([7], mappings, 'rate 7 term', 0.8, OPEN_SHAPE)).toEqual([])
	})

	it('an anchor never claims the digits inside its own word', () => {
		const mappings = [{ entity: '401k', aliases: [], field: 'plan' }]
		expect(assignEntities([401], mappings, '401k balance', 0.8, OPEN_SHAPE)).toEqual([])
	})

	it('a number the extractor did not read shifts nothing and is not claimed', () => {
		const mappings = [
			{ entity: 'age', aliases: [], field: 'age' },
			{ entity: 'rate', aliases: [], field: 'rate' },
		]
		const huge = '9'.repeat(400)
		const entities = assignEntities([5], mappings, `age ${huge}, rate 5`, 0.8, OPEN_SHAPE)
		expect(entities.map((entity) => [entity.name, entity.value])).toEqual([['rate', 5]])
		const injected = assignEntities([25], mappings, 'age 25, rate 5', 0.8, OPEN_SHAPE)
		expect(injected.map((entity) => [entity.name, entity.value])).toEqual([['age', 25]])
	})

	it('an anchor after a character that changes length in lower case still sits where it is', () => {
		const mappings = [{ entity: 'age', aliases: [], field: 'age' }]
		const entities = assignEntities([30], mappings, '\u0130\u0130 age 30', 0.8, OPEN_SHAPE)
		expect(entities[0]?.value).toBe(30)
	})

	it('alias fuzzy match uses the dynamic matchAlias score as confidence', () => {
		const mappings = [{ entity: 'amount', aliases: ['dollars'], field: 'amount' }]
		const secondMapping = [{ entity: 'other', aliases: ['euros'], field: 'other' }]
		const entities = assignEntities(
			[10, 20],
			[...mappings, ...secondMapping],
			'dollar 10, euro 20',
			0.5,
			OPEN_SHAPE,
		)
		expect(entities.length).toBeGreaterThan(0)
		for (const entity of entities) {
			expect(entity.confidence).toBeGreaterThan(0)
			expect(entity.confidence).toBeLessThanOrEqual(1)
		}
	})

	it('fills only the mapping an anchor names, and leaves the other to ask', () => {
		const mappings = [
			{ entity: 'age', aliases: ['years old'], field: 'age' },
			{ entity: 'score', aliases: ['credit score'], field: 'score' },
		]
		const entities = assignEntities(
			[25, 720],
			mappings,
			'25 year old with score 720',
			0.8,
			OPEN_SHAPE,
		)
		expect(entities.map((entity) => entity.name)).toEqual(['score'])
		expect(entities.map((entity) => entity.value)).toEqual([720])
	})

	it('is deterministic across repeated calls', () => {
		const mappings = [
			{ entity: 'age', aliases: [], field: 'age' },
			{ entity: 'income', aliases: [], field: 'income' },
		]
		const text = 'age is 25, income was $50,000'
		expect(assignEntities([25, 50000], mappings, text, 0.8, OPEN_SHAPE)).toEqual(
			assignEntities([25, 50000], mappings, text, 0.8, OPEN_SHAPE),
		)
	})
})

describe('classifyIntent', () => {
	it('pinned confidence formula: both fire → average; one fires → half; neither → 0', () => {
		const actions = { calculate: 'compute' }
		const domains = { rating: ['rate'] }
		expect(classifyIntent('calculate my rate', actions, domains)).toEqual({
			action: 'compute',
			domain: 'rating',
			confidence: 1,
		})
		expect(classifyIntent('calculate something', actions, {})).toEqual({
			action: 'compute',
			confidence: 0.5,
		})
		expect(classifyIntent('the rate please', {}, domains)).toEqual({
			domain: 'rating',
			confidence: 0.5,
		})
		expect(classifyIntent('hello there', {}, {})).toEqual({ confidence: 0 })
	})

	it('leaves an unmatched axis absent rather than an empty string', () => {
		const unclassified = classifyIntent('hello there', {}, {})
		expect(unclassified.action).toBeUndefined()
		expect(unclassified.domain).toBeUndefined()
		expect(Object.hasOwn(unclassified, 'action')).toBe(false)
		expect(Object.hasOwn(unclassified, 'domain')).toBe(false)
		const halfClassified = classifyIntent('calculate something', { calculate: 'compute' }, {})
		expect(halfClassified.action).toBe('compute')
		expect(Object.hasOwn(halfClassified, 'domain')).toBe(false)
	})

	it('never auto-classifies from a domain name absent from the caller vocabulary', () => {
		expect(classifyIntent('arithmetic please', {}, {})).toEqual({ confidence: 0 })
	})

	it('is deterministic across repeated calls', () => {
		const actions = { calculate: 'compute' }
		const domains = { rating: ['rate'] }
		const text = 'calculate my rate'
		expect(classifyIntent(text, actions, domains)).toEqual(classifyIntent(text, actions, domains))
	})
})

describe('scoreSimilarity / matchAlias', () => {
	it('scores 1 for exact case-insensitive match, 0 for short/disjoint strings', () => {
		expect(scoreSimilarity('Rate', 'rate')).toBe(1)
		expect(scoreSimilarity('a', 'ab')).toBe(0)
		expect(scoreSimilarity('rate', 'value')).toBe(0)
	})

	it('matchAlias returns the best score at or above threshold, else 0 (explicit no-match)', () => {
		expect(matchAlias('value', ['value'], 0.8)).toBe(1)
		expect(matchAlias('xyz', ['value', 'amount'], 0.8)).toBe(0)
	})
})

describe('canonicalize / canonicalizeNode / digestValue', () => {
	it('canonicalize is key-order independent for records', () => {
		expect(canonicalize({ b: 1, a: 2 })).toBe(canonicalize({ a: 2, b: 1 }))
	})

	it('canonicalize starts the leaf from an empty ancestor path', () => {
		const subject = { b: 1, a: 2 }
		expect(canonicalize(subject)).toBe('{"a":2,"b":1}')
		expect(canonicalize(subject)).toBe(canonicalizeNode(subject, new Set()))
	})

	it('canonicalizeNode renders a node already on the ancestor path as the cycle marker', () => {
		const subject = { age: 25 }
		expect(canonicalizeNode(subject, new Set([subject]))).toBe('"[cycle]"')
		const items = [1, 2]
		expect(canonicalizeNode(items, new Set([items]))).toBe('"[cycle]"')
	})

	it('canonicalizeNode keeps a sibling repeat of one object out of the cycle branch', () => {
		const shared = { a: 1 }
		expect(canonicalizeNode({ left: shared, right: shared }, new Set())).toBe(
			'{"left":{"a":1},"right":{"a":1}}',
		)
	})

	it('digestValue is key-order independent and deterministic', () => {
		const a = digestValue({ subject: { age: 25, income: 50000 }, recipe: 't1' })
		const b = digestValue({ recipe: 't1', subject: { income: 50000, age: 25 } })
		expect(a).toBe(b)
		expect(digestValue({ x: 1 })).toBe(digestValue({ x: 1 }))
	})

	it('digestValue differs for structurally different values', () => {
		expect(digestValue({ x: 1 })).not.toBe(digestValue({ x: 2 }))
	})

	it('canonicalize is cycle-safe: a self-referential record terminates and renders the cycle marker', () => {
		const subject: Record<string, unknown> = { age: 25 }
		subject.self = subject
		expect(() => canonicalize(subject)).not.toThrow()
		expect(canonicalize(subject)).toContain('[cycle]')
	})

	it('digestValue on a self-referential record terminates and yields a stable digest', () => {
		const subject: Record<string, unknown> = { age: 25 }
		subject.self = subject
		const digest = new InterpretFixtureValue('')
		expect(() => {
			digest.value = digestValue(subject)
		}).not.toThrow()
		expect(digestValue(subject)).toBe(digest.value)
	})

	it('SubjectManager.add on a self-referential subject terminates and stores a stable hash', () => {
		const subject: Record<string, unknown> = { age: 25 }
		subject.self = subject
		const manager = new SubjectManager()
		const record = new InterpretFixtureValue<ReturnType<typeof manager.add> | undefined>(undefined)
		expect(() => {
			record.value = manager.add(subject)
		}).not.toThrow()
		expect(record.value?.hash).toBe(digestValue(subject))
	})
})

describe('setField', () => {
	it('refuses an unsafe segment at a NESTED position and pollutes no prototype', () => {
		const first = setField({}, ['a', '__proto__'], { polluted: true })
		expect(first).toEqual({})
		expect(Reflect.get({}, 'polluted')).toBeUndefined()
		expect(Object.getOwnPropertyDescriptor(Object.prototype, 'polluted')).toBeUndefined()

		const second = setField({}, ['a', 'constructor', 'b'], true)
		expect(second).toEqual({})
		expect(Reflect.get({}, 'polluted')).toBeUndefined()
		expect(Object.getOwnPropertyDescriptor(Object.prototype, 'polluted')).toBeUndefined()
	})

	it('refuses each of __proto__, prototype, and constructor at the leading and the final segment', () => {
		const input = { a: 1 }
		for (const segment of ['__proto__', 'prototype', 'constructor']) {
			expect(setField(input, [segment, 'b'], 2)).toBe(input)
			expect(setField(input, ['a', segment], 2)).toBe(input)
			expect(setField(input, segment, 2)).toBe(input)
		}
		expect(input).toEqual({ a: 1 })
	})

	it('nested copy-on-write: input and its nested sub-record stay untouched, output is reference-distinct at every level', () => {
		const nested = { x: 1 }
		const input = { a: nested }
		const output = setField(input, ['a', 'y'], 2)

		expect(input).toEqual({ a: { x: 1 } })
		expect(input.a).toBe(nested)
		expect(output).not.toBe(input)
		expect(Reflect.get(output, 'a')).not.toBe(nested)
		expect(output).toEqual({ a: { x: 1, y: 2 } })
	})

	it('a scalar or array at an intermediate segment is replaced by a fresh record', () => {
		expect(setField({ a: 5 }, ['a', 'b'], 1)).toEqual({ a: { b: 1 } })
		expect(setField({ a: [1, 2, 3] }, ['a', 'b'], 1)).toEqual({ a: { b: 1 } })
	})

	it('an empty path returns the input unchanged', () => {
		const input = { a: 1 }
		expect(setField(input, [], 2)).toBe(input)
	})

	it('a plain string field behaves identically to its single-element array form', () => {
		expect(setField({ age: 25 }, 'age', 30)).toEqual(setField({ age: 25 }, ['age'], 30))
		expect(setField({}, 'address', { city: 'Reno' })).toEqual(
			setField({}, ['address'], { city: 'Reno' }),
		)
	})
})

describe('scoreRecipe / matchRecipe', () => {
	it('scores domain + action match as their mean', () => {
		const recipe = buildInterpretRecipe()
		expect(scoreRecipe({ action: 'calculate', domain: 'arithmetic', confidence: 1 }, recipe)).toBe(
			1,
		)
		expect(scoreRecipe({ action: 'nope', domain: 'arithmetic', confidence: 1 }, recipe)).toBe(0.5)
		expect(scoreRecipe({ action: 'nope', domain: 'other', confidence: 1 }, recipe)).toBe(0)
	})

	it('scores an absent axis as no match on that half', () => {
		const recipe = buildInterpretRecipe()
		expect(scoreRecipe({ domain: 'arithmetic', confidence: 0.5 }, recipe)).toBe(0.5)
		expect(scoreRecipe({ action: 'calculate', confidence: 0.5 }, recipe)).toBe(0.5)
		expect(scoreRecipe({ confidence: 0 }, recipe)).toBe(0)
	})

	it('matchRecipe returns undefined on an empty registry (explicit no-match, never recipes[0])', () => {
		expect(matchRecipe({ confidence: 0 }, [], 0.3)).toBeUndefined()
	})

	it('matchRecipe refuses an unclassified intent against a real recipe', () => {
		expect(matchRecipe({ confidence: 0 }, [buildInterpretRecipe()], 0.3)).toBeUndefined()
	})

	it('matchRecipe returns undefined when the best score is below floor', () => {
		const recipe = buildInterpretRecipe()
		expect(
			matchRecipe({ action: 'nope', domain: 'nope', confidence: 1 }, [recipe], 0.3),
		).toBeUndefined()
	})

	it('matchRecipe returns the best-scoring recipe at or above floor', () => {
		const recipe = buildInterpretRecipe()
		expect(
			matchRecipe({ action: 'calculate', domain: 'arithmetic', confidence: 1 }, [recipe], 0.3),
		).toBe(recipe)
	})
})

describe('variablesOf', () => {
	it('collects variable names in first-occurrence order, deduplicated', () => {
		const tree = createOperation(
			'add',
			createVariable('x'),
			createOperation('multiply', createVariable('y'), createVariable('x')),
		)
		expect(variablesOf(tree)).toEqual(['x', 'y'])
	})

	it('returns empty for a tree with no variables', () => {
		expect(variablesOf(createConstant(1))).toEqual([])
	})
})

describe('resolveExpression', () => {
	it('resolves a simple division (deductible/12)', () => {
		expect(
			resolveExpression(
				createOperation('divide', createVariable('deductible'), createConstant(12)),
				{
					deductible: 6000,
				},
			),
		).toBeCloseTo(500, 10)
	})

	it('divide-by-zero becomes a gap (undefined), never NaN on the subject', () => {
		expect(
			resolveExpression(createOperation('divide', createConstant(1), createConstant(0)), {}),
		).toBeUndefined()
	})

	it('an unresolved input variable is a gap', () => {
		expect(resolveExpression(createVariable('missing'), {})).toBeUndefined()
		expect(
			resolveExpression(createOperation('add', createVariable('missing'), createConstant(1)), {}),
		).toBeUndefined()
	})

	it('unary operations (round/ceil/floor/abs) ignore the absent right operand', () => {
		expect(resolveExpression(createOperation('floor', createConstant(2.7)), {})).toBe(2)
		expect(resolveExpression(createOperation('abs', createConstant(-4)), {})).toBe(4)
	})

	it('is deterministic across repeated calls', () => {
		const tree = createOperation('divide', createVariable('deductible'), createConstant(12))
		expect(resolveExpression(tree, { deductible: 6000 })).toBe(
			resolveExpression(tree, { deductible: 6000 }),
		)
	})

	describe('EXTREME_NUMBERS through a computed expression', () => {
		it('adding 0 to every extreme value returns it unchanged (finite stays finite)', () => {
			for (const value of EXTREME_NUMBERS) {
				const tree = createOperation('add', createVariable('x'), createConstant(0))
				// `-0 + 0` is `+0` by IEEE-754 addition (not `Object.is`-equal to `-0`), so this
				// probes numeric EQUALITY, not bitwise identity — the one EXTREME_NUMBERS entry
				// that legitimately changes representation under `+0` addition.
				expect(resolveExpression(tree, { x: value })).toBe(value === 0 ? 0 : value)
			}
		})

		it('an overflowing multiply (MAX_VALUE * MAX_VALUE) becomes a gap, not Infinity', () => {
			const tree = createOperation(
				'multiply',
				createConstant(Number.MAX_VALUE),
				createConstant(Number.MAX_VALUE),
			)
			expect(resolveExpression(tree, {})).toBeUndefined()
		})

		it('dividing the smallest EXTREME_NUMBERS value by a huge constant stays finite', () => {
			const tree = createOperation(
				'divide',
				createConstant(Number.MIN_VALUE),
				createConstant(Number.MAX_VALUE),
			)
			const result = resolveExpression(tree, {})
			expect(result).toBeDefined()
			expect(Number.isFinite(result)).toBe(true)
		})

		it('EPSILON survives an add/subtract round trip through the tree', () => {
			const tree = createOperation(
				'subtract',
				createOperation('add', createVariable('base'), createConstant(Number.EPSILON)),
				createConstant(Number.EPSILON),
			)
			expect(resolveExpression(tree, { base: 1 })).toBeCloseTo(1, 15)
		})
	})

	describe('absent-operand parity with the engine (SymbolicReasoner)', () => {
		it('add with absent right is a gap in resolveExpression, and the engine refuses it', () => {
			const node = createOperation('add', createVariable('x'))
			const definition = createSymbolicDefinition(
				'd',
				'D',
				[createEquation('e1', createConstant(0), node, 'result')],
				{ variables: { x: 5 } },
			)
			expect(resolveExpression(node, { x: 5 })).toBeUndefined()
			expect(createSymbolicReasoner().reason({}, definition).success).toBe(false)
		})

		it('multiply with absent right is a gap too, never an identity', () => {
			const node = createOperation('multiply', createVariable('x'))
			expect(resolveExpression(node, { x: 5 })).toBeUndefined()
		})

		it('divide with absent right is a gap here and NaN→gap in the engine (both non-finite)', () => {
			const node = createOperation('divide', createVariable('x'))
			const viaHelper = resolveExpression(node, { x: 5 })
			const definition = createSymbolicDefinition(
				'd',
				'D',
				[createEquation('e1', createConstant(0), node, 'result')],
				{
					variables: { x: 5 },
				},
			)
			const result = createSymbolicReasoner().reason({}, definition)
			expect(viaHelper).toBeUndefined()
			expect(result.success).toBe(false)
		})
	})
})

describe('renderSubject', () => {
	it('renders a subject with sorted fields, through a narrator', () => {
		const narrator = createNarrator()
		expect(renderSubject({ income: 50000, age: 25 }, narrator)).toBe('with age: 25, income: 50000')
		expect(renderSubject({}, narrator)).toBe('with no fields')
	})

	it('renders through a narrator with a labels override, a phrases.units entry, and a matching formatter', () => {
		const narrator = createNarrator({
			lexicon: {
				labels: { income: 'Annual income' },
				phrases: { units: { income: 'money' } },
			},
			formatters: { money: (value) => `$${String(value)}` },
		})
		expect(renderSubject({ income: 50000 }, narrator)).toBe('with Annual income: $50000')
	})

	it('renders a subject with an array-of-fields value and a non-number value through the plain path', () => {
		const narrator = createNarrator()
		expect(renderSubject({ tags: ['a', 'b'], name: 'Ada' }, narrator)).toBe(
			'with name: Ada, tags: a,b',
		)
	})
})

describe("the recipe's shape", () => {
	const entity: Entity = {
		name: 'age',
		value: 25,
		provenance: { category: 'extracted' },
		confidence: 1,
	}

	it("findEntityField reads the entity's own field, then its mapping, then its name", () => {
		const mappings = [{ entity: 'age', aliases: [], field: ['person', 'age'] }]
		expect(findEntityField({ ...entity, field: ['x'] }, mappings)).toEqual(['x'])
		expect(findEntityField(entity, mappings)).toEqual(['person', 'age'])
		expect(findEntityField(entity, [])).toBe('age')
	})

	it('buildSubject lands each entity on its field', () => {
		expect(
			buildSubject([entity, { ...entity, name: 'rate', field: ['terms', 'rate'], value: 3 }], []),
		).toEqual({ age: 25, terms: { rate: 3 } })
	})

	it('isArrayField reads an array and a nullable array, and nothing else', () => {
		const shape = objectShape({
			a: arrayShape(numberShape()),
			b: nullableShape(arrayShape(numberShape())),
			c: optionalShape(arrayShape(numberShape())),
			d: numberShape(),
			e: nullableShape(numberShape()),
		})
		expect(isArrayField(shape, 'a')).toBe(true)
		expect(isArrayField(shape, 'b')).toBe(true)
		expect(isArrayField(shape, 'c')).toBe(true)
		expect(isArrayField(shape, 'd')).toBe(false)
		expect(isArrayField(shape, 'e')).toBe(false)
		expect(isArrayField(shape, 'absent')).toBe(false)
	})

	it('findUnclaimedNumbers takes one number per claim, and reads an array by element', () => {
		expect(findUnclaimedNumbers([25, 700], [entity])).toEqual([700])
		expect(findUnclaimedNumbers([25, 25], [entity])).toEqual([25])
		expect(findUnclaimedNumbers([1, 2, 3], [{ ...entity, value: [1, 3] }])).toEqual([2])
		expect(findUnclaimedNumbers([], [entity])).toEqual([])
	})

	it('findAnchoredNumber claims the one number nearest in the clause', () => {
		const rate = { start: 0, end: 4 }
		const claimed = findAnchoredNumber('rate 5', rate, [{ start: 5, end: 6 }])
		expect(claimed).toEqual({ index: 0, gap: 1 })
		expect(findAnchoredNumber('401k', { start: 0, end: 4 }, [{ start: 0, end: 3 }])).toBeUndefined()
		expect(
			findAnchoredNumber('rate 5, term 7', rate, [
				{ start: 5, end: 6 },
				{ start: 13, end: 14 },
			])?.index,
		).toBe(0)
		expect(
			findAnchoredNumber('5 rate 7', { start: 2, end: 6 }, [
				{ start: 0, end: 1 },
				{ start: 7, end: 8 },
			]),
		).toBeUndefined()
		expect(findAnchoredNumber('rate, term 7', rate, [{ start: 11, end: 12 }])).toBeUndefined()
		expect(
			findAnchoredNumber('rate 5 and term 7', { start: 11, end: 15 }, [
				{ start: 5, end: 6 },
				{ start: 16, end: 17 },
			])?.index,
		).toBe(1)
		expect(findAnchoredNumber('rate 1,200 today', rate, [{ start: 5, end: 10 }])?.index).toBe(0)
		expect(findAnchoredNumber('rate 1.5 today', rate, [{ start: 5, end: 8 }])?.index).toBe(0)
		expect(findAnchoredNumber('rate: 6', rate, [{ start: 6, end: 7 }])?.index).toBe(0)
		expect(findAnchoredNumber('rate', rate, [])).toBeUndefined()
	})

	it('findFieldDescription reads through optional and nullable', () => {
		const shape = objectShape({
			a: numberShape({ description: 'A?' }),
			b: optionalShape(numberShape({ description: 'B?' })),
			c: nullableShape(numberShape({ description: 'C?' })),
			d: numberShape(),
		})
		expect(findFieldDescription(shape, 'a')).toBe('A?')
		expect(findFieldDescription(shape, 'b')).toBe('B?')
		expect(findFieldDescription(shape, 'c')).toBe('C?')
		expect(findFieldDescription(shape, 'd')).toBeUndefined()
		expect(findFieldDescription(shape, 'absent')).toBeUndefined()
	})

	it('collectShapeDefaults, given the subject so far, answers only what the door would fill', () => {
		const shape = objectShape({
			a: optionalShape(numberShape(), { default: 1 }),
			b: optionalShape(objectShape({ c: optionalShape(numberShape(), { default: 2 }) })),
			d: objectShape({ e: optionalShape(numberShape(), { default: 3 }) }),
		})
		expect(collectShapeDefaults(shape, {})).toEqual([{ field: ['a'], value: 1 }])
		expect(collectShapeDefaults(shape, { a: 9 })).toEqual([])
		expect(collectShapeDefaults(shape, { a: 9, b: {} })).toEqual([{ field: ['b', 'c'], value: 2 }])
		expect(collectShapeDefaults(shape, { a: 9, d: { e: 5 } })).toEqual([])
		expect(collectShapeDefaults(shape, { a: 9, d: {} })).toEqual([{ field: ['d', 'e'], value: 3 }])
		expect(collectShapeDefaults(shape, { a: undefined })).toEqual([{ field: ['a'], value: 1 }])
	})

	it('collectShapeDefaults walks objects and stops at a default', () => {
		const shape = objectShape({
			a: optionalShape(numberShape(), { default: 1 }),
			b: optionalShape(numberShape()),
			c: objectShape({ d: optionalShape(numberShape(), { default: 2 }) }),
			e: optionalShape(objectShape({ f: numberShape() }), { default: { f: 3 } }),
			g: nullableShape(objectShape({ h: optionalShape(numberShape(), { default: 4 }) })),
			i: arrayShape(numberShape()),
		})
		expect(collectShapeDefaults(shape)).toEqual([
			{ field: ['a'], value: 1 },
			{ field: ['c', 'd'], value: 2 },
			{ field: ['e'], value: { f: 3 } },
			{ field: ['g', 'h'], value: 4 },
		])
	})

	it('settleEntities takes the admitted value and adds what the door filled', () => {
		const settled = settleEntities(
			[{ ...entity, name: 'code', value: 42 }],
			[
				{ entity: 'code', aliases: [], field: 'code' },
				{ entity: 'length', aliases: [], field: 'term' },
			],
			{
				subject: { code: '42', term: 12, extra: { rate: 3 } },
				faults: [],
				repairs: [],
				defaulted: ['term', ['extra', 'rate']],
				errors: [],
			},
		)
		expect(settled).toEqual([
			{ ...entity, name: 'code', value: '42' },
			{ name: 'length', value: 12, provenance: { category: 'default' }, confidence: 1 },
			{
				name: 'extra.rate',
				field: ['extra', 'rate'],
				value: 3,
				provenance: { category: 'default' },
				confidence: 1,
			},
		])
	})

	it('settleEntities leaves what a refusal saw alone', () => {
		const entities = [entity]
		expect(
			settleEntities(entities, [], { faults: [], repairs: [], defaulted: [], errors: ['no'] }),
		).toBe(entities)
	})

	it('settleEntities keeps the entity itself when nothing changed', () => {
		const settled = settleEntities([entity], [], {
			subject: { age: 25 },
			faults: [],
			repairs: [],
			defaulted: [],
			errors: [],
		})
		expect(settled[0]).toBe(entity)
	})

	it('describeRecipeShape reads the shape, what is mapped, and what is computed', () => {
		const recipe = buildInterpretRecipe({
			mappings: [
				{ entity: 'age', aliases: [], field: 'age' },
				{ entity: 'agee', aliases: [], field: 'agee' },
			],
			computations: [{ field: 'total', expression: createConstant(1) }],
			shape: objectShape({ age: numberShape() }),
		})
		expect(describeRecipeShape(recipe)).toEqual([
			'Field "agee" is mapped, and the shape does not declare it',
			'Field "total" is computed, and the shape does not declare it',
		])
		expect(describeRecipeShape(buildInterpretRecipe({ shape: numberShape() }))).toEqual(
			expect.arrayContaining(['Shape must describe an object']),
		)
		expect(describeRecipeShape(buildInterpretRecipe())).toEqual([])
	})

	it('assertRecipe throws DEFINITION with what is wrong, and passes what stands', () => {
		expect(() => assertRecipe(buildInterpretRecipe())).not.toThrow()
		const malformed = captureError(() => assertRecipe({ id: 'r' }))
		expect(isInterpretError(malformed) ? malformed.code : undefined).toBe('DEFINITION')
		const invalid = captureError(() =>
			assertRecipe(buildInterpretRecipe({ shape: objectShape({ other: numberShape() }) })),
		)
		expect(isInterpretError(invalid) ? invalid.context : undefined).toEqual({
			errors: [
				'Field "value" is mapped, and the shape does not declare it',
				'Field "other" is required, and no mapping or computation fills it',
			],
		})
	})
})

describe('choosing a recipe asks rather than picks', () => {
	const actions = { calculate: 'compute', check: 'verify', constructor: 'build' }
	const domains = { rating: ['rate'], lending: ['loan'] }

	it('classifyIntent names no domain when two are named, and no action when two are named', () => {
		expect(classifyIntent('calculate the rate of a loan', actions, domains)).toEqual({
			action: 'compute',
			confidence: 0.5,
		})
		expect(classifyIntent('calculate the loan rate rate', actions, domains)).toEqual({
			action: 'compute',
			confidence: 0.5,
		})
		expect(classifyIntent('calculate and check the rate', actions, domains)).toEqual({
			domain: 'rating',
			confidence: 0.5,
		})
	})

	it("classifyIntent reads only a vocabulary's own keys", () => {
		expect(classifyIntent('tostring please', {}, {})).toEqual({ confidence: 0 })
		expect(classifyIntent('constructor', {}, {})).toEqual({ confidence: 0 })
		expect(classifyIntent('constructor', actions, {})).toEqual({ action: 'build', confidence: 0.5 })
	})

	it('matchRecipe refuses an action alone, however few recipes answer it', () => {
		const recipe = buildInterpretRecipe()
		expect(matchRecipe({ action: 'calculate', confidence: 0.5 }, [recipe], 0.3)).toBeUndefined()
	})

	it('matchRecipe refuses a domain no recipe holds, whatever action matches', () => {
		const recipe = buildInterpretRecipe({ domain: 'claims', intents: ['compute'] })
		const intent = { action: 'compute', domain: 'rating', confidence: 1 }
		expect(matchRecipe(intent, [recipe], 0.3)).toBeUndefined()
	})

	it('matchRecipe takes a domain alone when one recipe holds it', () => {
		const recipe = buildInterpretRecipe()
		expect(matchRecipe({ domain: 'arithmetic', confidence: 0.5 }, [recipe], 0.3)).toBe(recipe)
	})

	it('matchRecipe refuses a tie for the best score', () => {
		const first = buildInterpretRecipe({ id: 'first' })
		const second = buildInterpretRecipe({ id: 'second' })
		const intent = { action: 'calculate', domain: 'arithmetic', confidence: 1 }
		expect(matchRecipe(intent, [first, second], 0.3)).toBeUndefined()
		const elsewhere = buildInterpretRecipe({ id: 'third', intents: ['other'] })
		expect(matchRecipe(intent, [first, elsewhere], 0.3)).toBe(first)
	})
})

describe('a recipe that cannot work', () => {
	it('describeRecipeShape names a required field nothing fills', () => {
		const recipe = buildInterpretRecipe({
			mappings: [],
			shape: objectShape({ age: numberShape(), terms: objectShape({ rate: numberShape() }) }),
		})
		expect(describeRecipeShape(recipe)).toEqual([
			'Field "age" is required, and no mapping or computation fills it',
			'Field "terms.rate" is required, and no mapping or computation fills it',
		])
	})

	it('describeRecipeShape takes a mapping above or below a required field', () => {
		const below = buildInterpretRecipe({
			mappings: [{ entity: 'rate', aliases: [], field: ['terms', 'rate'] }],
			shape: objectShape({ terms: objectShape({ rate: numberShape() }) }),
		})
		const above = buildInterpretRecipe({
			mappings: [{ entity: 'terms', aliases: [], field: 'terms' }],
			shape: objectShape({ terms: objectShape({ rate: numberShape() }) }),
		})
		expect(describeRecipeShape(below)).toEqual([])
		expect(describeRecipeShape(above)).toEqual([])
	})

	it('describeRecipeShape names a variable nothing fills, and takes an element of a field', () => {
		const typo = buildInterpretRecipe({
			mappings: [{ entity: 'value', aliases: [], field: 'value' }],
			computations: [{ field: 'total', expression: createVariable('valuee') }],
		})
		expect(describeRecipeShape(typo)).toEqual([
			'Computation of "total" reads "valuee", which nothing fills',
		])
		const element = buildInterpretRecipe({
			mappings: [{ entity: 'value', aliases: [], field: 'value' }],
			computations: [{ field: 'total', expression: createVariable('value.0') }],
		})
		expect(describeRecipeShape(element)).toEqual([])
		const defaulted = buildInterpretRecipe({
			mappings: [],
			computations: [{ field: 'total', expression: createVariable('rate') }],
			shape: objectShape({
				rate: optionalShape(numberShape(), { default: 2 }),
				total: numberShape(),
			}),
		})
		expect(describeRecipeShape(defaulted)).toEqual([])
	})

	it('describeRecipeShape names a shape that does not compile', () => {
		const recipe = buildInterpretRecipe({ mappings: [], shape: UNCOMPILABLE_SHAPE })
		const errors = describeRecipeShape(recipe)
		expect(errors).toHaveLength(1)
		expect(errors[0]).toContain('Shape does not compile')
	})

	it('collectRequiredFields reads through nullable, and leaves optional and open keys out', () => {
		expect(
			collectRequiredFields(
				objectShape({
					a: numberShape(),
					b: optionalShape(numberShape()),
					c: nullableShape(numberShape()),
					d: objectShape({ e: optionalShape(numberShape()) }),
				}),
			),
		).toEqual(['a', 'c', 'd'])
		expect(collectRequiredFields(OPEN_SHAPE)).toEqual([])
	})

	it('isFieldFilled takes the field, one above it, or one inside it, and never a near name', () => {
		expect(isFieldFilled('a', ['a'])).toBe(true)
		expect(isFieldFilled('a.b', ['a'])).toBe(true)
		expect(isFieldFilled('a', ['a.b'])).toBe(true)
		expect(isFieldFilled('a', ['ab'])).toBe(false)
		expect(isFieldFilled('a', [])).toBe(false)
	})
})

describe('reading what a text holds beside a recipe', () => {
	it('resolveExpression reads no bound name from the prototype', () => {
		expect(resolveExpression(createVariable('constructor'), {})).toBeUndefined()
		expect(resolveExpression(createVariable('toString'), {})).toBeUndefined()
	})

	it('digestValue reads a bigint rather than throwing', () => {
		expect(digestValue({ a: 1n })).toBe(digestValue({ a: 1n }))
		expect(digestValue({ a: 1n })).not.toBe(digestValue({ a: 2n }))
	})

	it('findForeignNumbers answers in the digit runs extractNumbers reads', () => {
		expect(findForeignNumbers('call 555-0142 about 40 hours')).toEqual([555, 142])
		expect(findForeignNumbers('in 2019, 40 hours')).toEqual([2019])
		expect(findForeignNumbers('40 hours')).toEqual([])
	})

	it('findUnclaimedNumbers sets aside what belongs to no quantity', () => {
		expect(findUnclaimedNumbers([2019, 40], [], [2019])).toEqual([40])
		expect(findUnclaimedNumbers([2019, 2019], [], [2019])).toEqual([2019])
	})
})
