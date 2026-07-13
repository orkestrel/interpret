import type { InterpretEventMap } from '@src/core'
import { Extractor, Interpret } from '@src/core'
import { describe, expect, it } from 'vitest'
import {
	buildEligibilityTemplate,
	buildInsuranceTemplate,
	buildInterpretTemplate,
	buildLoanTemplate,
	buildStatisticsTemplate,
	INTERPRET_ACTIONS,
	INTERPRET_DOMAINS,
	recordEmitterEvents,
} from '../../setup.js'

// The interprets integration corpus — the terrain-vocabulary redesign of scsr's
// 49-case suite (sync API; no-match is auditable-incomplete, never templates[0];
// no durations): forward NL → subject/definition, cross-turn carry-over,
// multi-template best-match, register-after-miss, computed fields, the numeric
// corpus pins, full provenance, and determinism + digest-replay (design §8).

function build(templates = [buildInsuranceTemplate()]): Interpret {
	return new Interpret({
		templates,
		extractor: new Extractor({ actions: INTERPRET_ACTIONS, domains: INTERPRET_DOMAINS }),
	})
}

describe('interprets integration', () => {
	it('forward: natural language → structured subject + definition', () => {
		const interpret = build()
		const result = interpret.interpret('calculate insurance age 25')
		expect(result.intent).toEqual({ action: 'calculate', domain: 'insurance', confidence: 1 })
		expect(result.definition?.id).toBe('insurance-auto')
		expect(result.subject).toMatchObject({ age: 25, accidents: 0, coverage: 'standard' })
		expect(result.complete).toBe(true)
		expect(result.prompt.length).toBeGreaterThan(0)
		interpret.destroy()
	})

	it('carries entities across same-domain turns when a field is missing', () => {
		const interpret = build()
		interpret.interpret('calculate insurance age 25')
		const second = interpret.interpret('calculate insurance')
		expect(second.subject?.age).toBe(25)
		const carried = second.entities.find((entity) => entity.name === 'age')
		expect(carried?.provenance.category).toBe('carried')
		interpret.destroy()
	})

	it('selects the best-matching template among several — never an arbitrary fallback', () => {
		const interpret = build([buildInsuranceTemplate(), buildLoanTemplate()])
		expect(interpret.interpret('calculate insurance age 25').definition?.id).toBe('insurance-auto')
		expect(interpret.interpret('calculate loan 5000').definition?.id).toBe('loan-personal')
		interpret.destroy()
	})

	it('register-after-miss: an unmatched turn is incomplete, a later registration completes it', () => {
		const interpret = new Interpret({
			extractor: new Extractor({ actions: INTERPRET_ACTIONS, domains: INTERPRET_DOMAINS }),
		})
		const first = interpret.interpret('calculate insurance age 25')
		expect(first.complete).toBe(false)
		expect(first.failures[0]?.code).toBe('NO_TEMPLATE')
		interpret.register(buildInsuranceTemplate())
		const second = interpret.interpret('calculate insurance age 25')
		expect(second.complete).toBe(true)
		expect(second.definition?.id).toBe('insurance-auto')
		interpret.destroy()
	})

	it('resolves a declaratively computed field (monthly = deductible / 12)', () => {
		const interpret = build()
		const result = interpret.interpret('calculate insurance age 25')
		expect(result.subject?.monthly).toBeCloseTo(500 / 12, 5)
		interpret.destroy()
	})

	it('numeric corpus: "no accidents" fires the default (0), not negation parsing', () => {
		const interpret = build()
		const result = interpret.interpret('calculate insurance age 25 no accidents')
		expect(result.subject?.age).toBe(25)
		expect(result.subject?.accidents).toBe(0)
		const accidents = result.entities.find((entity) => entity.name === 'accidents')
		expect(accidents?.provenance.category).toBe('default')
		interpret.destroy()
	})

	it('numeric corpus: extracts multiple entities from a complex sentence (age 25, score 720)', () => {
		const interpret = build([buildEligibilityTemplate()])
		const result = interpret.interpret('check if a 25 year old with a 720 credit score qualifies')
		expect(result.subject?.age).toBe(25)
		expect(result.subject?.score).toBe(720)
		interpret.destroy()
	})

	it('numeric corpus: "$50,000" parses to 50000 and lands on a single-mapping collect', () => {
		const interpret = build([
			buildInterpretTemplate({ mappings: [{ entity: 'income', aliases: [], field: 'income' }] }),
		])
		const result = interpret.interpret('calculate arithmetic income was $50,000')
		expect(result.subject?.income).toBe(50000)
		interpret.destroy()
	})

	it('numeric corpus: statistics scalar 42 vs array with Sum/Count/Average/Minimum/Maximum', () => {
		const interpret = build([buildStatisticsTemplate()])
		expect(interpret.interpret('compute statistics 42').subject?.value).toBe(42)
		const many = interpret.interpret('compute statistics 10 20 30')
		expect(many.subject).toMatchObject({
			value: [10, 20, 30],
			valueSum: 60,
			valueCount: 3,
			valueAverage: 20,
			valueMinimum: 10,
			valueMaximum: 30,
		})
		interpret.destroy()
	})

	it('provenance: every built subject field carries a FieldMapping', () => {
		const interpret = build()
		const result = interpret.interpret('calculate insurance age 25')
		const subjectFields = Object.keys(result.subject ?? {}).sort()
		const mappingFields = result.mappings.map((mapping) => String(mapping.field)).sort()
		expect(mappingFields).toEqual(subjectFields)
		expect(subjectFields).toContain('monthly')
		interpret.destroy()
	})

	it('event pins: interpret once, error zero on a happy turn', () => {
		const interpret = build()
		const events = recordEmitterEvents<InterpretEventMap, 'interpret' | 'error'>(
			interpret.emitter,
			['interpret', 'error'],
		)
		interpret.interpret('calculate insurance age 25')
		expect(events.interpret.count).toBe(1)
		expect(events.error.count).toBe(0)
		interpret.destroy()
	})

	it('determinism + replay: same text + same template version reproduces the same digest', () => {
		const first = build().interpret('calculate insurance age 25')
		const second = build().interpret('calculate insurance age 25')
		expect(second.digest).toBe(first.digest)
	})

	it('replay: a template content change bumps the version and changes the digest', () => {
		const interpret = build()
		const before = interpret.interpret('calculate insurance age 25').digest
		interpret.register(buildInsuranceTemplate({ name: 'Renamed' }))
		const after = interpret.interpret('calculate insurance age 25').digest
		expect(after).not.toBe(before)
		interpret.destroy()
	})

	it('run-twice determinism: the same interpreter yields identical structure for a repeated fresh turn', () => {
		const one = build().interpret('compute statistics 10 20 30')
		const two = build().interpret('compute statistics 10 20 30')
		expect(two.subject).toEqual(one.subject)
		expect(two.mappings).toEqual(one.mappings)
		expect(two.digest).toBe(one.digest)
	})
})
