import {
	constant,
	factorGroup,
	fieldFactor,
	operation,
	quantitativeDefinition,
	variable,
} from '@src/core'
import { describe, expect, it } from 'vitest'
import {
	isComputedField,
	isEntityMapping,
	isFieldDefault,
	isTemplate,
} from '../../../../src/core/interprets/validators.js'
import { buildInterpretTemplate, TRICKY_KEYS } from '../../../setup.js'

// The interprets validators — deep TOTAL guards (AGENTS §14): adversarial
// junk (cycles, hostile prototypes, wrong shapes) returns `false`, never
// throws. Every record guard is EXACT — an extra key fails.

const ADVERSARIAL: readonly unknown[] = [
	null,
	undefined,
	42,
	3.14,
	true,
	false,
	'junk',
	Symbol('s'),
	10n,
	() => 1,
	new Date(),
	new Map(),
	[],
	[1, 2, 3],
]

describe('isEntityMapping', () => {
	it('accepts a well-formed mapping, optional `required` included or omitted', () => {
		expect(isEntityMapping({ entity: 'age', aliases: ['years old'], field: 'age' })).toBe(true)
		expect(
			isEntityMapping({ entity: 'age', aliases: ['years old'], field: 'age', required: true }),
		).toBe(true)
		expect(isEntityMapping({ entity: 'age', aliases: [], field: ['nested', 'age'] })).toBe(true)
	})

	it('rejects a RegExp alias, a missing field, and an extra key', () => {
		expect(isEntityMapping({ entity: 'age', aliases: [/\d+/], field: 'age' })).toBe(false)
		expect(isEntityMapping({ entity: 'age', aliases: [] })).toBe(false)
		expect(isEntityMapping({ entity: 'age', aliases: [], field: 'age', extra: true })).toBe(false)
	})

	it('rejects adversarial junk', () => {
		for (const value of ADVERSARIAL) expect(isEntityMapping(value)).toBe(false)
	})

	it('rejects every tricky-key record probe used as a mapping shape', () => {
		for (const key of TRICKY_KEYS) {
			expect(isEntityMapping({ [key]: 'x', aliases: [], field: 'a' })).toBe(false)
		}
	})

	it('accepts a Object.create(null) mapping with no stray own key', () => {
		const clean: Record<string, unknown> = Object.create(null)
		clean.entity = 'age'
		clean.aliases = []
		clean.field = 'age'
		expect(isEntityMapping(clean)).toBe(true)
	})

	it('rejects a hostile-prototype record carrying a stray OWN __proto__ key', () => {
		const hostile: Record<string, unknown> = Object.create(null)
		hostile.entity = 'age'
		hostile.aliases = []
		hostile.field = 'age'
		hostile.__proto__ = 5
		expect(Object.hasOwn(hostile, '__proto__')).toBe(true)
		expect(isEntityMapping(hostile)).toBe(false)
	})
})

describe('isFieldDefault', () => {
	it('accepts any present value, including null / undefined / 0', () => {
		expect(isFieldDefault({ field: 'term', value: 12 })).toBe(true)
		expect(isFieldDefault({ field: 'term', value: null })).toBe(true)
		expect(isFieldDefault({ field: 'term', value: undefined })).toBe(true)
		expect(isFieldDefault({ field: 'term', value: 0 })).toBe(true)
	})

	it('rejects a missing `value` key and a missing `field`', () => {
		expect(isFieldDefault({ field: 'term' })).toBe(false)
		expect(isFieldDefault({ value: 12 })).toBe(false)
	})

	it('rejects adversarial junk', () => {
		for (const value of ADVERSARIAL) expect(isFieldDefault(value)).toBe(false)
	})
})

describe('isComputedField', () => {
	it('accepts a well-formed computed field composing a symbolic expression', () => {
		expect(
			isComputedField({
				field: 'monthly',
				expression: operation('divide', variable('deductible'), constant(12)),
			}),
		).toBe(true)
	})

	it('rejects a malformed expression tree and a missing field', () => {
		expect(isComputedField({ field: 'monthly', expression: { form: 'variable' } })).toBe(false)
		expect(isComputedField({ expression: constant(1) })).toBe(false)
	})

	it('rejects adversarial junk, including a cyclic expression', () => {
		for (const value of ADVERSARIAL) expect(isComputedField(value)).toBe(false)
		const cyclic: Record<string, unknown> = { field: 'x' }
		cyclic.expression = cyclic
		expect(isComputedField(cyclic)).toBe(false)
	})
})

describe('isTemplate', () => {
	it('accepts a well-formed template built by the shared fixture', () => {
		expect(isTemplate(buildInterpretTemplate())).toBe(true)
	})

	it('accepts a template with computations and defaults populated', () => {
		const template = buildInterpretTemplate({
			defaults: [{ field: 'term', value: 12 }],
			computations: [
				{ field: 'monthly', expression: operation('divide', variable('value'), constant(12)) },
			],
		})
		expect(isTemplate(template)).toBe(true)
	})

	it('rejects a template whose definition fails isDefinition', () => {
		const bad = { ...buildInterpretTemplate(), definition: { reasoning: 'quantum' } }
		expect(isTemplate(bad)).toBe(false)
	})

	it('rejects a template missing most fields, and one with an extra key', () => {
		expect(isTemplate({ id: 't1' })).toBe(false)
		const extra = { ...buildInterpretTemplate(), extra: true }
		expect(isTemplate(extra)).toBe(false)
	})

	it('rejects adversarial junk, including a cyclic template', () => {
		for (const value of ADVERSARIAL) expect(isTemplate(value)).toBe(false)
		const cyclic: Record<string, unknown> = { id: 't1' }
		cyclic.self = cyclic
		expect(isTemplate(cyclic)).toBe(false)
	})

	it('round-trips against a definition built with reasons factories', () => {
		const definition = quantitativeDefinition('t2', 'Two', [
			factorGroup('g', 'sum', [fieldFactor('v', 'value')]),
		])
		const template = buildInterpretTemplate({ id: 't2', name: 'Two', definition })
		expect(isTemplate(template)).toBe(true)
	})

	it('rejects a hostile-prototype record carrying a stray OWN __proto__ key', () => {
		const base = buildInterpretTemplate()
		const hostile: Record<string, unknown> = Object.create(null)
		hostile.id = base.id
		hostile.name = base.name
		hostile.domain = base.domain
		hostile.intents = base.intents
		hostile.mappings = base.mappings
		hostile.defaults = base.defaults
		hostile.computations = base.computations
		hostile.definition = base.definition
		hostile.__proto__ = { polluted: true }
		expect(Object.hasOwn(hostile, '__proto__')).toBe(true)
		expect(isTemplate(hostile)).toBe(false)
	})
})
