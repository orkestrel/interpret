import type { EmitterInterface } from '@orkestrel/emitter'
import type { Definition, ReasonResult } from '@orkestrel/reason'
import type {
	Account,
	AccountDefinition,
	Ambiguity,
	Amendment,
	ClarifierInterface,
	ClarifyResult,
	Entity,
	ExtractorInterface,
	ExtractResult,
	FamilyProgram,
	FamilyProgramResult,
	FamilyQualification,
	FamilyQualificationResult,
	FamilyRating,
	FamilyRatingResult,
	FamilyResult,
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
	InterpretTurnOptions,
	Interpretation,
	NarratorInterface,
	NormalizeResult,
	NumberRefusals,
	NormalizerInterface,
	StageFailure,
	StageRecord,
	Recipe,
	RecipeRecord,
} from './types.js'
import {
	attempt,
	describeFaults,
	errorToMessage,
	isError,
	isString,
	preview,
} from '@orkestrel/contract'
import { Emitter } from '@orkestrel/emitter'
import { compileEntities, scanNumbers } from './compilers.js'
import { DEFAULT_INTERPRET_FLOOR, INTERPRET_STAGES } from './constants.js'
import { amendmentContract } from './contracts.js'
import { InterpretError, isInterpretError } from './errors.js'
import {
	amendEntities,
	assertInterpretation,
	assertRecipe,
	collectClaims,
	digestValue,
	findUnclaimedNumbers,
	matchRecipe,
} from './helpers.js'
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
 * same digest (the replay contract). `interpret(text, { previous })` carries from that one turn in
 * place of the history, and `amend` reruns the pipeline from clarify over an interpretation with
 * entities supplied or withdrawn. `describe` / `narrate` are the reverse
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

	interpret(text: string, options?: InterpretTurnOptions): Interpretation {
		this.#ensureAlive()
		const previous = options?.previous
		if (previous !== undefined) assertInterpretation(previous)
		const result = this.#read(text, previous === undefined ? this.#context : this.#seed(previous))
		if (result.subject !== undefined) this.#context.subjects.add(result.subject)
		if (result.definition !== undefined) {
			this.#context.definitions.add(result.definition, { id: result.definition.id })
		}
		this.#context.add(result)
		this.#emitter.emit('interpret', result)
		return result
	}

	amend(interpretation: Interpretation, amendment: Amendment): Interpretation {
		this.#ensureAlive()
		assertInterpretation(interpretation)
		const record = this.#findRecord(interpretation)
		const changes = this.#admit(amendment)
		const { normalized, entities } = interpretation
		const numbers = scanNumbers(normalized)
		const { mappings, shape } = record.recipe
		const compiled = compileEntities(numbers, mappings, normalized, shape)
		const stated = amendEntities(entities, compiled.entities, changes, record.recipe)
		const removed = new Set(changes.removed)
		// What was stated is settled, so only what the turn itself carried is left to carry.
		const carried = entities.filter(
			(entity) => entity.provenance.category === 'carried' && !removed.has(entity.name),
		)
		const result = this.#settle(
			interpretation.text,
			normalized,
			interpretation.intent,
			record,
			stated,
			findUnclaimedNumbers(numbers, collectClaims(compiled.entities, stated)),
			this.#seed({ ...interpretation, entities: carried }),
			// A phase before clarify keeps its record, and one the interpretation holds none of did not run.
			INTERPRET_STAGES.slice(0, INTERPRET_STAGES.indexOf('clarify')).map(
				(stage) =>
					interpretation.stages.find((held) => held.stage === stage) ?? {
						stage,
						input: undefined,
						output: undefined,
						failed: false,
					},
			),
			compiled.refusals,
		)
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

	describe(definition: AccountDefinition): Account {
		this.#ensureAlive()
		return this.#narrator.describe(definition)
	}

	narrate(definition: Definition, result: ReasonResult): Account
	narrate(definition: FamilyQualification, result: FamilyQualificationResult): Account
	narrate(definition: FamilyRating, result: FamilyRatingResult): Account
	narrate(definition: FamilyProgram, result: FamilyProgramResult): Account
	narrate(definition: AccountDefinition, result: ReasonResult | FamilyResult): Account
	narrate(definition: AccountDefinition, result: ReasonResult | FamilyResult): Account {
		this.#ensureAlive()
		return this.#narrator.narrate(definition, result)
	}

	destroy(): void {
		if (this.#destroyed) return
		this.#recipes.destroy()
		if (this.#ownsContext) this.#context.destroy()
		this.#destroyed = true
		this.#emitter.emit('destroy')
		this.#emitter.destroy()
	}

	// A context holding one interpretation, so carry-over reads that one and no history.
	#seed(previous: Interpretation): InterpretContextInterface {
		const { session } = this.#context
		const context = new InterpretContext({
			history: 1,
			...(session === undefined ? {} : { session }),
		})
		context.add(previous)
		return context
	}

	// The record an interpretation was read against, or a refusal naming what the registry holds.
	#findRecord(interpretation: Interpretation): RecipeRecord {
		const { recipe, version } = interpretation
		const record = recipe === undefined ? undefined : this.#recipes.recipe(recipe)
		if (record !== undefined && record.version === version) return record
		throw new InterpretError(
			'VERSION',
			recipe === undefined
				? 'The interpretation matched no recipe, so there is none to amend it under'
				: `Recipe ${preview(recipe)} version ${String(version)} is not held; ${
						record === undefined
							? 'the registry holds no recipe of that id'
							: `the registry holds version ${String(record.version)}`
					}`,
		)
	}

	// An amendment owned and admitted whole, with each entity named once.
	#admit(amendment: Amendment): Amendment {
		const owned = amendmentContract.own(amendment)
		if (!owned.success) {
			const { faults, cause } = owned.error
			throw new InterpretError(
				'AMENDMENT',
				`Amendment is malformed: ${
					faults.length > 0
						? describeFaults(faults, amendmentContract.schema)
						: errorToMessage(cause)
				}`,
				{ faults },
			)
		}
		const names = [
			...(owned.value.entities ?? []).map((entity) => entity.name),
			...(owned.value.removed ?? []),
		]
		const repeated = [...new Set(names.filter((name, index) => names.indexOf(name) !== index))]
		if (repeated.length > 0) {
			throw new InterpretError(
				'AMENDMENT',
				`Amendment names ${repeated.map((name) => preview(name)).join(', ')} more than once; supply or withdraw each entity once`,
				{ faults: [] },
			)
		}
		return owned.value
	}

	// Reads a text to a result that is not recorded yet.
	#read(text: string, context: InterpretContextInterface): Interpretation {
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
		const record = matched === undefined ? undefined : this.#recipes.recipe(matched.id)

		if (record === undefined) {
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
		const { mappings, shape } = record.recipe
		const compiled = compileEntities(numbers, mappings, normalized.text, shape)
		return this.#settle(
			text,
			normalized.text,
			intent,
			record,
			compiled.entities,
			findUnclaimedNumbers(numbers, compiled.entities),
			context,
			stages,
			compiled.refusals,
		)
	}

	// The pipeline from the confidence gate on, over what a text or an amendment states. The one
	// path to a result, so an amended interpretation is settled as a read one is.
	#settle(
		text: string,
		normalized: string,
		intent: Intent,
		record: RecipeRecord,
		stated: readonly Entity[],
		unclaimed: ReadonlyArray<number | string>,
		context: InterpretContextInterface,
		stages: StageRecord[],
		refusals?: NumberRefusals,
	): Interpretation {
		const { recipe, version } = record
		if (intent.confidence < this.#floor) {
			return this.#gate(
				text,
				normalized,
				intent,
				stated,
				stages,
				'LOW_CONFIDENCE',
				recipe.id,
				version,
				refusals,
			)
		}

		const clarifiedResult = attempt(() =>
			this.#clarifier.clarify(stated, recipe, context, intent, unclaimed),
		)
		if (!clarifiedResult.success) {
			const error = clarifiedResult.error
			return this.#fail(
				text,
				normalized,
				intent,
				stated,
				[],
				stages,
				'clarify',
				'CLARIFY_FAILED',
				stated,
				error,
				['format', 'generate'],
				recipe.id,
				version,
				refusals,
			)
		}
		const clarified: ClarifyResult = clarifiedResult.value
		stages.push({ stage: 'clarify', input: stated, output: clarified, failed: false })

		const formatInput = { intent, entities: clarified.entities, ambiguities: clarified.ambiguities }
		const formattedResult = attempt(() =>
			this.#formatter.format(intent, recipe, clarified.entities, clarified.ambiguities),
		)
		if (!formattedResult.success) {
			const error = formattedResult.error
			return this.#fail(
				text,
				normalized,
				intent,
				clarified.entities,
				clarified.ambiguities,
				stages,
				'format',
				'FORMAT_FAILED',
				formatInput,
				error,
				['generate'],
				recipe.id,
				version,
				refusals,
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
				recipeId: recipe.id,
				version,
				subject: undefined,
				definition: recipe.definition,
			})
			return {
				...(refusals === undefined ? {} : { refusals }),
				text,
				normalized,
				intent,
				recipe: recipe.id,
				version,
				entities: clarified.entities,
				definition: recipe.definition,
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
		}

		const generatedResult = attempt(() => this.#generator.generate(clarified.entities, recipe))
		if (!generatedResult.success) {
			const error = generatedResult.error
			return this.#fail(
				text,
				normalized,
				intent,
				clarified.entities,
				clarified.ambiguities,
				stages,
				'generate',
				'GENERATE_FAILED',
				clarified.entities,
				error,
				[],
				recipe.id,
				version,
				refusals,
			)
		}
		const generated: GenerateResult = generatedResult.value
		stages.push({ stage: 'generate', input: clarified.entities, output: generated, failed: false })

		const digest = digestValue({
			text,
			recipeId: recipe.id,
			version,
			subject: generated.subject,
			definition: generated.definition,
		})
		return {
			...(refusals === undefined ? {} : { refusals }),
			text,
			normalized,
			intent,
			recipe: recipe.id,
			version,
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
	// records so `stages` always holds one record per phase, and digest over the known
	// pre-image.
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
		return {
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
	}

	#ensureAlive(): void {
		if (this.#destroyed) throw new InterpretError('DESTROYED', 'Interpret has been destroyed')
	}
}
