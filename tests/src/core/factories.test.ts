import type { InterpretEventMap, Template } from '@src/core'
import { factorGroup, fieldFactor, quantitativeDefinition } from '@orkestrel/reason'
import {
	Clarifier,
	createClarifier,
	createDefinitionManager,
	createExtractor,
	createFormatter,
	createGenerator,
	createInterpret,
	createInterpretContext,
	createNormalizer,
	createSubjectManager,
	createTemplate,
	createTemplateManager,
	DEFAULT_INTERPRET_FLOOR,
	DEFAULT_INTERPRET_HISTORY,
	DEFAULT_INTERPRET_SIMILARITY,
	DefinitionManager,
	Extractor,
	Formatter,
	Generator,
	Interpret,
	InterpretContext,
	InterpretError,
	isInterpretError,
	Normalizer,
	SubjectManager,
	TemplateManager,
} from '@src/core'
import { describe, expect, it } from 'vitest'
import {
	buildInterpretTemplate,
	buildInterpretation,
	captureError,
	createRecorder,
	INTERPRET_ACTIONS,
	INTERPRET_DOMAINS,
	invokeRaw,
	recordEmitterEvents,
} from '../../setup.js'

// This file also verifies the aggregate `@src/core` barrel drops nothing for
// `interprets`: a representative sample of the module's exports resolves in
// BOTH type space (the `import type` block above — a compile-time check) and
// value space (the runtime assertions below).

describe('interprets barrel — value-space sample resolves', () => {
	it('every sampled export is defined', () => {
		expect(createInterpret).toBeDefined()
		expect(createNormalizer).toBeDefined()
		expect(createExtractor).toBeDefined()
		expect(createClarifier).toBeDefined()
		expect(createFormatter).toBeDefined()
		expect(createGenerator).toBeDefined()
		expect(createTemplateManager).toBeDefined()
		expect(createSubjectManager).toBeDefined()
		expect(createDefinitionManager).toBeDefined()
		expect(createInterpretContext).toBeDefined()
		expect(createTemplate).toBeDefined()
		expect(isInterpretError).toBeDefined()
		expect(InterpretError).toBeDefined()
		expect(DEFAULT_INTERPRET_FLOOR).toBeDefined()
		expect(DEFAULT_INTERPRET_SIMILARITY).toBeDefined()
		expect(DEFAULT_INTERPRET_HISTORY).toBeDefined()
		expect(Interpret).toBeDefined()
		expect(Normalizer).toBeDefined()
		expect(Extractor).toBeDefined()
		expect(Clarifier).toBeDefined()
		expect(Formatter).toBeDefined()
		expect(Generator).toBeDefined()
		expect(TemplateManager).toBeDefined()
		expect(SubjectManager).toBeDefined()
		expect(DefinitionManager).toBeDefined()
		expect(InterpretContext).toBeDefined()
	})
})

describe('createInterpret', () => {
	it('wires a working orchestrator that interprets against a registered template', () => {
		const interpret = createInterpret({
			templates: [buildInterpretTemplate()],
			extractor: createExtractor({ actions: INTERPRET_ACTIONS, domains: INTERPRET_DOMAINS }),
		})
		const result = interpret.interpret('calculate arithmetic 42')
		expect(result.complete).toBe(true)
		expect(result.subject).toEqual({ value: 42 })
		expect(interpret.templates()).toHaveLength(1)
	})

	it('honors construction hooks via emitter events', () => {
		const interpretEvents = createRecorder<InterpretEventMap['interpret']>()
		const interpret = createInterpret({
			templates: [buildInterpretTemplate()],
			extractor: createExtractor({ actions: INTERPRET_ACTIONS, domains: INTERPRET_DOMAINS }),
			on: { interpret: interpretEvents.handler },
		})
		const events = recordEmitterEvents(interpret.emitter, ['interpret', 'register', 'destroy'])
		interpret.interpret('calculate arithmetic 42')
		expect(interpretEvents.count).toBe(1)
		expect(events.interpret.count).toBe(1)
		interpret.destroy()
		expect(events.destroy.count).toBe(1)
	})
})

describe('createNormalizer', () => {
	it('wires a working normalizer honoring the neutral built-in contractions', () => {
		const normalizer = createNormalizer()
		expect(normalizer.normalize("it's cold").text).toBe('it is cold')
	})

	it('merges caller options over the neutral defaults', () => {
		const normalizer = createNormalizer({ corrections: { teh: 'the' } })
		expect(normalizer.normalize('teh value').text).toBe('the value')
	})
})

describe('createExtractor', () => {
	it('wires a working extractor honoring caller vocabulary', () => {
		const extractor = createExtractor({ actions: INTERPRET_ACTIONS, domains: INTERPRET_DOMAINS })
		const result = extractor.extract('calculate arithmetic 42')
		expect(result.intent).toEqual({ action: 'calculate', domain: 'arithmetic', confidence: 1 })
		expect(result.numbers).toEqual([42])
	})
})

describe('createClarifier', () => {
	it('wires a working clarifier honoring the configured floor', () => {
		const clarifier = createClarifier({ floor: 0.5 })
		const template = buildInterpretTemplate()
		const result = clarifier.clarify([], template, undefined, {
			action: 'calculate',
			domain: 'arithmetic',
			confidence: 1,
		})
		expect(result.complete).toBe(true)
		expect(result.ambiguities).toEqual([])
	})
})

describe('createFormatter', () => {
	it('wires a working formatter honoring caller verb phrasing', () => {
		const formatter = createFormatter({ verbs: { calculate: 'Calculate' } })
		const result = formatter.format(
			{ action: 'calculate', domain: 'arithmetic', confidence: 1 },
			buildInterpretTemplate(),
			[],
			[],
		)
		expect(result.prompt).toContain('Calculate')
	})
})

describe('createGenerator', () => {
	it('wires a working generator that builds a subject from entities', () => {
		const generator = createGenerator()
		const result = generator.generate(
			[
				{
					name: 'value',
					value: 42,
					provenance: { category: 'extracted', detail: 'keyword' },
					confidence: 1,
				},
			],
			buildInterpretTemplate(),
		)
		expect(result.subject).toEqual({ value: 42 })
		expect(result.mappings).toHaveLength(1)
	})
})

describe('createTemplateManager', () => {
	it('wires a working registry seeded from options', () => {
		const manager = createTemplateManager({ templates: [buildInterpretTemplate()] })
		expect(manager.size).toBe(1)
		expect(manager.has('template-1')).toBe(true)
	})

	it('honors a custom id via add options', () => {
		const manager = createTemplateManager()
		const record = manager.add(buildInterpretTemplate(), { id: 'custom-id' })
		expect(record.id).toBe('custom-id')
		expect(manager.has('custom-id')).toBe(true)
		expect(manager.has('template-1')).toBe(false)
	})
})

describe('createSubjectManager', () => {
	it('wires a working registry seeded from options', () => {
		const manager = createSubjectManager({ subjects: [{ value: 1 }] })
		expect(manager.size).toBe(1)
	})

	it('honors a custom id via add options', () => {
		const manager = createSubjectManager()
		const record = manager.add({ value: 1 }, { id: 'custom-subject' })
		expect(record.id).toBe('custom-subject')
		expect(manager.has('custom-subject')).toBe(true)
	})
})

describe('createDefinitionManager', () => {
	const definition = quantitativeDefinition('d1', 'D1', [
		factorGroup('total', 'sum', [fieldFactor('value', 'value')]),
	])

	it('wires a working registry seeded from options', () => {
		const manager = createDefinitionManager({ definitions: [definition] })
		expect(manager.size).toBe(1)
		expect(manager.has('d1')).toBe(true)
	})

	it('honors a custom id via add options', () => {
		const manager = createDefinitionManager()
		const record = manager.add(definition, { id: 'custom-definition' })
		expect(record.id).toBe('custom-definition')
		expect(manager.has('custom-definition')).toBe(true)
		expect(manager.has('d1')).toBe(false)
	})
})

describe('createInterpretContext', () => {
	it('wires a working context honoring session and history options', () => {
		const context = createInterpretContext({ session: 'turn-1', history: 2 })
		expect(context.session).toBe('turn-1')
		expect(context.previous()).toEqual([])
		context.add(buildInterpretation())
		context.add(buildInterpretation())
		context.add(buildInterpretation())
		expect(context.previous()).toHaveLength(2)
	})
})

describe('createTemplate — validation', () => {
	it('returns valid template data unchanged', () => {
		const template = createTemplate(buildInterpretTemplate())
		expect(template.id).toBe('template-1')
	})

	it('throws InterpretError INVALID_TEMPLATE for malformed data', () => {
		const bad: unknown = { ...buildInterpretTemplate(), mappings: 'not-an-array' }
		const error = captureError(() => invokeRaw<Template>(undefined, createTemplate, [bad]))
		if (!isInterpretError(error)) throw new Error('expected an InterpretError')
		expect(error.code).toBe('INVALID_TEMPLATE')
	})
})
