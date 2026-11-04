import type { Entity, Intent } from '@src/core'
import {
	arrayShape,
	numberShape,
	objectShape,
	optionalShape,
	stringShape,
} from '@orkestrel/contract'
import { createConstant, createOperation, createVariable } from '@orkestrel/reason'
import { Clarifier, Narrator } from '@src/core'
import { describe, expect, it } from 'vitest'
import { buildInterpretation, buildInterpretRecipe, seedInterpretContext } from '../../../setup.js'

// The `Clarifier` stage — carry-over, the door's defaults, computed fields (topological,
// gap-on-cycle), and what the door refuses as ambiguities. Drives a REAL
// `InterpretContext` (through `seedInterpretContext`) — the Clarifier only ever
// calls `context.previous()`.

const intent: Intent = { action: 'calculate', domain: 'arithmetic', confidence: 1 }

describe('Clarifier', () => {
	it('passes through fresh entities untouched when nothing else applies', () => {
		const clarifier = new Clarifier()
		const recipe = buildInterpretRecipe()
		const entities: readonly Entity[] = [
			{ name: 'value', value: 42, provenance: { category: 'extracted' }, confidence: 0.9 },
		]
		const result = clarifier.clarify(entities, recipe, undefined, intent)
		expect(result.entities).toEqual(entities)
		expect(result.ambiguities).toEqual([])
		expect(Object.hasOwn(result, 'complete')).toBe(false)
	})

	describe('carry-over', () => {
		it('carries a same-domain prior entity when the fresh set leaves it unfilled', () => {
			const clarifier = new Clarifier()
			const recipe = buildInterpretRecipe({
				mappings: [{ entity: 'value', aliases: [], field: 'value' }],
			})
			const prior = buildInterpretation({
				intent,
				entities: [
					{ name: 'value', value: 99, provenance: { category: 'extracted' }, confidence: 1 },
				],
			})
			const result = clarifier.clarify([], recipe, seedInterpretContext([prior]), intent)
			expect(result.entities).toEqual([
				{ name: 'value', value: 99, provenance: { category: 'carried' }, confidence: 0.7 },
			])
		})

		it('drops carry-over across a domain change', () => {
			const clarifier = new Clarifier()
			const recipe = buildInterpretRecipe({
				mappings: [{ entity: 'value', aliases: [], field: 'value' }],
			})
			const prior = buildInterpretation({
				intent: { action: 'calculate', domain: 'other', confidence: 1 },
				entities: [
					{ name: 'value', value: 99, provenance: { category: 'extracted' }, confidence: 1 },
				],
			})
			const result = clarifier.clarify([], recipe, seedInterpretContext([prior]), intent)
			expect(result.entities).toEqual([])
		})

		it('a fresh value wins over a carried one', () => {
			const clarifier = new Clarifier()
			const recipe = buildInterpretRecipe({
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
			const result = clarifier.clarify(fresh, recipe, seedInterpretContext([prior]), intent)
			expect(result.entities).toEqual(fresh)
		})
	})

	describe('defaults', () => {
		it('the door fills an unresolved field from the default in the shape', () => {
			const clarifier = new Clarifier()
			const recipe = buildInterpretRecipe({
				mappings: [],
				shape: objectShape({ term: optionalShape(numberShape(), { default: 12 }) }),
			})
			const result = clarifier.clarify([], recipe, undefined, intent)
			expect(result.entities).toEqual([
				{ name: 'term', value: 12, provenance: { category: 'default' }, confidence: 1 },
			])
			expect(result.defaulted).toEqual([['term']])
		})

		it('a mapped default lands under its mapping, with no field of its own', () => {
			const clarifier = new Clarifier()
			const recipe = buildInterpretRecipe({
				mappings: [{ entity: 'length', aliases: [], field: 'term' }],
				shape: objectShape({ term: optionalShape(numberShape(), { default: 12 }) }),
			})
			const result = clarifier.clarify([], recipe, undefined, intent)
			expect(result.entities).toEqual([
				{ name: 'length', value: 12, provenance: { category: 'default' }, confidence: 1 },
			])
		})

		it('never overwrites an already-filled field', () => {
			const clarifier = new Clarifier()
			const recipe = buildInterpretRecipe({
				mappings: [{ entity: 'term', aliases: [], field: 'term' }],
				shape: objectShape({ term: optionalShape(numberShape(), { default: 12 }) }),
			})
			const fresh: readonly Entity[] = [
				{ name: 'term', value: 24, provenance: { category: 'extracted' }, confidence: 1 },
			]
			const result = clarifier.clarify(fresh, recipe, undefined, intent)
			expect(result.entities).toEqual(fresh)
			expect(result.defaulted).toEqual([])
		})

		it('a computation reads a default the door has yet to fill', () => {
			const clarifier = new Clarifier()
			const recipe = buildInterpretRecipe({
				mappings: [],
				computations: [
					{
						field: 'monthly',
						expression: createOperation('divide', createVariable('deductible'), createConstant(12)),
					},
				],
				shape: objectShape({
					deductible: optionalShape(numberShape(), { default: 600 }),
					monthly: numberShape(),
				}),
			})
			const result = clarifier.clarify([], recipe, undefined, intent)
			expect(result.ambiguities).toEqual([])
			expect(result.entities.find((entity) => entity.name === 'monthly')?.value).toBe(50)
			expect(result.entities.find((entity) => entity.name === 'deductible')?.value).toBe(600)
			expect(result.defaulted).toEqual([['deductible']])
		})

		it('a computed value stands over a default on the same field', () => {
			const clarifier = new Clarifier()
			const recipe = buildInterpretRecipe({
				mappings: [{ entity: 'base', aliases: [], field: 'base' }],
				computations: [
					{
						field: 'double',
						expression: createOperation('multiply', createVariable('base'), createConstant(2)),
					},
				],
				shape: objectShape({
					base: numberShape(),
					double: optionalShape(numberShape(), { default: 7 }),
				}),
			})
			const fresh: readonly Entity[] = [
				{ name: 'base', value: 5, provenance: { category: 'extracted' }, confidence: 1 },
			]
			const result = clarifier.clarify(fresh, recipe, undefined, intent)
			expect(result.entities.find((entity) => entity.name === 'double')?.value).toBe(10)
			expect(result.defaulted).toEqual([])
		})
	})

	describe('the door', () => {
		it('a repair replaces the value read and is reported', () => {
			const clarifier = new Clarifier()
			const recipe = buildInterpretRecipe({
				mappings: [{ entity: 'code', aliases: [], field: 'code' }],
				shape: objectShape({ code: stringShape() }),
			})
			const fresh: readonly Entity[] = [
				{ name: 'code', value: 42, provenance: { category: 'extracted' }, confidence: 1 },
			]
			const result = clarifier.clarify(fresh, recipe, undefined, intent)
			expect(result.entities[0]?.value).toBe('42')
			expect(result.repairs.map((fault) => fault.path)).toEqual([['code']])
			expect(result.ambiguities).toEqual([])
		})

		it('a value the door refuses is a question carrying its fault', () => {
			const clarifier = new Clarifier()
			const recipe = buildInterpretRecipe({
				mappings: [{ entity: 'age', aliases: [], field: 'age' }],
				shape: objectShape({ age: numberShape({ max: 120 }) }),
			})
			const fresh: readonly Entity[] = [
				{ name: 'age', value: 900, provenance: { category: 'extracted' }, confidence: 1 },
			]
			const result = clarifier.clarify(fresh, recipe, undefined, intent)
			expect(result.ambiguities).toHaveLength(1)
			expect(result.ambiguities[0]?.required).toBe(true)
			expect(result.ambiguities[0]?.fault?.reason).toBe('constraint')
		})

		it('an optional field the door refuses still blocks', () => {
			const clarifier = new Clarifier()
			const recipe = buildInterpretRecipe({
				mappings: [{ entity: 'age', aliases: [], field: 'age' }],
				shape: objectShape({ age: optionalShape(numberShape({ max: 120 })) }),
			})
			const fresh: readonly Entity[] = [
				{ name: 'age', value: 900, provenance: { category: 'extracted' }, confidence: 1 },
			]
			expect(clarifier.clarify(fresh, recipe, undefined, intent).ambiguities[0]?.required).toBe(
				true,
			)
		})

		it('a refusal fills no default and reports nothing filled', () => {
			const clarifier = new Clarifier()
			const recipe = buildInterpretRecipe({
				mappings: [{ entity: 'age', aliases: [], field: 'age' }],
				shape: objectShape({
					age: numberShape(),
					term: optionalShape(numberShape(), { default: 12 }),
				}),
			})
			const result = clarifier.clarify([], recipe, undefined, intent)
			expect(result.entities).toEqual([])
			expect(result.defaulted).toEqual([])
			expect(result.ambiguities.map((ambiguity) => ambiguity.field)).toEqual(['age'])
		})

		it('a nested field lands on its path, unmapped', () => {
			const clarifier = new Clarifier()
			const recipe = buildInterpretRecipe({
				mappings: [{ entity: 'base', aliases: [], field: 'base' }],
				computations: [
					{
						field: ['terms', 'double'],
						expression: createOperation('multiply', createVariable('base'), createConstant(2)),
					},
				],
				shape: objectShape({
					base: numberShape(),
					terms: objectShape({
						double: numberShape(),
						rate: optionalShape(numberShape(), { default: 3 }),
					}),
				}),
			})
			const fresh: readonly Entity[] = [
				{ name: 'base', value: 5, provenance: { category: 'extracted' }, confidence: 1 },
			]
			const result = clarifier.clarify(fresh, recipe, undefined, intent)
			expect(result.ambiguities).toEqual([])
			expect(result.defaulted).toEqual([['terms', 'rate']])
			const rate = result.entities.find((entity) => entity.name === 'terms.rate')
			expect(rate?.field).toEqual(['terms', 'rate'])
			expect(rate?.value).toBe(3)
		})

		it('an array value stays an array through the door', () => {
			const clarifier = new Clarifier()
			const recipe = buildInterpretRecipe({
				shape: objectShape({ value: arrayShape(numberShape()) }),
			})
			const fresh: readonly Entity[] = [
				{ name: 'value', value: [1, 2], provenance: { category: 'extracted' }, confidence: 1 },
			]
			const result = clarifier.clarify(fresh, recipe, undefined, intent)
			expect(result.entities[0]?.value).toEqual([1, 2])
			expect(result.ambiguities).toEqual([])
		})
	})

	describe('computed fields', () => {
		it('resolves a computed field through resolveExpression against resolved bindings', () => {
			const clarifier = new Clarifier()
			const recipe = buildInterpretRecipe({
				mappings: [{ entity: 'deductible', aliases: [], field: 'deductible' }],
				computations: [
					{
						field: 'monthly',
						expression: createOperation('divide', createVariable('deductible'), createConstant(12)),
					},
				],
			})
			const fresh: readonly Entity[] = [
				{ name: 'deductible', value: 6000, provenance: { category: 'extracted' }, confidence: 1 },
			]
			const result = clarifier.clarify(fresh, recipe, undefined, intent)
			const computed = result.entities.find((entity) => entity.name === 'monthly')
			expect(computed).toEqual({
				name: 'monthly',
				value: 500,
				provenance: { category: 'computed' },
				confidence: 0.9,
			})
		})

		it('binds each numeric element of an array-valued field under its index', () => {
			const clarifier = new Clarifier()
			const recipe = buildInterpretRecipe({
				mappings: [{ entity: 'value', aliases: [], field: 'value' }],
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
			})
			const fresh: readonly Entity[] = [
				{
					name: 'value',
					value: [10, 20, 30],
					provenance: { category: 'extracted', detail: 'collect' },
					confidence: 0.9,
				},
			]
			const result = clarifier.clarify(fresh, recipe, undefined, intent)
			expect(result.entities.find((entity) => entity.name === 'total')?.value).toBe(60)
		})

		it('leaves a computation over a non-numeric array element a gap', () => {
			const clarifier = new Clarifier()
			const recipe = buildInterpretRecipe({
				mappings: [{ entity: 'value', aliases: [], field: 'value' }],
				computations: [
					{
						field: 'total',
						expression: createOperation(
							'add',
							createVariable('value.0'),
							createVariable('value.1'),
						),
					},
				],
			})
			const fresh: readonly Entity[] = [
				{
					name: 'value',
					value: [10, 'twenty'],
					provenance: { category: 'extracted', detail: 'collect' },
					confidence: 0.9,
				},
			]
			const result = clarifier.clarify(fresh, recipe, undefined, intent)
			expect(result.entities.find((entity) => entity.name === 'total')).toBeUndefined()
		})

		it('resolves multi-step computed fields in dependency (topological) order', () => {
			const clarifier = new Clarifier()
			const recipe = buildInterpretRecipe({
				mappings: [{ entity: 'value', aliases: [], field: 'value' }],
				computations: [
					// 'yearly' depends on 'monthly', which depends on the fresh 'value'
					{
						field: 'yearly',
						expression: createOperation('multiply', createVariable('monthly'), createConstant(12)),
					},
					{
						field: 'monthly',
						expression: createOperation('divide', createVariable('value'), createConstant(12)),
					},
				],
			})
			const fresh: readonly Entity[] = [
				{ name: 'value', value: 1200, provenance: { category: 'extracted' }, confidence: 1 },
			]
			const result = clarifier.clarify(fresh, recipe, undefined, intent)
			expect(result.entities.find((entity) => entity.name === 'monthly')?.value).toBe(100)
			expect(result.entities.find((entity) => entity.name === 'yearly')?.value).toBe(1200)
		})

		it('an unresolved input variable leaves the computed field a gap', () => {
			const clarifier = new Clarifier()
			const recipe = buildInterpretRecipe({
				mappings: [],
				computations: [
					{
						field: 'monthly',
						expression: createOperation('divide', createVariable('deductible'), createConstant(12)),
					},
				],
			})
			const result = clarifier.clarify([], recipe, undefined, intent)
			expect(result.entities.find((entity) => entity.name === 'monthly')).toBeUndefined()
		})

		it('a divide-by-zero non-finite result leaves the computed field a gap', () => {
			const clarifier = new Clarifier()
			const recipe = buildInterpretRecipe({
				mappings: [{ entity: 'value', aliases: [], field: 'value' }],
				computations: [
					{
						field: 'ratio',
						expression: createOperation('divide', createVariable('value'), createConstant(0)),
					},
				],
			})
			const fresh: readonly Entity[] = [
				{ name: 'value', value: 10, provenance: { category: 'extracted' }, confidence: 1 },
			]
			const result = clarifier.clarify(fresh, recipe, undefined, intent)
			expect(result.entities.find((entity) => entity.name === 'ratio')).toBeUndefined()
		})

		it('a dependency cycle leaves every cyclic field a gap', () => {
			const clarifier = new Clarifier()
			const recipe = buildInterpretRecipe({
				mappings: [],
				computations: [
					{
						field: 'a',
						expression: createOperation('add', createVariable('b'), createConstant(1)),
					},
					{
						field: 'b',
						expression: createOperation('add', createVariable('a'), createConstant(1)),
					},
				],
			})
			const result = clarifier.clarify([], recipe, undefined, intent)
			expect(result.entities.find((entity) => entity.name === 'a')).toBeUndefined()
			expect(result.entities.find((entity) => entity.name === 'b')).toBeUndefined()
		})
	})

	describe('ambiguities', () => {
		it('raises an ambiguity for a required field left unresolved', () => {
			const clarifier = new Clarifier()
			const recipe = buildInterpretRecipe({
				mappings: [{ entity: 'value', aliases: [], field: 'value' }],
				shape: objectShape({ value: numberShape() }),
			})
			const result = clarifier.clarify([], recipe, undefined, intent)
			expect(result.ambiguities).toEqual([
				{
					field: 'value',
					question: 'What is your value?',
					candidates: [],
					required: true,
					fault: { reason: 'missing', path: ['value'], expected: 'number' },
				},
			])
		})

		it('words the question from the description in the shape', () => {
			const clarifier = new Clarifier()
			const recipe = buildInterpretRecipe({
				mappings: [{ entity: 'value', aliases: [], field: 'value' }],
				shape: objectShape({ value: numberShape({ description: 'How much is it?' }) }),
			})
			const result = clarifier.clarify([], recipe, undefined, intent)
			expect(result.ambiguities[0]?.question).toBe('How much is it?')
		})

		it('renders the question through the injected narrator, so a lexicon rewords it', () => {
			const clarifier = new Clarifier({
				narrator: new Narrator({
					lexicon: { templates: { 'ambiguity.entity': 'Which {{entity}}?' } },
				}),
			})
			const recipe = buildInterpretRecipe({
				mappings: [{ entity: 'value', aliases: [], field: 'value' }],
				shape: objectShape({ value: numberShape() }),
			})
			const result = clarifier.clarify([], recipe, undefined, intent)
			expect(result.ambiguities[0]?.question).toBe('Which value?')
		})

		it('never raises an ambiguity for an optional field left absent', () => {
			const clarifier = new Clarifier()
			const recipe = buildInterpretRecipe({
				mappings: [{ entity: 'value', aliases: [], field: 'value' }],
				shape: objectShape({ value: optionalShape(numberShape()) }),
			})
			const result = clarifier.clarify([], recipe, undefined, intent)
			expect(result.ambiguities).toEqual([])
		})

		it('honors the configured floor — a below-floor entity still raises its ambiguity', () => {
			const clarifier = new Clarifier({ floor: 0.95 })
			const recipe = buildInterpretRecipe({
				mappings: [{ entity: 'value', aliases: [], field: 'value' }],
				shape: objectShape({ value: numberShape() }),
			})
			const fresh: readonly Entity[] = [
				{ name: 'value', value: 42, provenance: { category: 'extracted' }, confidence: 0.7 },
			]
			const result = clarifier.clarify(fresh, recipe, undefined, intent)
			expect(result.ambiguities).toHaveLength(1)
			expect(Object.hasOwn(result.ambiguities[0] ?? {}, 'fault')).toBe(false)
		})

		it('a below-floor entity on an optional field still asks', () => {
			const clarifier = new Clarifier({ floor: 0.95 })
			const recipe = buildInterpretRecipe({
				mappings: [{ entity: 'value', aliases: [], field: 'value' }],
				shape: objectShape({ value: optionalShape(numberShape()) }),
			})
			const fresh: readonly Entity[] = [
				{ name: 'value', value: 42, provenance: { category: 'extracted' }, confidence: 0.7 },
			]
			expect(clarifier.clarify(fresh, recipe, undefined, intent).ambiguities).toEqual([
				{ field: 'value', question: 'What is your value?', candidates: [], required: true },
			])
		})

		it('a mapped field left to a default asks while a number nobody claimed could be its value', () => {
			const clarifier = new Clarifier()
			const recipe = buildInterpretRecipe({
				mappings: [{ entity: 'term', aliases: [], field: 'term' }],
				shape: objectShape({ term: optionalShape(numberShape(), { default: 12 }) }),
			})
			const result = clarifier.clarify([], recipe, undefined, intent, [24, 36])
			expect(result.ambiguities).toEqual([
				{ field: 'term', question: 'What is your term?', candidates: ['24', '36'], required: true },
			])
		})

		it('a required field asks with the unclaimed numbers as candidates', () => {
			const clarifier = new Clarifier()
			const recipe = buildInterpretRecipe({
				mappings: [{ entity: 'age', aliases: [], field: 'age' }],
				shape: objectShape({ age: numberShape() }),
			})
			const result = clarifier.clarify([], recipe, undefined, intent, [30])
			expect(result.ambiguities).toEqual([
				{
					field: 'age',
					question: 'What is your age?',
					candidates: ['30'],
					required: true,
					fault: { reason: 'missing', path: ['age'], expected: 'number' },
				},
			])
		})

		it('a carried value asks too while a number nobody claimed could replace it', () => {
			const clarifier = new Clarifier()
			const recipe = buildInterpretRecipe({
				mappings: [{ entity: 'value', aliases: [], field: 'value' }],
			})
			const prior = buildInterpretation({
				intent,
				entities: [
					{ name: 'value', value: 99, provenance: { category: 'extracted' }, confidence: 1 },
				],
			})
			const result = clarifier.clarify([], recipe, seedInterpretContext([prior]), intent, [7])
			expect(result.ambiguities.map((ambiguity) => ambiguity.candidates)).toEqual([['7']])
		})

		it('a stated or computed value does not ask, whatever is left over', () => {
			const clarifier = new Clarifier()
			const recipe = buildInterpretRecipe({
				mappings: [
					{ entity: 'value', aliases: [], field: 'value' },
					{ entity: 'double', aliases: [], field: 'double' },
				],
				computations: [
					{
						field: 'double',
						expression: createOperation('multiply', createVariable('value'), createConstant(2)),
					},
				],
			})
			const fresh: readonly Entity[] = [
				{ name: 'value', value: 5, provenance: { category: 'extracted' }, confidence: 1 },
			]
			expect(clarifier.clarify(fresh, recipe, undefined, intent, [7]).ambiguities).toEqual([])
		})

		it('a low floor accepts the same entity as resolved', () => {
			const clarifier = new Clarifier({ floor: 0.3 })
			const recipe = buildInterpretRecipe({
				mappings: [{ entity: 'value', aliases: [], field: 'value' }],
				shape: objectShape({ value: numberShape() }),
			})
			const fresh: readonly Entity[] = [
				{ name: 'value', value: 42, provenance: { category: 'extracted' }, confidence: 0.7 },
			]
			const result = clarifier.clarify(fresh, recipe, undefined, intent)
			expect(result.ambiguities).toEqual([])
		})
	})

	it('is deterministic across repeated calls', () => {
		const clarifier = new Clarifier()
		const recipe = buildInterpretRecipe({
			mappings: [{ entity: 'value', aliases: [], field: 'value' }],
			shape: objectShape({
				value: numberShape(),
				term: optionalShape(numberShape(), { default: 12 }),
			}),
		})
		const fresh: readonly Entity[] = [
			{ name: 'value', value: 42, provenance: { category: 'extracted' }, confidence: 0.9 },
		]
		expect(clarifier.clarify(fresh, recipe, undefined, intent)).toEqual(
			clarifier.clarify(fresh, recipe, undefined, intent),
		)
	})
})
