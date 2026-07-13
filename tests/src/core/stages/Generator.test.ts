import { Generator } from '@src/core'
import { describe, expect, it } from 'vitest'
import { buildInterpretTemplate, TRICKY_KEYS } from '../../../setup.js'

// The `Generator` stage — entity → field, array unwrap/aggregate, mean
// confidence, and a `FieldMapping` for EVERY subject field (design §8).

describe('Generator', () => {
	const generator = new Generator()

	it('maps an entity to its template field and builds the subject', () => {
		const template = buildInterpretTemplate()
		const entities = [
			{ name: 'value', value: 42, provenance: { category: 'extracted' as const }, confidence: 0.9 },
		]
		const result = generator.generate(entities, template)
		expect(result.subject).toEqual({ value: 42 })
		expect(result.definition).toBe(template.definition)
		expect(result.mappings).toEqual([
			{
				field: 'value',
				entity: 'value',
				value: 42,
				provenance: { category: 'extracted' },
				confidence: 0.9,
			},
		])
		expect(result.confidence).toBe(0.9)
	})

	it('falls back to the entity name itself as the field when no mapping matches', () => {
		const template = buildInterpretTemplate({ mappings: [] })
		const entities = [
			{ name: 'term', value: 12, provenance: { category: 'default' as const }, confidence: 1 },
		]
		const result = generator.generate(entities, template)
		expect(result.subject).toEqual({ term: 12 })
		expect(result.mappings[0]?.field).toBe('term')
	})

	it('unwraps a single-element array value to its scalar', () => {
		const template = buildInterpretTemplate()
		const entities = [
			{
				name: 'value',
				value: [42],
				provenance: { category: 'extracted' as const, detail: 'collect' },
				confidence: 0.9,
			},
		]
		const result = generator.generate(entities, template)
		expect(result.subject.value).toBe(42)
	})

	it('keeps a multi-element numeric array AND emits Sum/Count/Average/Minimum/Maximum aggregates', () => {
		const template = buildInterpretTemplate()
		const entities = [
			{
				name: 'value',
				value: [10, 20, 30],
				provenance: { category: 'extracted' as const, detail: 'collect' },
				confidence: 0.9,
			},
		]
		const result = generator.generate(entities, template)
		expect(result.subject).toEqual({
			value: [10, 20, 30],
			valueSum: 60,
			valueCount: 3,
			valueAverage: 20,
			valueMinimum: 10,
			valueMaximum: 30,
		})
		const aggregateFields = result.mappings
			.filter((mapping) => mapping.provenance.category === 'computed')
			.map((mapping) => mapping.field)
		expect(aggregateFields).toEqual([
			'valueSum',
			'valueCount',
			'valueAverage',
			'valueMinimum',
			'valueMaximum',
		])
	})

	it('a nested array mapping produces nested sibling aggregates (subject.address.amountsSum, ...)', () => {
		const template = buildInterpretTemplate({
			mappings: [{ entity: 'value', aliases: [], field: ['address', 'amounts'] }],
		})
		const entities = [
			{
				name: 'value',
				value: [10, 20, 30],
				provenance: { category: 'extracted' as const, detail: 'collect' },
				confidence: 0.9,
			},
		]
		const result = generator.generate(entities, template)
		expect(result.subject).toEqual({
			address: {
				amounts: [10, 20, 30],
				amountsSum: 60,
				amountsCount: 3,
				amountsAverage: 20,
				amountsMinimum: 10,
				amountsMaximum: 30,
			},
		})
		const aggregateMappings = result.mappings.filter(
			(mapping) => mapping.provenance.category === 'computed',
		)
		expect(aggregateMappings.map((mapping) => mapping.field)).toEqual([
			['address', 'amountsSum'],
			['address', 'amountsCount'],
			['address', 'amountsAverage'],
			['address', 'amountsMinimum'],
			['address', 'amountsMaximum'],
		])
	})

	it('leaves a multi-element NON-numeric array untouched — no aggregates', () => {
		const template = buildInterpretTemplate()
		const entities = [
			{
				name: 'value',
				value: ['a', 'b'],
				provenance: { category: 'extracted' as const },
				confidence: 0.5,
			},
		]
		const result = generator.generate(entities, template)
		expect(result.subject).toEqual({ value: ['a', 'b'] })
		expect(result.mappings).toHaveLength(1)
	})

	it('emits a FieldMapping for EVERY field, including defaults and computed entries', () => {
		const template = buildInterpretTemplate()
		const entities = [
			{ name: 'value', value: 42, provenance: { category: 'extracted' as const }, confidence: 0.9 },
			{ name: 'term', value: 12, provenance: { category: 'default' as const }, confidence: 1 },
			{
				name: 'monthly',
				value: 500,
				provenance: { category: 'computed' as const },
				confidence: 0.9,
			},
		]
		const result = generator.generate(entities, template)
		expect(result.mappings).toHaveLength(3)
		expect(result.mappings.map((mapping) => mapping.field).sort()).toEqual([
			'monthly',
			'term',
			'value',
		])
	})

	it('confidence is the mean of the input entities, 0 for an empty set', () => {
		const template = buildInterpretTemplate()
		expect(generator.generate([], template).confidence).toBe(0)
		const entities = [
			{ name: 'a', value: 1, provenance: { category: 'extracted' as const }, confidence: 1 },
			{ name: 'b', value: 2, provenance: { category: 'extracted' as const }, confidence: 0.5 },
		]
		expect(generator.generate(entities, buildInterpretTemplate({ mappings: [] })).confidence).toBe(
			0.75,
		)
	})

	it('assigns every TRICKY_KEYS value as a field path, refusing UNSAFE_FIELD_SEGMENTS (prototype-pollution defense)', () => {
		// UPDATED for the refactored `setField` semantics: `UNSAFE_FIELD_SEGMENTS`
		// (constants.ts) refuses `__proto__` / `prototype` / `constructor` — not
		// only `__proto__` as the pre-refactor expectation pinned.
		const UNSAFE = new Set(['__proto__', 'prototype', 'constructor'])
		const observed = TRICKY_KEYS.map((key) => {
			const template = buildInterpretTemplate({
				mappings: [{ entity: 'value', aliases: [], field: key }],
			})
			const entities = [
				{
					name: 'value',
					value: 42,
					provenance: { category: 'extracted' as const },
					confidence: 1,
				},
			]
			const result = generator.generate(entities, template)
			const owned = Object.hasOwn(result.subject, key)
			return {
				key,
				owned,
				value: owned ? result.subject[key] : undefined,
				mapped: result.mappings[0]?.field,
			}
		})
		expect(observed).toEqual(
			TRICKY_KEYS.map((key) => ({
				key,
				owned: !UNSAFE.has(key),
				value: UNSAFE.has(key) ? undefined : 42,
				mapped: key,
			})),
		)
	})

	it('is deterministic across repeated calls', () => {
		const template = buildInterpretTemplate()
		const entities = [
			{
				name: 'value',
				value: [10, 20, 30],
				provenance: { category: 'extracted' as const },
				confidence: 0.9,
			},
		]
		expect(generator.generate(entities, template)).toEqual(generator.generate(entities, template))
	})

	describe('immutability', () => {
		it('never mutates the input entities array or its element objects', () => {
			const template = buildInterpretTemplate()
			const entity = {
				name: 'value',
				value: 42,
				provenance: { category: 'extracted' as const },
				confidence: 0.9,
			}
			const entities = Object.freeze([entity])
			const before = structuredClone(entities)
			const result = generator.generate(entities, template)
			expect(entities).toEqual(before)
			expect(result.subject).not.toBe(entities)
		})

		it('never mutates a multi-element array entity value while building aggregates', () => {
			const template = buildInterpretTemplate()
			const value = Object.freeze([10, 20, 30])
			const entities = [
				{ name: 'value', value, provenance: { category: 'extracted' as const }, confidence: 0.9 },
			]
			const result = generator.generate(entities, template)
			// `value` stays frozen and unchanged (a mutation would throw under
			// strict mode / fail this equality) — the array is carried through,
			// never mutated in place, even though it is not deep-cloned.
			expect(value).toEqual([10, 20, 30])
			expect(result.subject.value).toEqual([10, 20, 30])
		})

		it('builds a fresh subject reference on every call — no shared mutable state across calls', () => {
			const template = buildInterpretTemplate()
			const entities = [
				{ name: 'value', value: 1, provenance: { category: 'extracted' as const }, confidence: 1 },
			]
			const first = generator.generate(entities, template)
			const second = generator.generate(entities, template)
			expect(first.subject).not.toBe(second.subject)
			expect(first.subject).toEqual(second.subject)
		})
	})
})
