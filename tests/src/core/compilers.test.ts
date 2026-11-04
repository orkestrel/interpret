import { preview } from '@orkestrel/contract'
import { assignEntities, compileEntities, scanNumbers, NUMBER_REFUSAL_LIMIT } from '@src/core'
import { describe, expect, it } from 'vitest'
import { OPEN_SHAPE, REVIEWER_LOAN_READINGS, WHOLE_NUMBER_FORMS } from '../../setup.js'

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
