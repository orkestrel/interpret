import type { Entity } from '@src/core'
import { Formatter, Narrator, Interpret } from '@src/core'
import { objectShape, optionalShape, rawShape } from '@orkestrel/contract'
import { describe, expect, it } from 'vitest'
import { buildInterpretRecipe, createCorpusExtractor, DEFAULT_RENDERINGS } from '../../../setup.js'

// The `Formatter` stage — prose shape: `{verb} {name}` + `with …` (non-
// default entities) + `(defaults: …)` + `needed: …` (ambiguities).

describe('Formatter', () => {
	it.each(DEFAULT_RENDERINGS)(
		'renders a real shape default as $rendered without a format failure',
		({ value, rendered }) => {
			const interpret = new Interpret({
				extractor: createCorpusExtractor(),
				recipes: [
					buildInterpretRecipe({
						shape: objectShape({ value: optionalShape(rawShape({}), { default: value }) }),
						computations: [],
					}),
				],
			})
			const result = interpret.interpret('calculate arithmetic')
			expect(result.failures).toEqual([])
			expect(result.subject?.value).toEqual(value)
			expect(result.prompt).toContain(`value: ${rendered}`)
			interpret.destroy()
		},
	)
	const intent = { action: 'calculate', domain: 'arithmetic', confidence: 1 }

	it('renders `{verb} {name}` alone when there is nothing else to say', () => {
		const formatter = new Formatter({ verbs: { calculate: 'Calculate' } })
		const recipe = buildInterpretRecipe()
		expect(formatter.format(intent, recipe, [], []).prompt).toBe('Calculate Arithmetic')
	})

	it('falls back to the bare action string when no verb is mapped', () => {
		const formatter = new Formatter()
		const recipe = buildInterpretRecipe()
		expect(formatter.format(intent, recipe, [], []).prompt).toBe('calculate Arithmetic')
	})

	it('renders an empty verb when the intent carries no action', () => {
		const formatter = new Formatter({ verbs: { calculate: 'Calculate' } })
		const recipe = buildInterpretRecipe()
		expect(formatter.format({ domain: 'arithmetic', confidence: 0.5 }, recipe, [], []).prompt).toBe(
			' Arithmetic',
		)
	})

	it('appends a `with {label}: {value}` clause for non-default entities', () => {
		const formatter = new Formatter({ verbs: { calculate: 'Calculate' } })
		const recipe = buildInterpretRecipe()
		const entities: readonly Entity[] = [
			{ name: 'value', value: 42, provenance: { category: 'extracted' }, confidence: 0.9 },
		]
		expect(formatter.format(intent, recipe, entities, []).prompt).toBe(
			'Calculate Arithmetic with value: 42',
		)
	})

	it('separates default-provenance entities into a `(defaults: …)` clause', () => {
		const formatter = new Formatter({ verbs: { calculate: 'Calculate' } })
		const recipe = buildInterpretRecipe()
		const entities: readonly Entity[] = [
			{ name: 'value', value: 42, provenance: { category: 'extracted' }, confidence: 0.9 },
			{ name: 'term', value: 12, provenance: { category: 'default' }, confidence: 1 },
		]
		expect(formatter.format(intent, recipe, entities, []).prompt).toBe(
			'Calculate Arithmetic with value: 42 (defaults: term: 12)',
		)
	})

	it('appends a `needed: …` clause listing every ambiguity question', () => {
		const formatter = new Formatter({ verbs: { calculate: 'Calculate' } })
		const recipe = buildInterpretRecipe()
		const ambiguities = [
			{ field: 'value', question: 'What is your value?', candidates: [], required: true },
		]
		expect(formatter.format(intent, recipe, [], ambiguities).prompt).toBe(
			'Calculate Arithmetic needed: What is your value?',
		)
	})

	it('composes all three clauses together', () => {
		const formatter = new Formatter({ verbs: { calculate: 'Calculate' } })
		const recipe = buildInterpretRecipe()
		const entities: readonly Entity[] = [
			{ name: 'value', value: 42, provenance: { category: 'extracted' }, confidence: 0.9 },
			{ name: 'term', value: 12, provenance: { category: 'default' }, confidence: 1 },
		]
		const ambiguities = [
			{ field: 'age', question: 'What is your age?', candidates: [], required: true },
		]
		expect(formatter.format(intent, recipe, entities, ambiguities).prompt).toBe(
			'Calculate Arithmetic with value: 42 (defaults: term: 12) needed: What is your age?',
		)
	})

	it('renders every clause through the injected narrator, so a lexicon rewords the prompt', () => {
		const formatter = new Formatter({
			verbs: { calculate: 'Calculate' },
			narrator: new Narrator({
				lexicon: {
					templates: {
						'prompt.base': '{{verb}} → {{name}}',
						'prompt.entities': ' [{{fields}}]',
						'prompt.defaults': ' <{{fields}}>',
						'prompt.ambiguities': ' ask {{questions}}',
					},
				},
			}),
		})
		const recipe = buildInterpretRecipe()
		const entities: readonly Entity[] = [
			{ name: 'value', value: 42, provenance: { category: 'extracted' }, confidence: 0.9 },
			{ name: 'term', value: 12, provenance: { category: 'default' }, confidence: 1 },
		]
		const ambiguities = [
			{ field: 'age', question: 'What is your age?', candidates: [], required: true },
		]
		expect(formatter.format(intent, recipe, entities, ambiguities).prompt).toBe(
			'Calculate → Arithmetic [value: 42] <term: 12> ask What is your age?',
		)
	})

	it('is deterministic across repeated calls', () => {
		const formatter = new Formatter({ verbs: { calculate: 'Calculate' } })
		const recipe = buildInterpretRecipe()
		const entities: readonly Entity[] = [
			{ name: 'value', value: 42, provenance: { category: 'extracted' }, confidence: 0.9 },
		]
		expect(formatter.format(intent, recipe, entities, [])).toEqual(
			formatter.format(intent, recipe, entities, []),
		)
	})
})
