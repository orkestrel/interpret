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
	createConstant,
	createEquation,
	createReason,
	createSymbolicDefinition,
	createSymbolicReasoner,
	createVariable,
} from '@orkestrel/reason'
import { createNarrator, Interpret, InterpretContext, isInterpretError } from '@src/core'
import { captureError, createRecorders } from '@orkestrel/test'
import { describe, expect, it } from 'vitest'
import {
	buildInsuranceTemplate,
	buildInterpretTemplate,
	createCorpusExtractor,
} from '../../setup.js'

// The `Interpret` orchestrator — registry, synchronous five-stage pipeline,
// explicit NO_TEMPLATE / LOW_CONFIDENCE gates, visible stage-throw failures,
// reverse passthroughs, emitter, and DESTROYED teardown (design §2/§8).

describe('Interpret', () => {
	describe('registry', () => {
		it('adds, looks up, lists, and removes templates as plain data', () => {
			const interpret = new Interpret()
			const template = buildInterpretTemplate()
			interpret.add(template)
			expect(interpret.template('template-1')).toEqual(template)
			expect(interpret.templates()).toEqual([template])
			expect(interpret.remove('template-1')).toBe(true)
			expect(interpret.template('template-1')).toBeUndefined()
			interpret.destroy()
		})

		it('removes a listed batch all-or-nothing, and every template with no argument', () => {
			const interpret = new Interpret()
			interpret.add(buildInterpretTemplate())
			interpret.add(buildInsuranceTemplate())
			expect(interpret.remove(['template-1', 'absent'])).toBe(false)
			expect(interpret.templates()).toHaveLength(2)
			expect(interpret.remove(['template-1', 'insurance-auto'])).toBe(true)
			expect(interpret.templates()).toEqual([])
			interpret.add(buildInterpretTemplate())
			expect(interpret.remove()).toBeUndefined()
			expect(interpret.templates()).toEqual([])
			interpret.destroy()
		})

		it('emits add with the template id', () => {
			const interpret = new Interpret()
			const events = createRecorders<InterpretEventMap, 'add'>(interpret.emitter, ['add'])
			interpret.add(buildInterpretTemplate())
			expect(events.add.calls).toEqual([['template-1']])
			interpret.destroy()
		})
	})

	describe('pipeline', () => {
		it('runs the five ordered stages and produces a complete result', () => {
			const interpret = new Interpret({
				templates: [buildInsuranceTemplate()],
				extractor: createCorpusExtractor(),
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
			expect(result.ambiguities).toEqual([])
			expect(result.failures).toEqual([])
			expect(result.subject).toMatchObject({ age: 25, accidents: 0, coverage: 'standard' })
			expect(result.text).toBe('calculate insurance age 25')
			expect(result.digest.length).toBeGreaterThan(0)
			interpret.destroy()
		})

		it('stores no completeness flag, so a reader derives it from ambiguities and failures', () => {
			const interpret = new Interpret({
				templates: [buildInsuranceTemplate()],
				extractor: createCorpusExtractor(),
			})
			const resolved = interpret.interpret('calculate insurance age 25')
			const unresolved = interpret.interpret('what is the meaning of life')

			expect(Object.hasOwn(resolved, 'complete')).toBe(false)
			expect(Object.hasOwn(unresolved, 'complete')).toBe(false)
			expect(resolved.ambiguities).toEqual([])
			expect(resolved.failures).toEqual([])
			expect(unresolved.failures).not.toEqual([])
			interpret.destroy()
		})

		it('records structured, non-blob per-stage input/output snapshots that chain across stages', () => {
			const interpret = new Interpret({
				templates: [buildInsuranceTemplate()],
				extractor: createCorpusExtractor(),
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
				extractor: createCorpusExtractor(),
			})
			const events = createRecorders<InterpretEventMap, 'interpret' | 'error'>(interpret.emitter, [
				'interpret',
				'error',
			])
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
				extractor: createCorpusExtractor(),
			})
			const result = interpret.interpret('what is the meaning of life')
			expect(result.ambiguities).not.toEqual([])
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

		it('renders the gate question through the lexicon, so a caller rewords it', () => {
			const interpret = new Interpret({
				templates: [buildInsuranceTemplate()],
				extractor: createCorpusExtractor(),
				narrator: { lexicon: { templates: { 'ambiguity.intent': 'Which domain?' } } },
			})
			const result = interpret.interpret('what is the meaning of life')
			expect(result.ambiguities[0]?.question).toBe('Which domain?')
			interpret.destroy()
		})

		it('fires NO_TEMPLATE even against a non-empty registry (no templates[0] fallback)', () => {
			const interpret = new Interpret({
				templates: [buildInsuranceTemplate()],
				extractor: createCorpusExtractor(),
			})
			const result = interpret.interpret('compute statistics 42')
			expect(result.ambiguities).not.toEqual([])
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
					}
				},
			}
			const interpret = new Interpret({
				templates: [buildInsuranceTemplate()],
				extractor: weakExtractor,
			})
			const result = interpret.interpret('calculate insurance age 25')
			expect(result.ambiguities).not.toEqual([])
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
				extractor: createCorpusExtractor(),
				normalizer: throwingNormalizer,
			})
			const events = createRecorders<InterpretEventMap, 'interpret' | 'error'>(interpret.emitter, [
				'interpret',
				'error',
			])
			const result = interpret.interpret('calculate insurance age 25')
			expect(result.stages[0]?.failed).toBe(true)
			expect(result.stages[0]?.error).toBe('boom')
			expect(result.stages).toHaveLength(5)
			expect(result.failures.map((failure) => failure.code)).toEqual(['NORMALIZE_FAILED'])
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
			expect(result.failures.map((failure) => failure.code)).toEqual(['EXTRACT_FAILED'])
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
				extractor: createCorpusExtractor(),
				clarifier: throwingClarifier,
			})
			const result = interpret.interpret('calculate insurance age 25')
			expect(result.stages[2]?.failed).toBe(true)
			expect(result.stages[2]?.error).toBe('clarify boom')
			expect(result.stages).toHaveLength(5)
			expect(result.failures.map((failure) => failure.code)).toEqual(['CLARIFY_FAILED'])
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
				extractor: createCorpusExtractor(),
				formatter: throwingFormatter,
			})
			const result = interpret.interpret('calculate insurance age 25')
			expect(result.stages[3]?.failed).toBe(true)
			expect(result.stages[3]?.error).toBe('format boom')
			expect(result.stages).toHaveLength(5)
			expect(result.failures.map((failure) => failure.code)).toEqual(['FORMAT_FAILED'])
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
				extractor: createCorpusExtractor(),
				generator: throwingGenerator,
			})
			const result = interpret.interpret('calculate insurance age 25')
			expect(result.stages[4]?.failed).toBe(true)
			expect(result.stages[4]?.error).toBe('generate boom')
			expect(result.stages).toHaveLength(5)
			expect(result.failures.map((failure) => failure.code)).toEqual(['GENERATE_FAILED'])
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
				createSymbolicDefinition('r', 'R', [
					createEquation('e1', createVariable('x'), createConstant(5), 'x'),
				]),
			)
			expect(interpret.narrate(result)).toBe(createNarrator().narrate(result))
			reason.destroy()
			interpret.destroy()
		})

		it('honors a lexicon override supplied through the narrator option group', () => {
			const interpret = new Interpret({
				narrator: {
					lexicon: { templates: { 'definition.quantitative': '{{name}} has {{count}} group(s)' } },
				},
			})
			const definition = buildInterpretTemplate().definition
			expect(interpret.describe(definition)).toBe('Arithmetic has 1 group(s)')
			interpret.destroy()
		})
	})

	describe('teardown', () => {
		it('emits destroy once and throws DESTROYED afterwards, keeping the emitter getter alive', () => {
			const interpret = new Interpret()
			const events = createRecorders<InterpretEventMap, 'destroy'>(interpret.emitter, ['destroy'])
			interpret.destroy()
			interpret.destroy()
			expect(events.destroy.count).toBe(1)
			expect(interpret.emitter).toBeDefined()
			const error = captureError(() => interpret.interpret('x'))
			expect(isInterpretError(error) && error.code === 'DESTROYED').toBe(true)
		})

		it('leaves a caller-supplied context alive, and a second orchestrator keeps using it', () => {
			const context = new InterpretContext({ session: 'shared' })
			const first = new Interpret({ context })
			const second = new Interpret({ context })
			first.destroy()
			expect(context.session).toBe('shared')
			expect(context.previous()).toEqual([])
			second.interpret('calculate arithmetic 42')
			expect(context.previous()).toHaveLength(1)
			second.destroy()
			expect(context.session).toBe('shared')
			context.destroy()
			const error = captureError(() => context.previous())
			expect(isInterpretError(error) && error.code === 'DESTROYED').toBe(true)
		})

		// The teardown of a context the orchestrator constructed itself has no
		// public observer: `Interpret` publishes no context accessor, so nothing
		// outside can read that context's state or subscribe to its emitter. The
		// supplied-context case above is the half a caller can drive, and it is the
		// half that matters — a shared context outliving one orchestrator.
	})
})
