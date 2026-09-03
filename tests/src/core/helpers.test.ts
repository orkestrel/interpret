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
	assignEntities,
	canonicalize,
	canonicalizeNode,
	classifyIntent,
	collapseWhitespace,
	createNarrator,
	digestValue,
	escapeRegExp,
	extractNumbers,
	matchAlias,
	matchTemplate,
	renderSubject,
	resolveExpression,
	scoreSimilarity,
	scoreTemplate,
	setField,
	SubjectManager,
	tokenize,
	variablesOf,
} from '@src/core'
import { describe, expect, it } from 'vitest'
import { buildInterpretTemplate, EXTREME_NUMBERS, expectSymbolic } from '../../setup.js'

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

describe('escapeRegExp', () => {
	it('escapes every regex metacharacter so the result matches literally', () => {
		expect(escapeRegExp('a.b*c')).toBe('a\\.b\\*c')
		expect(new RegExp(escapeRegExp('a.b*c')).test('a.b*c')).toBe(true)
		expect(new RegExp(escapeRegExp('a.b*c')).test('axbyc')).toBe(false)
	})

	it('escapes the full metacharacter set: . * + ? ^ $ { } ( ) | [ ] \\', () => {
		const metacharacters = '.*+?^${}()|[]\\'
		const escaped = escapeRegExp(metacharacters)
		for (const character of metacharacters) expect(escaped).toContain(`\\${character}`)
		expect(new RegExp(escapeRegExp(metacharacters)).test(metacharacters)).toBe(true)
	})

	it('returns the empty string unchanged', () => {
		expect(escapeRegExp('')).toBe('')
	})

	it('leaves ordinary text untouched', () => {
		expect(escapeRegExp('hello world 123')).toBe('hello world 123')
	})

	it('is deterministic across repeated calls', () => {
		expect(escapeRegExp('a.b*c')).toBe(escapeRegExp('a.b*c'))
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
	it('single-mapping collects every number (array when >1, scalar otherwise)', () => {
		const mappings = [{ entity: 'readings', aliases: [], field: 'readings' }]
		expect(assignEntities([10, 20, 30], mappings, 'values 10 20 30', 0.8)).toEqual([
			{
				name: 'readings',
				value: [10, 20, 30],
				provenance: { category: 'extracted', detail: 'collect' },
				confidence: 0.9,
			},
		])
		expect(assignEntities([42], mappings, 'value 42', 0.8)).toEqual([
			{
				name: 'readings',
				value: 42,
				provenance: { category: 'extracted', detail: 'collect' },
				confidence: 0.9,
			},
		])
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
		)
		const rate = entities.find((entity) => entity.name === 'rate')
		expect(rate?.value).toBe(0.85)
		expect(rate?.confidence).toBe(1)
		expect(rate?.provenance).toEqual({ category: 'extracted', detail: 'keyword' })
	})

	it('load-bearing corpus pin: "score 85 near \'score\'" assigns to the score field', () => {
		const mappings = [{ entity: 'score', aliases: ['credit score'], field: 'score' }]
		const entities = assignEntities([85], mappings, 'the score is 85', 0.8)
		expect(entities).toEqual([
			{
				name: 'score',
				value: 85,
				provenance: { category: 'extracted', detail: 'collect' },
				confidence: 0.9,
			},
		])
	})

	it('load-bearing corpus pin: "age…is 25" / "income was $50,000" — two mappings, keyword proximity', () => {
		const mappings = [
			{ entity: 'age', aliases: ['years old'], field: 'age' },
			{ entity: 'income', aliases: [], field: 'income' },
		]
		const entities = assignEntities([25, 50000], mappings, 'age is 25, income was $50,000', 0.8)
		expect(entities.find((entity) => entity.name === 'age')?.value).toBe(25)
		expect(entities.find((entity) => entity.name === 'income')?.value).toBe(50000)
	})

	it('positional fallback fills an unmatched mapping with the next unused number', () => {
		const mappings = [
			{ entity: 'width', aliases: [], field: 'width' },
			{ entity: 'height', aliases: [], field: 'height' },
		]
		const entities = assignEntities([4, 8], mappings, 'dimensions 4 8', 0.8)
		expect(entities).toEqual([
			{
				name: 'width',
				value: 4,
				provenance: { category: 'extracted', detail: 'positional' },
				confidence: 0.7,
			},
			{
				name: 'height',
				value: 8,
				provenance: { category: 'extracted', detail: 'positional' },
				confidence: 0.7,
			},
		])
	})

	it('alias fuzzy match uses the dynamic matchAlias score as confidence', () => {
		const mappings = [{ entity: 'amount', aliases: ['dollars'], field: 'amount' }]
		const secondMapping = [{ entity: 'other', aliases: ['dollars'], field: 'other' }]
		const entities = assignEntities(
			[10, 20],
			[...mappings, ...secondMapping],
			'dollar 10 dolars 20',
			0.5,
		)
		expect(entities.length).toBeGreaterThan(0)
		for (const entity of entities) {
			expect(entity.confidence).toBeGreaterThan(0)
			expect(entity.confidence).toBeLessThanOrEqual(1)
		}
	})

	it('returns keyword-anchored entities before positionally filled ones', () => {
		const mappings = [
			{ entity: 'age', aliases: ['years old'], field: 'age' },
			{ entity: 'score', aliases: ['credit score'], field: 'score' },
		]
		const entities = assignEntities([25, 720], mappings, '25 year old with score 720', 0.8)
		expect(entities.map((entity) => entity.name)).toEqual(['score', 'age'])
		expect(entities.map((entity) => entity.value)).toEqual([720, 25])
		expect(entities.map((entity) => entity.provenance.detail)).toEqual(['keyword', 'positional'])
	})

	it('anchors a keyword on a whole word, never on the same letters inside a longer word', () => {
		const mappings = [
			{ entity: 'age', aliases: [], field: 'age' },
			{ entity: 'value', aliases: [], field: 'value' },
		]
		const entities = assignEntities([50, 25], mappings, 'the average is 50 and age 25', 0.8)
		expect(entities.find((entity) => entity.name === 'age')?.value).toBe(25)
	})

	it('anchors a repeated keyword on its rightmost occurrence, as the contract states', () => {
		const mappings = [
			{ entity: 'age', aliases: [], field: 'age' },
			{ entity: 'value', aliases: [], field: 'value' },
		]
		const entities = assignEntities([25, 30], mappings, 'age 25 and age 30', 0.8)
		expect(entities.find((entity) => entity.name === 'age')?.value).toBe(30)
	})

	it('returns empty for an empty mapping list or no numbers', () => {
		expect(assignEntities([1, 2], [], 'a b', 0.8)).toEqual([])
		expect(
			assignEntities([], [{ entity: 'x', aliases: [], field: 'x' }], 'no numbers', 0.8),
		).toEqual([])
	})

	it('is deterministic across repeated calls', () => {
		const mappings = [
			{ entity: 'age', aliases: ['years old'], field: 'age' },
			{ entity: 'income', aliases: [], field: 'income' },
		]
		const text = 'age is 25, income was $50,000'
		expect(assignEntities([25, 50000], mappings, text, 0.8)).toEqual(
			assignEntities([25, 50000], mappings, text, 0.8),
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

	it('never auto-classifies from a domain name absent from the caller vocabulary (ledger 18)', () => {
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
		const a = digestValue({ subject: { age: 25, income: 50000 }, template: 't1' })
		const b = digestValue({ template: 't1', subject: { income: 50000, age: 25 } })
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
		let digest = ''
		expect(() => {
			digest = digestValue(subject)
		}).not.toThrow()
		expect(digestValue(subject)).toBe(digest)
	})

	it('SubjectManager.add on a self-referential subject terminates and stores a stable hash', () => {
		const subject: Record<string, unknown> = { age: 25 }
		subject.self = subject
		const manager = new SubjectManager()
		let record: ReturnType<typeof manager.add> | undefined
		expect(() => {
			record = manager.add(subject)
		}).not.toThrow()
		expect(record?.hash).toBe(digestValue(subject))
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

describe('scoreTemplate / matchTemplate', () => {
	it('scores domain + action match as their mean', () => {
		const template = buildInterpretTemplate()
		expect(
			scoreTemplate({ action: 'calculate', domain: 'arithmetic', confidence: 1 }, template),
		).toBe(1)
		expect(scoreTemplate({ action: 'nope', domain: 'arithmetic', confidence: 1 }, template)).toBe(
			0.5,
		)
		expect(scoreTemplate({ action: 'nope', domain: 'other', confidence: 1 }, template)).toBe(0)
	})

	it('scores an absent axis as no match on that half', () => {
		const template = buildInterpretTemplate()
		expect(scoreTemplate({ domain: 'arithmetic', confidence: 0.5 }, template)).toBe(0.5)
		expect(scoreTemplate({ action: 'calculate', confidence: 0.5 }, template)).toBe(0.5)
		expect(scoreTemplate({ confidence: 0 }, template)).toBe(0)
	})

	it('matchTemplate returns undefined on an empty registry (explicit no-match, never templates[0])', () => {
		expect(matchTemplate({ confidence: 0 }, [], 0.3)).toBeUndefined()
	})

	it('matchTemplate refuses an unclassified intent against a real template', () => {
		expect(matchTemplate({ confidence: 0 }, [buildInterpretTemplate()], 0.3)).toBeUndefined()
	})

	it('matchTemplate returns undefined when the best score is below floor', () => {
		const template = buildInterpretTemplate()
		expect(
			matchTemplate({ action: 'nope', domain: 'nope', confidence: 1 }, [template], 0.3),
		).toBeUndefined()
	})

	it('matchTemplate returns the best-scoring template at or above floor', () => {
		const template = buildInterpretTemplate()
		expect(
			matchTemplate({ action: 'calculate', domain: 'arithmetic', confidence: 1 }, [template], 0.3),
		).toBe(template)
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
		it('add with absent right defaults to 0 in both resolveExpression and the engine', () => {
			const node = createOperation('add', createVariable('x'))
			const viaHelper = resolveExpression(node, { x: 5 })
			const definition = createSymbolicDefinition(
				'd',
				'D',
				[createEquation('e1', createConstant(0), node, 'result')],
				{
					variables: { x: 5 },
				},
			)
			const result = expectSymbolic(createSymbolicReasoner().reason({}, definition))
			expect(viaHelper).toBe(result.solutions.result)
		})

		it('multiply with absent right is 0 (engine-pinned, NOT Transform default 1) in both paths', () => {
			const node = createOperation('multiply', createVariable('x'))
			const viaHelper = resolveExpression(node, { x: 5 })
			const definition = createSymbolicDefinition(
				'd',
				'D',
				[createEquation('e1', createConstant(0), node, 'result')],
				{
					variables: { x: 5 },
				},
			)
			const result = expectSymbolic(createSymbolicReasoner().reason({}, definition))
			expect(viaHelper).toBe(0)
			expect(viaHelper).toBe(result.solutions.result)
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
