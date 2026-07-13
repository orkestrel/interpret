import { describe, expect, it } from 'vitest'
import { Formatter } from '../../../../../src/core/interprets/stages/Formatter.js'
import { buildInterpretTemplate } from '../../../../setup.js'

// The `Formatter` stage — prose shape: `{verb} {name}` + `with …` (non-
// default entities) + `(defaults: …)` + `needed: …` (ambiguities).

describe('Formatter', () => {
	const intent = { action: 'calculate', domain: 'arithmetic', confidence: 1 }

	it('renders `{verb} {name}` alone when there is nothing else to say', () => {
		const formatter = new Formatter({ verbs: { calculate: 'Calculate' } })
		const template = buildInterpretTemplate()
		expect(formatter.format(intent, template, [], []).prompt).toBe('Calculate Arithmetic')
	})

	it('falls back to the bare action string when no verb is mapped', () => {
		const formatter = new Formatter()
		const template = buildInterpretTemplate()
		expect(formatter.format(intent, template, [], []).prompt).toBe('calculate Arithmetic')
	})

	it('appends a `with {label}: {value}` clause for non-default entities', () => {
		const formatter = new Formatter({ verbs: { calculate: 'Calculate' } })
		const template = buildInterpretTemplate()
		const entities = [
			{ name: 'value', value: 42, provenance: { category: 'extracted' as const }, confidence: 0.9 },
		]
		expect(formatter.format(intent, template, entities, []).prompt).toBe(
			'Calculate Arithmetic with value: 42',
		)
	})

	it('separates default-provenance entities into a `(defaults: …)` clause', () => {
		const formatter = new Formatter({ verbs: { calculate: 'Calculate' } })
		const template = buildInterpretTemplate()
		const entities = [
			{ name: 'value', value: 42, provenance: { category: 'extracted' as const }, confidence: 0.9 },
			{ name: 'term', value: 12, provenance: { category: 'default' as const }, confidence: 1 },
		]
		expect(formatter.format(intent, template, entities, []).prompt).toBe(
			'Calculate Arithmetic with value: 42 (defaults: term: 12)',
		)
	})

	it('appends a `needed: …` clause listing every ambiguity question', () => {
		const formatter = new Formatter({ verbs: { calculate: 'Calculate' } })
		const template = buildInterpretTemplate()
		const ambiguities = [
			{ field: 'value', question: 'What is your value?', candidates: [], required: true },
		]
		expect(formatter.format(intent, template, [], ambiguities).prompt).toBe(
			'Calculate Arithmetic needed: What is your value?',
		)
	})

	it('composes all three clauses together', () => {
		const formatter = new Formatter({ verbs: { calculate: 'Calculate' } })
		const template = buildInterpretTemplate()
		const entities = [
			{ name: 'value', value: 42, provenance: { category: 'extracted' as const }, confidence: 0.9 },
			{ name: 'term', value: 12, provenance: { category: 'default' as const }, confidence: 1 },
		]
		const ambiguities = [
			{ field: 'age', question: 'What is your age?', candidates: [], required: true },
		]
		expect(formatter.format(intent, template, entities, ambiguities).prompt).toBe(
			'Calculate Arithmetic with value: 42 (defaults: term: 12) needed: What is your age?',
		)
	})

	it('is deterministic across repeated calls', () => {
		const formatter = new Formatter({ verbs: { calculate: 'Calculate' } })
		const template = buildInterpretTemplate()
		const entities = [
			{ name: 'value', value: 42, provenance: { category: 'extracted' as const }, confidence: 0.9 },
		]
		expect(formatter.format(intent, template, entities, [])).toEqual(
			formatter.format(intent, template, entities, []),
		)
	})
})
