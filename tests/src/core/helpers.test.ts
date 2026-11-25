import type { Check, Expression } from '@orkestrel/reason'
import type { Account, Entity } from '@src/core'
import {
	arrayShape,
	nullableShape,
	numberShape,
	objectShape,
	optionalShape,
} from '@orkestrel/contract'
import {
	collectConcluders,
	combineStates,
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
	createOperation,
	createQuantitativeDefinition,
	createRule,
	createStaticFactor,
	createSymbolicDefinition,
	createSymbolicReasoner,
	createVariable,
	LOGICAL_OPERATORS,
} from '@orkestrel/reason'
import {
	applyReplacements,
	assertRecipe,
	assignEntities,
	scanNumbers,
	buildAccountLine,
	buildSubject,
	canonicalize,
	canonicalizeNode,
	classifyIntent,
	collapseWhitespace,
	collectAccountText,
	collectFaultFields,
	collectFieldGaps,
	collectGaps,
	collectNameGaps,
	collectReasons,
	collectRequiredFields,
	collectShapeDefaults,
	collectUnitGaps,
	createNarrator,
	DEFAULT_LEXICON,
	scanRecipeShape,
	digestValue,
	extractNumbers,
	filterUniqueGaps,
	findConditionRules,
	findDecidingOperands,
	findEntityField,
	findAnchoredNumber,
	findLinkedNumbers,
	findSpanOffset,
	findFieldDescription,
	findGoalRule,
	findSoleExpression,
	findUnclaimedNumbers,
	findWord,
	FRAME_SLOTS,
	isFrameName,
	matchesArrayField,
	matchesFilledField,
	matchesNumericCheck,
	mergeLexicon,
	isInterpretError,
	matchRecipe,
	normalizeLine,
	renderAccount,
	renderName,
	renderReasons,
	renderSubject,
	resolveExpression,
	resolveGlossary,
	resolveLexicon,
	resolveLocale,
	scanFrame,
	scanGlossary,
	scanLexicon,
	scanWord,
	scanWords,
	scoreRecipe,
	setField,
	settleEntities,
	settleExpression,
	settleOperands,
	SubjectManager,
	tokenize,
	variablesOf,
} from '@src/core'
import { captureError, createHostileValues } from '@orkestrel/test'
import { describe, expect, it } from 'vitest'
import {
	buildInterpretRecipe,
	buildWorkshopGates,
	buildWorkshopRules,
	EXTREME_NUMBERS,
	InterpretFixtureValue,
	OPEN_SHAPE,
	UNBOUND_LINK_READINGS,
	NUMBER_LINK_READINGS,
	UNCOMPILABLE_SHAPE,
	UNSTATED_UNITS,
} from '../../setup.js'

// The interprets pure leaves — every function is referentially transparent
// (same inputs → same outputs, `.claude/rules/tests.md` § Test contract), so
// most tests double-invoke to
// pin run-twice determinism directly.

describe('applyReplacements / collapseWhitespace / tokenize', () => {
	it('findSpanOffset locates ordered starts and ends including equal edges', () => {
		const spans = [
			{ start: 1, end: 3 },
			{ start: 4, end: 6 },
		]
		expect(findSpanOffset(spans, 4)).toBe(1)
		expect(findSpanOffset(spans, 6, 'end')).toBe(1)
		expect(findSpanOffset(spans, 7, 'end')).toBe(2)
		expect(findSpanOffset([], 0)).toBe(0)
	})
	it('findLinkedNumbers preserves tied distances and forward-only colons', () => {
		const spans = [
			{ start: 0, end: 1 },
			{ start: 7, end: 8 },
		]
		expect(
			findLinkedNumbers('5 rate 7', { start: 2, end: 6 }, spans, { start: 0, end: 8 }),
		).toEqual([
			{ index: 0, gap: 1 },
			{ index: 1, gap: 1 },
		])
		expect(
			findLinkedNumbers(
				'5 rate: 7',
				{ start: 2, end: 6 },
				[
					{ start: 0, end: 1 },
					{ start: 8, end: 9 },
				],
				{ start: 0, end: 9 },
			),
		).toEqual([{ index: 1, gap: 2 }])
	})
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
	it.each(UNBOUND_LINK_READINGS)('refuses an unbound link in $text', ({ entity, text }) => {
		expect(
			assignEntities(scanNumbers(text), [{ entity, aliases: [], field: entity }], text, OPEN_SHAPE),
		).toEqual([])
	})
	it.each(NUMBER_LINK_READINGS)(
		'refuses before a numeric target and exposes both values in $text',
		({ entity, text, value, unclaimed }) => {
			const numbers = scanNumbers(text)
			const entities = assignEntities(
				numbers,
				[{ entity, aliases: [], field: entity }],
				text,
				OPEN_SHAPE,
			)
			expect(entities).toEqual([])
			expect(findUnclaimedNumbers(numbers, entities)).toEqual([value, unclaimed])
		},
	)
	it.each(['a', 'an', 'the'])('allows one %s article before an anchor head', (article) => {
		const text = `amount 50000 with ${article} annual income 120000`
		const mappings = [
			{ entity: 'amount', aliases: [], field: 'amount' },
			{ entity: 'income', aliases: ['annual income'], field: 'income' },
		]
		expect(
			assignEntities(scanNumbers(text), mappings, text, OPEN_SHAPE).map((found) => found.value),
		).toEqual([50000, 120000])
	})
	it('pins the known punctuation limit: a comma hides and up from the following-word test', () => {
		const text = 'amount 50000, and up'
		expect(
			assignEntities(
				scanNumbers(text),
				[{ entity: 'amount', aliases: [], field: 'amount' }],
				text,
				OPEN_SHAPE,
			).map((found) => found.value),
		).toEqual([50000])
	})
	it('keeps and inside the reader whole-number form', () => {
		const text = 'amount 50000 and a half'
		expect(
			assignEntities(
				scanNumbers(text),
				[{ entity: 'amount', aliases: [], field: 'amount' }],
				text,
				OPEN_SHAPE,
			).map((found) => found.value),
		).toEqual([50000.5])
	})
	it('asks because months follows the whole 3.5 reading', () => {
		const text = 'years 3 and a half months'
		const numbers = scanNumbers(text)
		expect(numbers.map((number) => number.value)).toEqual([3.5])
		expect(numbers.map((number) => number.unreadable)).toEqual([undefined])
		expect(
			assignEntities(numbers, [{ entity: 'years', aliases: [], field: 'years' }], text, OPEN_SHAPE),
		).toEqual([])
	})
	it.each(['or', 'but', 'plus', 'then', 'now'])(
		'keeps %s outside the following-word links',
		(word) => {
			const text = `amount 50000 ${word} 60000`
			expect(
				assignEntities(
					scanNumbers(text),
					[{ entity: 'amount', aliases: [], field: 'amount' }],
					text,
					OPEN_SHAPE,
				),
			).toEqual([])
		},
	)
	it.each(UNSTATED_UNITS)('refuses an unstated unit in $text', ({ entity, text }) => {
		expect(
			assignEntities(scanNumbers(text), [{ entity, aliases: [], field: entity }], text, OPEN_SHAPE),
		).toEqual([])
	})
	it('keeps declared anchor heads, a comma and the end eligible', () => {
		const mappings = [{ entity: 'years', aliases: ['year term'], field: 'years' }]
		for (const text of ['3 years', '3 year term', 'years 3, months', 'years 3']) {
			expect(
				assignEntities(scanNumbers(text), mappings, text, OPEN_SHAPE).map((entity) => entity.value),
			).toEqual([3])
		}
	})
	it.each(['is', 'of', 'at', 'to', 'a', 'an', 'the'])('refuses a terminal %s link', (link) => {
		const text = `years 3 ${link}`
		expect(
			assignEntities(
				scanNumbers(text),
				[{ entity: 'years', aliases: [], field: 'years' }],
				text,
				OPEN_SHAPE,
			),
		).toEqual([])
	})
	it('refuses array collection when any number carries an undeclared unit', () => {
		const mappings = [{ entity: 'values', aliases: [], field: 'values' }]
		const text = 'values 10, 20 months'
		expect(
			assignEntities(
				scanNumbers(text),
				mappings,
				text,
				objectShape({ values: arrayShape(numberShape()) }),
			),
		).toEqual([])
	})
	it.each(['a', 'an', 'the'])('links the article %s only after the anchor', (article) => {
		const mappings = [{ entity: 'term', aliases: ['year'], field: 'term' }]
		const before = `125000 ${article} year`
		expect(assignEntities(scanNumbers(before), mappings, before, OPEN_SHAPE)).toEqual([])
		const after = `year ${article} 25`
		expect(assignEntities(scanNumbers(after), mappings, after, OPEN_SHAPE)[0]?.value).toBe(25)
	})

	it('does not assign annual income to the mortgage term', () => {
		const text =
			"What's the monthly payment for borrowing $225,000 over 25 years at 4.5% if I earn $125,000 a year?"
		const mappings = [{ entity: 'term', aliases: ['year', 'years'], field: 'term' }]
		expect(assignEntities(scanNumbers(text), mappings, text, OPEN_SHAPE)).toEqual([])
	})

	it('single mapping onto an array field collects every number, one included', () => {
		const mappings = [{ entity: 'readings', aliases: ['value', 'values'], field: 'readings' }]
		const shape = objectShape({ readings: arrayShape(numberShape()) })
		expect(
			assignEntities(
				scanNumbers('values 10 and values 20 and values 30'),
				mappings,
				'values 10 and values 20 and values 30',
				shape,
			),
		).toEqual([
			{
				name: 'readings',
				value: [10, 20, 30],
				provenance: { category: 'extracted', detail: 'collect' },
				confidence: 0.9,
			},
		])
		expect(assignEntities(scanNumbers('value 42'), mappings, 'value 42', shape)).toEqual([
			{
				name: 'readings',
				value: [42],
				provenance: { category: 'extracted', detail: 'collect' },
				confidence: 0.9,
			},
		])
	})

	it('single scalar mapping refuses a link followed by a number word', () => {
		const mappings = [{ entity: 'age', aliases: [], field: 'age' }]
		const shape = objectShape({ age: numberShape() })
		expect(assignEntities(scanNumbers('one 1 two 2'), mappings, 'one 1 two 2', shape)).toEqual([])
		expect(
			assignEntities(scanNumbers('age 25 and one 1'), mappings, 'age 25 and one 1', shape),
		).toEqual([])
	})

	it('a number on an array field among many mappings lands as an array of one', () => {
		const mappings = [
			{ entity: 'age', aliases: [], field: 'age' },
			{ entity: 'scores', aliases: [], field: 'scores' },
		]
		const shape = objectShape({ age: numberShape(), scores: arrayShape(numberShape()) })
		const entities = assignEntities(
			scanNumbers('age 25, scores 7'),
			mappings,
			'age 25, scores 7',
			shape,
		)
		expect(entities.find((entity) => entity.name === 'scores')?.value).toEqual([7])
		expect(entities.find((entity) => entity.name === 'age')?.value).toBe(25)
	})

	it('a tied anchor still contests both adjacent numbers', () => {
		const text = 'loan: amount 50000 income 120000 years'
		const mappings = [
			{ entity: 'amount', aliases: [], field: 'amount' },
			{ entity: 'income', aliases: [], field: 'income' },
			{ entity: 'years', aliases: [], field: 'years' },
		]
		expect(assignEntities(scanNumbers(text), mappings, text, OPEN_SHAPE)).toEqual([])
	})

	it('claims a multi-word alias only as an exact token sequence', () => {
		const mapping = [{ entity: 'copies', aliases: ['print run'], field: 'copies' }]
		expect(
			assignEntities(scanNumbers('print run 5000'), mapping, 'print run 5000', OPEN_SHAPE).map(
				(entity) => entity.value,
			),
		).toEqual([5000])
		expect(assignEntities(scanNumbers('run 5000'), mapping, 'run 5000', OPEN_SHAPE)).toEqual([])
		expect(assignEntities(scanNumbers('print 5000'), mapping, 'print 5000', OPEN_SHAPE)).toEqual([])
		expect(
			assignEntities(scanNumbers('run print 5000'), mapping, 'run print 5000', OPEN_SHAPE),
		).toEqual([])
		expect(
			assignEntities(scanNumbers('print runs 5000'), mapping, 'print runs 5000', OPEN_SHAPE),
		).toEqual([])
	})

	it('keeps the later overlapping anchor and the existing token boundaries', () => {
		const text = '7 interest rate 5'
		expect(
			assignEntities(
				scanNumbers(text),
				[{ entity: 'charge', aliases: ['rate', 'interest rate'], field: 'charge' }],
				text,
				OPEN_SHAPE,
			).map((entity) => entity.value),
		).toEqual([5])
		expect(
			assignEntities(
				scanNumbers('5 rate.'),
				[{ entity: 'rate', aliases: [], field: 'rate' }],
				'5 rate.',
				OPEN_SHAPE,
			).map((entity) => entity.value),
		).toEqual([5])
	})

	it('claims both rate and score across the and link', () => {
		const mappings = [
			{ entity: 'rate', aliases: ['value'], field: 'rate' },
			{ entity: 'score', aliases: ['credit score'], field: 'score' },
		]
		const entities = assignEntities(
			scanNumbers('the rate is 0.85 and the score is 720'),
			mappings,
			'the rate is 0.85 and the score is 720',
			OPEN_SHAPE,
		)
		const rate = entities.find((entity) => entity.name === 'rate')
		expect(rate?.value).toBe(0.85)
		expect(entities.find((entity) => entity.name === 'score')?.value).toBe(720)
	})

	it('load-bearing corpus pin: "score 85 near \'score\'" assigns to the score field', () => {
		const mappings = [{ entity: 'score', aliases: ['credit score'], field: 'score' }]
		const entities = assignEntities(
			scanNumbers('the score is 85'),
			mappings,
			'the score is 85',
			OPEN_SHAPE,
		)
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
			scanNumbers('age is 25, income was $50,000'),
			mappings,
			'age is 25, income was $50,000',
			OPEN_SHAPE,
		)
		expect(entities.find((entity) => entity.name === 'age')?.value).toBe(25)
		expect(entities.find((entity) => entity.name === 'income')).toBeUndefined()
	})

	it('the unbound then refuses the number beside a literal metacharacter anchor', () => {
		const mappings = [
			{ entity: 'net.pay', aliases: [], field: 'pay' },
			{ entity: 'other', aliases: [], field: 'other' },
		]
		const entities = assignEntities(
			scanNumbers('net.pay 100 then netxpay 200 other 5'),
			mappings,
			'net.pay 100 then netxpay 200 other 5',
			OPEN_SHAPE,
		)
		expect(entities.find((entity) => entity.name === 'net.pay')).toBeUndefined()
		expect(entities).toEqual([])
	})

	it('no anchor fills no field, because position is a guess', () => {
		const mappings = [
			{ entity: 'width', aliases: [], field: 'width' },
			{ entity: 'height', aliases: [], field: 'height' },
		]
		expect(
			assignEntities(scanNumbers('dimensions 4 8'), mappings, 'dimensions 4 8', OPEN_SHAPE),
		).toEqual([])
	})

	it('an anchor claims nothing across a clause, nor from a tie', () => {
		const mappings = [
			{ entity: 'rate', aliases: [], field: 'rate' },
			{ entity: 'term', aliases: [], field: 'term' },
		]
		expect(
			assignEntities(
				scanNumbers('the rate, then term 7'),
				mappings,
				'the rate, then term 7',
				OPEN_SHAPE,
			).map((entity) => entity.name),
		).toEqual(['term'])
		expect(assignEntities(scanNumbers('5 rate 7'), mappings, '5 rate 7', OPEN_SHAPE)).toEqual([])
		expect(
			assignEntities(scanNumbers('5  rate 7'), mappings, '5  rate 7', OPEN_SHAPE).map(
				(entity) => entity.value,
			),
		).toEqual([7])
	})

	it('an unbound and link refuses the nearest claim and the farther anchor', () => {
		const mappings = [
			{ entity: 'rate', aliases: [], field: 'rate' },
			{ entity: 'term', aliases: [], field: 'term' },
		]
		const entities = assignEntities(
			scanNumbers('rate term 7 and more 900'),
			mappings,
			'rate term 7 and more 900',
			OPEN_SHAPE,
		)
		expect(entities).toEqual([])
	})

	it('a number two anchors sit equally close to goes to neither', () => {
		const mappings = [
			{ entity: 'rate', aliases: [], field: 'rate' },
			{ entity: 'term', aliases: [], field: 'term' },
		]
		expect(assignEntities(scanNumbers('rate 7 term'), mappings, 'rate 7 term', OPEN_SHAPE)).toEqual(
			[],
		)
	})

	it('an anchor never claims the digits inside its own word', () => {
		const mappings = [{ entity: '401k', aliases: [], field: 'plan' }]
		expect(
			assignEntities(scanNumbers('401k balance'), mappings, '401k balance', OPEN_SHAPE),
		).toEqual([])
	})

	it('a number the extractor did not read shifts nothing and is not claimed', () => {
		const mappings = [
			{ entity: 'age', aliases: [], field: 'age' },
			{ entity: 'rate', aliases: [], field: 'rate' },
		]
		const huge = '9'.repeat(400)
		const entities = assignEntities(
			scanNumbers(`age ${huge}, rate 5`),
			mappings,
			`age ${huge}, rate 5`,
			OPEN_SHAPE,
		)
		expect(entities.map((entity) => [entity.name, entity.value])).toEqual([['rate', 5]])
		const injected = assignEntities(
			scanNumbers('age 25, rate 5').slice(0, 1),
			mappings,
			'age 25, rate 5',
			OPEN_SHAPE,
		)
		expect(injected.map((entity) => [entity.name, entity.value])).toEqual([['age', 25]])
	})

	it('an anchor after a character that changes length in lower case still sits where it is', () => {
		const mappings = [{ entity: 'age', aliases: [], field: 'age' }]
		const entities = assignEntities(
			scanNumbers('\u0130\u0130 age 30'),
			mappings,
			'\u0130\u0130 age 30',
			OPEN_SHAPE,
		)
		expect(entities[0]?.value).toBe(30)
	})

	it('a fuzzy alias claims no entity value', () => {
		const mappings = [{ entity: 'amount', aliases: ['dollars'], field: 'amount' }]
		const secondMapping = [{ entity: 'other', aliases: ['euros'], field: 'other' }]
		const entities = assignEntities(
			scanNumbers('dollar 10, euro 20'),
			[...mappings, ...secondMapping],
			'dollar 10, euro 20',
			OPEN_SHAPE,
		)
		expect(entities).toEqual([])
	})

	it('fills only the mapping an anchor names, and leaves the other to ask', () => {
		const mappings = [
			{ entity: 'age', aliases: ['years old'], field: 'age' },
			{ entity: 'score', aliases: ['credit score'], field: 'score' },
		]
		const entities = assignEntities(
			scanNumbers('25 year old with score 720'),
			mappings,
			'25 year old with score 720',
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
		expect(assignEntities(scanNumbers(text), mappings, text, OPEN_SHAPE)).toEqual(
			assignEntities(scanNumbers(text), mappings, text, OPEN_SHAPE),
		)
	})
})

describe('classifyIntent', () => {
	it.each(['I need a table.', 'a table...', 'a table. thanks'])(
		'names a domain by its word before a sentence end in %s',
		(text) => {
			expect(classifyIntent(text, {}, { booking: ['table'] }).domain).toBe('booking')
		},
	)
	it('keeps two domains tied when one word carries the period', () => {
		expect(
			classifyIntent('a table. a room', {}, { booking: ['table'], hotel: ['room'] }).domain,
		).toBeUndefined()
	})
	it('reads no domain from a period inside a word', () => {
		expect(classifyIntent('a table.ok', {}, { booking: ['table'] }).domain).toBeUndefined()
	})
	it.each(['st.', 'p.m.', 'u.s.', 'no.'])(
		'keeps a declared keyword holding its own period: %s',
		(word) => {
			expect(classifyIntent(word, {}, { literal: [word] }).domain).toBe('literal')
		},
	)
	it('ties a dotted and an undotted keyword on one dotted word, and chooses neither', () => {
		const domains = { literal: ['st.'], plain: ['st'] }
		expect(classifyIntent('St.', {}, domains).domain).toBeUndefined()
	})
	it('names an action by its word before a sentence end', () => {
		expect(classifyIntent('cancel.', { cancel: 'cancel' }, {}).action).toBe('cancel')
	})
	it('keeps a declared action holding its own period', () => {
		expect(classifyIntent('st.', { 'st.': 'street' }, {}).action).toBe('street')
	})
	it('keeps two actions tied when one word carries the period', () => {
		const actions = { book: 'book', cancel: 'cancel' }
		expect(classifyIntent('book table. cancel.', actions, { booking: ['table'] })).toEqual({
			domain: 'booking',
			confidence: 0.5,
		})
	})
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

	it('renders each field by its label and in its unit', () => {
		const narrator = createNarrator({
			glossary: { labels: { income: 'Annual income' }, units: { income: 'money' } },
			formatters: { money: (value) => `$${String(value)}` },
		})
		expect(renderSubject({ income: 50000 }, narrator)).toBe('with Annual income: $50000')
	})

	it('joins a list, keeps a string, omits an absent field, and stays on one line', () => {
		const narrator = createNarrator()
		expect(
			renderSubject({ tags: ['a', 'b'], name: 'Ada\nLovelace', gone: undefined }, narrator),
		).toBe('with name: Ada Lovelace, tags: a and b')
		expect(renderSubject({ gone: undefined }, narrator)).toBe('with no fields')
	})
})

describe('the words', () => {
	it('findWord reads an own key alone', () => {
		expect(findWord({ cost: 'Cost' }, 'cost')).toBe('Cost')
		expect(findWord({ cost: 'Cost' }, 'toString')).toBeUndefined()
		expect(findWord(undefined, 'cost')).toBeUndefined()
	})

	it('scanWord finds what is no word', () => {
		expect(scanWord('w', 'Cost')).toEqual([])
		expect(scanWord('w', 5)).toEqual(['w is not text'])
		expect(scanWord('w', undefined)).toEqual(['w is not text'])
		expect(scanWord('w', ' \t')).toEqual(['w is empty'])
		for (const text of ['a\nb', 'a\rb', 'a\vb', 'a\fb', 'a\u{85}b', 'a\u{2028}b', 'a\u{2029}b']) {
			expect(scanWord('w', text)).toEqual(['w holds a line break'])
		}
	})

	it('scanWords finds a table that is none, an unknown key, and a malformed word', () => {
		expect(scanWords(['rules'], { met: 'holds' }, ['met'])).toEqual([])
		expect(scanWords(['labels'], { anything: 'at all' })).toEqual([])
		expect(scanWords(['phrases', 'a b'], null)).toEqual(['phrases."a b" is not a table of words'])
		expect(scanWords(['rules'], { meet: 'holds', met: '' }, ['met', 'unmet'])).toEqual([
			'rules.meet is not one of met, unmet',
			'rules.met is empty',
		])
	})

	it('scanFrame finds each slot a frame does not offer, spaced, dotted, and unsafe ones too', () => {
		expect(scanFrame('rule.settled', '{{ name }} {{verdict}} \\{{raw}}')).toEqual([])
		expect(scanFrame('subject.empty', 'nothing')).toEqual([])
		expect(scanFrame('subject.empty', '{{name}}')).toEqual([
			'frames."subject.empty" names the slot "name", and it offers none',
		])
		expect(scanFrame('result.refused', '{{name.first}} {{__proto__}}')).toEqual([
			'frames."result.refused" names the slot "name.first", and it offers name',
			'frames."result.refused" names the slot "__proto__", and it offers name',
		])
	})

	it('scanLexicon admits any one word of any table, and the complete shipped lexicon', () => {
		expect(scanLexicon({})).toEqual([])
		expect(scanLexicon(DEFAULT_LEXICON)).toEqual([])
		expect(scanLexicon({ comparisons: { from: { fails: 'is below' } } })).toEqual([])
		expect(scanLexicon({ limits: { list: 0 } })).toEqual([])
	})

	it.each<readonly [unknown, string]>([
		[{ comparisons: 5 }, 'comparisons is not a table of words'],
		[
			{ comparisons: { over: { holds: 'x' } } },
			'comparisons.over is not one of equals, not, above, below, from, to, any, none, between, outside',
		],
		[{ comparisons: { from: { hold: 'x' } } }, 'comparisons.from.hold is not one of holds, fails'],
		[{ comparisons: { from: { holds: '' } } }, 'comparisons.from.holds is empty'],
		[{ checks: { read: 'x' } }, 'checks.read is not one of met, unmet, unread'],
		[{ rules: { met: 5 } }, 'rules.met is not text'],
		[{ verdicts: { won: 'x' } }, 'verdicts.won is not one of met, unmet, unread'],
		[{ joins: { first: 'x' } }, 'joins.first is not one of reasons, last'],
		[{ joins: { last: ' ' } }, 'joins.last is empty'],
		[
			{ aggregations: { mode: 'x' } },
			'aggregations.mode is not one of sum, product, average, minimum, maximum',
		],
		[
			{ faults: { late: 'x' } },
			'faults.late is not one of type, missing, constraint, variant, oneOf, extra, hidden',
		],
		[{ values: { yes: 'x' } }, 'values.yes is not one of true, false, null'],
		[{ frames: { 'rule.settled': '' } }, 'frames."rule.settled" is empty'],
		[
			{ frames: { 'rule.settled': '{{label}}' } },
			'frames."rule.settled" names the slot "label", and it offers name, verdict',
		],
		[{ limits: 3 }, 'limits is not a table of limits'],
		[{ limits: { rows: 3 } }, 'limits.rows is not one of list, reasons'],
		[{ limits: { reasons: 0 } }, 'limits.reasons is not a whole number from 1'],
		[{ limits: { list: -1 } }, 'limits.list is not a whole number from 0'],
		[{ limits: { list: 1.5 } }, 'limits.list is not a whole number from 0'],
		[{ missing: 'a\nb' }, 'missing holds a line break'],
		[
			{ labels: { cost: 'Cost' } },
			'labels is not one of comparisons, checks, rules, verdicts, aggregations, faults, values, joins, frames, limits, missing',
		],
	])('scanLexicon refuses %j', (input, finding) => {
		expect(scanLexicon(input)).toEqual([finding])
	})

	it('scanLexicon and scanGlossary answer whatever the input holds', () => {
		for (const value of [undefined, null, 5, 'words', [], ...createHostileValues()]) {
			const read = [scanLexicon(value), scanGlossary(value)]
			expect(read.flat().every((finding) => finding.length > 0)).toBe(true)
			expect(read[1]).not.toEqual([])
		}
		expect(scanLexicon({ missing: 5n })).toHaveLength(1)
		expect(scanGlossary({ labels: {}, units: undefined })).toHaveLength(1)
	})

	it('scanGlossary admits every table, and a unit with no format', () => {
		expect(
			scanGlossary({
				labels: { cost: 'Cost' },
				units: { cost: 'acre' },
				values: { score: 'count' },
				formats: { money: { style: 'currency', currency: 'USD' } },
				phrases: { status: { active: 'under way' } },
				templates: { greeting: 'Hello {{anyone}}' },
			}),
		).toEqual([])
	})

	it.each<readonly [unknown, string]>([
		[{}, 'labels is missing'],
		[{ labels: [] }, 'labels is not a table of words'],
		[{ labels: { cost: ' ' } }, 'labels.cost is empty'],
		[{ labels: {}, units: { cost: 5 } }, 'units.cost is not text'],
		[{ labels: {}, values: { cost: '' } }, 'values.cost is empty'],
		[{ labels: {}, formats: 5 }, 'formats is not a table of formats'],
		[
			{ labels: {}, formats: { money: 'USD' } },
			'formats.money is not a number format the host reads',
		],
		[
			{ labels: {}, formats: { money: { style: 'cash' } } },
			'formats.money is not a number format the host reads',
		],
		[{ labels: {}, phrases: 5 }, 'phrases is not a table of phrase tables'],
		[{ labels: {}, phrases: { status: 5 } }, 'phrases.status is not a table of words'],
		[{ labels: {}, phrases: { rules: {} } }, 'phrases.rules is a table of the lexicon'],
		[{ labels: {}, phrases: { missing: {} } }, 'phrases.missing is a table of the lexicon'],
		[{ labels: {}, templates: { greeting: '' } }, 'templates.greeting is empty'],
		[
			{ labels: {}, templates: { 'prompt.base': 'x' } },
			'templates."prompt.base" is a frame of the lexicon',
		],
		[
			{ labels: {}, words: {} },
			'words is not one of labels, units, values, formats, phrases, templates',
		],
	])('scanGlossary refuses %j', (input, finding) => {
		expect(scanGlossary(input)).toEqual([finding])
	})

	it('mergeLexicon overrides one word and keeps every other, in a frozen copy', () => {
		const input = {
			comparisons: { from: { fails: 'is below' } },
			rules: { met: 'fires' },
			joins: { last: ' plus ' },
			limits: { list: 2 },
			missing: 'is unknown',
		}
		const merged = mergeLexicon(DEFAULT_LEXICON, input)
		expect(merged).toEqual({
			...DEFAULT_LEXICON,
			comparisons: {
				...DEFAULT_LEXICON.comparisons,
				from: { holds: 'is at least', fails: 'is below' },
			},
			rules: { met: 'fires', unmet: 'does not apply', unread: 'cannot be decided' },
			joins: { reasons: '; ', last: ' plus ' },
			limits: { list: 2, reasons: 4 },
			missing: 'is unknown',
		})
		input.rules.met = 'changed'
		expect(merged.rules.met).toBe('fires')
		expect(Object.isFrozen(merged) && Object.isFrozen(merged.comparisons.from)).toBe(true)
	})

	it('DEFAULT_LEXICON words every frame with only the slots it offers', () => {
		expect(Object.keys(DEFAULT_LEXICON.frames).toSorted()).toEqual(
			Object.keys(FRAME_SLOTS).toSorted(),
		)
		expect(
			Object.entries(DEFAULT_LEXICON.frames).flatMap(([id, frame]) =>
				isFrameName(id) ? scanFrame(id, frame) : [id],
			),
		).toEqual([])
	})

	it('resolveLexicon, resolveGlossary, and resolveLocale own what stands and refuse the rest', () => {
		expect(resolveLexicon()).toEqual(DEFAULT_LEXICON)
		expect(resolveLexicon({ missing: 'is unknown' }).missing).toBe('is unknown')
		expect(resolveGlossary()).toEqual({ labels: {} })
		const labels = { cost: 'Cost' }
		const glossary = resolveGlossary({ labels })
		labels.cost = 'changed'
		expect(glossary.labels.cost).toBe('Cost')
		expect(resolveLocale()).toBe('en-US')
		expect(resolveLocale('fr-CA')).toBe('fr-CA')
		const refused = [
			captureError(() => resolveLexicon({ missing: '' })),
			captureError(() => resolveGlossary({ labels: { cost: '' } })),
			captureError(() => resolveLocale('')),
		]
		expect(refused.map((error) => isInterpretError(error) && error.code)).toEqual([
			'LEXICON',
			'GLOSSARY',
			'LEXICON',
		])
	})
})

describe('the gaps', () => {
	it('matchesNumericCheck reads which checks print a number of their field', () => {
		for (const operator of ['above', 'below', 'from', 'to', 'between', 'outside'] as const) {
			expect(matchesNumericCheck({ field: 'n', operator, value: 'x' })).toBe(true)
		}
		expect(matchesNumericCheck({ field: 'n', operator: 'equals', value: 5 })).toBe(true)
		expect(matchesNumericCheck({ field: 'n', operator: 'not', value: 'x' })).toBe(false)
		expect(matchesNumericCheck({ field: 'n', operator: 'any', value: ['x', 5] })).toBe(true)
		expect(matchesNumericCheck({ field: 'n', operator: 'none', value: ['x'] })).toBe(false)
		expect(matchesNumericCheck({ field: 'n', operator: 'any', value: 5 })).toBe(false)
	})

	it('collectFieldGaps, collectUnitGaps, and collectNameGaps name what is missing', () => {
		const formats = new Set(['count'])
		const glossary = { labels: { a: 'A' }, units: { a: 'count', b: 'acre', 'c.d': 'count' } }
		expect(collectFieldGaps('a', true, glossary, formats)).toEqual([])
		expect(collectFieldGaps('b', true, glossary, formats)).toEqual([
			{ word: 'label', field: 'b' },
			{ word: 'format', unit: 'acre' },
		])
		expect(collectFieldGaps(['c', 'd'], true, glossary, formats)).toEqual([
			{ word: 'label', field: ['c', 'd'] },
		])
		expect(collectFieldGaps('e', true, glossary, formats)).toEqual([
			{ word: 'label', field: 'e' },
			{ word: 'unit', field: 'e' },
		])
		expect(collectFieldGaps('e', false, glossary, formats)).toEqual([{ word: 'label', field: 'e' }])
		expect(collectUnitGaps(undefined, formats)).toEqual([])
		expect(collectUnitGaps('count', formats)).toEqual([])
		expect(collectUnitGaps('acre', formats)).toEqual([{ word: 'format', unit: 'acre' }])
		expect(collectNameGaps('group', { id: 'g', name: 'Group' })).toEqual([])
		expect(collectNameGaps('group', { id: 'g', name: 'g' })).toEqual([
			{ word: 'name', part: 'group', id: 'g' },
		])
		expect(collectNameGaps('factor', { id: 'f', name: ' ' })).toEqual([
			{ word: 'name', part: 'factor', id: 'f' },
		])
	})

	it('filterUniqueGaps keeps the first of each, two spellings of one path alike', () => {
		expect(
			filterUniqueGaps([
				{ word: 'label', field: ['a', 'b'] },
				{ word: 'unit', field: 'a.b' },
				{ word: 'label', field: 'a.b' },
				{ word: 'label', field: 'c' },
			]),
		).toEqual([
			{ word: 'label', field: ['a', 'b'] },
			{ word: 'unit', field: 'a.b' },
			{ word: 'label', field: 'c' },
		])
	})

	it('collectGaps reads each reasoning, and skips a disabled part and a concluded key', () => {
		const formats = new Set<string>()
		const logical = createLogicalDefinition('l', 'l', [
			createRule('r', [createAtom('a', 'above', 1)], createAtom('k', 'equals', true)),
			createRule('s', [createAtom('k', 'equals', true)], createAtom('m', 'equals', true), {
				name: 'Second',
			}),
			createRule('t', [createAtom('z', 'above', 1)], createAtom('n', 'equals', true), {
				enabled: false,
			}),
			createRule('u', [createAtom('k', 'equals', 'never')], createAtom('o', 'equals', true), {
				name: 'Fourth',
			}),
		])
		expect(collectGaps([logical, logical], { labels: {} }, formats)).toEqual([
			{ word: 'name', part: 'definition', id: 'l' },
			{ word: 'name', part: 'rule', id: 'r' },
			{ word: 'label', field: 'a' },
			{ word: 'unit', field: 'a' },
			{ word: 'label', field: 'k' },
		])
		const quantitative = createQuantitativeDefinition('q', 'Q', [
			createFactorGroup('g', 'sum', [
				createFieldFactor('f', ['x', 'y'], {
					checks: [{ field: 'c', operator: 'to', value: 5 }],
				}),
				createStaticFactor('off', 1, { enabled: false }),
			]),
		])
		expect(collectGaps([quantitative], { labels: {}, values: { q: 'acre' } }, formats)).toEqual([
			{ word: 'name', part: 'group', id: 'g' },
			{ word: 'name', part: 'factor', id: 'f' },
			{ word: 'label', field: ['x', 'y'] },
			{ word: 'unit', field: ['x', 'y'] },
			{ word: 'label', field: 'c' },
			{ word: 'unit', field: 'c' },
			{ word: 'format', unit: 'acre' },
		])
		const symbolic = createSymbolicDefinition(
			's',
			'S',
			[
				createEquation(
					'e',
					createVariable('x'),
					createOperation('add', createVariable('seeded'), createVariable('y')),
					'x',
				),
			],
			{ variables: { seeded: 1 } },
		)
		expect(collectGaps([symbolic], { labels: {} }, formats)).toEqual([
			{ word: 'name', part: 'equation', id: 'e' },
			{ word: 'label', field: 'x' },
			{ word: 'label', field: 'y' },
		])
		const inferential = createInferentialDefinition(
			'i',
			'I',
			[],
			[createInference('n', [], createFact('c', 'p', []))],
		)
		expect(collectGaps([inferential], { labels: {} }, formats)).toEqual([
			{ word: 'name', part: 'inference', id: 'n' },
		])
	})
})

describe('the reasons', () => {
	const a = createAtom('a', 'equals', 1)
	const b = createAtom('b', 'equals', 1)
	const checks = [
		{ field: 'a', state: 'met', actual: 1 },
		{ field: 'b', state: 'unmet', actual: 2 },
	] as const

	const held = { check: { field: 'a', operator: 'equals', value: 1 }, result: checks[0] }

	it('settleOperands gives each operand the checks of its own atoms', () => {
		const settled = settleOperands([createCompound('and', [a, b]), a], [...checks, checks[0]])
		expect(settled.map(({ state, end }) => [state, end])).toEqual([
			['unmet', 2],
			['met', 3],
		])
		expect(settleOperands([a, b], []).map(({ state }) => state)).toEqual(['unread', 'unread'])
		expect(settleOperands([], checks)).toEqual([])
	})

	it('settleExpression settles every connective, and reads an absent check as unread', () => {
		const states = LOGICAL_OPERATORS.map(
			(operator) => settleExpression(createCompound(operator, [a, b]), checks).state,
		)
		expect(states).toEqual(['unmet', 'met', 'unread', 'unmet', 'met'])
		expect(settleExpression(createCompound('not', [a]), checks).state).toBe('unmet')
		expect(settleExpression(a, [])).toEqual({ state: 'unread', reasons: [], end: 1 })
		expect(settleExpression(createCompound('and', []), checks, 1)).toEqual({
			state: 'unread',
			reasons: [],
			end: 1,
		})
	})

	it('findConditionRules finds the rules whose value bears on a check of their key', () => {
		const gold = createRule('gold', [a], createAtom('tier', 'equals', 'gold'))
		const tin = createRule('tin', [b], createAtom('tier', 'equals', 'tin'))
		const concluders = collectConcluders([gold, tin])
		const cases = [
			['equals', 'gold', [gold]],
			['equals', 'lead', []],
			['any', ['gold', 'tin'], [gold, tin]],
			['not', 'gold', [gold]],
			['none', ['gold', 'tin'], [gold, tin]],
			['above', 5, []],
		] as const
		for (const [operator, value, rules] of cases) {
			expect(findConditionRules({ field: 'tier', operator, value }, concluders)).toEqual(rules)
		}
		expect(
			findConditionRules({ field: 'other', operator: 'equals', value: 1 }, concluders),
		).toEqual([])
		const unknown: Check = JSON.parse('{"field":"tier","operator":"near","value":1}')
		expect(findConditionRules(unknown, concluders)).toEqual([])
	})

	it('findGoalRule finds the workshop approval, and no goal among independent gates', () => {
		expect(findGoalRule(buildWorkshopRules())?.id).toBe('approve')
		expect(findGoalRule(buildWorkshopGates())).toBe(undefined)
	})

	it('findGoalRule reads the enabled rules alone', () => {
		const first = createRule('first', [a], createAtom('one', 'equals', true))
		const apart = createRule('apart', [b], createAtom('two', 'equals', true))
		const goal = createRule(
			'goal',
			[b, createCompound('not', [createCompound('or', [a, createAtom('one', 'equals', true)])])],
			createAtom('three', 'equals', true),
		)
		const off = { enabled: false } as const
		const cases = [
			['one rule', [apart], apart],
			['a last rule that reads a concluded key', [first, apart, goal], goal],
			['a goal that is not last', [first, goal, apart], undefined],
			['a disabled last rule behind a goal', [first, goal, { ...apart, ...off }], goal],
			['a disabled last rule, the goal', [first, apart, { ...goal, ...off }], undefined],
			['one rule left enabled', [first, { ...goal, ...off }], first],
			['a concluder that is disabled', [{ ...first, ...off }, apart, goal], undefined],
			['every rule disabled', [{ ...first, ...off }], undefined],
			['no rule', [], undefined],
		] as const
		for (const [title, rules, found] of cases) {
			const definition = createLogicalDefinition('d', 'D', rules)
			expect([title, findGoalRule(definition)]).toEqual([title, found])
		}
	})

	it('findGoalRule reads a key by its display path, and no key a rule reads of itself', () => {
		const nested = createRule('nested', [a], createAtom(['seat', 'free'], 'equals', true))
		const reader = createRule(
			'reader',
			[createAtom('seat.free', 'equals', true)],
			createAtom('open', 'equals', true),
		)
		const selfish = createRule(
			'selfish',
			[createAtom('open', 'equals', true)],
			createAtom('open', 'equals', true),
		)
		expect(findGoalRule(createLogicalDefinition('d', 'D', [nested, reader]))).toBe(reader)
		expect(findGoalRule(createLogicalDefinition('d', 'D', [nested, selfish]))).toBe(undefined)
		expect(findGoalRule(createLogicalDefinition('d', 'D', [nested, reader, selfish]))).toBe(selfish)
	})

	it('findSoleExpression unwraps an and or an or over one operand, and nothing else', () => {
		const negated = createCompound('not', [a])
		const pair = createCompound('or', [a, b])
		expect(findSoleExpression(a)).toBe(a)
		expect(findSoleExpression(createCompound('and', [createCompound('or', [a])]))).toBe(a)
		expect(findSoleExpression(createCompound('and', [negated]))).toBe(negated)
		expect(findSoleExpression(negated)).toBe(negated)
		expect(findSoleExpression(pair)).toBe(pair)
		const empty = createCompound('and', [])
		expect(findSoleExpression(empty)).toBe(empty)
	})

	it('findDecidingOperands names unread operands alone for an unread state, and settling them settles it', () => {
		const states = ['met', 'unmet', 'unread'] as const
		const arities = { and: [1, 2, 3], or: [1, 2, 3], not: [1], implies: [2], xor: [2] } as const
		for (const operator of LOGICAL_OPERATORS) {
			for (const arity of arities[operator]) {
				const assignments = Array.from({ length: 3 ** arity }, (_, number) =>
					Array.from(
						{ length: arity },
						(_entry, index) => states[Math.floor(number / 3 ** index) % 3] ?? 'met',
					),
				)
				const open = assignments
					.filter((assignment) => combineStates(operator, assignment) === 'unread')
					.filter((assignment) => {
						const deciding = findDecidingOperands(operator, assignment)
						return (
							deciding.length === 0 ||
							deciding.some((index) => assignment[index] !== 'unread') ||
							assignments.some(
								(other) =>
									combineStates(operator, other) === 'unread' &&
									other.every((state, index) =>
										deciding.includes(index) ? state !== 'unread' : state === assignment[index],
									),
							)
						)
					})
				expect(open).toEqual([])
			}
		}
	})

	it('findDecidingOperands names operands that fix a settled state, over every assignment', () => {
		const states = ['met', 'unmet', 'unread'] as const
		const arities = { and: [1, 2, 3], or: [1, 2, 3], not: [1], implies: [2], xor: [2] } as const
		for (const operator of LOGICAL_OPERATORS) {
			for (const arity of arities[operator]) {
				const assignments = Array.from({ length: 3 ** arity }, (_, number) =>
					Array.from(
						{ length: arity },
						(_entry, index) => states[Math.floor(number / 3 ** index) % 3] ?? 'met',
					),
				)
				const moved = assignments
					.filter((assignment) => combineStates(operator, assignment) !== 'unread')
					.flatMap((assignment) => {
						const deciding = findDecidingOperands(operator, assignment)
						const state = combineStates(operator, assignment)
						return assignments
							.filter((other) => deciding.every((index) => other[index] === assignment[index]))
							.filter((other) => combineStates(operator, other) !== state)
					})
				expect(moved).toEqual([])
			}
		}
		expect(findDecidingOperands('and', ['met', 'unmet', 'unmet'])).toEqual([1])
		expect(findDecidingOperands('or', ['unmet', 'met', 'met'])).toEqual([1])
		expect(findDecidingOperands('implies', ['unmet', 'met'])).toEqual([0])
		expect(findDecidingOperands('implies', ['met', 'met'])).toEqual([1])
		expect(findDecidingOperands('xor', ['unread', 'met'])).toEqual([0])
	})

	it('settleExpression walks to the deciding atoms', () => {
		const tree = createCompound('not', [createCompound('or', [b, a])])
		expect(settleExpression(tree, [checks[1], checks[0]]).reasons).toEqual([held])
	})

	it('collectReasons collects a check cited twice once, and nothing for a result of another rule', () => {
		const rule = createRule('r', [createCompound('or', [a, b]), a], createAtom('x', 'equals', true))
		const result = {
			id: 'r',
			state: 'met',
			premises: ['met', 'met'],
			checks: [...checks, checks[0]],
		} as const
		expect(collectReasons(rule, result)).toEqual([held])
		expect(collectReasons(rule, { ...result, checks: [...checks] })).toEqual([])
		expect(collectReasons(rule, { ...result, checks: [checks[1], checks[0], checks[0]] })).toEqual(
			[],
		)
		expect(collectReasons(rule, { ...result, state: 'unmet' })).toEqual([])
		expect(collectReasons(rule, { ...result, premises: ['met', 'unmet'] })).toEqual([])
		expect(collectReasons(rule, { ...result, premises: ['met'] })).toEqual([])
	})

	it('collectReasons gives nothing for a tree too deep to walk', () => {
		const deep = Array.from({ length: 20000 }).reduce<Expression>(
			(inner) => createCompound('not', [inner]),
			a,
		)
		const rule = createRule('r', [deep], createAtom('x', 'equals', true))
		expect(
			collectReasons(rule, { id: 'r', state: 'met', premises: ['met'], checks: [checks[0]] }),
		).toEqual([])
	})
})

describe("the account's text", () => {
	const verdict = buildAccountLine({
		role: 'verdict',
		decisive: true,
		text: 'verdict',
		summary: 'verdict, because why',
		lines: [
			buildAccountLine({ role: 'reason', decisive: true, text: 'why' }),
			buildAccountLine({ role: 'step', text: 'aside' }),
		],
	})
	const step = buildAccountLine({
		role: 'step',
		text: 'step',
		lines: [buildAccountLine({ role: 'reason', decisive: true, text: 'under' })],
	})

	it('normalizeLine makes one space of each run of line breaks', () => {
		expect(normalizeLine('one\r\n\u{2028}two\vthree')).toBe('one two three')
		expect(normalizeLine('one  two')).toBe('one  two')
	})

	it('buildAccountLine fills what is absent, and keeps each gap once', () => {
		expect(buildAccountLine({ role: 'step', text: 'a\nb' })).toEqual({
			role: 'step',
			decisive: false,
			text: 'a b',
			summary: 'a b',
			source: {},
			gaps: [],
			lines: [],
		})
		expect(
			buildAccountLine({
				role: 'reason',
				state: 'met',
				decisive: true,
				text: 'a',
				summary: 'a\r\nb',
				source: { rule: 'r' },
				gaps: [
					{ word: 'unit', field: 'a' },
					{ word: 'unit', field: 'a' },
				],
				lines: [step],
			}),
		).toEqual({
			role: 'reason',
			state: 'met',
			decisive: true,
			text: 'a',
			summary: 'a b',
			source: { rule: 'r' },
			gaps: [{ word: 'unit', field: 'a' }],
			lines: [step],
		})
	})

	it('collectFaultFields reads the faults of every line, nested ones too', () => {
		const fault = { reason: 'missing', path: ['a', 'b'], expected: 'number' } as const
		const inner = buildAccountLine({ role: 'reason', text: 'x', source: { fault } })
		const outer = buildAccountLine({ role: 'reason', text: 'y', lines: [step, inner] })
		expect(collectFaultFields([verdict, outer])).toEqual(new Set(['a.b']))
		expect(collectFaultFields([])).toEqual(new Set())
	})

	it('renderReasons joins reasons, with its own word before the last', () => {
		const joins = { reasons: '; ', last: '; and ' }
		expect(renderReasons([], joins)).toBe('')
		expect(renderReasons(['a'], joins)).toBe('a')
		expect(renderReasons(['a', 'b'], joins)).toBe('a; and b')
		expect(renderReasons(['a', 'b', 'c'], joins)).toBe('a; b; and c')
	})

	it('renderName prints the name, then the id, then the quoted id', () => {
		expect(renderName({ id: 'r', name: 'Rule' })).toBe('Rule')
		expect(renderName({ id: 'r', name: ' ' })).toBe('r')
		expect(renderName({ id: '', name: '' })).toBe('""')
	})

	it('renderAccount prints the verdict, the deciding lines, or every line', () => {
		const account: Account = { id: 'd', name: 'D', lines: [verdict, step] }
		expect(renderAccount(account, { detail: 'line' })).toBe('verdict, because why')
		expect(renderAccount(account, { detail: 'reasons' })).toBe('verdict\n  why')
		expect(renderAccount(account)).toBe('verdict\n  why')
		expect(renderAccount(account, { detail: 'full' })).toBe(
			'verdict\n  why\n  aside\nstep\n  under',
		)
		expect(renderAccount({ ...account, lines: [] })).toBe('')
		expect(collectAccountText([step], 'full', 2)).toEqual(['    step', '      under'])
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

	it('matchesArrayField reads an array and a nullable array, and nothing else', () => {
		const shape = objectShape({
			a: arrayShape(numberShape()),
			b: nullableShape(arrayShape(numberShape())),
			c: optionalShape(arrayShape(numberShape())),
			d: numberShape(),
			e: nullableShape(numberShape()),
		})
		expect(matchesArrayField(shape, 'a')).toBe(true)
		expect(matchesArrayField(shape, 'b')).toBe(true)
		expect(matchesArrayField(shape, 'c')).toBe(true)
		expect(matchesArrayField(shape, 'd')).toBe(false)
		expect(matchesArrayField(shape, 'e')).toBe(false)
		expect(matchesArrayField(shape, 'absent')).toBe(false)
	})

	it('findUnclaimedNumbers takes one number per claim, and reads an array by element', () => {
		expect(findUnclaimedNumbers(scanNumbers('25, 700'), [entity])).toEqual([700])
		expect(findUnclaimedNumbers(scanNumbers('25 25'), [entity])).toEqual([25])
		expect(findUnclaimedNumbers(scanNumbers('1 2 3'), [{ ...entity, value: [1, 3] }])).toEqual([2])
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

	it('scanRecipeShape reads the shape, what is mapped, and what is computed', () => {
		const recipe = buildInterpretRecipe({
			mappings: [
				{ entity: 'age', aliases: [], field: 'age' },
				{ entity: 'agee', aliases: [], field: 'agee' },
			],
			computations: [{ field: 'total', expression: createConstant(1) }],
			shape: objectShape({ age: numberShape() }),
		})
		expect(scanRecipeShape(recipe)).toEqual([
			'Field "agee" is mapped, and the shape does not declare it',
			'Field "total" is computed, and the shape does not declare it',
		])
		expect(scanRecipeShape(buildInterpretRecipe({ shape: numberShape() }))).toEqual(
			expect.arrayContaining(['Shape must describe an object']),
		)
		expect(scanRecipeShape(buildInterpretRecipe())).toEqual([])
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
	it('scanRecipeShape names a required field nothing fills', () => {
		const recipe = buildInterpretRecipe({
			mappings: [],
			shape: objectShape({ age: numberShape(), terms: objectShape({ rate: numberShape() }) }),
		})
		expect(scanRecipeShape(recipe)).toEqual([
			'Field "age" is required, and no mapping or computation fills it',
			'Field "terms.rate" is required, and no mapping or computation fills it',
		])
	})

	it('scanRecipeShape takes a mapping above or below a required field', () => {
		const below = buildInterpretRecipe({
			mappings: [{ entity: 'rate', aliases: [], field: ['terms', 'rate'] }],
			shape: objectShape({ terms: objectShape({ rate: numberShape() }) }),
		})
		const above = buildInterpretRecipe({
			mappings: [{ entity: 'terms', aliases: [], field: 'terms' }],
			shape: objectShape({ terms: objectShape({ rate: numberShape() }) }),
		})
		expect(scanRecipeShape(below)).toEqual([])
		expect(scanRecipeShape(above)).toEqual([])
	})

	it('scanRecipeShape names a variable nothing fills, and takes an element of a field', () => {
		const typo = buildInterpretRecipe({
			mappings: [{ entity: 'value', aliases: [], field: 'value' }],
			computations: [{ field: 'total', expression: createVariable('valuee') }],
		})
		expect(scanRecipeShape(typo)).toEqual([
			'Computation of "total" reads "valuee", which nothing fills',
		])
		const element = buildInterpretRecipe({
			mappings: [{ entity: 'value', aliases: [], field: 'value' }],
			computations: [{ field: 'total', expression: createVariable('value.0') }],
		})
		expect(scanRecipeShape(element)).toEqual([])
		const defaulted = buildInterpretRecipe({
			mappings: [],
			computations: [{ field: 'total', expression: createVariable('rate') }],
			shape: objectShape({
				rate: optionalShape(numberShape(), { default: 2 }),
				total: numberShape(),
			}),
		})
		expect(scanRecipeShape(defaulted)).toEqual([])
	})

	it('scanRecipeShape names a shape that does not compile', () => {
		const recipe = buildInterpretRecipe({ mappings: [], shape: UNCOMPILABLE_SHAPE })
		const errors = scanRecipeShape(recipe)
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

	it('matchesFilledField takes the field, one above it, or one inside it, and never a near name', () => {
		expect(matchesFilledField('a', ['a'])).toBe(true)
		expect(matchesFilledField('a.b', ['a'])).toBe(true)
		expect(matchesFilledField('a', ['a.b'])).toBe(true)
		expect(matchesFilledField('a', ['ab'])).toBe(false)
		expect(matchesFilledField('a', [])).toBe(false)
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

	it('findUnclaimedNumbers sets aside what belongs to no quantity', () => {
		expect(findUnclaimedNumbers(scanNumbers('in 2019, 40 hours'), [])).toEqual([40])
		expect(findUnclaimedNumbers(scanNumbers('call me at 5551234 about 40 hours'), [])).toEqual([40])
		expect(findUnclaimedNumbers(scanNumbers('call 555-0142 about 40 hours'), [])).toEqual([
			'555-0142',
			40,
		])
	})
})
