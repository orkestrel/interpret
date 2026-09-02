import {
	createConstant,
	createFactorGroup,
	createFieldFactor,
	createOperation,
	createQuantitativeDefinition,
	createVariable,
} from '@orkestrel/reason'
import {
	createInterpret,
	Extractor,
	isAmbiguity,
	isComputedField,
	isEntity,
	isEntityMapping,
	isFieldDefault,
	isFieldMapping,
	isIntent,
	isInterpretation,
	isProvenance,
	isStageFailure,
	isStageRecord,
	isTemplate,
} from '@src/core'
import { describe, expect, it } from 'vitest'
import {
	buildInsuranceTemplate,
	buildInterpretTemplate,
	INTERPRET_ACTIONS,
	INTERPRET_DOMAINS,
	TRICKY_KEYS,
} from '../../setup.js'

// The interprets validators — deep TOTAL guards (AGENTS §14): adversarial
// junk (cycles, hostile prototypes, wrong shapes) returns `false`, never
// throws. Input record guards are exact; foreign-result guards are open.

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
				expression: createOperation('divide', createVariable('deductible'), createConstant(12)),
			}),
		).toBe(true)
	})

	it('rejects a malformed expression tree and a missing field', () => {
		expect(isComputedField({ field: 'monthly', expression: { form: 'variable' } })).toBe(false)
		expect(isComputedField({ expression: createConstant(1) })).toBe(false)
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
				{
					field: 'monthly',
					expression: createOperation('divide', createVariable('value'), createConstant(12)),
				},
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
		const definition = createQuantitativeDefinition('t2', 'Two', [
			createFactorGroup('g', 'sum', [createFieldFactor('v', 'value')]),
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

describe('isProvenance', () => {
	it('accepts open records and real class instances', () => {
		expect(isProvenance({ category: 'extracted', detail: 'alias', extra: true })).toBe(true)
		expect(
			isProvenance(
				Object.assign(
					new (class {
						get metadata(): boolean {
							return true
						}
					})(),
					{
						category: 'computed',
						detail: 'formula',
						extra: true,
					},
				),
			),
		).toBe(true)
	})

	it('checks category and the optional detail member', () => {
		expect(isProvenance({ category: 'subject' })).toBe(true)
		expect(isProvenance({ category: 'subject', detail: undefined })).toBe(true)
		expect(isProvenance({ category: 'external' })).toBe(false)
		expect(isProvenance({ category: 'subject', detail: 1 })).toBe(false)
	})

	it('refuses arrays', () => {
		expect(isProvenance([])).toBe(false)
	})
})

describe('isIntent', () => {
	it('accepts open records, real class instances, and every number', () => {
		expect(
			isIntent({ action: 'calculate', domain: 'arithmetic', confidence: Number.NaN, extra: true }),
		).toBe(true)
		expect(
			isIntent(
				Object.assign(
					new (class {
						get metadata(): boolean {
							return true
						}
					})(),
					{
						action: 'calculate',
						domain: 'arithmetic',
						confidence: Number.POSITIVE_INFINITY,
					},
				),
			),
		).toBe(true)
	})

	it('accepts an unclassified intent carrying neither axis', () => {
		expect(isIntent({ confidence: 0 })).toBe(true)
		expect(isIntent({ action: 'calculate', confidence: 0.5 })).toBe(true)
		expect(isIntent({ domain: 'arithmetic', confidence: 0.5 })).toBe(true)
	})

	it('rejects each wrongly typed member and arrays', () => {
		expect(isIntent({ action: 1, domain: 'arithmetic', confidence: 1 })).toBe(false)
		expect(isIntent({ action: 'calculate', domain: 1, confidence: 1 })).toBe(false)
		expect(isIntent({ action: 'calculate', domain: 'arithmetic', confidence: 'high' })).toBe(false)
		expect(isIntent({})).toBe(false)
		expect(isIntent([])).toBe(false)
	})
})

describe('isEntity', () => {
	it('accepts open records, real class instances, and does not inspect unknown value', () => {
		expect(
			isEntity({
				name: 'value',
				provenance: { category: 'extracted' },
				confidence: 1,
				extra: true,
			}),
		).toBe(true)
		expect(
			isEntity(
				Object.assign(
					new (class {
						get metadata(): boolean {
							return true
						}
					})(),
					{
						name: 'value',
						value: new Proxy({}, {}),
						provenance: { category: 'default' },
						confidence: Number.NaN,
					},
				),
			),
		).toBe(true)
	})

	it('rejects each checked member and arrays', () => {
		expect(isEntity({ name: 1, provenance: { category: 'extracted' }, confidence: 1 })).toBe(false)
		expect(isEntity({ name: 'value', provenance: { category: 'external' }, confidence: 1 })).toBe(
			false,
		)
		expect(
			isEntity({ name: 'value', provenance: { category: 'extracted' }, confidence: 'high' }),
		).toBe(false)
		expect(isEntity([])).toBe(false)
	})
})

describe('isFieldMapping', () => {
	it('accepts open records, real class instances, field paths, and unchecked value', () => {
		expect(
			isFieldMapping({
				field: ['nested', 'value'],
				provenance: { category: 'computed' },
				confidence: 1,
				extra: true,
			}),
		).toBe(true)
		expect(
			isFieldMapping(
				Object.assign(
					new (class {
						get metadata(): boolean {
							return true
						}
					})(),
					{
						field: 'value',
						entity: 'amount',
						value: Symbol('opaque'),
						provenance: { category: 'extracted' },
						confidence: Number.NEGATIVE_INFINITY,
					},
				),
			),
		).toBe(true)
	})

	it('checks field, provenance, confidence, and optional entity', () => {
		const mapping = { field: 'value', provenance: { category: 'extracted' }, confidence: 1 }
		expect(isFieldMapping(mapping)).toBe(true)
		expect(isFieldMapping({ ...mapping, entity: undefined })).toBe(true)
		expect(isFieldMapping({ ...mapping, field: [1] })).toBe(false)
		expect(isFieldMapping({ ...mapping, provenance: { category: 'external' } })).toBe(false)
		expect(isFieldMapping({ ...mapping, confidence: 'high' })).toBe(false)
		expect(isFieldMapping({ ...mapping, entity: 1 })).toBe(false)
		expect(isFieldMapping([])).toBe(false)
	})
})

describe('isAmbiguity', () => {
	it('accepts open records and real class instances', () => {
		const ambiguity = {
			field: 'value',
			question: 'Which value?',
			candidates: ['one', 'two'],
			required: true,
		}
		expect(isAmbiguity({ ...ambiguity, extra: true })).toBe(true)
		expect(
			isAmbiguity(
				Object.assign(
					new (class {
						get metadata(): boolean {
							return true
						}
					})(),
					ambiguity,
				),
			),
		).toBe(true)
	})

	it('rejects each wrongly typed member and arrays', () => {
		const ambiguity = {
			field: 'value',
			question: 'Which value?',
			candidates: ['one'],
			required: true,
		}
		expect(isAmbiguity({ ...ambiguity, field: [1] })).toBe(false)
		expect(isAmbiguity({ ...ambiguity, question: 1 })).toBe(false)
		expect(isAmbiguity({ ...ambiguity, candidates: [1] })).toBe(false)
		expect(isAmbiguity({ ...ambiguity, required: 'yes' })).toBe(false)
		expect(isAmbiguity([])).toBe(false)
	})
})

describe('isStageRecord', () => {
	it('accepts open records, real class instances, and does not inspect unknown snapshots', () => {
		expect(isStageRecord({ stage: 'extract', failed: false, extra: true })).toBe(true)
		expect(
			isStageRecord(
				Object.assign(
					new (class {
						get metadata(): boolean {
							return true
						}
					})(),
					{
						stage: 'generate',
						input: Symbol('input'),
						output: new Proxy({}, {}),
						failed: true,
						error: 'failed',
					},
				),
			),
		).toBe(true)
	})

	it('checks stage, failed, and optional error', () => {
		const record = { stage: 'normalize', failed: false }
		expect(isStageRecord(record)).toBe(true)
		expect(isStageRecord({ ...record, error: undefined })).toBe(true)
		expect(isStageRecord({ ...record, stage: 'publish' })).toBe(false)
		expect(isStageRecord({ ...record, failed: 'no' })).toBe(false)
		expect(isStageRecord({ ...record, error: 1 })).toBe(false)
		expect(isStageRecord([])).toBe(false)
	})
})

describe('isStageFailure', () => {
	it('accepts open records and real class instances', () => {
		const failure = { stage: 'format', code: 'FORMAT_FAILED', message: 'format failed' }
		expect(isStageFailure({ ...failure, extra: true })).toBe(true)
		expect(
			isStageFailure(
				Object.assign(
					new (class {
						get metadata(): boolean {
							return true
						}
					})(),
					failure,
				),
			),
		).toBe(true)
	})

	it('rejects each wrongly typed or out-of-domain member and arrays', () => {
		const failure = { stage: 'format', code: 'FORMAT_FAILED', message: 'format failed' }
		expect(isStageFailure({ ...failure, stage: 'publish' })).toBe(false)
		expect(isStageFailure({ ...failure, code: 'UNKNOWN' })).toBe(false)
		expect(isStageFailure({ ...failure, message: 1 })).toBe(false)
		expect(isStageFailure([])).toBe(false)
	})
})

describe('isInterpretation', () => {
	it('accepts every checked member, extra members, and shallow open subject/definition objects', () => {
		const interpretation = {
			text: 'calculate arithmetic 42',
			normalized: 'calculate arithmetic 42',
			intent: { action: 'calculate', domain: 'arithmetic', confidence: 1 },
			entities: [
				{
					name: 'value',
					value: 42,
					provenance: { category: 'extracted' },
					confidence: 1,
				},
			],
			subject: {},
			definition: {},
			mappings: [
				{
					field: 'value',
					entity: 'value',
					value: 42,
					provenance: { category: 'extracted' },
					confidence: 1,
				},
			],
			ambiguities: [],
			prompt: 'Calculate Arithmetic',
			stages: [{ stage: 'normalize', input: 'raw', output: 'normalized', failed: false }],
			failures: [],
			complete: true,
			confidence: Number.NaN,
			digest: 'abc123',
			extra: true,
		}
		expect(isInterpretation(interpretation)).toBe(true)

		const { text, ...members } = interpretation
		const instance = Object.assign(
			new (class {
				get text(): string {
					return text
				}
			})(),
			members,
		)
		expect(isInterpretation(instance)).toBe(true)
	})

	it('checks every required member', () => {
		const interpretation = {
			text: 'calculate arithmetic 42',
			normalized: 'calculate arithmetic 42',
			intent: { action: 'calculate', domain: 'arithmetic', confidence: 1 },
			entities: [],
			mappings: [],
			ambiguities: [],
			prompt: 'Calculate Arithmetic',
			stages: [],
			failures: [],
			complete: true,
			confidence: 1,
			digest: 'abc123',
		}
		expect(isInterpretation({ ...interpretation, text: 1 })).toBe(false)
		expect(isInterpretation({ ...interpretation, normalized: 1 })).toBe(false)
		expect(isInterpretation({ ...interpretation, intent: {} })).toBe(false)
		expect(isInterpretation({ ...interpretation, entities: [{}] })).toBe(false)
		expect(isInterpretation({ ...interpretation, mappings: [{}] })).toBe(false)
		expect(isInterpretation({ ...interpretation, ambiguities: [{}] })).toBe(false)
		expect(isInterpretation({ ...interpretation, prompt: 1 })).toBe(false)
		expect(isInterpretation({ ...interpretation, stages: [{}] })).toBe(false)
		expect(isInterpretation({ ...interpretation, failures: [{}] })).toBe(false)
		expect(isInterpretation({ ...interpretation, complete: 'yes' })).toBe(false)
		expect(isInterpretation({ ...interpretation, confidence: 'high' })).toBe(false)
		expect(isInterpretation({ ...interpretation, digest: 1 })).toBe(false)
		expect(isInterpretation([])).toBe(false)
	})

	it('checks optional subject and definition only as open non-array objects', () => {
		const interpretation = {
			text: 'text',
			normalized: 'text',
			intent: { confidence: 0 },
			entities: [],
			mappings: [],
			ambiguities: [],
			prompt: '',
			stages: [],
			failures: [],
			complete: false,
			confidence: 0,
			digest: 'digest',
		}
		expect(isInterpretation(interpretation)).toBe(true)
		expect(isInterpretation({ ...interpretation, subject: undefined, definition: undefined })).toBe(
			true,
		)
		expect(isInterpretation({ ...interpretation, subject: [] })).toBe(false)
		expect(isInterpretation({ ...interpretation, definition: 'invalid' })).toBe(false)
	})

	it('accepts a real createInterpret result', () => {
		const interpret = createInterpret()
		try {
			const result = interpret.interpret('unmatched text')
			expect(isInterpretation(result)).toBe(true)
		} finally {
			interpret.destroy()
		}
	})

	it('accepts a real result from the complete branch, subject and definition populated', () => {
		// The NO_TEMPLATE round trip above never reaches the branch that builds
		// `subject`, `definition`, `entities`, and `mappings`. This vector is
		// proven to complete in Interpret.test.ts, and the `complete` assertion
		// pins that the populated branch was actually reached — a guard pass on
		// the refusal branch would not count.
		const interpret = createInterpret({
			templates: [buildInsuranceTemplate()],
			extractor: new Extractor({ actions: INTERPRET_ACTIONS, domains: INTERPRET_DOMAINS }),
		})
		try {
			const result = interpret.interpret('calculate insurance age 25')
			expect(result.complete).toBe(true)
			expect(isInterpretation(result)).toBe(true)
		} finally {
			interpret.destroy()
		}
	})

	it('rejects an input-family Template that is accepted by its exact input guard', () => {
		const template = buildInterpretTemplate()
		expect(isTemplate(template)).toBe(true)
		expect(isInterpretation(template)).toBe(false)
	})
})

it('keeps every result guard total under hostile inputs', () => {
	const cyclic: Record<string, unknown> = {}
	cyclic.self = cyclic
	const nullPrototype: Record<string, unknown> = Object.create(null)
	const revoked = Proxy.revocable({}, {})
	revoked.revoke()

	for (const guard of [
		isProvenance,
		isIntent,
		isEntity,
		isFieldMapping,
		isAmbiguity,
		isStageRecord,
		isStageFailure,
		isInterpretation,
	]) {
		expect(guard(cyclic)).toBe(false)
		expect(guard(nullPrototype)).toBe(false)
		expect(guard(revoked.proxy)).toBe(false)
	}

	expect(
		isProvenance({
			get category(): never {
				throw new Error('hostile provenance getter')
			},
		}),
	).toBe(false)
	expect(
		isIntent({
			get action(): never {
				throw new Error('hostile intent getter')
			},
		}),
	).toBe(false)
	expect(
		isEntity({
			get name(): never {
				throw new Error('hostile entity getter')
			},
		}),
	).toBe(false)
	expect(
		isFieldMapping({
			get field(): never {
				throw new Error('hostile field-mapping getter')
			},
		}),
	).toBe(false)
	expect(
		isAmbiguity({
			get field(): never {
				throw new Error('hostile ambiguity getter')
			},
		}),
	).toBe(false)
	expect(
		isStageRecord({
			get stage(): never {
				throw new Error('hostile stage-record getter')
			},
		}),
	).toBe(false)
	expect(
		isStageFailure({
			get stage(): never {
				throw new Error('hostile stage-failure getter')
			},
		}),
	).toBe(false)
	expect(
		isInterpretation({
			get text(): never {
				throw new Error('hostile interpretation getter')
			},
		}),
	).toBe(false)
})
