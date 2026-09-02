import type { EmitterInterface } from '@orkestrel/emitter'
import type { Definition, ReasonResult } from '@orkestrel/reason'
import type {
	Ambiguity,
	ClarifierInterface,
	ClarifyResult,
	Entity,
	ExtractorInterface,
	ExtractResult,
	FormatResult,
	FormatterInterface,
	GenerateResult,
	GeneratorInterface,
	Intent,
	InterpretContextInterface,
	InterpretErrorCode,
	InterpretEventMap,
	InterpretInterface,
	InterpretOptions,
	InterpretStage,
	Interpretation,
	NarratorInterface,
	NormalizeResult,
	NormalizerInterface,
	StageFailure,
	StageRecord,
	Template,
} from './types.js'
import { Emitter } from '@orkestrel/emitter'
import { DEFAULT_INTERPRET_FLOOR, DEFAULT_INTERPRET_SIMILARITY } from './constants.js'
import { InterpretError } from './errors.js'
import { assignEntities, digestValue, matchTemplate } from './helpers.js'
import { InterpretContext } from './InterpretContext.js'
import { TemplateManager } from './managers/TemplateManager.js'
import { Narrator } from './Narrator.js'
import { Clarifier } from './stages/Clarifier.js'
import { Extractor } from './stages/Extractor.js'
import { Formatter } from './stages/Formatter.js'
import { Generator } from './stages/Generator.js'
import { Normalizer } from './stages/Normalizer.js'

/**
 * The interpretation orchestrator — the sole public entry point of the
 * `interprets` module, mirroring the reasons `Reason` orchestrator shape.
 *
 * @remarks
 * `interpret()` is genuinely SYNCHRONOUS — it returns its
 * {@link Interpretation} directly, never a `Promise` — and runs a fixed
 * five-stage pipeline —
 * `[normalize, extract, clarify, format, generate]` — each producing one
 * {@link StageRecord}. Between `extract` and `clarify` the orchestrator matches
 * the classified {@link Intent} against its registered {@link Template}s and,
 * on a match, assigns the extracted numbers to that template's mappings
 * (`assignEntities`) — a template-owned step, not a sixth stage. No match, or a
 * matched template whose intent confidence falls below the configured `floor`,
 * yields an explicit, auditable INCOMPLETE result (a `field: 'intent'`
 * ambiguity, absent subject/definition) rather than an arbitrary fallback
 * template. A stage THROW is caught, marked on its record AND on
 * `failures`, emitted as `error`, and still yields a visible incomplete result
 * — never a silent fallback. Every result carries a `digest` over its original
 * text plus the matched template id/version and the built subject/definition,
 * so re-running the same text against the same template version reproduces the
 * same digest (the replay contract). `describe` / `narrate` are the reverse
 * direction (structure → prose). `destroy()` is idempotent, tears down the
 * registry and the context it constructed itself — a context supplied through
 * `options.context` is shared, so it stays alive for whoever else holds it —
 * then destroys the emitter LAST; every method afterwards except the
 * {@link emitter} getter throws `InterpretError('DESTROYED', …)`.
 *
 * @example
 * ```ts
 * import { createFactorGroup, createFieldFactor, createQuantitativeDefinition } from '@orkestrel/reason'
 * import { Interpret, Extractor } from '@src/core'
 *
 * const interpret = new Interpret({
 * 	extractor: new Extractor({ actions: { calculate: 'calculate' }, domains: { arithmetic: ['arithmetic'] } }),
 * 	templates: [
 * 		{
 * 			id: 't1',
 * 			name: 'Arithmetic',
 * 			domain: 'arithmetic',
 * 			intents: ['calculate'],
 * 			mappings: [{ entity: 'value', aliases: [], field: 'value' }],
 * 			defaults: [],
 * 			computations: [],
 * 			definition: createQuantitativeDefinition('t1', 'Arithmetic', [
 * 				createFactorGroup('total', 'sum', [createFieldFactor('value', 'value')]),
 * 			]),
 * 		},
 * 	],
 * })
 * interpret.interpret('calculate arithmetic 42').subject // { value: 42 }
 * ```
 */
export class Interpret implements InterpretInterface {
	readonly #templates: TemplateManager
	readonly #context: InterpretContextInterface
	readonly #ownsContext: boolean
	readonly #normalizer: NormalizerInterface
	readonly #extractor: ExtractorInterface
	readonly #clarifier: ClarifierInterface
	readonly #formatter: FormatterInterface
	readonly #generator: GeneratorInterface
	readonly #similarity: number
	readonly #floor: number
	readonly #narrator: NarratorInterface
	readonly #emitter: Emitter<InterpretEventMap>
	#destroyed = false

	constructor(options?: InterpretOptions) {
		this.#similarity = options?.similarity ?? DEFAULT_INTERPRET_SIMILARITY
		this.#floor = options?.floor ?? DEFAULT_INTERPRET_FLOOR
		this.#templates = new TemplateManager({
			...(options?.templates === undefined ? {} : { templates: options.templates }),
		})
		this.#ownsContext = options?.context === undefined
		this.#context =
			options?.context ??
			new InterpretContext(
				options?.history === undefined ? undefined : { history: options.history },
			)
		this.#narrator = new Narrator(options?.narrator)
		this.#normalizer = options?.normalizer ?? new Normalizer()
		this.#extractor = options?.extractor ?? new Extractor()
		this.#clarifier =
			options?.clarifier ?? new Clarifier({ floor: this.#floor, narrator: this.#narrator })
		this.#formatter = options?.formatter ?? new Formatter({ narrator: this.#narrator })
		this.#generator = options?.generator ?? new Generator()
		this.#emitter = new Emitter<InterpretEventMap>({
			...(options?.on === undefined ? {} : { on: options.on }),
			...(options?.error === undefined ? {} : { error: options.error }),
		})
	}

	get emitter(): EmitterInterface<InterpretEventMap> {
		return this.#emitter
	}

	interpret(text: string): Interpretation {
		this.#ensureAlive()
		const stages: StageRecord[] = []

		let normalized: NormalizeResult
		try {
			normalized = this.#normalizer.normalize(text)
		} catch (error) {
			return this.#fail(
				text,
				text,
				{ confidence: 0 },
				[],
				[],
				stages,
				'normalize',
				'NORMALIZE_FAILED',
				text,
				error,
				['extract', 'clarify', 'format', 'generate'],
				undefined,
				undefined,
			)
		}
		stages.push({ stage: 'normalize', input: text, output: normalized, failed: false })

		let extract: ExtractResult
		try {
			extract = this.#extractor.extract(normalized.text)
		} catch (error) {
			return this.#fail(
				text,
				normalized.text,
				{ confidence: 0 },
				[],
				[],
				stages,
				'extract',
				'EXTRACT_FAILED',
				normalized.text,
				error,
				['clarify', 'format', 'generate'],
				undefined,
				undefined,
			)
		}
		stages.push({ stage: 'extract', input: normalized.text, output: extract, failed: false })

		const intent = extract.intent
		const templates = this.#templates.templates().map((record) => record.template)
		const matched = matchTemplate(intent, templates, this.#floor)

		if (matched === undefined) {
			return this.#gate(
				text,
				normalized.text,
				intent,
				[],
				stages,
				'NO_TEMPLATE',
				undefined,
				undefined,
			)
		}

		const assigned = assignEntities(
			extract.numbers,
			matched.mappings,
			normalized.text,
			this.#similarity,
		)
		const record = this.#templates.template(matched.id)
		const version = record?.version

		if (intent.confidence < this.#floor) {
			return this.#gate(
				text,
				normalized.text,
				intent,
				assigned,
				stages,
				'LOW_CONFIDENCE',
				matched.id,
				version,
			)
		}

		let clarified: ClarifyResult
		try {
			clarified = this.#clarifier.clarify(assigned, matched, this.#context, intent)
		} catch (error) {
			return this.#fail(
				text,
				normalized.text,
				intent,
				assigned,
				[],
				stages,
				'clarify',
				'CLARIFY_FAILED',
				assigned,
				error,
				['format', 'generate'],
				matched.id,
				version,
			)
		}
		stages.push({ stage: 'clarify', input: assigned, output: clarified, failed: false })

		const formatInput = { intent, entities: clarified.entities, ambiguities: clarified.ambiguities }
		let formatted: FormatResult
		try {
			formatted = this.#formatter.format(intent, matched, clarified.entities, clarified.ambiguities)
		} catch (error) {
			return this.#fail(
				text,
				normalized.text,
				intent,
				clarified.entities,
				clarified.ambiguities,
				stages,
				'format',
				'FORMAT_FAILED',
				formatInput,
				error,
				['generate'],
				matched.id,
				version,
			)
		}
		stages.push({ stage: 'format', input: formatInput, output: formatted, failed: false })

		let generated: GenerateResult
		try {
			generated = this.#generator.generate(clarified.entities, matched)
		} catch (error) {
			return this.#fail(
				text,
				normalized.text,
				intent,
				clarified.entities,
				clarified.ambiguities,
				stages,
				'generate',
				'GENERATE_FAILED',
				clarified.entities,
				error,
				[],
				matched.id,
				version,
			)
		}
		stages.push({ stage: 'generate', input: clarified.entities, output: generated, failed: false })

		const digest = digestValue({
			text,
			templateId: matched.id,
			templateVersion: version,
			subject: generated.subject,
			definition: generated.definition,
		})
		const result: Interpretation = {
			text,
			normalized: normalized.text,
			intent,
			entities: clarified.entities,
			subject: generated.subject,
			definition: generated.definition,
			mappings: generated.mappings,
			ambiguities: clarified.ambiguities,
			prompt: formatted.prompt,
			stages,
			failures: [],
			complete: clarified.complete,
			confidence: generated.confidence,
			digest,
		}

		this.#context.subjects.add(generated.subject)
		this.#context.definitions.add(generated.definition, { id: generated.definition.id })
		this.#context.add(result)
		this.#emitter.emit('interpret', result)
		return result
	}

	add(template: Template): void {
		this.#ensureAlive()
		this.#templates.add(template, { id: template.id })
		this.#emitter.emit('add', template.id)
	}

	remove(ids: readonly string[]): boolean
	remove(id: string): boolean
	remove(): void
	remove(target?: string | readonly string[]): boolean | void {
		this.#ensureAlive()
		if (target === undefined) return this.#templates.remove()
		if (typeof target === 'string') return this.#templates.remove(target)
		return this.#templates.remove(target)
	}

	template(id: string): Template | undefined {
		this.#ensureAlive()
		return this.#templates.template(id)?.template
	}

	templates(): readonly Template[] {
		this.#ensureAlive()
		return this.#templates.templates().map((record) => record.template)
	}

	describe(definition: Definition): string {
		this.#ensureAlive()
		return this.#narrator.describe(definition)
	}

	narrate(result: ReasonResult): string {
		this.#ensureAlive()
		return this.#narrator.narrate(result)
	}

	destroy(): void {
		if (this.#destroyed) return
		this.#templates.destroy()
		if (this.#ownsContext) this.#context.destroy()
		this.#destroyed = true
		this.#emitter.emit('destroy')
		this.#emitter.destroy()
	}

	// A NO_TEMPLATE / LOW_CONFIDENCE match gate — an explicit incomplete result
	// carrying a `field: 'intent'` ambiguity whose candidates are the registered
	// domain names, plus the matching StageFailure. The question renders through
	// the narrator's `ambiguity.*` line, so gate wording stays caller data. No
	// `error` emit — a gate is a deliberate incomplete outcome, not a stage
	// throw.
	#gate(
		text: string,
		normalized: string,
		intent: Intent,
		entities: readonly Entity[],
		stages: StageRecord[],
		code: 'NO_TEMPLATE' | 'LOW_CONFIDENCE',
		templateId: string | undefined,
		templateVersion: number | undefined,
	): Interpretation {
		const domains = [
			...new Set(this.#templates.templates().map((record) => record.template.domain)),
		]
		const ambiguity: Ambiguity = {
			field: 'intent',
			question: this.#narrator.line(
				code === 'NO_TEMPLATE' ? 'ambiguity.intent' : 'ambiguity.confidence',
				{},
			),
			candidates: domains,
			required: true,
		}
		const failure: StageFailure = {
			stage: 'clarify',
			code,
			message:
				code === 'NO_TEMPLATE'
					? 'No registered template matched the classified intent'
					: 'Classified intent confidence fell below the configured floor',
		}
		return this.#assemble(
			text,
			normalized,
			intent,
			entities,
			[ambiguity],
			stages,
			[failure],
			['clarify', 'format', 'generate'],
			templateId,
			templateVersion,
		)
	}

	// A stage THROW — mark the failed stage's record, emit `error` with the raw
	// thrown value, and assemble a visible incomplete result. The one site the
	// thrown value is rendered to a message (folded here, its sole use).
	#fail(
		text: string,
		normalized: string,
		intent: Intent,
		entities: readonly Entity[],
		ambiguities: readonly Ambiguity[],
		stages: StageRecord[],
		stage: InterpretStage,
		code: InterpretErrorCode,
		input: unknown,
		error: unknown,
		remaining: readonly InterpretStage[],
		templateId: string | undefined,
		templateVersion: number | undefined,
	): Interpretation {
		const message = error instanceof Error ? error.message : String(error)
		stages.push({ stage, input, output: undefined, failed: true, error: message })
		this.#emitter.emit('error', error)
		return this.#assemble(
			text,
			normalized,
			intent,
			entities,
			ambiguities,
			stages,
			[{ stage, code, message }],
			remaining,
			templateId,
			templateVersion,
		)
	}

	// Assemble a visible incomplete result: pad the un-run stages with skipped
	// records so `stages` always holds exactly five, digest over the known
	// pre-image, record the result in context, and emit `interpret` (an
	// incomplete run is still a completed CALL — visibility is the point).
	#assemble(
		text: string,
		normalized: string,
		intent: Intent,
		entities: readonly Entity[],
		ambiguities: readonly Ambiguity[],
		stages: StageRecord[],
		failures: readonly StageFailure[],
		remaining: readonly InterpretStage[],
		templateId: string | undefined,
		templateVersion: number | undefined,
	): Interpretation {
		for (const stage of remaining) {
			stages.push({ stage, input: undefined, output: undefined, failed: false })
		}
		const digest = digestValue({
			text,
			templateId,
			templateVersion,
			subject: undefined,
			definition: undefined,
		})
		const result: Interpretation = {
			text,
			normalized,
			intent,
			entities,
			mappings: [],
			ambiguities,
			prompt: '',
			stages,
			failures: [...failures],
			complete: false,
			confidence: 0,
			digest,
		}
		this.#context.add(result)
		this.#emitter.emit('interpret', result)
		return result
	}

	#ensureAlive(): void {
		if (this.#destroyed) throw new InterpretError('DESTROYED', 'Interpret has been destroyed')
	}
}
