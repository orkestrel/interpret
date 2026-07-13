import type { Entity, Intent } from '@src/core'
import { constant, operation, variable } from '@orkestrel/reason'
import { Clarifier } from '@src/core'
import { describe, expect, it } from 'vitest'
import {
	buildInterpretation,
	buildInterpretTemplate,
	seedInterpretContext,
} from '../../../setup.js'

// The `Clarifier` stage — carry-over, defaults, computed fields (topological,
// gap-on-cycle), and floor-gated ambiguities (design §8). Drives a REAL
// `InterpretContext` (via `seedInterpretContext`) — the Clarifier only ever
// calls `context.previous()`.

const intent: Intent = { action: 'calculate', domain: 'arithmetic', confidence: 1 }

describe('Clarifier', () => {
	it('passes through fresh entities untouched when nothing else applies', () => {
		const clarifier = new Clarifier()
		const template = buildInterpretTemplate()
		const entities: readonly Entity[] = [
			{ name: 'value', value: 42, provenance: { category: 'extracted' }, confidence: 0.9 },
		]
		const result = clarifier.clarify(entities, template, undefined, intent)
		expect(result.entities).toEqual(entities)
		expect(result.ambiguities).toEqual([])
		expect(result.complete).toBe(true)
	})

	describe('carry-over', () => {
		it('carries a same-domain prior entity when the fresh set leaves it unfilled', () => {
			const clarifier = new Clarifier()
			const template = buildInterpretTemplate({
				mappings: [{ entity: 'value', aliases: [], field: 'value' }],
			})
			const prior = buildInterpretation({
				intent,
				entities: [
					{ name: 'value', value: 99, provenance: { category: 'extracted' }, confidence: 1 },
				],
			})
			const result = clarifier.clarify([], template, seedInterpretContext([prior]), intent)
			expect(result.entities).toEqual([
				{ name: 'value', value: 99, provenance: { category: 'carried' }, confidence: 0.7 },
			])
		})

		it('drops carry-over across a domain change', () => {
			const clarifier = new Clarifier()
			const template = buildInterpretTemplate({
				mappings: [{ entity: 'value', aliases: [], field: 'value' }],
			})
			const prior = buildInterpretation({
				intent: { action: 'calculate', domain: 'other', confidence: 1 },
				entities: [
					{ name: 'value', value: 99, provenance: { category: 'extracted' }, confidence: 1 },
				],
			})
			const result = clarifier.clarify([], template, seedInterpretContext([prior]), intent)
			expect(result.entities).toEqual([])
		})

		it('a fresh value wins over a carried one', () => {
			const clarifier = new Clarifier()
			const template = buildInterpretTemplate({
				mappings: [{ entity: 'value', aliases: [], field: 'value' }],
			})
			const prior = buildInterpretation({
				intent,
				entities: [
					{ name: 'value', value: 99, provenance: { category: 'extracted' }, confidence: 1 },
				],
			})
			const fresh: readonly Entity[] = [
				{ name: 'value', value: 5, provenance: { category: 'extracted' }, confidence: 1 },
			]
			const result = clarifier.clarify(fresh, template, seedInterpretContext([prior]), intent)
			expect(result.entities).toEqual(fresh)
		})
	})

	describe('defaults', () => {
		it('fills an unresolved field from the template default', () => {
			const clarifier = new Clarifier()
			const template = buildInterpretTemplate({
				mappings: [],
				defaults: [{ field: 'term', value: 12 }],
			})
			const result = clarifier.clarify([], template, undefined, intent)
			expect(result.entities).toEqual([
				{ name: 'term', value: 12, provenance: { category: 'default' }, confidence: 1 },
			])
		})

		it('never overwrites an already-filled field', () => {
			const clarifier = new Clarifier()
			const template = buildInterpretTemplate({
				mappings: [{ entity: 'term', aliases: [], field: 'term' }],
				defaults: [{ field: 'term', value: 12 }],
			})
			const fresh: readonly Entity[] = [
				{ name: 'term', value: 24, provenance: { category: 'extracted' }, confidence: 1 },
			]
			const result = clarifier.clarify(fresh, template, undefined, intent)
			expect(result.entities).toEqual(fresh)
		})
	})

	describe('computed fields', () => {
		it('resolves a computed field via resolveExpression against resolved bindings', () => {
			const clarifier = new Clarifier()
			const template = buildInterpretTemplate({
				mappings: [{ entity: 'deductible', aliases: [], field: 'deductible' }],
				computations: [
					{
						field: 'monthly',
						expression: operation('divide', variable('deductible'), constant(12)),
					},
				],
			})
			const fresh: readonly Entity[] = [
				{ name: 'deductible', value: 6000, provenance: { category: 'extracted' }, confidence: 1 },
			]
			const result = clarifier.clarify(fresh, template, undefined, intent)
			const computed = result.entities.find((entity) => entity.name === 'monthly')
			expect(computed).toEqual({
				name: 'monthly',
				value: 500,
				provenance: { category: 'computed' },
				confidence: 0.9,
			})
		})

		it('resolves multi-step computed fields in dependency (topological) order', () => {
			const clarifier = new Clarifier()
			const template = buildInterpretTemplate({
				mappings: [{ entity: 'value', aliases: [], field: 'value' }],
				computations: [
					// 'yearly' depends on 'monthly', which depends on the fresh 'value'
					{ field: 'yearly', expression: operation('multiply', variable('monthly'), constant(12)) },
					{ field: 'monthly', expression: operation('divide', variable('value'), constant(12)) },
				],
			})
			const fresh: readonly Entity[] = [
				{ name: 'value', value: 1200, provenance: { category: 'extracted' }, confidence: 1 },
			]
			const result = clarifier.clarify(fresh, template, undefined, intent)
			expect(result.entities.find((entity) => entity.name === 'monthly')?.value).toBe(100)
			expect(result.entities.find((entity) => entity.name === 'yearly')?.value).toBe(1200)
		})

		it('an unresolved input variable leaves the computed field a gap', () => {
			const clarifier = new Clarifier()
			const template = buildInterpretTemplate({
				mappings: [],
				computations: [
					{
						field: 'monthly',
						expression: operation('divide', variable('deductible'), constant(12)),
					},
				],
			})
			const result = clarifier.clarify([], template, undefined, intent)
			expect(result.entities.find((entity) => entity.name === 'monthly')).toBeUndefined()
		})

		it('a divide-by-zero non-finite result leaves the computed field a gap', () => {
			const clarifier = new Clarifier()
			const template = buildInterpretTemplate({
				mappings: [{ entity: 'value', aliases: [], field: 'value' }],
				computations: [
					{ field: 'ratio', expression: operation('divide', variable('value'), constant(0)) },
				],
			})
			const fresh: readonly Entity[] = [
				{ name: 'value', value: 10, provenance: { category: 'extracted' }, confidence: 1 },
			]
			const result = clarifier.clarify(fresh, template, undefined, intent)
			expect(result.entities.find((entity) => entity.name === 'ratio')).toBeUndefined()
		})

		it('a dependency cycle leaves every cyclic field a gap', () => {
			const clarifier = new Clarifier()
			const template = buildInterpretTemplate({
				mappings: [],
				computations: [
					{ field: 'a', expression: operation('add', variable('b'), constant(1)) },
					{ field: 'b', expression: operation('add', variable('a'), constant(1)) },
				],
			})
			const result = clarifier.clarify([], template, undefined, intent)
			expect(result.entities.find((entity) => entity.name === 'a')).toBeUndefined()
			expect(result.entities.find((entity) => entity.name === 'b')).toBeUndefined()
		})
	})

	describe('ambiguities', () => {
		it('raises an ambiguity for a required mapping left unresolved', () => {
			const clarifier = new Clarifier()
			const template = buildInterpretTemplate({
				mappings: [{ entity: 'value', aliases: [], field: 'value', required: true }],
			})
			const result = clarifier.clarify([], template, undefined, intent)
			expect(result.ambiguities).toEqual([
				{ field: 'value', question: 'What is your value?', candidates: [], required: true },
			])
			expect(result.complete).toBe(false)
		})

		it('never raises an ambiguity for a non-required mapping', () => {
			const clarifier = new Clarifier()
			const template = buildInterpretTemplate({
				mappings: [{ entity: 'value', aliases: [], field: 'value' }],
			})
			const result = clarifier.clarify([], template, undefined, intent)
			expect(result.ambiguities).toEqual([])
		})

		it('honors the configured floor — a below-floor entity still raises its ambiguity', () => {
			const clarifier = new Clarifier({ floor: 0.95 })
			const template = buildInterpretTemplate({
				mappings: [{ entity: 'value', aliases: [], field: 'value', required: true }],
			})
			const fresh: readonly Entity[] = [
				{ name: 'value', value: 42, provenance: { category: 'extracted' }, confidence: 0.7 },
			]
			const result = clarifier.clarify(fresh, template, undefined, intent)
			expect(result.ambiguities).toHaveLength(1)
			expect(result.complete).toBe(false)
		})

		it('a low floor accepts the same entity as resolved', () => {
			const clarifier = new Clarifier({ floor: 0.3 })
			const template = buildInterpretTemplate({
				mappings: [{ entity: 'value', aliases: [], field: 'value', required: true }],
			})
			const fresh: readonly Entity[] = [
				{ name: 'value', value: 42, provenance: { category: 'extracted' }, confidence: 0.7 },
			]
			const result = clarifier.clarify(fresh, template, undefined, intent)
			expect(result.ambiguities).toEqual([])
			expect(result.complete).toBe(true)
		})
	})

	it('is deterministic across repeated calls', () => {
		const clarifier = new Clarifier()
		const template = buildInterpretTemplate({
			mappings: [{ entity: 'value', aliases: [], field: 'value' }],
			defaults: [{ field: 'term', value: 12 }],
		})
		const fresh: readonly Entity[] = [
			{ name: 'value', value: 42, provenance: { category: 'extracted' }, confidence: 0.9 },
		]
		expect(clarifier.clarify(fresh, template, undefined, intent)).toEqual(
			clarifier.clarify(fresh, template, undefined, intent),
		)
	})
})
