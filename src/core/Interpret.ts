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
	NumberRefusals,
	NormalizerInterface,
	StageFailure,
	StageRecord,
	Recipe,
} from './types.js'
import { attempt, isError, isString } from '@orkestrel/contract'
import { Emitter } from '@orkestrel/emitter'
import { compileEntities, scanNumbers } from './compilers.js'
import { DEFAULT_INTERPRET_FLOOR } from './constants.js'
import { InterpretError, isInterpretError } from './errors.js'
import { assertRecipe, digestValue, findUnclaimedNumbers, matchRecipe } from './helpers.js'
import { InterpretContext } from './InterpretContext.js'
import { RecipeManager } from './managers/RecipeManager.js'
import { Narrator } from './Narrator.js'
import { Clarifier } from './stages/Clarifier.js'
import { Extractor } from './stages/Extractor.js'
import { Formatter } from './stages/Formatter.js'
import { Generator } from './stages/Generator.js'
import { Normalizer } from './stages/Normalizer.js'

/**
 * Implements the interpretation orchestrator — the sole public entry point of the
 * `interprets` module, mirroring the reasons `Reason` orchestrator shape: it runs the
 * `[normalize, extract, clarify, format, generate]` pipeline, owns the recipe
 * registry and the context, and exposes the reverse direction.
 *
 * @remarks
 * `interpret()` is genuinely synchronous — it returns its
 * {@link Interpretation} directly, never a `Promise` — each phase producing
 * one {@link StageRecord}. Between `extract` and `clarify` the orchestrator matches
 * the classified {@link Intent} against its added {@link Recipe}s and,
 * on a match, assigns the extracted numbers to that recipe's mappings
 * (`assignEntities`) — a recipe-owned step, not a sixth stage. No match, or a
 * matched recipe whose intent confidence falls below the configured `floor`,
 * yields an explicit, auditable incomplete result (a `field: 'intent'`
 * ambiguity, absent subject/definition) rather than an arbitrary fallback
 * recipe. `subject` stays absent while a required ambiguity is open, and
 * `add` refuses a recipe that does not stand with `InterpretError('DEFINITION')`. A stage throw is caught, marked on its record and on
 * `failures`, emitted as `error`, and still yields a visible incomplete result
 * — never a silent fallback. Every result carries a `digest` over its original
 * text plus the matched recipe id/version and the built subject/definition,
 * so re-running the same text against the same recipe version reproduces the
 * same digest (the replay contract). `describe` / `narrate` are the reverse
 * direction (structure → prose). `destroy()` is idempotent, tears down the
 * registry and the context it constructed itself — a context supplied through
 * `options.context` is shared, so it stays alive for whoever else holds it —
 * then destroys the emitter last; every method afterwards except the
 * {@link emitter} getter throws `InterpretError('DESTROYED', …)`.
 *
 * @example
 * ```ts
 * import { numberShape, objectShape } from '@orkestrel/contract'
 * import { createFactorGroup, createFieldFactor, createQuantitativeDefinition } from '@orkestrel/reason'
 * import { Interpret, Extractor } from '@orkestrel/interpret'
 *
 * const interpret = new Interpret({
 * 	extractor: new Extractor({ actions: { calculate: 'calculate' }, domains: { arithmetic: ['arithmetic'] } }),
 * 	recipes: [
 * 		{
 * 			id: 't1',
 * 			name: 'Arithmetic',
 * 			domain: 'arithmetic',
 * 			intents: ['calculate'],
 * 			mappings: [{ entity: 'value', aliases: [], field: 'value' }],
 * 			shape: objectShape({ value: numberShape() }),
 * 			computations: [],
 * 			definition: createQuantitativeDefinition('t1', 'Arithmetic', [
 * 				createFactorGroup('total', 'sum', [createFieldFactor('value', 'value')]),
 * 			]),
 * 		},
 * 	],
 * })
 * interpret.interpret('calculate arithmetic value 42').subject // { value: 42 }
 * ```
 */
export class Interpret implements InterpretInterface {
	readonly #recipes: RecipeManager
	readonly #context: InterpretContextInterface
	readonly #ownsContext: boolean
	readonly #normalizer: NormalizerInterface
	readonly #extractor: ExtractorInterface
	readonly #clarifier: ClarifierInterface
	readonly #formatter: FormatterInterface
	readonly #generator: GeneratorInterface
	readonly #floor: number
	readonly #narrator: NarratorInterface
	readonly #emitter: Emitter<InterpretEventMap>
	#destroyed = false

	constructor(options?: InterpretOptions) {
		for (const recipe of options?.recipes ?? []) assertRecipe(recipe)
		this.#floor = options?.floor ?? DEFAULT_INTERPRET_FLOOR
		this.#recipes = new RecipeManager({
			...(options?.recipes === undefined ? {} : { recipes: options.recipes }),
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

		const normalizedResult = attempt(() => this.#normalizer.normalize(text))
		if (!normalizedResult.success) {
			const error = normalizedResult.error
			return this.#fail(
				text,
				text,
				{ confidence: 0 },
				[],
				[],
				stages,
				'normalize',
				isInterpretError(error) && error.code === 'TEXT_LIMIT' ? 'TEXT_LIMIT' : 'NORMALIZE_FAILED',
				text,
				error,
				['extract', 'clarify', 'format', 'generate'],
				undefined,
				undefined,
			)
		}
		const normalized: NormalizeResult = normalizedResult.value
		stages.push({ stage: 'normalize', input: text, output: normalized, failed: false })

		const extractResult = attempt(() => this.#extractor.extract(normalized.text))
		if (!extractResult.success) {
			const error = extractResult.error
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
		const extract: ExtractResult = extractResult.value
		stages.push({ stage: 'extract', input: normalized.text, output: extract, failed: false })

		const intent = extract.intent
		const recipes = this.#recipes.recipes().map((record) => record.recipe)
		const matched = matchRecipe(intent, recipes, this.#floor)

		if (matched === undefined) {
			return this.#gate(
				text,
				normalized.text,
				intent,
				[],
				stages,
				'NO_RECIPE',
				undefined,
				undefined,
			)
		}

		const numbers = scanNumbers(normalized.text)
		const compiled = compileEntities(numbers, matched.mappings, normalized.text, matched.shape)
		const assigned = compiled.entities
		const record = this.#recipes.recipe(matched.id)
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
				compiled.refusals,
			)
		}

		const clarifiedResult = attempt(() =>
			this.#clarifier.clarify(
				assigned,
				matched,
				this.#context,
				intent,
				findUnclaimedNumbers(numbers, assigned),
			),
		)
		if (!clarifiedResult.success) {
			const error = clarifiedResult.error
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
				compiled.refusals,
			)
		}
		const clarified: ClarifyResult = clarifiedResult.value
		stages.push({ stage: 'clarify', input: assigned, output: clarified, failed: false })

		const formatInput = { intent, entities: clarified.entities, ambiguities: clarified.ambiguities }
		const formattedResult = attempt(() =>
			this.#formatter.format(intent, matched, clarified.entities, clarified.ambiguities),
		)
		if (!formattedResult.success) {
			const error = formattedResult.error
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
				compiled.refusals,
			)
		}
		const formatted: FormatResult = formattedResult.value
		stages.push({ stage: 'format', input: formatInput, output: formatted, failed: false })

		// A subject the door refused, or one a required question stands over, is no subject, so it
		// is not built: no stage record or mapping holds what the door refused.
		if (clarified.ambiguities.some((ambiguity) => ambiguity.required)) {
			stages.push({ stage: 'generate', input: undefined, output: undefined, failed: false })
			const digest = digestValue({
				text,
				recipeId: matched.id,
				version: version,
				subject: undefined,
				definition: matched.definition,
			})
			const asked: Interpretation = {
				...(compiled.refusals === undefined ? {} : { refusals: compiled.refusals }),
				text,
				normalized: normalized.text,
				intent,
				recipe: matched.id,
				...(version === undefined ? {} : { version: version }),
				entities: clarified.entities,
				definition: matched.definition,
				mappings: [],
				ambiguities: clarified.ambiguities,
				repairs: clarified.repairs,
				defaulted: clarified.defaulted,
				prompt: formatted.prompt,
				stages,
				failures: [],
				confidence: 0,
				digest,
			}
			this.#context.definitions.add(matched.definition, { id: matched.definition.id })
			this.#context.add(asked)
			this.#emitter.emit('interpret', asked)
			return asked
		}

		const generatedResult = attempt(() => this.#generator.generate(clarified.entities, matched))
		if (!generatedResult.success) {
			const error = generatedResult.error
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
				compiled.refusals,
			)
		}
		const generated: GenerateResult = generatedResult.value
		stages.push({ stage: 'generate', input: clarified.entities, output: generated, failed: false })

		const digest = digestValue({
			text,
			recipeId: matched.id,
			version: version,
			subject: generated.subject,
			definition: generated.definition,
		})
		const result: Interpretation = {
			...(compiled.refusals === undefined ? {} : { refusals: compiled.refusals }),
			text,
			normalized: normalized.text,
			intent,
			recipe: matched.id,
			...(version === undefined ? {} : { version: version }),
			entities: clarified.entities,
			subject: generated.subject,
			definition: generated.definition,
			mappings: generated.mappings,
			ambiguities: clarified.ambiguities,
			repairs: clarified.repairs,
			defaulted: clarified.defaulted,
			prompt: formatted.prompt,
			stages,
			failures: [],
			confidence: generated.confidence,
			digest,
		}

		this.#context.subjects.add(generated.subject)
		this.#context.definitions.add(generated.definition, { id: generated.definition.id })
		this.#context.add(result)
		this.#emitter.emit('interpret', result)
		return result
	}

	add(recipe: Recipe): void {
		this.#ensureAlive()
		assertRecipe(recipe)
		this.#recipes.add(recipe, { id: recipe.id })
		this.#emitter.emit('add', recipe.id)
	}

	remove(ids: readonly string[]): boolean
	remove(id: string): boolean
	remove(): void
	remove(target?: string | readonly string[]): boolean | void {
		this.#ensureAlive()
		if (target === undefined) return this.#recipes.remove()
		if (isString(target)) return this.#recipes.remove(target)
		return this.#recipes.remove(target)
	}

	recipe(id: string): Recipe | undefined {
		this.#ensureAlive()
		return this.#recipes.recipe(id)?.recipe
	}

	recipes(): readonly Recipe[] {
		this.#ensureAlive()
		return this.#recipes.recipes().map((record) => record.recipe)
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
		this.#recipes.destroy()
		if (this.#ownsContext) this.#context.destroy()
		this.#destroyed = true
		this.#emitter.emit('destroy')
		this.#emitter.destroy()
	}

	// A NO_RECIPE / LOW_CONFIDENCE match gate — an explicit incomplete result
	// carrying a `field: 'intent'` ambiguity whose candidates are the added
	// recipes' domain names, plus the matching StageFailure. The question
	// renders through the narrator's `ambiguity.*` line, so gate wording stays
	// caller data. No `error` emit — a gate is a deliberate incomplete outcome,
	// not a stage throw.
	#gate(
		text: string,
		normalized: string,
		intent: Intent,
		entities: readonly Entity[],
		stages: StageRecord[],
		code: 'NO_RECIPE' | 'LOW_CONFIDENCE',
		recipeId: string | undefined,
		version: number | undefined,
		refusals?: NumberRefusals,
	): Interpretation {
		const domains = [...new Set(this.#recipes.recipes().map((record) => record.recipe.domain))]
		const ambiguity: Ambiguity = {
			field: 'intent',
			question: this.#narrator.line(
				code === 'NO_RECIPE' ? 'ambiguity.intent' : 'ambiguity.confidence',
				{},
			),
			candidates: domains,
			required: true,
		}
		const failure: StageFailure = {
			stage: 'clarify',
			code,
			message:
				code === 'NO_RECIPE'
					? 'No added recipe matched the classified intent'
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
			recipeId,
			version,
			refusals,
		)
	}

	// A stage throw — mark the failed stage's record, emit `error` with the raw
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
		recipeId: string | undefined,
		version: number | undefined,
		refusals?: NumberRefusals,
	): Interpretation {
		const message = isError(error) ? error.message : String(error)
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
			recipeId,
			version,
			refusals,
		)
	}

	// Assemble a visible incomplete result: pad the un-run stages with skipped
	// records so `stages` always holds one record per phase, digest over the known
	// pre-image, record the result in context, and emit `interpret` (an
	// incomplete run is still a completed call — visibility is the point).
	#assemble(
		text: string,
		normalized: string,
		intent: Intent,
		entities: readonly Entity[],
		ambiguities: readonly Ambiguity[],
		stages: StageRecord[],
		failures: readonly StageFailure[],
		remaining: readonly InterpretStage[],
		recipeId: string | undefined,
		version: number | undefined,
		refusals?: NumberRefusals,
	): Interpretation {
		for (const stage of remaining) {
			stages.push({ stage, input: undefined, output: undefined, failed: false })
		}
		const digest = digestValue({
			text,
			recipeId,
			version,
			subject: undefined,
			definition: undefined,
		})
		const result: Interpretation = {
			text,
			normalized,
			...(refusals === undefined ? {} : { refusals }),
			intent,
			...(recipeId === undefined ? {} : { recipe: recipeId }),
			...(version === undefined ? {} : { version }),
			entities,
			mappings: [],
			ambiguities,
			repairs: [],
			defaulted: [],
			prompt: '',
			stages,
			failures: [...failures],
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
