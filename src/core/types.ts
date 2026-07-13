import type { FieldPath } from '../types.js'
import type { EmitterErrorHandler, EmitterHooks, EmitterInterface } from '../emitters/index.js'
import type { Definition, ReasonResult, Subject, SymbolicExpression } from '../reasons/index.js'

// Interprets — a zero-dependency, synchronous, deterministic bidirectional
// bridge between natural language and the reasons engine, plus the manager
// that owns the interpretation lifecycle. FORWARD: raw text is normalized,
// classified into an intent, matched against a registered `Template`, mined
// for numeric entities, clarified (carry-over / defaults / computed fields),
// formatted into a refined prompt, then generated into a `Subject` +
// `Definition` pair ready for `Reason.reason`. REVERSE: `Definition` /
// `Subject` / `ReasonResult` render to display-neutral prose, complementing
// (never duplicating) raters' `describe*` family. Nothing here is an LLM,
// provider, or agent — the `prompt` a result carries is FOR an external
// model, never consumed internally. Types are the source of truth (AGENTS
// §2); every discriminant names its axis, never `kind` / `type` (AGENTS
// §4.4): `stage` splits pipeline phases, `category` splits provenance,
// `code` splits coded errors.

// === Vocabulary

/**
 * How one {@link FieldMapping} / {@link Entity} value was obtained.
 *
 * @remarks
 * `extracted` — mined from the raw text via keyword / alias / positional
 * matching. `carried` — reused from a same-domain prior turn in an
 * {@link InterpretContextInterface}. `default` — filled from a
 * {@link Template}'s {@link FieldDefault}. `computed` — derived by evaluating
 * a {@link ComputedField}'s expression. `subject` — already present on an
 * injected base subject, untouched by this interpretation.
 */
export type ProvenanceCategory = 'extracted' | 'carried' | 'default' | 'computed' | 'subject'

/**
 * The five fixed pipeline phases an {@link InterpretInterface#interpret} run
 * produces one {@link StageRecord} for, in order.
 *
 * @remarks
 * Deliberately NOT named `Stage` — raters already owns that identifier for
 * its worksheet derivation axis (`'factor' | 'group' | 'total'`); the two are
 * unrelated concepts on the shared `@src/core` barrel.
 */
export type InterpretStage = 'normalize' | 'extract' | 'clarify' | 'format' | 'generate'

/**
 * Coded misuse / failure conditions thrown as an {@link InterpretError} or
 * carried on a {@link StageFailure}.
 *
 * @remarks
 * `NORMALIZE_FAILED` / `EXTRACT_FAILED` / `CLARIFY_FAILED` / `FORMAT_FAILED`
 * / `GENERATE_FAILED` — an injected stage implementation threw during that
 * phase. `NO_TEMPLATE` — no registered {@link Template} scored at or above
 * the confidence floor (or the registry is empty). `LOW_CONFIDENCE` — a
 * template matched but the classified {@link Intent}'s confidence fell below
 * the floor. `INVALID_TEMPLATE` — `createTemplate` was handed data that
 * fails `isTemplate`. `DESTROYED` — any use of a destroyed entity.
 */
export type InterpretErrorCode =
	| 'NORMALIZE_FAILED'
	| 'EXTRACT_FAILED'
	| 'CLARIFY_FAILED'
	| 'FORMAT_FAILED'
	| 'GENERATE_FAILED'
	| 'NO_TEMPLATE'
	| 'LOW_CONFIDENCE'
	| 'INVALID_TEMPLATE'
	| 'DESTROYED'

// === Template data model — pure JSON-serializable, versionable, diffable, hashable

/**
 * One entity-extraction rule inside a {@link Template}: which literal alias
 * phrases identify a value, and which subject field it lands on.
 *
 * @remarks
 * `aliases` are literal phrases (no `RegExp` — templates stay JSON), matched
 * exact-then-fuzzy against tokens surrounding an extracted number. `required`
 * marks the field as needing an {@link Ambiguity} when it stays unresolved.
 */
export interface EntityMapping {
	readonly entity: string
	readonly aliases: readonly string[]
	readonly field: FieldPath
	readonly required?: boolean
}

/** A fallback value a {@link Template} fills onto a field left unresolved by extraction. */
export interface FieldDefault {
	readonly field: FieldPath
	readonly value: unknown
}

/**
 * A declaratively computed field: evaluate `expression` against the entities
 * already resolved for this interpretation, and land the result on `field`.
 *
 * @remarks
 * Renamed from scsr's `InferenceRule` — the reasons engine already owns
 * `Inference` for fact derivation, a different concept. `expression` is a
 * reasons {@link SymbolicExpression} tree (pure JSON `Variable` / `Constant`
 * / `Operation`), evaluated by the pure `resolveExpression` helper rather
 * than a closure, so a `Template` stays JSON-serializable end to end.
 * Dependencies are derived from the tree (`variablesOf`) — scsr's explicit
 * `from: string[]` list is gone.
 */
export interface ComputedField {
	readonly field: FieldPath
	readonly expression: SymbolicExpression
}

/**
 * A named, versionable interpretation template: which intents it answers,
 * how to mine entities for it, its fallback data, its computed fields, and
 * the reasons `Definition` it ultimately produces a `Subject` for.
 *
 * @remarks
 * `definition` is inline and already expressed in terrain reasons vocabulary
 * (`reasoning` / `Check` / `terms` / `form` / `origin`) — there is no
 * scsr-era `template.id === definition.id` invariant; a `Template` and its
 * `Definition` are simply the same authored record. `intents` lists the
 * `Intent.action` values this template answers.
 */
export interface Template {
	readonly id: string
	readonly name: string
	readonly domain: string
	readonly intents: readonly string[]
	readonly mappings: readonly EntityMapping[]
	readonly defaults: readonly FieldDefault[]
	readonly computations: readonly ComputedField[]
	readonly definition: Definition
}

// === Intent, entity, ambiguity, provenance

/** How one value landed — its origin category plus an optional strategy detail. */
export interface Provenance {
	readonly category: ProvenanceCategory
	readonly detail?: string
}

/**
 * The classified action + domain for one interpretation, with a combined
 * confidence.
 *
 * @remarks
 * Produced by `classifyIntent` against caller-supplied `actions` / `domains`
 * vocabularies only — there is no built-in en-US worldview and no
 * auto-classification from a registered template's own `domain` name.
 */
export interface Intent {
	readonly action: string
	readonly domain: string
	readonly confidence: number
}

/** One value assigned to a template's entity mapping, with its provenance and confidence. */
export interface Entity {
	readonly name: string
	readonly value: unknown
	readonly provenance: Provenance
	readonly confidence: number
}

/** An unresolved field surfaced as a human-readable question, never bare prose. */
export interface Ambiguity {
	readonly field: FieldPath
	readonly question: string
	readonly candidates: readonly string[]
	readonly required: boolean
}

/**
 * One audited field of the built subject — its resolved value, provenance,
 * and confidence.
 *
 * @remarks
 * Emitted for EVERY field that lands in the generated subject, including
 * defaults and computed fields (scsr silently omitted those from its audit
 * trail; this closes that gap).
 */
export interface FieldMapping {
	readonly field: FieldPath
	readonly entity?: string
	readonly value: unknown
	readonly provenance: Provenance
	readonly confidence: number
}

/** One normalization substitution applied to the raw text. */
export interface TextChange {
	readonly from: string
	readonly to: string
}

// === Per-stage record + failure marker

/**
 * A structured input/output snapshot of one pipeline phase.
 *
 * @remarks
 * `input` / `output` are live structured values, never a stringified JSON
 * blob. No `duration` field — strict core forbids wall-clock timing
 * (AGENTS §17.7); the audit story here is structural, not temporal.
 */
export interface StageRecord {
	readonly stage: InterpretStage
	readonly input: unknown
	readonly output: unknown
	readonly failed: boolean
	readonly error?: string
}

/** A visible marker for a stage that threw, carrying its coded reason. */
export interface StageFailure {
	readonly stage: InterpretStage
	readonly code: InterpretErrorCode
	readonly message: string
}

// === Stage result shapes

/** The `Normalizer` stage's output: the cleaned text plus every substitution applied. */
export interface NormalizeResult {
	readonly text: string
	readonly changes: readonly TextChange[]
}

/**
 * The `Extractor` stage's output: intent classification plus raw numbers.
 *
 * @remarks
 * Template-agnostic by design — extraction never sees a `Template`, only the
 * text. `numbers`, not template-named entities; entity ASSIGNMENT is a
 * separate orchestrator step run only after a template has matched (see
 * `assignEntities` in `helpers.ts`).
 */
export interface ExtractResult {
	readonly intent: Intent
	readonly numbers: readonly number[]
	readonly complete: boolean
}

/** The `Clarifier` stage's output: resolved entities plus any remaining ambiguities. */
export interface ClarifyResult {
	readonly entities: readonly Entity[]
	readonly ambiguities: readonly Ambiguity[]
	readonly complete: boolean
}

/** The `Formatter` stage's output: the refined natural-language prompt. */
export interface FormatResult {
	readonly prompt: string
}

/** The `Generator` stage's output: the built subject/definition pair plus its full field audit. */
export interface GenerateResult {
	readonly subject: Subject
	readonly definition: Definition
	readonly mappings: readonly FieldMapping[]
	readonly confidence: number
}

// === The result

/**
 * The full, replayable outcome of one `interpret()` call.
 *
 * @remarks
 * `subject` / `definition` are absent on an incomplete `NO_TEMPLATE` /
 * `LOW_CONFIDENCE` result — there is never a fabricated fallback template
 * (scsr's `templates[0]` double-fallback defect). `stages` always holds
 * exactly five records, `[normalize, extract, clarify, format, generate]`,
 * in order. `digest` is `digestValue` over `{text, templateId,
 * templateVersion, subject, definition}` — re-running the same original text
 * against the same template version reproduces the same digest (the replay
 * contract).
 */
export interface Interpretation {
	readonly text: string
	readonly normalized: string
	readonly intent: Intent
	readonly entities: readonly Entity[]
	readonly subject?: Subject
	readonly definition?: Definition
	readonly mappings: readonly FieldMapping[]
	readonly ambiguities: readonly Ambiguity[]
	readonly prompt: string
	readonly stages: readonly StageRecord[]
	readonly failures: readonly StageFailure[]
	readonly complete: boolean
	readonly confidence: number
	readonly digest: string
}

// === Versioned, content-hashed records

/**
 * A versioned, content-hashed {@link Template} as held by a
 * {@link TemplateManagerInterface}.
 *
 * @remarks
 * `version` bumps only when `hash` (derived from `template`'s content, not
 * `id`) actually changes — an identical re-add keeps the same version,
 * unlike scsr's version-bumps-on-every-add defect.
 */
export interface TemplateRecord {
	readonly id: string
	readonly template: Template
	readonly version: number
	readonly hash: string
}

/**
 * A versioned, content-hashed {@link Subject} as held by a
 * {@link SubjectManagerInterface}.
 *
 * @remarks
 * `id` is the manager's OWN minted identity — never `definition.id` — so
 * successive turns never silently overwrite one shared subject (scsr's
 * defect).
 */
export interface SubjectRecord {
	readonly id: string
	readonly subject: Subject
	readonly version: number
	readonly hash: string
}

/** A versioned, content-hashed {@link Definition} as held by a {@link DefinitionManagerInterface}. */
export interface DefinitionRecord {
	readonly id: string
	readonly definition: Definition
	readonly version: number
	readonly hash: string
}

// === Event map (AGENTS §13)

/**
 * The push observation surface of an {@link InterpretInterface} (AGENTS §13).
 *
 * @remarks
 * `interpret` fires once per completed `interpret()` call (complete OR
 * incomplete — visibility is the point, unlike scsr's silent fallbacks).
 * `register` fires when a template is registered, carrying its id. `error`
 * fires with the raw thrown value when an injected stage implementation
 * throws. `destroy` fires once on teardown. Listener isolation is the
 * emitter's own (AGENTS §13) — never routed onto this map.
 */
export type InterpretEventMap = {
	/** An `interpret()` call completed — carries the full result. */
	readonly interpret: readonly [result: Interpretation]
	/** A template was registered — carries its id. */
	readonly register: readonly [templateId: string]
	/** An injected stage implementation threw — carries the raw thrown value. */
	readonly error: readonly [error: unknown]
	/** The orchestrator was destroyed. */
	readonly destroy: readonly []
}

// === Narrator — lexicon-driven reverse rendering (mechanism, never policy)

/**
 * A pure formatting function for one lexicon `value()` unit.
 *
 * @remarks
 * A `Narrator` calls this from `value()` inside a `try`/`catch` (AGENTS §21 —
 * a wording engine must never crash a render) — a throwing formatter is
 * caught and the raw value falls back to `String(raw)`.
 */
export type NarratorFormatter = (value: unknown) => string

/**
 * Caller-injected wording data for the reverse direction — mechanism, never
 * policy (AGENTS §21). Every phrase, label, and template string a `Narrator`
 * renders is DATA supplied here, never a core literal.
 *
 * @remarks
 * `phrases` is a two-level lookup (`table` → `key` → phrase) for domain
 * vocabulary swaps (e.g. `comparison.equals` → `'is'`). `labels` maps a
 * dotted `FieldPath` string to its display label, falling back to
 * `formatField` when absent. `templates` maps a template id (e.g.
 * `'definition.quantitative'`, `'result.symbolic'`, `'subject.fields'`) to an
 * `interpolateMessage` template string — see `DEFAULT_LEXICON` for the
 * pinned neutral key set.
 */
export interface Lexicon {
	readonly phrases?: Readonly<Record<string, Readonly<Record<string, string>>>>
	readonly labels?: Readonly<Record<string, string>>
	readonly templates?: Readonly<Record<string, string>>
}

/** Options for `createNarrator` / the `Narrator` constructor. */
export interface NarratorOptions {
	readonly lexicon?: Lexicon
	readonly formatters?: Readonly<Record<string, NarratorFormatter>>
}

// === Options records

/**
 * Options for `createNormalizer` / the `Normalizer` constructor.
 *
 * @remarks
 * Each map is merged OVER the neutral built-in defaults, applied in order
 * contractions → abbreviations → corrections, before whitespace collapse.
 */
export interface NormalizerOptions {
	readonly contractions?: Readonly<Record<string, string>>
	readonly abbreviations?: Readonly<Record<string, string>>
	readonly corrections?: Readonly<Record<string, string>>
}

/**
 * Options for `createExtractor` / the `Extractor` constructor.
 *
 * @remarks
 * `actions` / `domains` are the caller's intent vocabulary — there is no
 * built-in worldview (AGENTS-flagged scsr defect). Neither `floor` nor
 * `similarity` lives here: the confidence floor gate is the orchestrator's
 * `matchTemplate` step, never the classifier itself.
 */
export interface ExtractorOptions {
	readonly actions?: Readonly<Record<string, string>>
	readonly domains?: Readonly<Record<string, readonly string[]>>
}

/**
 * Options for `createClarifier` / the `Clarifier` constructor.
 *
 * @remarks
 * `floor` is the confidence axis honored when raising ambiguities — never
 * hardcoded (scsr hardcoded its confidence constant instead of honoring the
 * configured value).
 */
export interface ClarifierOptions {
	readonly floor?: number
}

/** Options for `createFormatter` / the `Formatter` constructor — caller-supplied intent-verb phrasing. */
export interface FormatterOptions {
	readonly verbs?: Readonly<Record<string, string>>
}

/**
 * Options for `createGenerator` / the `Generator` constructor.
 *
 * @remarks
 * Currently an empty extension seam — the `Generator` stage takes no
 * configuration today, but keeps its own options type so a future knob
 * never has to change the `GeneratorInterface#generate` call signature.
 */
export interface GeneratorOptions {}

/** Options for `createTemplateManager` / the `TemplateManager` constructor — the initial seed collection. */
export interface TemplateManagerOptions {
	readonly templates?: readonly Template[]
}

/** Options for `createSubjectManager` / the `SubjectManager` constructor — the initial seed collection. */
export interface SubjectManagerOptions {
	readonly subjects?: readonly Subject[]
}

/** Options for `createDefinitionManager` / the `DefinitionManager` constructor — the initial seed collection. */
export interface DefinitionManagerOptions {
	readonly definitions?: readonly Definition[]
}

/**
 * Per-call options shared by every manager's `add` method.
 *
 * @remarks
 * `id` overrides the minted record id. `TemplateManagerInterface#add` /
 * `DefinitionManagerInterface#add` default to the added value's own `id`
 * field when omitted; `SubjectManagerInterface#add` mints a fresh id when
 * omitted, since a `Subject` carries no `id` field of its own.
 */
export interface ManagerAddOptions {
	readonly id?: string
}

/** Options for `createInterpretContext` / the `InterpretContext` constructor. */
export interface InterpretContextOptions {
	readonly session?: string
	readonly history?: number
}

/**
 * Options for `createInterpret` / the `Interpret` constructor.
 *
 * @remarks
 * `templates` seeds the registry. `context` supplies a shared
 * {@link InterpretContextInterface} (a fresh one is constructed when
 * omitted). Each stage slot is BRING-YOUR-OWN — a supplied implementation is
 * used as-is, else the built-in stage is constructed from the matching
 * per-stage options. `similarity` (fuzzy alias-match threshold, default
 * `DEFAULT_INTERPRET_SIMILARITY`) and `floor` (intent confidence floor,
 * default `DEFAULT_INTERPRET_FLOOR`) are two distinct, clearly named axes —
 * both honored wherever they apply, never a single overloaded `threshold`
 * (scsr's defect). `history` caps the context's `previous()` ring buffer.
 * `on` — initial event listeners (AGENTS §8). `error` — the emitter's
 * listener-error handler (AGENTS §13).
 */
export interface InterpretOptions {
	readonly templates?: readonly Template[]
	readonly context?: InterpretContextInterface
	readonly normalizer?: NormalizerInterface
	readonly extractor?: ExtractorInterface
	readonly clarifier?: ClarifierInterface
	readonly formatter?: FormatterInterface
	readonly generator?: GeneratorInterface
	readonly similarity?: number
	readonly floor?: number
	readonly history?: number
	readonly lexicon?: Lexicon
	readonly formatters?: Readonly<Record<string, NarratorFormatter>>
	readonly on?: EmitterHooks<InterpretEventMap>
	readonly error?: EmitterErrorHandler
}

// === Class interfaces (AGENTS §22 — exact bijection with the implementing class)

/** The `Normalizer` stage contract: raw text in, cleaned text + applied changes out. */
export interface NormalizerInterface {
	normalize(text: string): NormalizeResult
}

/** The `Extractor` stage contract: template-agnostic intent classification + raw number mining. */
export interface ExtractorInterface {
	extract(text: string): ExtractResult
}

/**
 * The `Clarifier` stage contract: resolve carry-over, defaults, and computed
 * fields against a set of already-assigned entities, surfacing ambiguities
 * for anything required that stays unresolved.
 */
export interface ClarifierInterface {
	clarify(
		entities: readonly Entity[],
		template: Template,
		context: InterpretContextInterface | undefined,
		intent: Intent,
	): ClarifyResult
}

/** The `Formatter` stage contract: render the refined natural-language prompt for a matched template. */
export interface FormatterInterface {
	format(
		intent: Intent,
		template: Template,
		entities: readonly Entity[],
		ambiguities: readonly Ambiguity[],
	): FormatResult
}

/** The `Generator` stage contract: build the final subject/definition pair plus its field audit. */
export interface GeneratorInterface {
	generate(entities: readonly Entity[], template: Template): GenerateResult
}

/**
 * The `Narrator` contract — a stateless, TOTAL, lexicon-driven rendering
 * engine for the reverse direction.
 *
 * @remarks
 * Every method is total — never throws. A lookup miss degrades to a
 * `fallback` (when supplied), the lookup key itself, or a computed fallback
 * (`formatField` for `label`, `String(raw)` for `value`) — never a thrown
 * error, even for adversarial prototype-chain keys (`toString`,
 * `constructor`, `__proto__`), guarded with `Object.hasOwn` at every lookup.
 * `phrase` looks up a two-level `table`/`key` pair in the lexicon's
 * `phrases`. `label` renders a field's display label from `labels`, falling
 * back to `formatField`. `line` interpolates a named `templates` entry
 * against `values`, falling back to an empty string when the id is absent.
 * `value` runs a named formatter over a raw value, catching a throw and
 * falling back to `String(raw)`. `describe` / `narrate` compose these
 * primitives over a reasons `Definition` / `ReasonResult`.
 */
export interface NarratorInterface {
	phrase(table: string, key: string, fallback?: string): string
	label(field: FieldPath): string
	line(id: string, values: Readonly<Record<string, unknown>>): string
	value(unit: string, raw: unknown): string
	describe(definition: Definition): string
	narrate(result: ReasonResult): string
}

/**
 * The template registry — a self-owning, versioned/hashed record-holder
 * (AGENTS §9.1 singular/plural accessors, §9.2 batch overloads).
 *
 * @remarks
 * `size` (never `count` — this is the sole tally in scope) mirrors the
 * raters `ProgramManagerInterface` registry precedent. `remove`'s batch form
 * is all-or-nothing: any missing id in the list leaves the collection
 * untouched and returns `false`.
 */
export interface TemplateManagerInterface {
	readonly size: number
	has(id: string): boolean
	template(id: string): TemplateRecord | undefined
	templates(): readonly TemplateRecord[]
	add(template: Template, options?: ManagerAddOptions): TemplateRecord
	remove(ids: readonly string[]): boolean
	remove(id: string): boolean
	remove(): void
	destroy(): void
}

/**
 * The subject registry — a self-owning, versioned/hashed record-holder
 * that mints its own record ids (a `Subject` carries none).
 */
export interface SubjectManagerInterface {
	readonly size: number
	has(id: string): boolean
	subject(id: string): SubjectRecord | undefined
	subjects(): readonly SubjectRecord[]
	add(subject: Subject, options?: ManagerAddOptions): SubjectRecord
	remove(ids: readonly string[]): boolean
	remove(id: string): boolean
	remove(): void
	destroy(): void
}

/** The definition registry — a self-owning, versioned/hashed record-holder. */
export interface DefinitionManagerInterface {
	readonly size: number
	has(id: string): boolean
	definition(id: string): DefinitionRecord | undefined
	definitions(): readonly DefinitionRecord[]
	add(definition: Definition, options?: ManagerAddOptions): DefinitionRecord
	remove(ids: readonly string[]): boolean
	remove(id: string): boolean
	remove(): void
	destroy(): void
}

/**
 * Cross-turn interpretation context: a capped, replayable history plus the
 * subject/definition registries carry-over reads from.
 *
 * @remarks
 * `previous()` returns the ring buffer newest-last, capped at the
 * configured `history` (default `DEFAULT_INTERPRET_HISTORY`). `entities()`
 * flattens every entity recorded across the buffered history, most recent
 * last — the read carry-over consults. `add` pushes one completed
 * {@link Interpretation}, dropping the oldest entry once the cap is reached.
 */
export interface InterpretContextInterface {
	readonly session?: string
	readonly subjects: SubjectManagerInterface
	readonly definitions: DefinitionManagerInterface
	previous(): readonly Interpretation[]
	entities(): readonly Entity[]
	add(result: Interpretation): void
	clear(): void
	destroy(): void
}

/**
 * The interpretation orchestrator — the sole public entry point, mirroring
 * `reasons`' `Reason` orchestrator shape.
 *
 * @remarks
 * `interpret` is genuinely SYNCHRONOUS (scsr's `interpret()` was fake-async
 * with zero `await`s). `register` / `unregister` / `template` / `templates`
 * delegate to an internal {@link TemplateManagerInterface} but expose plain
 * {@link Template} data, not the richer versioned record. `describe` /
 * `narrate` are the reverse direction — structure-to-prose, complementing
 * (never duplicating) raters' `describe*` family. After `destroy()` every
 * method except the `emitter` getter and `destroy` itself throws
 * `InterpretError('DESTROYED', …)`; `destroy()` is idempotent and tears the
 * emitter down LAST.
 */
export interface InterpretInterface {
	readonly emitter: EmitterInterface<InterpretEventMap>
	interpret(text: string): Interpretation
	register(template: Template): void
	unregister(id: string): boolean
	template(id: string): Template | undefined
	templates(): readonly Template[]
	describe(definition: Definition): string
	narrate(result: ReasonResult): string
	destroy(): void
}
