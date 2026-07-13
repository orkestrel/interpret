import type {
	ClarifierInterface,
	ExtractorInterface,
	ExtractResult,
	FormatterInterface,
	GeneratorInterface,
	InterpretEventMap,
	NormalizerInterface,
} from '@src/core'
import { isRecord, isString } from '@orkestrel/contract'
import {
	constant,
	createReason,
	createSymbolicReasoner,
	equation,
	symbolicDefinition,
	variable,
} from '@orkestrel/reason'
import { createNarrator, Extractor, Interpret, isInterpretError } from '@src/core'
import { describe, expect, it } from 'vitest'
import {
	buildInsuranceTemplate,
	buildInterpretTemplate,
	captureError,
	INTERPRET_ACTIONS,
	INTERPRET_DOMAINS,
	recordEmitterEvents,
} from '../../setup.js'

// The `Interpret` orchestrator — registry, synchronous five-stage pipeline,
// explicit NO_TEMPLATE / LOW_CONFIDENCE gates, visible stage-throw failures,
// reverse passthroughs, emitter, and DESTROYED teardown (design §2/§8).

function corpusExtractor(): ExtractorInterface {
	return new Extractor({ actions: INTERPRET_ACTIONS, domains: INTERPRET_DOMAINS })
}

describe('Interpret', () => {
	describe('registry', () => {
		it('registers, looks up, lists, and unregisters templates as plain data', () => {
			const interpret = new Interpret()
			const template = buildInterpretTemplate()
			interpret.register(template)
			expect(interpret.template('template-1')).toEqual(template)
			expect(interpret.templates()).toEqual([template])
			expect(interpret.unregister('template-1')).toBe(true)
			expect(interpret.template('template-1')).toBeUndefined()
			interpret.destroy()
		})

		it('emits register with the template id', () => {
			const interpret = new Interpret()
			const events = recordEmitterEvents<InterpretEventMap, 'register'>(interpret.emitter, [
				'register',
			])
			interpret.register(buildInterpretTemplate())
			expect(events.register.calls).toEqual([['template-1']])
			interpret.destroy()
		})
	})

	describe('pipeline', () => {
		it('runs the five ordered stages and produces a complete result', () => {
			const interpret = new Interpret({
				templates: [buildInsuranceTemplate()],
				extractor: corpusExtractor(),
			})
			const result = interpret.interpret('calculate insurance age 25')
			expect(result.stages.map((stage) => stage.stage)).toEqual([
				'normalize',
				'extract',
				'clarify',
				'format',
				'generate',
			])
			expect(result.stages.every((stage) => !stage.failed)).toBe(true)
			expect(result.complete).toBe(true)
			expect(result.failures).toEqual([])
			expect(result.subject).toMatchObject({ age: 25, accidents: 0, coverage: 'standard' })
			expect(result.text).toBe('calculate insurance age 25')
			expect(result.digest.length).toBeGreaterThan(0)
			interpret.destroy()
		})

		it('records structured, non-blob per-stage input/output snapshots that chain across stages', () => {
			const interpret = new Interpret({
				templates: [buildInsuranceTemplate()],
				extractor: corpusExtractor(),
			})
			const result = interpret.interpret('calculate insurance age 25')
			const normalize = result.stages[0]
			const extract = result.stages[1]
			expect(typeof normalize?.output).not.toBe('string')
			expect(normalize?.output).toEqual({ text: 'calculate insurance age 25', changes: [] })
			const normalizeOutput = normalize?.output
			if (!isRecord(normalizeOutput) || !isString(normalizeOutput.text)) {
				throw new Error('expected a NormalizeResult output')
			}
			expect(extract?.input).toBe(normalizeOutput.text)
			interpret.destroy()
		})

		it('emits interpret once and error zero on the happy path', () => {
			const interpret = new Interpret({
				templates: [buildInsuranceTemplate()],
				extractor: corpusExtractor(),
			})
			const events = recordEmitterEvents<InterpretEventMap, 'interpret' | 'error'>(
				interpret.emitter,
				['interpret', 'error'],
			)
			interpret.interpret('calculate insurance age 25')
			expect(events.interpret.count).toBe(1)
			expect(events.error.count).toBe(0)
			interpret.destroy()
		})
	})

	describe('NO_TEMPLATE gate', () => {
		it('yields an explicit incomplete result with a field:intent ambiguity, never a fallback template', () => {
			const interpret = new Interpret({
				templates: [buildInsuranceTemplate()],
				extractor: corpusExtractor(),
			})
			const result = interpret.interpret('what is the meaning of life')
			expect(result.complete).toBe(false)
			expect(result.subject).toBeUndefined()
			expect(result.definition).toBeUndefined()
			expect(result.entities).toEqual([])
			expect(result.confidence).toBe(0)
			expect(result.ambiguities[0]?.field).toBe('intent')
			expect(result.ambiguities[0]?.required).toBe(true)
			expect(result.ambiguities[0]?.candidates).toEqual(['insurance'])
			expect(result.failures[0]?.code).toBe('NO_TEMPLATE')
			expect(result.stages).toHaveLength(5)
			interpret.destroy()
		})

		it('fires NO_TEMPLATE even against a non-empty registry (no templates[0] fallback)', () => {
			const interpret = new Interpret({
				templates: [buildInsuranceTemplate()],
				extractor: corpusExtractor(),
			})
			const result = interpret.interpret('compute statistics 42')
			expect(result.complete).toBe(false)
			expect(result.failures[0]?.code).toBe('NO_TEMPLATE')
			interpret.destroy()
		})
	})

	describe('LOW_CONFIDENCE gate', () => {
		it('honors the configured floor: a matched template with sub-floor intent is incomplete, entities still assigned', () => {
			const weakExtractor: ExtractorInterface = {
				extract(): ExtractResult {
					return {
						intent: { action: 'calculate', domain: 'insurance', confidence: 0.1 },
						numbers: [25],
						complete: true,
					}
				},
			}
			const interpret = new Interpret({
				templates: [buildInsuranceTemplate()],
				extractor: weakExtractor,
			})
			const result = interpret.interpret('calculate insurance age 25')
			expect(result.complete).toBe(false)
			expect(result.subject).toBeUndefined()
			expect(result.failures[0]?.code).toBe('LOW_CONFIDENCE')
			expect(result.ambiguities[0]?.field).toBe('intent')
			expect(result.entities.map((entity) => entity.name)).toContain('age')
			interpret.destroy()
		})
	})

	describe('stage failures', () => {
		it('marks a throwing stage on its record AND on failures, emits error, and stays visible-incomplete', () => {
			const throwingNormalizer: NormalizerInterface = {
				normalize() {
					throw new Error('boom')
				},
			}
			const interpret = new Interpret({
				templates: [buildInsuranceTemplate()],
				extractor: corpusExtractor(),
				normalizer: throwingNormalizer,
			})
			const events = recordEmitterEvents<InterpretEventMap, 'interpret' | 'error'>(
				interpret.emitter,
				['interpret', 'error'],
			)
			const result = interpret.interpret('calculate insurance age 25')
			expect(result.stages[0]?.failed).toBe(true)
			expect(result.stages[0]?.error).toBe('boom')
			expect(result.stages).toHaveLength(5)
			expect(result.failures[0]?.code).toBe('NORMALIZE_FAILED')
			expect(result.complete).toBe(false)
			expect(events.error.count).toBe(1)
			expect(events.interpret.count).toBe(1)
			interpret.destroy()
		})

		it('marks EXTRACT_FAILED on a throwing extractor', () => {
			const throwingExtractor: ExtractorInterface = {
				extract() {
					throw new Error('extract boom')
				},
			}
			const interpret = new Interpret({
				templates: [buildInsuranceTemplate()],
				extractor: throwingExtractor,
			})
			const result = interpret.interpret('calculate insurance age 25')
			expect(result.stages[1]?.failed).toBe(true)
			expect(result.stages[1]?.error).toBe('extract boom')
			expect(result.stages).toHaveLength(5)
			expect(result.failures[0]?.code).toBe('EXTRACT_FAILED')
			expect(result.complete).toBe(false)
			interpret.destroy()
		})

		it('marks CLARIFY_FAILED on a throwing clarifier', () => {
			const throwingClarifier: ClarifierInterface = {
				clarify() {
					throw new Error('clarify boom')
				},
			}
			const interpret = new Interpret({
				templates: [buildInsuranceTemplate()],
				extractor: corpusExtractor(),
				clarifier: throwingClarifier,
			})
			const result = interpret.interpret('calculate insurance age 25')
			expect(result.stages[2]?.failed).toBe(true)
			expect(result.stages[2]?.error).toBe('clarify boom')
			expect(result.stages).toHaveLength(5)
			expect(result.failures[0]?.code).toBe('CLARIFY_FAILED')
			expect(result.complete).toBe(false)
			interpret.destroy()
		})

		it('marks FORMAT_FAILED on a throwing formatter', () => {
			const throwingFormatter: FormatterInterface = {
				format() {
					throw new Error('format boom')
				},
			}
			const interpret = new Interpret({
				templates: [buildInsuranceTemplate()],
				extractor: corpusExtractor(),
				formatter: throwingFormatter,
			})
			const result = interpret.interpret('calculate insurance age 25')
			expect(result.stages[3]?.failed).toBe(true)
			expect(result.stages[3]?.error).toBe('format boom')
			expect(result.stages).toHaveLength(5)
			expect(result.failures[0]?.code).toBe('FORMAT_FAILED')
			expect(result.complete).toBe(false)
			interpret.destroy()
		})

		it('marks GENERATE_FAILED on a throwing generator', () => {
			const throwingGenerator: GeneratorInterface = {
				generate() {
					throw new Error('generate boom')
				},
			}
			const interpret = new Interpret({
				templates: [buildInsuranceTemplate()],
				extractor: corpusExtractor(),
				generator: throwingGenerator,
			})
			const result = interpret.interpret('calculate insurance age 25')
			expect(result.stages[4]?.failed).toBe(true)
			expect(result.stages[4]?.error).toBe('generate boom')
			expect(result.stages).toHaveLength(5)
			expect(result.failures[0]?.code).toBe('GENERATE_FAILED')
			expect(result.complete).toBe(false)
			interpret.destroy()
		})
	})

	describe('reverse direction', () => {
		it('describe delegates to its owned narrator', () => {
			const interpret = new Interpret()
			const definition = buildInterpretTemplate().definition
			expect(interpret.describe(definition)).toBe(createNarrator().describe(definition))
			interpret.destroy()
		})

		it('narrate delegates to its owned narrator', () => {
			const interpret = new Interpret()
			const reason = createReason({ reasoners: [createSymbolicReasoner()] })
			const result = reason.reason(
				{},
				symbolicDefinition('r', 'R', [equation('e1', variable('x'), constant(5), 'x')]),
			)
			expect(interpret.narrate(result)).toBe(createNarrator().narrate(result))
			reason.destroy()
			interpret.destroy()
		})

		it('honors a lexicon override supplied through InterpretOptions', () => {
			const interpret = new Interpret({
				lexicon: { templates: { 'definition.quantitative': '{{name}} has {{count}} group(s)' } },
			})
			const definition = buildInterpretTemplate().definition
			expect(interpret.describe(definition)).toBe('Arithmetic has 1 group(s)')
			interpret.destroy()
		})
	})

	describe('teardown', () => {
		it('emits destroy once and throws DESTROYED afterwards, keeping the emitter getter alive', () => {
			const interpret = new Interpret()
			const events = recordEmitterEvents<InterpretEventMap, 'destroy'>(interpret.emitter, [
				'destroy',
			])
			interpret.destroy()
			interpret.destroy()
			expect(events.destroy.count).toBe(1)
			expect(interpret.emitter).toBeDefined()
			const error = captureError(() => interpret.interpret('x'))
			expect(isInterpretError(error) && error.code === 'DESTROYED').toBe(true)
		})
	})
})
