import { preview } from '@orkestrel/contract'
import { assignEntities, compileEntities, scanNumbers, NUMBER_REFUSAL_LIMIT } from '@src/core'
import { describe, expect, it } from 'vitest'
import {
	ADMITTED_CLAIMS,
	OPEN_SHAPE,
	REVIEWER_LOAN_READINGS,
	UNDECLARED_NEIGHBORS,
	WHOLE_NUMBER_FORMS,
} from '../../setup.js'

describe('compileEntities — admitted neighbors', () => {
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
