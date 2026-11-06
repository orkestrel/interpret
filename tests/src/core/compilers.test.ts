import { arrayShape, numberShape, objectShape, preview } from '@orkestrel/contract'
import { assignEntities, compileEntities, scanNumbers, NUMBER_REFUSAL_LIMIT } from '@src/core'
import { describe, expect, it } from 'vitest'
import {
	ADMITTED_CLAIMS,
	NEIGHBOR_FORMS,
	PRECEDING_NEIGHBORS,
	OPEN_SHAPE,
	REVIEWER_LOAN_READINGS,
	UNDECLARED_NEIGHBORS,
	WHOLE_NUMBER_FORMS,
} from '../../setup.js'

describe('compileEntities — a field word before a sentence end', () => {
	it.each([
		['for 2 nights.', { nights: 2 }],
		['for 2 nights...', { nights: 2 }],
		['for 2 nights. Thanks', { nights: 2 }],
		['for 2 nights. 3 people', { nights: 2, people: 3 }],
		['for 2 nights. 3 people.', { nights: 2, people: 3 }],
		['for 2 nights and 3 guests.', { nights: 2, people: 3 }],
		['for 2 nights.ok', {}],
		['for 2 nights. 3 nights.', {}],
	])('reads %s', (text, expected) => {
		const mappings = [
			{ entity: 'nights', aliases: [], field: 'nights' },
			{ entity: 'people', aliases: ['guests'], field: 'people' },
		]
		const held = compileEntities(scanNumbers(text), mappings, text, OPEN_SHAPE).entities
		expect(Object.fromEntries(held.map((entity) => [entity.name, entity.value]))).toEqual(expected)
	})
})

describe('compileEntities — admitted neighbors', () => {
	it('refuses the last word of an alias without its first word', () => {
		const text = 'amount 50000 income'
		const result = compileEntities(
			scanNumbers(text),
			[
				{ entity: 'amount', aliases: [], field: 'amount' },
				{ entity: 'earnings', aliases: ['monthly income'], field: 'income' },
			],
			text,
			OPEN_SHAPE,
		)
		expect(result.entities).toEqual([])
		expect(result.refusals?.items[0]).toMatchObject({
			reason: 'following-word',
			word: preview('income'),
		})
	})
	it.each(['for', 'per', 'via', 'within', 'into', 'onto'])(
		'refuses the near-miss link %s before a declared anchor',
		(link) => {
			const text = `amount 3 ${link} income`
			const result = compileEntities(
				scanNumbers(text),
				['amount', 'income'].map((entity) => ({ entity, aliases: [], field: entity })),
				text,
				OPEN_SHAPE,
			)
			expect(result.entities).toEqual([])
			expect(result.refusals?.items[0]).toMatchObject({
				reason: 'following-word',
				word: preview(link),
			})
		},
	)
	it.each(PRECEDING_NEIGHBORS)(
		'refuses the preceding neighbor %s across numeric forms',
		(before) => {
			for (const form of NEIGHBOR_FORMS) {
				const text = `${before} ${form} value`
				const result = compileEntities(
					scanNumbers(text),
					[{ entity: 'value', aliases: [], field: 'value' }],
					text,
					OPEN_SHAPE,
				)
				expect(result.entities).toEqual([])
				expect(result.refusals?.items.at(-1)).toMatchObject({
					reason: 'preceding-word',
					word: preview(before.trim().split(/\s+/).at(-1)),
				})
			}
		},
	)
	it.each(['under', 'less than', 'nearly', 'at most'])(
		'refuses the existing hedge flag before %s 2 years',
		(before) => {
			const text = `${before} 2 years`
			const result = compileEntities(
				scanNumbers(text),
				[{ entity: 'years', aliases: [], field: 'years' }],
				text,
				OPEN_SHAPE,
			)
			expect(result.entities).toEqual([])
			expect(result.refusals?.items[0]).toMatchObject({
				reason: 'preceding-word',
				word: preview(before.split(' ').at(-1)),
			})
		},
	)
	it.each(['3 years', 'for 3 years', 'have 3 years', 'income 120000, 3 years'])(
		'retains the backward control %s',
		(text) => {
			const result = compileEntities(
				scanNumbers(text),
				['income', 'years'].map((entity) => ({ entity, aliases: [], field: entity })),
				text,
				OPEN_SHAPE,
			)
			expect(result.entities.find((entity) => entity.name === 'years')?.value).toBe(3)
		},
	)
	it.each(['amount:€ 50000', 'amount=€ 50000', 'amount:€50000', 'amount: € 50000', 'amount:50000'])(
		'refuses the undeclared currency or glued token %s',
		(text) => {
			expect(
				compileEntities(
					scanNumbers(text),
					[{ entity: 'amount', aliases: [], field: 'amount' }],
					text,
					OPEN_SHAPE,
				).entities,
			).toEqual([])
			expect(scanNumbers(text).every((number) => number.unreadable !== undefined)).toBe(true)
		},
	)
	it.each([
		'monthly payments',
		'monthly',
		'monthly incomes',
		'and monthly payments',
		'with a monthly payments',
	])('refuses an incomplete alias neighbor %s', (neighbor) => {
		const text = `amount 50000 ${neighbor}`
		expect(
			compileEntities(
				scanNumbers(text),
				[
					{ entity: 'amount', aliases: [], field: 'amount' },
					{ entity: 'income', aliases: ['monthly income'], field: 'income' },
				],
				text,
				OPEN_SHAPE,
			).entities,
		).toEqual([])
	})
	it.each(['is', 'of', 'at', 'to', 'a', 'an', 'the', 'and', 'with'])(
		'admits the link %s only before the whole anchor',
		(link) => {
			for (const form of NEIGHBOR_FORMS) {
				const text = `value ${form} ${link} monthly income`
				const result = compileEntities(
					scanNumbers(text),
					[
						{ entity: 'value', aliases: [], field: 'value' },
						{ entity: 'income', aliases: ['monthly income'], field: 'income' },
					],
					text,
					OPEN_SHAPE,
				)
				expect(result.entities.find((entity) => entity.name === 'value')?.value).toBe(
					scanNumbers(form)[0]?.value,
				)
			}
		},
	)
	it.each(['\n', ' ', ', '])(
		'claims colon fields forward without a wrong tie across %j',
		(separator) => {
			const text = ['amount: 50000', 'income: 120000', 'years: 3'].join(separator)
			const result = compileEntities(
				scanNumbers(text),
				['amount', 'income', 'years'].map((entity) => ({ entity, aliases: [], field: entity })),
				text,
				OPEN_SHAPE,
			)
			expect(result.entities.map(({ name, value }) => ({ name, value }))).toEqual([
				{ name: 'amount', value: 50000 },
				{ name: 'income', value: 120000 },
				{ name: 'years', value: 3 },
			])
		},
	)
	it('claims both fields beside the full monthly income alias', () => {
		const text = 'amount 50000 monthly income 120000'
		const result = compileEntities(
			scanNumbers(text),
			[
				{ entity: 'amount', aliases: [], field: 'amount' },
				{ entity: 'income', aliases: ['monthly income'], field: 'income' },
			],
			text,
			OPEN_SHAPE,
		)
		expect(result.entities.map(({ name, value }) => ({ name, value }))).toEqual([
			{ name: 'amount', value: 50000 },
			{ name: 'income', value: 120000 },
		])
	})
	it.each(['.', '!', '?', ';'])('admits the attached sentence end %s', (mark) => {
		const text = `value 3${mark} unknown`
		expect(
			compileEntities(
				scanNumbers(text),
				[{ entity: 'value', aliases: [], field: 'value' }],
				text,
				OPEN_SHAPE,
			).entities.map((entity) => entity.value),
		).toEqual([3])
	})
	it.each(['three.Next', '3\n Next'])('refuses a missing sentence boundary in %s', (form) => {
		const text = `value ${form}`
		expect(
			compileEntities(
				scanNumbers(text),
				[{ entity: 'value', aliases: [], field: 'value' }],
				text,
				OPEN_SHAPE,
			).entities,
		).toEqual([])
	})
	it('keeps the unseparated control tied with no entity', () => {
		const text = 'amount 50000 income 120000'
		const mappings = ['amount', 'income'].map((entity) => ({ entity, aliases: [], field: entity }))
		const result = compileEntities(scanNumbers(text), mappings, text, OPEN_SHAPE)
		expect(result.entities).toEqual([])
		expect(result.refusals?.items).toEqual([
			{ text: '"50000"', start: 7, end: 12, reason: 'anchor-tie', field: 'income' },
			{ text: '"120000"', start: 20, end: 26, reason: 'anchor-tie', field: 'income' },
		])
	})
	it.each(UNDECLARED_NEIGHBORS)('refuses the undeclared neighbor %s', (neighbor) => {
		for (const form of NEIGHBOR_FORMS) {
			const text = `value ${form} ${neighbor}`
			expect(
				compileEntities(
					scanNumbers(text),
					[{ entity: 'value', aliases: [], field: 'value' }],
					text,
					OPEN_SHAPE,
				).entities,
			).toEqual([])
		}
		const text = `value 3 ${neighbor}`
		const result = compileEntities(
			scanNumbers(text),
			[{ entity: 'value', aliases: [], field: 'value' }],
			text,
			OPEN_SHAPE,
		)
		expect(result.entities).toEqual([])
		expect(result.refusals?.items[0]).toMatchObject({
			reason: 'following-word',
			word: preview(neighbor.split(' ')[0]),
		})
		const spoken = `value three ${neighbor}`
		expect(
			compileEntities(
				scanNumbers(spoken),
				[{ entity: 'value', aliases: [], field: 'value' }],
				spoken,
				OPEN_SHAPE,
			).entities,
		).toEqual([])
	})
	it.each(ADMITTED_CLAIMS)('retains the assignment control %s', (text, values) => {
		const mappings = ['amount', 'income', 'value'].map((entity) => ({
			entity,
			aliases: [],
			field: entity,
		}))
		expect(
			compileEntities(scanNumbers(text), mappings, text, OPEN_SHAPE).entities.map(
				(entity) => entity.value,
			),
		).toEqual(values)
	})
})

describe('compileEntities', () => {
	it('preserves a linked later rate against a preceding number', () => {
		const text = '7 interest rate is 5'
		const result = compileEntities(
			scanNumbers(text),
			[{ entity: 'rate', aliases: ['interest rate'], field: 'rate' }],
			text,
			OPEN_SHAPE,
		)
		expect(result.entities.map((entity) => [entity.name, entity.value])).toEqual([['rate', 5]])
	})
	it('preserves the following rate against a preceding number', () => {
		const text = '5 interest rate is 6'
		const result = compileEntities(
			scanNumbers(text),
			[{ entity: 'rate', aliases: ['interest rate'], field: 'rate' }],
			text,
			OPEN_SHAPE,
		)
		expect(result.entities.map((entity) => [entity.name, entity.value])).toEqual([['rate', 6]])
	})
	it('preserves term and rate beside the longer alias', () => {
		const text = 'term 30 interest rate is 5'
		const result = compileEntities(
			scanNumbers(text),
			[
				{ entity: 'term', aliases: [], field: 'term' },
				{ entity: 'rate', aliases: ['interest rate'], field: 'rate' },
			],
			text,
			OPEN_SHAPE,
		)
		expect(result.entities.map((entity) => [entity.name, entity.value])).toEqual([
			['term', 30],
			['rate', 5],
		])
	})
	it('preserves training hours and independent hours', () => {
		const text = 'training hours 30. hours 40'
		const result = compileEntities(
			scanNumbers(text),
			[
				{ entity: 'training hours', aliases: [], field: 'training' },
				{ entity: 'hours', aliases: [], field: 'hours' },
			],
			text,
			OPEN_SHAPE,
		)
		expect(result.entities.map((entity) => [entity.name, entity.value])).toEqual([
			['training hours', 30],
			['hours', 40],
		])
	})
	it('preserves lab hours and independent hours', () => {
		const text = 'lab hours 97. hours 16'
		const result = compileEntities(
			scanNumbers(text),
			[
				{ entity: 'lab hours', aliases: [], field: 'lab' },
				{ entity: 'hours', aliases: [], field: 'hours' },
			],
			text,
			OPEN_SHAPE,
		)
		expect(result.entities.map((entity) => [entity.name, entity.value])).toEqual([
			['lab hours', 97],
			['hours', 16],
		])
	})
	it('preserves total lab hours and independent hours', () => {
		const text = 'total lab hours 9. hours 16'
		const result = compileEntities(
			scanNumbers(text),
			[
				{ entity: 'total lab hours', aliases: [], field: 'lab' },
				{ entity: 'hours', aliases: [], field: 'hours' },
			],
			text,
			OPEN_SHAPE,
		)
		expect(result.entities.map((entity) => [entity.name, entity.value])).toEqual([
			['total lab hours', 9],
			['hours', 16],
		])
	})
	it('preserves the conflict between lab time and its time alias', () => {
		const text = 'lab time 9. time 16'
		const result = compileEntities(
			scanNumbers(text),
			[{ entity: 'lab time', aliases: ['time'], field: 'time' }],
			text,
			OPEN_SHAPE,
		)
		expect(result.entities).toEqual([])
		expect(result.refusals?.items).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ reason: 'anchor-conflict', field: 'time' }),
			]),
		)
	})
	it('preserves lab time and an independent time alias', () => {
		const text = 'lab time 9. time 16'
		const result = compileEntities(
			scanNumbers(text),
			[
				{ entity: 'lab time', aliases: [], field: 'lab' },
				{ entity: 'duration', aliases: ['time'], field: 'time' },
			],
			text,
			OPEN_SHAPE,
		)
		expect(result.entities.map((entity) => [entity.name, entity.value])).toEqual([
			['lab time', 9],
			['duration', 16],
		])
	})
	it('preserves down payment and independent payment', () => {
		const text = 'down payment 20000, monthly payment 1500'
		const result = compileEntities(
			scanNumbers(text),
			[
				{ entity: 'down payment', aliases: [], field: 'down' },
				{ entity: 'payment', aliases: [], field: 'payment' },
			],
			text,
			OPEN_SHAPE,
		)
		expect(result.entities.map((entity) => [entity.name, entity.value])).toEqual([
			['down payment', 20000],
			['payment', 1500],
		])
	})
	it('includes selected anchors from mappings with equal starts', () => {
		const text = 'reserve lab hours billed 97. hours 16'
		const result = compileEntities(
			scanNumbers(text),
			[
				{ entity: 'hours', aliases: [], field: 'hours' },
				{ entity: 'hours billed', aliases: [], field: 'hours' },
			],
			text,
			OPEN_SHAPE,
		)
		expect(result.entities).toEqual([])
		expect(result.refusals?.items).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ reason: 'anchor-conflict', field: 'hours' }),
			]),
		)
	})
	it("includes a selected phrase beside another mapping's later rate", () => {
		const text = 'reserve lab 7 interest rate, my rate is 5'
		const result = compileEntities(
			scanNumbers(text),
			[
				{ entity: 'rate', aliases: [], field: 'rate' },
				{ entity: 'interest rate', aliases: [], field: 'rate' },
			],
			text,
			OPEN_SHAPE,
		)
		expect(result.entities).toEqual([])
		expect(result.refusals?.items).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ reason: 'anchor-conflict', field: 'rate' }),
			]),
		)
	})
	it('lets a displaced phrase speak when its later alias is silent', () => {
		const text = 'reserve lab 7 interest rate, my rate is 5'
		const result = compileEntities(
			scanNumbers(text),
			[{ entity: 'rate', aliases: ['interest rate'], field: 'rate' }],
			text,
			OPEN_SHAPE,
		)
		expect(result.entities).toEqual([])
		expect(result.refusals?.items).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ reason: 'anchor-conflict', field: 'rate' }),
			]),
		)
	})
	it('keeps the selected longer entity when its alias shares its start', () => {
		const text = 'reserve lab hours 16. hours billed 97'
		const result = compileEntities(
			scanNumbers(text),
			[{ entity: 'hours billed', aliases: ['hours'], field: 'hours' }],
			text,
			OPEN_SHAPE,
		)
		expect(result.entities).toEqual([])
		expect(result.refusals?.items).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ reason: 'anchor-conflict', field: 'hours' }),
			]),
		)
	})
	it('keeps the selected hours inside a token-gated phrase', () => {
		const text = 'hours 16. pre-lab hours 97'
		const result = compileEntities(
			scanNumbers(text),
			[
				{ entity: 'hours', aliases: [], field: 'hours' },
				{ entity: 'lab hours', aliases: [], field: 'lab' },
			],
			text,
			OPEN_SHAPE,
		)
		expect(result.entities.filter((entity) => entity.name === 'hours')).toEqual([])
		expect(result.refusals?.items).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ reason: 'anchor-conflict', field: 'hours' }),
			]),
		)
	})
	it('keeps the longer alias at equal starts for term length', () => {
		const text = 'reserve lab term length 30. term 15'
		const result = compileEntities(
			scanNumbers(text),
			[{ entity: 'term', aliases: ['term length'], field: 'term' }],
			text,
			OPEN_SHAPE,
		)
		expect(result.entities).toEqual([])
		expect(result.refusals?.items).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ reason: 'anchor-conflict', field: 'term' }),
			]),
		)
	})
	it('keeps the longer billed-hours alias at equal starts', () => {
		const text = 'hours billed 97. hours 16'
		const result = compileEntities(
			scanNumbers(text),
			[{ entity: 'hours', aliases: ['hours billed'], field: 'hours' }],
			text,
			OPEN_SHAPE,
		)
		expect(result.entities).toEqual([])
		expect(result.refusals?.items).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ reason: 'anchor-conflict', field: 'hours' }),
			]),
		)
	})
	it('keeps the longer interest alias at equal starts', () => {
		const text = 'rate of interest 5. rate 6'
		const result = compileEntities(
			scanNumbers(text),
			[{ entity: 'rate', aliases: ['rate of interest'], field: 'rate' }],
			text,
			OPEN_SHAPE,
		)
		expect(result.entities).toEqual([])
		expect(result.refusals?.items).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ reason: 'anchor-conflict', field: 'rate' }),
			]),
		)
	})
	it('lets an earlier alias speak when the kept rate has no link', () => {
		const text = '5 interest rate, rate 6'
		const result = compileEntities(
			scanNumbers(text),
			[{ entity: 'rate', aliases: ['interest rate'], field: 'rate' }],
			text,
			OPEN_SHAPE,
		)
		expect(result.entities).toEqual([])
		expect(result.refusals?.items).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ reason: 'anchor-conflict', field: 'rate' }),
			]),
		)
	})
	it('refuses ownership by a phrase crossing a comma', () => {
		const text = 'reserve the lab, hours 97. hours 16'
		const result = compileEntities(
			scanNumbers(text),
			[
				{ entity: 'hours', aliases: [], field: 'hours' },
				{ entity: 'lab hours', aliases: [], field: 'lab' },
			],
			text,
			OPEN_SHAPE,
		)
		expect(result.entities.filter((entity) => entity.name === 'hours')).toEqual([])
		expect(result.refusals?.items).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ reason: 'anchor-conflict', field: 'hours' }),
			]),
		)
	})
	it('refuses ownership by a phrase crossing a semicolon', () => {
		const text = 'lab; hours 97; hours 16'
		const result = compileEntities(
			scanNumbers(text),
			[
				{ entity: 'hours', aliases: [], field: 'hours' },
				{ entity: 'lab hours', aliases: [], field: 'lab' },
			],
			text,
			OPEN_SHAPE,
		)
		expect(result.entities.filter((entity) => entity.name === 'hours')).toEqual([])
		expect(result.refusals?.items).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ reason: 'anchor-conflict', field: 'hours' }),
			]),
		)
	})
	it("does not treat an equal span as another field's longer owner", () => {
		const text = 'hours 30. hours 40'
		const result = compileEntities(
			scanNumbers(text),
			[
				{ entity: 'hours', aliases: [], field: 'hours' },
				{ entity: 'hours', aliases: [], field: 'training' },
			],
			text,
			OPEN_SHAPE,
		)
		expect(result.entities).toEqual([])
		expect(result.refusals?.items).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ reason: 'anchor-conflict', field: 'hours' }),
			]),
		)
	})
	it('keeps the longer equal-start span when both spans speak', () => {
		const text = '5 rate of interest 6'
		const result = compileEntities(
			scanNumbers(text),
			[{ entity: 'rate', aliases: ['rate of interest'], field: 'rate' }],
			text,
			OPEN_SHAPE,
		)
		expect(result.entities).toEqual([])
		expect(result.refusals?.items).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ reason: 'anchor-conflict', field: 'rate' }),
			]),
		)
	})
	it('tracks the longest prefix owner past an intervening shorter anchor', () => {
		const text = 'training session hours 30. hours 40'
		const result = compileEntities(
			scanNumbers(text),
			[
				{ entity: 'training session hours', aliases: [], field: 'training' },
				{ entity: 'session', aliases: [], field: 'session' },
				{ entity: 'hours', aliases: [], field: 'hours' },
			],
			text,
			OPEN_SHAPE,
		)
		expect(result.entities.map((entity) => [entity.name, entity.value])).toEqual([
			['training session hours', 30],
			['hours', 40],
		])
	})
	it('retains correction when a candidate is changed without being suspect', () => {
		const text = 'wait. hours 30. changed hours 40'
		const numbers = scanNumbers(text)
		expect(numbers[1]?.changed).toBe(true)
		expect(numbers[1]?.suspect).not.toBe(true)
		const result = compileEntities(
			numbers,
			[{ entity: 'hours', aliases: [], field: 'hours' }],
			text,
			OPEN_SHAPE,
		)
		expect(result.entities).toEqual([])
		expect(result.refusals?.items[1]).toMatchObject({ reason: 'correction', field: 'hours' })
	})
	it('refuses tied numbers across repeated hours', () => {
		const text = '97 hours 38 hours 16 hours'
		const numbers = scanNumbers(text)
		const result = compileEntities(
			numbers,
			[{ entity: 'hours', aliases: [], field: 'hours' }],
			text,
			OPEN_SHAPE,
		)
		expect(result.entities).toEqual([])
		expect(result.refusals?.items.map((entry) => entry.reason)).toEqual([
			'anchor-conflict',
			'anchor-conflict',
			'anchor-conflict',
		])
	})
	it('refuses a tied request and training quantity', () => {
		const text = 'reserve lab for 97 hours 38 hours of training done'
		const numbers = scanNumbers(text)
		const result = compileEntities(
			numbers,
			[{ entity: 'hours', aliases: [], field: 'hours' }],
			text,
			OPEN_SHAPE,
		)
		expect(result.entities).toEqual([])
		expect(result.refusals?.items.map((entry) => entry.reason)).toEqual([
			'anchor-conflict',
			'anchor-conflict',
		])
	})
	it('includes an earlier tie in the field conflict', () => {
		const text = '20 hours 30. 40 hours'
		const numbers = scanNumbers(text)
		const result = compileEntities(
			numbers,
			[{ entity: 'hours', aliases: [], field: 'hours' }],
			text,
			OPEN_SHAPE,
		)
		expect(result.entities).toEqual([])
		expect(result.refusals?.items.map((entry) => entry.reason)).toEqual([
			'anchor-conflict',
			'anchor-conflict',
			'anchor-conflict',
		])
	})
	it('groups different mappings by their target field', () => {
		const text = 'reserve lab hours 97. duration 16'
		const numbers = scanNumbers(text)
		const result = compileEntities(
			numbers,
			[
				{ entity: 'hours', aliases: [], field: 'hours' },
				{ entity: 'duration', aliases: [], field: 'hours' },
			],
			text,
			OPEN_SHAPE,
		)
		expect(result.entities).toEqual([])
		expect(result.refusals?.items.map((entry) => entry.reason)).toEqual([
			'anchor-conflict',
			'anchor-conflict',
		])
	})
	it('keeps one value across mappings on a field', () => {
		const text = 'reserve lab hours 40. duration 40'
		const numbers = scanNumbers(text)
		const result = compileEntities(
			numbers,
			[
				{ entity: 'hours', aliases: [], field: 'hours' },
				{ entity: 'duration', aliases: [], field: 'hours' },
			],
			text,
			OPEN_SHAPE,
		)
		expect(result.entities.map((entry) => entry.value)).toEqual([40, 40])
	})
	it('prunes overlapping aliases before conflict probes', () => {
		const text = 'reserve lab term 30 interest rate is 5'
		const numbers = scanNumbers(text)
		const result = compileEntities(
			numbers,
			[
				{ entity: 'term', aliases: [], field: 'term' },
				{ entity: 'rate', aliases: ['interest rate'], field: 'rate' },
			],
			text,
			OPEN_SHAPE,
		)
		expect(result.entities.map((entry) => [entry.name, entry.value])).toEqual([
			['term', 30],
			['rate', 5],
		])
	})
	it('retains the later overlapping rate in baseline input', () => {
		const text = '5 interest rate is 6'
		const numbers = scanNumbers(text)
		const result = compileEntities(
			numbers,
			[{ entity: 'rate', aliases: ['interest rate'], field: 'rate' }],
			text,
			OPEN_SHAPE,
		)
		expect(result.entities.map((entry) => entry.value)).toEqual([6])
	})
	it('lets a longer declared phrase own its hours word', () => {
		const text = 'reserve lab training hours 30. hours 40'
		const numbers = scanNumbers(text)
		const result = compileEntities(
			numbers,
			[
				{ entity: 'training hours', aliases: [], field: 'training' },
				{ entity: 'hours', aliases: [], field: 'hours' },
			],
			text,
			OPEN_SHAPE,
		)
		expect(result.entities.map((entry) => [entry.name, entry.value])).toEqual([
			['training hours', 30],
			['hours', 40],
		])
	})
	it('lets a declared down payment own its payment word', () => {
		const text = 'reserve lab down payment 20000, monthly payment 1500'
		const numbers = scanNumbers(text)
		const result = compileEntities(
			numbers,
			[
				{ entity: 'down payment', aliases: [], field: 'down' },
				{ entity: 'payment', aliases: [], field: 'payment' },
			],
			text,
			OPEN_SHAPE,
		)
		expect(result.entities.map((entry) => [entry.name, entry.value])).toEqual([
			['down payment', 20000],
			['payment', 1500],
		])
	})
	it('counts a range beside overlapping aliases once', () => {
		const text = 'interest rate 12 to 18'
		const numbers = scanNumbers(text)
		const result = compileEntities(
			numbers,
			[{ entity: 'rate', aliases: ['interest rate'], field: 'rate' }],
			text,
			OPEN_SHAPE,
		)
		expect(result.entities).toEqual([])
		expect(result.refusals?.items[0]).toMatchObject({ reason: 'unreadable', unreadable: 'range' })
	})
	it('counts one unreadable number reached from two spans once', () => {
		const text = 'hours twelve fifty hours'
		const numbers = scanNumbers(text)
		const result = compileEntities(
			numbers,
			[{ entity: 'hours', aliases: [], field: 'hours' }],
			text,
			OPEN_SHAPE,
		)
		expect(result.entities).toEqual([])
		expect(result.refusals?.items[0]).toMatchObject({ reason: 'unreadable', unreadable: 'spoken' })
	})
	it('counts case equivalent alias spans once', () => {
		const text = 'hours 12 to 18'
		const numbers = scanNumbers(text)
		const result = compileEntities(
			numbers,
			[{ entity: 'hours', aliases: ['Hours'], field: 'hours' }],
			text,
			OPEN_SHAPE,
		)
		expect(result.entities).toEqual([])
		expect(result.refusals?.items[0]).toMatchObject({ reason: 'unreadable', unreadable: 'range' })
	})
	it('refuses different unreadable numeric occurrences', () => {
		const text = 'hours twelve fifty. hours thirteen fifty'
		const numbers = scanNumbers(text)
		expect(numbers.map((number) => number.value)).toEqual([undefined, undefined])
		const result = compileEntities(
			numbers,
			[{ entity: 'hours', aliases: [], field: 'hours' }],
			text,
			OPEN_SHAPE,
		)
		expect(result.entities).toEqual([])
		expect(result.refusals?.items.map((entry) => entry.reason)).toEqual([
			'anchor-conflict',
			'anchor-conflict',
		])
	})
	it('keeps foreign numbers in conflict candidates', () => {
		const text = 'reserve lab, stop every 3 hours, for 97 hours'
		const numbers = scanNumbers(text)
		expect(numbers[0]?.foreign).toBeDefined()
		const result = compileEntities(
			numbers,
			[{ entity: 'hours', aliases: [], field: 'hours' }],
			text,
			OPEN_SHAPE,
		)
		expect(result.entities).toEqual([])
		expect(result.refusals?.items.map((entry) => entry.reason)).toEqual([
			'anchor-conflict',
			'anchor-conflict',
		])
	})
	it('asks when the same word states its own revision', () => {
		const text = 'hours 30. now hours 40'
		const numbers = scanNumbers(text)
		const result = compileEntities(
			numbers,
			[{ entity: 'hours', aliases: [], field: 'hours' }],
			text,
			OPEN_SHAPE,
		)
		expect(result.entities).toEqual([])
		expect(result.refusals?.items.map((entry) => entry.reason)).toEqual([
			'anchor-conflict',
			'anchor-conflict',
		])
	})
	it('retains correction on changed candidates', () => {
		const text = 'hours 30. wait changed hours 40'
		const numbers = scanNumbers(text)
		const result = compileEntities(
			numbers,
			[{ entity: 'hours', aliases: [], field: 'hours' }],
			text,
			OPEN_SHAPE,
		)
		expect(numbers[1]?.changed).toBe(true)
		expect(result.entities).toEqual([])
		expect(result.refusals?.items[1]?.reason).toBe('correction')
	})
	it('exempts lone array mappings even without a selected claim', () => {
		const text = '30 hours. 40 hours. Discuss hours'
		const result = compileEntities(
			scanNumbers(text),
			[{ entity: 'hours', aliases: [], field: 'hours' }],
			text,
			objectShape({ hours: arrayShape(numberShape()) }),
		)
		expect(result.entities).toEqual([])
		expect(result.refusals?.items.map((entry) => entry.reason)).toEqual([
			'unanchored',
			'unanchored',
		])
	})
	it('refuses conflicts on a non-lone array field', () => {
		const text = 'values 10. values 20. other 5'
		const result = compileEntities(
			scanNumbers(text),
			['values', 'other'].map((entity) => ({ entity, aliases: [], field: entity })),
			text,
			objectShape({ values: arrayShape(numberShape()), other: numberShape() }),
		)
		expect(result.entities.map((entry) => [entry.name, entry.value])).toEqual([['other', 5]])
		expect(result.refusals?.items.map((entry) => entry.reason)).toEqual([
			'anchor-conflict',
			'anchor-conflict',
		])
	})
	it('binds the stated number when a sentence-end period follows and the other sentence negates', () => {
		const text = "I don't need 30 hours. I need 40 hours."
		const result = compileEntities(
			scanNumbers(text),
			[{ entity: 'hours', aliases: [], field: 'hours' }],
			text,
			OPEN_SHAPE,
		)
		expect(result.entities.map((entity) => entity.value)).toEqual([40])
		expect(result.refusals?.items.some((entry) => entry.reason === 'anchor-conflict')).toBe(false)
	})
	it('records conflicts even when terminal punctuation leaves no selected anchor', () => {
		const text = '30 hours. 40 hours.'
		const result = compileEntities(
			scanNumbers(text),
			[{ entity: 'hours', aliases: [], field: 'hours' }],
			text,
			OPEN_SHAPE,
		)
		expect(result.entities).toEqual([])
		expect(result.refusals?.items.map((entry) => entry.reason)).toEqual([
			'anchor-conflict',
			'anchor-conflict',
		])
	})
	it('keeps repeated digits as one value', () => {
		const text = '40 hours. 40 hours'
		const result = compileEntities(
			scanNumbers(text),
			[{ entity: 'hours', aliases: [], field: 'hours' }],
			text,
			OPEN_SHAPE,
		)
		expect(result.entities.map((entity) => entity.value)).toEqual([40])
	})
	it('compares spoken and digit candidates by value', () => {
		const text = 'forty hours. 40 hours'
		const result = compileEntities(
			scanNumbers(text),
			[{ entity: 'hours', aliases: [], field: 'hours' }],
			text,
			OPEN_SHAPE,
		)
		expect(result.entities.map((entity) => entity.value)).toEqual([40])
	})
	it('refuses different values across an alias and its entity', () => {
		const text = '30 duration. 40 hours'
		const result = compileEntities(
			scanNumbers(text),
			[{ entity: 'hours', aliases: ['duration'], field: 'hours' }],
			text,
			OPEN_SHAPE,
		)
		expect(result.entities).toEqual([])
		expect(result.refusals?.items.map((entry) => [entry.reason, entry.field])).toEqual([
			['anchor-conflict', 'hours'],
			['anchor-conflict', 'hours'],
		])
	})
	it('keeps overlapping rate anchors on one value', () => {
		const text = 'interest rate 5'
		const result = compileEntities(
			scanNumbers(text),
			[{ entity: 'charge', aliases: ['rate', 'interest rate'], field: 'charge' }],
			text,
			OPEN_SHAPE,
		)
		expect(result.entities.map((entity) => entity.value)).toEqual([5])
	})
	it("keeps another field's own claim on a refused candidate", () => {
		const text = 'training 30 hours. 40 hours'
		const result = compileEntities(
			scanNumbers(text),
			['training', 'hours'].map((entity) => ({ entity, aliases: [], field: entity })),
			text,
			OPEN_SHAPE,
		)
		expect(result.entities.map((entity) => [entity.name, entity.value])).toEqual([['training', 30]])
		expect(result.refusals?.items.map((entry) => [entry.text, entry.reason, entry.field])).toEqual([
			['"40"', 'anchor-conflict', 'hours'],
		])
	})
	it('keeps a withheld anchor in rivalry with other fields', () => {
		const text = '30 hours. training 40 hours'
		const result = compileEntities(
			scanNumbers(text),
			['training', 'hours'].map((entity) => ({ entity, aliases: [], field: entity })),
			text,
			OPEN_SHAPE,
		)
		expect(result.entities).toEqual([])
	})
	it('ignores a negated occurrence in its own clause', () => {
		const text = "I don't need 30 hours. I need 40 hours"
		const result = compileEntities(
			scanNumbers(text),
			[{ entity: 'hours', aliases: [], field: 'hours' }],
			text,
			OPEN_SHAPE,
		)
		expect(result.entities.map((entity) => entity.value)).toEqual([40])
		expect(result.refusals?.items.map((entry) => entry.reason)).toEqual(['unanchored'])
	})
	it('does not rescue an earlier value when the last anchor has none', () => {
		const text = '40 hours. Discuss hours'
		const result = compileEntities(
			scanNumbers(text),
			[{ entity: 'hours', aliases: [], field: 'hours' }],
			text,
			OPEN_SHAPE,
		)
		expect(result.entities).toEqual([])
		expect(result.refusals?.items.map((entry) => entry.reason)).toEqual(['unanchored'])
	})
	it('retains first tie reasons when repeated anchors conflict', () => {
		const text = '40 hours. 20 hours 30'
		const result = compileEntities(
			scanNumbers(text),
			[{ entity: 'hours', aliases: [], field: 'hours' }],
			text,
			OPEN_SHAPE,
		)
		expect(result.entities).toEqual([])
		expect(result.refusals?.items.map((entry) => entry.reason)).toEqual([
			'anchor-conflict',
			'anchor-tie',
			'anchor-tie',
		])
	})
	it('keeps lone array collection across distinct anchor values', () => {
		const text = '30 hours. 40 hours'
		const result = compileEntities(
			scanNumbers(text),
			[{ entity: 'hours', aliases: [], field: 'hours' }],
			text,
			objectShape({ hours: arrayShape(numberShape()) }),
		)
		expect(result.entities.map((entity) => entity.value)).toEqual([[30, 40]])
		expect(result.refusals).toBeUndefined()
	})
	it('refuses an unreadable candidate beside a readable candidate', () => {
		const text = `${'9'.repeat(400)} hours. 40 hours`
		const numbers = scanNumbers(text)
		expect(numbers.map((number) => number.value)).toEqual([undefined, 40])
		const result = compileEntities(
			numbers,
			[{ entity: 'hours', aliases: [], field: 'hours' }],
			text,
			OPEN_SHAPE,
		)
		expect(result.entities).toEqual([])
		expect(result.refusals?.items.map((entry) => entry.reason)).toEqual([
			'anchor-conflict',
			'anchor-conflict',
		])
	})
	it('retains correction for a marked candidate in a conflict', () => {
		const text = 'hours 30. wait hours 40'
		const numbers = scanNumbers(text)
		expect(numbers[1]?.suspect).toBe(true)
		const result = compileEntities(
			numbers,
			[{ entity: 'hours', aliases: [], field: 'hours' }],
			text,
			OPEN_SHAPE,
		)
		expect(result.entities).toEqual([])
		expect(result.refusals?.items.map((entry) => [entry.reason, entry.field])).toEqual([
			['anchor-conflict', 'hours'],
			['correction', 'hours'],
		])
	})
	it('refuses conflicting hours in the microscope request', () => {
		const text =
			"Reserve the laboratory microscope for 97 hours. I've completed 38 hours of training on it, a supervisor will be present for 16 hours"
		const result = compileEntities(
			scanNumbers(text),
			[{ entity: 'hours', aliases: [], field: 'hours' }],
			text,
			OPEN_SHAPE,
		)
		expect(result.entities).toEqual([])
		expect(
			result.refusals?.items.map(({ text: raw, reason, field }) => ({ text: raw, reason, field })),
		).toEqual([
			{ text: '"97"', reason: 'anchor-conflict', field: 'hours' },
			{ text: '"38"', reason: 'anchor-conflict', field: 'hours' },
			{ text: '"16"', reason: 'anchor-conflict', field: 'hours' },
		])
	})
	it.each(WHOLE_NUMBER_FORMS)('preserves assignments for %s', (form) => {
		const text = `value ${form}`
		const numbers = scanNumbers(text)
		const mappings = [{ entity: 'value', aliases: [], field: 'value' }]
		expect(compileEntities(numbers, mappings, text, OPEN_SHAPE).entities).toEqual(
			assignEntities(numbers, mappings, text, OPEN_SHAPE),
		)
	})
	it.each(REVIEWER_LOAN_READINGS)('preserves reviewer assignments for $text', ({ text }) => {
		const numbers = scanNumbers(text)
		const mappings = ['amount', 'income', 'years', 'collateral'].map((entity) => ({
			entity,
			aliases: [],
			field: entity,
		}))
		expect(compileEntities(numbers, mappings, text, OPEN_SHAPE).entities).toEqual(
			assignEntities(numbers, mappings, text, OPEN_SHAPE),
		)
	})
	it('caps records at 32 and counts every omitted occurrence', () => {
		const text = Array.from({ length: 40 }, (_, index) => `${index + 1}`).join(', ')
		const numbers = scanNumbers(text)
		const result = compileEntities(numbers, [], text, OPEN_SHAPE)
		expect(NUMBER_REFUSAL_LIMIT).toBe(32)
		expect(result.refusals?.items).toEqual(
			numbers.slice(0, 32).map((number) => ({
				text: preview(number.raw),
				start: number.start,
				end: number.end,
				reason: 'unanchored',
			})),
		)
		expect(result.refusals?.omitted).toBe(8)
	})
	it('reports competing anchors without inventing a unique field', () => {
		const text = 'rate 7 term'
		expect(
			compileEntities(
				scanNumbers(text),
				['rate', 'term'].map((entity) => ({ entity, aliases: [], field: entity })),
				text,
				OPEN_SHAPE,
			).refusals,
		).toEqual({ items: [{ text: '"7"', start: 5, end: 6, reason: 'anchor-tie' }], omitted: 0 })
	})
	it('drops a tentative tie record when a nearer anchor claims the occurrence', () => {
		const text = 'amount 1  middle  2 years'
		const mappings = ['amount', 'middle', 'years'].map((entity) => ({
			entity,
			aliases: [],
			field: entity,
		}))
		const result = compileEntities(scanNumbers(text), mappings, text, OPEN_SHAPE)
		expect(result.entities.map((entity) => [entity.name, entity.value])).toEqual([
			['amount', 1],
			['years', 2],
		])
		expect(result.refusals).toBeUndefined()
	})
})
