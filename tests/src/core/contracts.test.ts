import { createContract, isRecord, seededRandom } from '@orkestrel/contract'
import { projectValue } from '@orkestrel/reason'
import {
	interpretationContract,
	projectInterpretation,
	readNumberShape,
	readNumbersContract,
	scanNumbers,
} from '@src/core'
import { describe, expect, it } from 'vitest'
import { buildCorpusInterpret, buildInterpretContractCases, REFUSAL_READINGS } from '../../setup.js'

describe('standing guard contract table', () => {
	const table = buildInterpretContractCases()
	it('canonical positives and negative controls declare their direction and projection', () => {
		for (const row of table.definitions) {
			expect(row.direction).toBe('is implies guard')
			expect(row.project).toBeUndefined()
			expect(row.wire.is(row.positive)).toBe(true)
			expect(row.guard(row.positive)).toBe(true)
			expect(row.wire.is(row.negative)).toBe(false)
			expect(row.guard(row.negative)).toBe(false)
		}
		for (const row of table.numbers) {
			expect(row.direction).toBe('producer implies wire after projection')
			expect(row.guard).toBeUndefined()
			expect(row.wire.is(row.project(row.positive))).toBe(true)
			expect(row.wire.is(row.negative)).toBe(false)
		}
		for (const row of [
			...table.results.map((entry) => ({ ...entry, projected: entry.project(entry.positive) })),
			...table.members.map((entry) => ({ ...entry, projected: entry.project(entry.positive) })),
		]) {
			expect(row.direction).toBe('producer implies wire after projection')
			expect(row.guard(row.positive)).toBe(true)
			expect(row.wire.is(row.projected)).toBe(true)
			expect(row.wire.is(row.negative)).toBe(false)
			expect(row.guard(row.negative)).toBe(false)
			expect(row.guard({ ...row.positive, foreign: true })).toBe(true)
		}
	})
	it.each(table.definitions)('$name: generated admissions imply guard without discards', (row) => {
		const outcomes = Array.from({ length: 100 }, (_, seed) => {
			const value = row.wire.generate(seededRandom(seed))
			return { seed, admitted: row.wire.is(value), guarded: row.guard(value) }
		})
		expect(outcomes.filter((entry) => !entry.admitted)).toEqual([])
		expect(outcomes.filter((entry) => !entry.guarded)).toEqual([])
	})
	it('producer refusals and number readings cross their wire contracts', () => {
		const interpret = buildCorpusInterpret()
		try {
			for (const row of REFUSAL_READINGS) {
				const result = interpret.interpret(row.text)
				expect(interpretationContract.is(projectInterpretation(result))).toBe(true)
				const numbers = scanNumbers(row.text)
				expect(readNumbersContract.is(projectValue(numbers))).toBe(true)
				for (const number of numbers)
					expect(createContract(readNumberShape).is(projectValue(number))).toBe(true)
			}
		} finally {
			interpret.destroy()
		}
	})
	it('refuses non-record subject and definition roots and malformed refusals', () => {
		const row = table.results[0]
		if (row === undefined) throw new Error('Missing interpretation row')
		const projected = row.project(row.positive)
		if (!isRecord(projected)) throw new Error('Expected projected record')
		for (const field of ['subject', 'definition', 'refusals']) {
			for (const value of [42, null, [], 'text']) {
				expect(row.wire.is({ ...projected, [field]: value })).toBe(false)
			}
		}
	})
	it('preserves hinted audit faults and refuses unknown fault reasons', () => {
		const row = table.results[0]
		if (row === undefined) throw new Error('Missing interpretation row')
		const projected = row.project(row.positive)
		if (!isRecord(projected)) throw new Error('Expected projected record')
		const fault = { reason: 'variant', path: ['x'], variants: 2, key: 'kind', expected: ['a', 'b'] }
		expect(row.wire.is({ ...projected, repairs: [fault] })).toBe(true)
		expect(row.wire.is({ ...projected, repairs: [{ reason: 'invented', path: [] }] })).toBe(false)
	})
})
