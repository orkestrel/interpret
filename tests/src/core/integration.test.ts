import type { InterpretEventMap } from '@src/core'
import { Interpret } from '@src/core'
import { createOperation, createVariable } from '@orkestrel/reason'
import { createRecorders } from '@orkestrel/test'
import { describe, expect, it } from 'vitest'
import {
	buildCorpusInterpret,
	createCorpusExtractor,
	buildEligibilityRecipe,
	buildInsuranceRecipe,
	buildInterpretRecipe,
	buildLoanRecipe,
	buildStatisticsRecipe,
} from '../../setup.js'

// The interprets integration corpus — the terrain-vocabulary redesign of scsr's
// 49-case suite (sync API; no-match is auditable-incomplete, never recipes[0];
// no durations): forward NL → subject/definition, cross-turn carry-over,
// multi-recipe best-match, add-after-miss, computed fields, the numeric
// corpus pins, full provenance, and determinism + digest-replay.

describe('interprets integration', () => {
	it('forward: natural language → structured subject + definition', () => {
		const interpret = buildCorpusInterpret()
		const result = interpret.interpret('calculate insurance age 25')
		expect(result.intent).toEqual({ action: 'calculate', domain: 'insurance', confidence: 1 })
		expect(result.definition?.id).toBe('insurance-auto')
		expect(result.subject).toMatchObject({ age: 25, accidents: 0, coverage: 'standard' })
		expect(result.ambiguities).toEqual([])
		expect(result.failures).toEqual([])
		expect(result.prompt.length).toBeGreaterThan(0)
		interpret.destroy()
	})

	it('carries entities across same-domain turns when a field is missing', () => {
		const interpret = new Interpret({
			recipes: [buildInsuranceRecipe()],
			extractor: createCorpusExtractor(),
			history: 16,
		})
		interpret.interpret('calculate insurance age 25')
		const second = interpret.interpret('calculate insurance')
		expect(second.subject?.age).toBe(25)
		const carried = second.entities.find((entity) => entity.name === 'age')
		expect(carried?.provenance.category).toBe('carried')
		interpret.destroy()
	})

	it('selects the best-matching recipe among several — never an arbitrary fallback', () => {
		const interpret = buildCorpusInterpret([buildInsuranceRecipe(), buildLoanRecipe()])
		expect(interpret.interpret('calculate insurance age 25').definition?.id).toBe('insurance-auto')
		expect(interpret.interpret('calculate loan 5000').definition?.id).toBe('loan-personal')
		interpret.destroy()
	})

	it('add-after-miss: an unmatched turn is incomplete, a later add completes it', () => {
		const interpret = buildCorpusInterpret([])
		const first = interpret.interpret('calculate insurance age 25')
		expect(first.failures.map((failure) => failure.code)).toEqual(['NO_RECIPE'])
		interpret.add(buildInsuranceRecipe())
		const second = interpret.interpret('calculate insurance age 25')
		expect(second.ambiguities).toEqual([])
		expect(second.failures).toEqual([])
		expect(second.definition?.id).toBe('insurance-auto')
		interpret.destroy()
	})

	it('resolves a declaratively computed field (monthly = deductible / 12)', () => {
		const interpret = buildCorpusInterpret()
		const result = interpret.interpret('calculate insurance age 25')
		expect(result.subject?.monthly).toBeCloseTo(500 / 12, 5)
		interpret.destroy()
	})

	it('numeric corpus: negation in the clause prevents an age claim', () => {
		const interpret = buildCorpusInterpret()
		const result = interpret.interpret('calculate insurance age 25 no accidents')
		expect(result.subject).toBeUndefined()
		expect(result.ambiguities).not.toEqual([])
		const accidents = result.entities.find((entity) => entity.name === 'accidents')
		expect(accidents).toBeUndefined()
		interpret.destroy()
	})

	it('numeric corpus: intervening words leave a complex sentence asking', () => {
		const interpret = buildCorpusInterpret([buildEligibilityRecipe()])
		const result = interpret.interpret('check if a 25 year old with a 720 credit score qualifies')
		expect(result.subject).toBeUndefined()
		expect(result.ambiguities).not.toEqual([])
		interpret.destroy()
	})

	it('numeric corpus: "$50,000" parses to 50000 and lands on its anchored field', () => {
		const interpret = buildCorpusInterpret([
			buildInterpretRecipe({ mappings: [{ entity: 'income', aliases: [], field: 'income' }] }),
		])
		const result = interpret.interpret('calculate arithmetic income is $50,000')
		expect(result.subject?.income).toBe(50000)
		interpret.destroy()
	})

	it('numeric corpus: a statistics turn keeps its collected array and derives no field of its own', () => {
		const interpret = buildCorpusInterpret([buildStatisticsRecipe()])
		expect(interpret.interpret('compute statistics value 42').subject?.value).toEqual([42])
		expect(interpret.interpret('compute statistics value 10 20 30').subject).toBeUndefined()
		expect(interpret.interpret('compute statistics value 10 and 20 and 30').subject).toBeUndefined()
		const many = interpret.interpret('compute statistics value 10 and value 20 and value 30')
		expect(many.subject).toEqual({ value: [10, 20, 30] })
		interpret.destroy()
	})

	it('numeric corpus: a declared computation aggregates the collected array by element', () => {
		const interpret = buildCorpusInterpret([
			buildStatisticsRecipe({
				computations: [
					{
						field: 'total',
						expression: createOperation(
							'add',
							createOperation('add', createVariable('value.0'), createVariable('value.1')),
							createVariable('value.2'),
						),
					},
				],
			}),
		])
		expect(interpret.interpret('compute statistics value 10 20 30').subject).toBeUndefined()
		expect(interpret.interpret('compute statistics value 10 and 20 and 30').subject).toBeUndefined()
		const result = interpret.interpret('compute statistics value 10 and value 20 and value 30')
		expect(result.subject).toEqual({ value: [10, 20, 30], total: 60 })
		const computed = result.mappings.find((mapping) => mapping.field === 'total')
		expect(computed?.provenance.category).toBe('computed')
		interpret.destroy()
	})

	it('provenance: every built subject field carries a FieldMapping', () => {
		const interpret = buildCorpusInterpret()
		const result = interpret.interpret('calculate insurance age 25')
		const subjectFields = Object.keys(result.subject ?? {}).sort()
		const mappingFields = result.mappings.map((mapping) => String(mapping.field)).sort()
		expect(mappingFields).toEqual(subjectFields)
		expect(subjectFields).toContain('monthly')
		interpret.destroy()
	})

	it('event pins: interpret once, error zero on a happy turn', () => {
		const interpret = buildCorpusInterpret()
		const events = createRecorders<InterpretEventMap, 'interpret' | 'error'>(interpret.emitter, [
			'interpret',
			'error',
		])
		interpret.interpret('calculate insurance age 25')
		expect(events.interpret.count).toBe(1)
		expect(events.error.count).toBe(0)
		interpret.destroy()
	})

	it('determinism + replay: same text + same recipe version reproduces the same digest', () => {
		const first = buildCorpusInterpret().interpret('calculate insurance age 25')
		const second = buildCorpusInterpret().interpret('calculate insurance age 25')
		expect(second.digest).toBe(first.digest)
	})

	it('replay: a recipe content change bumps the version and changes the digest', () => {
		const interpret = buildCorpusInterpret()
		const before = interpret.interpret('calculate insurance age 25').digest
		interpret.add(buildInsuranceRecipe({ name: 'Renamed' }))
		const after = interpret.interpret('calculate insurance age 25').digest
		expect(after).not.toBe(before)
		interpret.destroy()
	})

	it('run-twice determinism: the same interpreter yields identical structure for a repeated fresh turn', () => {
		const one = buildCorpusInterpret().interpret('compute statistics 10 20 30')
		const two = buildCorpusInterpret().interpret('compute statistics 10 20 30')
		expect(two.subject).toEqual(one.subject)
		expect(two.mappings).toEqual(one.mappings)
		expect(two.digest).toBe(one.digest)
	})
})
