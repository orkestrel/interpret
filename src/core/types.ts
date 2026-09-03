import type { FieldPath } from '@orkestrel/contract'
import type { EmitterErrorHandler, EmitterHooks, EmitterInterface } from '@orkestrel/emitter'
import type { Definition, ReasonResult, Subject, SymbolicExpression } from '@orkestrel/reason'

// Interprets — a synchronous, deterministic bidirectional
// bridge between natural language and the reasons engine, plus the manager
// that owns the interpretation lifecycle. FORWARD: raw text is normalized,
// classified into an intent, matched against an added `Template`, mined
// for numeric entities, clarified (carry-over / defaults / computed fields),
// formatted into a refined prompt, then generated into a `Subject` +
// `Definition` pair ready for `Reason.reason`. REVERSE: `Definition` /
// `Subject` / `ReasonResult` render to display-neutral prose, complementing
// (never duplicating) raters' `describe*` family. Nothing here is an LLM,
// provider, or agent — the `prompt` a result carries is FOR an external
// model, never consumed internally. Types are the source of truth, and every
// discriminant names its axis, never `kind` / `type`: `stage` splits pipeline
// phases, `category` splits provenance, `code` splits coded errors.

// === Vocabulary

/**
 * Names how one {@link FieldMapping} / {@link Entity} value was obtained.
 *
 * @remarks
 * `extracted` — mined from the raw text through keyword / alias / positional
 * matching. `carried` — reused from a same-domain prior turn in an
 * {@link InterpretContextInterface}. `default` — filled from a
 * {@link Template}'s {@link FieldDefault}. `computed` — derived by evaluating
 * a {@link ComputedField}'s expression. `subject` — already present on an
 * injected base subject, untouched by this interpretation.
 */
export type ProvenanceCategory = 'extracted' | 'carried' | 'default' | 'computed' | 'subject'

/**
 * Names the five fixed pipeline phases an {@link InterpretInterface#interpret} run
 * produces one {@link StageRecord} for, in order.
 *
 * @remarks
 * Deliberately NOT named `Stage` — raters already owns that identifier for
 * its worksheet derivation axis (`'factor' | 'group' | 'total'`); the two are
 * unrelated concepts on the shared `@src/core` barrel.
 */
export type InterpretStage = 'normalize' | 'extract' | 'clarify' | 'format' | 'generate'

/**
 * Names the coded misuse / failure conditions thrown as an {@link InterpretError} or
 * carried on a {@link StageFailure}.
 *
 * @remarks
 * `NORMALIZE_FAILED` / `EXTRACT_FAILED` / `CLARIFY_FAILED` / `FORMAT_FAILED`
 * / `GENERATE_FAILED` — an injected stage implementation threw during that
 * phase. `NO_TEMPLATE` — no added {@link Template} scored at or above
 * the confidence floor (or the registry is empty). `LOW_CONFIDENCE` — a
 * template matched but the classified {@link Intent}'s confidence fell below
 * the floor. `DESTROYED` — any use of a destroyed entity.
 */
export type InterpretErrorCode =
	| 'NORMALIZE_FAILED'
	| 'EXTRACT_FAILED'
	| 'CLARIFY_FAILED'
	| 'FORMAT_FAILED'
	| 'GENERATE_FAILED'
	| 'NO_TEMPLATE'
	| 'LOW_CONFIDENCE'
	| 'DESTROYED'

// === Template data model — pure JSON-serializable, versionable, diffable, hashable

/**
 * Represents one entity-extraction rule inside a {@link Template}: which literal alias
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

/** Represents a fallback value a {@link Template} fills onto a field left unresolved by extraction. */
export interface FieldDefault {
	readonly field: FieldPath
	readonly value: unknown
}

/**
 * Represents a declaratively computed field: evaluate `expression` against the entities
 * already resolved for this interpretation, and land the result on `field`.
 *
 * @remarks
 * Named `ComputedField` rather than a rule: `@orkestrel/reason` already owns
 * `Inference` for fact derivation, a different concept. `expression` is a
 * reasons {@link SymbolicExpression} tree (pure JSON `Variable` / `Constant`
 * / `Operation`), evaluated by the pure `resolveExpression` helper rather
 * than a closure, so a `Template` stays JSON-serializable end to end. A
 * `ComputedField` declares no dependency list of its own — `variablesOf`
 * derives every dependency from the tree. A `Variable` names a resolved field,
 * or one numeric element of an array-valued field as `{field}.{index}`, so a
 * computation addressing each element in turn declares an aggregate over a
 * collection of KNOWN length; a collection whose length varies per turn has no
 * declarable aggregate, because `resolveExpression` returns `undefined` for an
 * unbound variable and abandons the whole expression. When a scalar field's
 * path formats to the same binding key as an array element's — the `FieldPath`
 * `['value', '0']` and the first element of `value` both format to `value.0` —
 * the entity resolved later overwrites the earlier binding.
 */
export interface ComputedField {
	readonly field: FieldPath
	readonly expression: SymbolicExpression
}

/**
 * Represents a named, versionable interpretation template: which intents it answers,
 * how to mine entities for it, its fallback data, its computed fields, and
 * the reasons `Definition` it ultimately produces a `Subject` for.
 *
 * @remarks
 * `definition` is inline and already expressed in `@orkestrel/reason`
 * vocabulary (`reasoning` / `Check` / `terms` / `form` / `origin`). A
 * `Template` and its `Definition` are one authored record, and their ids stay
 * independent: nothing requires `template.id` to equal `definition.id`.
 * `intents` lists the `Intent.action` values this template answers.
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

/** Describes how one value landed — its origin category plus an optional strategy detail. */
export interface Provenance {
	readonly category: ProvenanceCategory
	readonly detail?: string
}

/**
 * Represents the classified action + domain for one interpretation, with a combined
 * confidence.
 *
 * @remarks
 * Produced by `classifyIntent` against caller-supplied `actions` / `domains`
 * vocabularies only — there is no built-in en-US worldview and no
 * auto-classification from an added template's own `domain` name. An axis
 * the vocabularies leave unmatched is absent (`undefined`), never an empty
 * string, so a reader tells "unclassified" from "classified as `''`".
 */
export interface Intent {
	readonly action?: string
	readonly domain?: string
	readonly confidence: number
}

/** Represents one value assigned to a template's entity mapping, with its provenance and confidence. */
export interface Entity {
	readonly name: string
	readonly value: unknown
	readonly provenance: Provenance
	readonly confidence: number
}

/** Represents an unresolved field surfaced as a human-readable question, never bare prose. */
export interface Ambiguity {
	readonly field: FieldPath
	readonly question: string
	readonly candidates: readonly string[]
	readonly required: boolean
}

/**
 * Represents one audited field of the built subject — its resolved value, provenance,
 * and confidence.
 *
 * @remarks
 * Emitted for EVERY field that lands in the generated subject, including
 * defaults and computed fields.
 */
export interface FieldMapping {
	readonly field: FieldPath
	readonly entity?: string
	readonly value: unknown
	readonly provenance: Provenance
	readonly confidence: number
}

/** Represents one normalization substitution applied to the raw text. */
export interface TextChange {
	readonly from: string
	readonly to: string
}

// === Per-stage record + failure marker

/**
 * Represents a structured input/output snapshot of one pipeline phase.
 *
 * @remarks
 * `input` / `output` are live structured values, never a stringified JSON
 * blob. No `duration` field — strict core reads no wall clock; the audit
 * story here is structural, not temporal.
 */
export interface StageRecord {
	readonly stage: InterpretStage
	readonly input: unknown
	readonly output: unknown
	readonly failed: boolean
	readonly error?: string
}

/** Represents a visible marker for a stage that threw, carrying its coded reason. */
export interface StageFailure {
	readonly stage: InterpretStage
	readonly code: InterpretErrorCode
	readonly message: string
}

// === Stage result shapes

/** Represents the `Normalizer` stage's output: the cleaned text plus every substitution applied. */
export interface NormalizeResult {
	readonly text: string
	readonly changes: readonly TextChange[]
}

/**
 * Represents the `Extractor` stage's output: intent classification plus raw numbers.
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
}

/** Represents the `Clarifier` stage's output: resolved entities plus any remaining ambiguities. */
export interface ClarifyResult {
	readonly entities: readonly Entity[]
	readonly ambiguities: readonly Ambiguity[]
}

/** Represents the `Formatter` stage's output: the refined natural-language prompt. */
export interface FormatResult {
	readonly prompt: string
}

/** Represents the `Generator` stage's output: the built subject/definition pair plus its full field audit. */
export interface GenerateResult {
	readonly subject: Subject
	readonly definition: Definition
	readonly mappings: readonly FieldMapping[]
	readonly confidence: number
}

// === The result

/**
 * Represents the full, replayable outcome of one `interpret()` call.
 *
 * @remarks
 * `subject` / `definition` are absent on an incomplete `NO_TEMPLATE` /
 * `LOW_CONFIDENCE` result — there is never a fabricated fallback template. An
 * interpretation is complete when `ambiguities` and `failures` are both empty;
 * no stored flag repeats that fact. `stages` always holds
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
	readonly confidence: number
	readonly digest: string
}

// === Versioned, content-hashed records

/**
 * Represents a versioned, content-hashed {@link Template} as held by a
 * {@link TemplateManagerInterface}.
 *
 * @remarks
 * `version` bumps only when `hash` (derived from `template`'s content, not
 * `id`) actually changes — an identical re-add keeps the same version.
 */
export interface TemplateRecord {
	readonly id: string
	readonly template: Template
	readonly version: number
	readonly hash: string
}

/**
 * Represents a versioned, content-hashed {@link Subject} as held by a
 * {@link SubjectManagerInterface}.
 *
 * @remarks
 * `id` is the manager's OWN minted identity — never `definition.id` — so
 * successive turns never silently overwrite one shared subject.
 */
export interface SubjectRecord {
	readonly id: string
	readonly subject: Subject
	readonly version: number
	readonly hash: string
}

/** Represents a versioned, content-hashed {@link Definition} as held by a {@link DefinitionManagerInterface}. */
export interface DefinitionRecord {
	readonly id: string
	readonly definition: Definition
	readonly version: number
	readonly hash: string
}

// === Event maps

/**
 * Represents the push observation surface of an {@link InterpretInterface}.
 *
 * @remarks
 * `interpret` fires once per completed `interpret()` call, complete OR
 * incomplete — visibility is the point. `add` fires when a template is added,
 * carrying its id, and names the same act as the {@link RecordEventMap} row
 * the call forwards to. `error` fires with the raw thrown value when an
 * injected stage implementation throws. `destroy` fires once on teardown.
 * Listener isolation is the emitter's own — never routed onto this map.
 */
export type InterpretEventMap = {
	/** Fires when an `interpret()` call completes — carries the full result. */
	readonly interpret: readonly [result: Interpretation]
	/** Fires when a template is added — carries its id. */
	readonly add: readonly [templateId: string]
	/** Fires when an injected stage implementation throws — carries the raw thrown value. */
	readonly error: readonly [error: unknown]
	/** Fires when the orchestrator is destroyed. */
	readonly destroy: readonly []
}

/**
 * Represents the push observation surface shared by every record registry — an id-keyed
 * collection, so `add` / `remove` are the events (never ordered-list
 * `append`/`prepend`).
 */
export type RecordEventMap = {
	/** Fires when a record is added — carries its record id. */
	readonly add: readonly [id: string]
	/** Fires when a record is removed — carries its record id. */
	readonly remove: readonly [id: string]
	/** Fires when the registry is destroyed. */
	readonly destroy: readonly []
}

/** Represents the push observation surface of a {@link TemplateManagerInterface}. */
export type TemplateManagerEventMap = RecordEventMap

/** Represents the push observation surface of a {@link SubjectManagerInterface}, whose `add` carries the own-minted record id. */
export type SubjectManagerEventMap = RecordEventMap

/** Represents the push observation surface of a {@link DefinitionManagerInterface}. */
export type DefinitionManagerEventMap = RecordEventMap

/**
 * Represents the push observation surface of an {@link InterpretContextInterface}.
 *
 * @remarks
 * An {@link Interpretation} carries no `id` of its own — `add` carries the
 * entry's `digest` instead, the closest content-derived identity it has.
 */
export type InterpretContextEventMap = {
	/** Fires when a completed interpretation is added to the history — carries its digest. */
	readonly add: readonly [digest: string]
	/** Fires when the history and both registries are cleared. */
	readonly clear: readonly []
	/** Fires when the context is destroyed. */
	readonly destroy: readonly []
}

// === Narrator — lexicon-driven reverse rendering (mechanism, never policy)

/**
 * Represents a pure formatting function for one lexicon `value()` unit.
 *
 * @remarks
 * A `Narrator` calls this from `value()` inside a `try`/`catch`, because a
 * wording engine must never crash a render — a throwing formatter is caught
 * and the raw value falls back to `String(raw)`.
 */
export type NarratorFormatter = (value: unknown) => string

/**
 * Represents caller-injected wording data for the reverse direction — mechanism, never
 * policy. Every phrase, label, and template string a `Narrator` renders is
 * DATA supplied here, never a core literal.
 *
 * @remarks
 * `phrases` is a two-level lookup (`table` → `key` → phrase) for domain
 * vocabulary swaps (for example `comparison.equals` → `'is'`). `labels` maps a
 * dotted `FieldPath` string to its display label, falling back to
 * `formatField` when absent. `templates` maps a template id (for example
 * `'definition.quantitative'`, `'result.symbolic'`, `'subject.fields'`) to an
 * @orkestrel/template `fillTemplate` template string — see `DEFAULT_LEXICON`
 * for the pinned neutral key set. Token grammar (the `[^{}]` token class, the
 * `\{{` literal escape, whitespace trimming, and dotted-token path
 * resolution) is defined by @orkestrel/template — see the vendored
 * `guides/template.md` for the authoritative contract.
 */
export interface Lexicon {
	readonly phrases?: Readonly<Record<string, Readonly<Record<string, string>>>>
	readonly labels?: Readonly<Record<string, string>>
	readonly templates?: Readonly<Record<string, string>>
}

/** Represents the options for `createNarrator` / the `Narrator` constructor. */
export interface NarratorOptions {
	readonly lexicon?: Lexicon
	readonly formatters?: Readonly<Record<string, NarratorFormatter>>
}

// === Options records

/**
 * Represents the options for `createNormalizer` / the `Normalizer` constructor.
 *
 * @remarks
 * The maps apply in order — contractions → abbreviations → corrections —
 * before whitespace collapse. `contractions` merges OVER
 * `DEFAULT_CONTRACTIONS`; `abbreviations` and `corrections` carry no built-in
 * vocabulary, because an abbreviation or a misspelling set is domain worldview
 * rather than mechanism.
 */
export interface NormalizerOptions {
	readonly contractions?: Readonly<Record<string, string>>
	readonly abbreviations?: Readonly<Record<string, string>>
	readonly corrections?: Readonly<Record<string, string>>
}

/**
 * Represents the options for `createExtractor` / the `Extractor` constructor.
 *
 * @remarks
 * `actions` / `domains` are the caller's intent vocabulary — there is no
 * built-in worldview. Neither `floor` nor
 * `similarity` lives here: the confidence floor gate is the orchestrator's
 * `matchTemplate` step, never the classifier itself.
 */
export interface ExtractorOptions {
	readonly actions?: Readonly<Record<string, string>>
	readonly domains?: Readonly<Record<string, readonly string[]>>
}

/**
 * Represents the options for `createClarifier` / the `Clarifier` constructor.
 *
 * @remarks
 * `floor` is the confidence axis honored when raising ambiguities — the
 * configured value, never a hardcoded constant. `narrator` supplies the
 * wording seam: every {@link Ambiguity} question renders through
 * `narrator.line('ambiguity.entity', …)`, so a caller rewords the question by
 * overriding that key in a {@link Lexicon}. A fresh `Narrator` over
 * `DEFAULT_LEXICON` is constructed when omitted.
 */
export interface ClarifierOptions {
	readonly floor?: number
	readonly narrator?: NarratorInterface
}

/**
 * Represents the options for `createFormatter` / the `Formatter` constructor.
 *
 * @remarks
 * `verbs` maps an `Intent.action` to its display verb. `narrator` supplies the
 * rest of the wording seam: every prompt clause renders through
 * `narrator.line('prompt.…', …)`, so a caller rewords the clause assembly by
 * overriding those keys in a {@link Lexicon}. A fresh `Narrator` over
 * `DEFAULT_LEXICON` is constructed when omitted.
 */
export interface FormatterOptions {
	readonly verbs?: Readonly<Record<string, string>>
	readonly narrator?: NarratorInterface
}

/** Represents the options for `createTemplateManager` / the `TemplateManager` constructor — the initial seed collection. */
export interface TemplateManagerOptions {
	readonly templates?: readonly Template[]
	readonly on?: EmitterHooks<TemplateManagerEventMap>
	readonly error?: EmitterErrorHandler
}

/** Represents the options for `createSubjectManager` / the `SubjectManager` constructor — the initial seed collection. */
export interface SubjectManagerOptions {
	readonly subjects?: readonly Subject[]
	readonly on?: EmitterHooks<SubjectManagerEventMap>
	readonly error?: EmitterErrorHandler
}

/** Represents the options for `createDefinitionManager` / the `DefinitionManager` constructor — the initial seed collection. */
export interface DefinitionManagerOptions {
	readonly definitions?: readonly Definition[]
	readonly on?: EmitterHooks<DefinitionManagerEventMap>
	readonly error?: EmitterErrorHandler
}

/**
 * Represents the identity, version, and content hash a {@link RecordManagerInterface}
 * derives for one record before its concrete shape is built.
 *
 * @remarks
 * `hash` is derived from the held value's CONTENT alone (id-independent), and
 * `version` bumps only when that hash changes at a reused id — so an
 * identical re-add keeps its version. Every record type in this module
 * (`TemplateRecord` / `SubjectRecord` / `DefinitionRecord`) carries `id`,
 * `version`, and `hash` plus its own value field.
 */
export interface RecordStamp {
	readonly id: string
	readonly version: number
	readonly hash: string
}

/**
 * Builds one concrete record from the {@link RecordStamp} its registry derived
 * and the value that record holds.
 *
 * @remarks
 * The one place a concrete manager decides its record's own value field, so
 * `TemplateManager` names it `template`, `SubjectManager` names it `subject`,
 * and `DefinitionManager` names it `definition` while every registry shares
 * one engine.
 */
export type RecordFunction<TValue, TRecord extends RecordStamp> = (
	stamp: RecordStamp,
	value: TValue,
) => TRecord

/**
 * Represents the options for the `RecordManager` constructor.
 *
 * @remarks
 * `entity` names what the registry holds, and is the only wording the engine
 * emits: a call after `destroy()` throws
 * `InterpretError('DESTROYED', '{entity} manager has been destroyed')`.
 */
export interface RecordManagerOptions {
	readonly entity: string
	readonly on?: EmitterHooks<RecordEventMap>
	readonly error?: EmitterErrorHandler
}

/**
 * Represents the shared registry engine every record manager composes — the `Map`, the
 * content-hash and version rule, the batch `remove` overloads, and teardown.
 *
 * @remarks
 * Generic over the value it holds and the record it mints, so one
 * implementation serves `TemplateManagerInterface`,
 * `SubjectManagerInterface`, and `DefinitionManagerInterface`. Each concrete
 * manager keeps its own accessor noun pair, its own id source, and its own
 * {@link RecordFunction}; everything else lives here. `remove`'s batch form is
 * all-or-nothing: any missing id in the list leaves the collection untouched
 * and returns `false`. `destroy()` is idempotent and tears the emitter down
 * LAST; every method afterwards throws `InterpretError('DESTROYED', …)`.
 */
export interface RecordManagerInterface<TValue, TRecord extends RecordStamp> {
	readonly emitter: EmitterInterface<RecordEventMap>
	readonly count: number
	has(id: string): boolean
	record(id: string): TRecord | undefined
	records(): readonly TRecord[]
	add(id: string, value: TValue, build: RecordFunction<TValue, TRecord>): TRecord
	remove(ids: readonly string[]): boolean
	remove(id: string): boolean
	remove(): void
	destroy(): void
}

/**
 * Represents the per-call options for the record a manager's `add` mints.
 *
 * @remarks
 * `id` overrides the minted record id. `TemplateManagerInterface#add` /
 * `DefinitionManagerInterface#add` default to the added value's own `id`
 * field when omitted; `SubjectManagerInterface#add` mints a fresh id when
 * omitted, because a `Subject` carries no `id` field of its own.
 */
export interface RecordOptions {
	readonly id?: string
}

/** Represents the options for `createInterpretContext` / the `InterpretContext` constructor. */
export interface InterpretContextOptions {
	readonly session?: string
	readonly history?: number
	readonly on?: EmitterHooks<InterpretContextEventMap>
	readonly error?: EmitterErrorHandler
}

/**
 * Represents the options for `createInterpret` / the `Interpret` constructor.
 *
 * @remarks
 * `templates` seeds the registry. `context` supplies a shared
 * {@link InterpretContextInterface} (a fresh one is constructed when
 * omitted); a supplied context stays the caller's to tear down, and
 * `destroy()` leaves it alive for the other orchestrators sharing it. Each
 * stage slot is BRING-YOUR-OWN — a supplied implementation is
 * used as-is, else the built-in stage is constructed with its own defaults,
 * so a caller who wants a configured stage constructs that stage and supplies
 * the instance. There are no per-stage option keys here: `floor` is the one
 * value threaded into a built-in stage, reaching the `Clarifier`.
 * `similarity` (fuzzy alias-match threshold, default
 * `DEFAULT_INTERPRET_SIMILARITY`) and `floor` (intent confidence floor,
 * default `DEFAULT_INTERPRET_FLOOR`) are two distinct, clearly named axes —
 * each honored wherever it applies, never a single overloaded `threshold`.
 * `history` caps the context's `previous()` ring buffer. `narrator` groups the
 * wording settings the orchestrator builds its own {@link NarratorInterface}
 * from, keeping them clear of the `formatter` stage slot beside them. `on` —
 * initial event listeners. `error` — the emitter's listener-error handler.
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
	readonly narrator?: NarratorOptions
	readonly on?: EmitterHooks<InterpretEventMap>
	readonly error?: EmitterErrorHandler
}

// === Class interfaces — an exact bijection with the implementing class

/** Represents the `Normalizer` stage contract: raw text in, cleaned text + applied changes out. */
export interface NormalizerInterface {
	normalize(text: string): NormalizeResult
}

/** Represents the `Extractor` stage contract: template-agnostic intent classification + raw number mining. */
export interface ExtractorInterface {
	extract(text: string): ExtractResult
}

/**
 * Represents the `Clarifier` stage contract: resolve carry-over, defaults, and computed
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

/** Represents the `Formatter` stage contract: render the refined natural-language prompt for a matched template. */
export interface FormatterInterface {
	format(
		intent: Intent,
		template: Template,
		entities: readonly Entity[],
		ambiguities: readonly Ambiguity[],
	): FormatResult
}

/**
 * Represents the `Generator` stage contract: build the final subject/definition pair plus
 * its field audit.
 *
 * @remarks
 * Every field the built subject carries comes from an entity the caller's own
 * {@link Template} declared — a mapping, a default, or a
 * {@link ComputedField}. The stage derives no field of its own, so a subject
 * never gains a sibling the template author did not ask for.
 */
export interface GeneratorInterface {
	generate(entities: readonly Entity[], template: Template): GenerateResult
}

/**
 * Represents the `Narrator` contract — a stateless, TOTAL, lexicon-driven rendering
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
 * Represents the template registry — a self-owning, versioned/hashed record-holder with
 * the singular/plural accessor pair and the batch `remove` overloads.
 *
 * @remarks
 * `count` is the registry's lone tally. `remove`'s batch form is
 * all-or-nothing: any missing id in the list leaves the collection untouched
 * and returns `false`.
 */
export interface TemplateManagerInterface {
	readonly emitter: EmitterInterface<TemplateManagerEventMap>
	readonly count: number
	has(id: string): boolean
	template(id: string): TemplateRecord | undefined
	templates(): readonly TemplateRecord[]
	add(template: Template, options?: RecordOptions): TemplateRecord
	remove(ids: readonly string[]): boolean
	remove(id: string): boolean
	remove(): void
	destroy(): void
}

/**
 * Represents the subject registry — a self-owning, versioned/hashed record-holder
 * that mints its own record ids (a `Subject` carries none).
 */
export interface SubjectManagerInterface {
	readonly emitter: EmitterInterface<SubjectManagerEventMap>
	readonly count: number
	has(id: string): boolean
	subject(id: string): SubjectRecord | undefined
	subjects(): readonly SubjectRecord[]
	add(subject: Subject, options?: RecordOptions): SubjectRecord
	remove(ids: readonly string[]): boolean
	remove(id: string): boolean
	remove(): void
	destroy(): void
}

/** Represents the definition registry — a self-owning, versioned/hashed record-holder. */
export interface DefinitionManagerInterface {
	readonly emitter: EmitterInterface<DefinitionManagerEventMap>
	readonly count: number
	has(id: string): boolean
	definition(id: string): DefinitionRecord | undefined
	definitions(): readonly DefinitionRecord[]
	add(definition: Definition, options?: RecordOptions): DefinitionRecord
	remove(ids: readonly string[]): boolean
	remove(id: string): boolean
	remove(): void
	destroy(): void
}

/**
 * Represents the cross-turn interpretation context: a capped, replayable history plus the
 * subject/definition registries carry-over reads from.
 *
 * @remarks
 * `previous()` returns the ring buffer newest-last, capped at the
 * configured `history` (default `DEFAULT_INTERPRET_HISTORY`). `entities()`
 * flattens every entity recorded across the buffered history, most recent
 * last — the read carry-over consults. `add` pushes one completed
 * {@link Interpretation}, dropping the oldest entry after the cap is reached.
 */
export interface InterpretContextInterface {
	readonly emitter: EmitterInterface<InterpretContextEventMap>
	readonly session: string | undefined
	readonly subjects: SubjectManagerInterface
	readonly definitions: DefinitionManagerInterface
	previous(): readonly Interpretation[]
	entities(): readonly Entity[]
	add(result: Interpretation): void
	clear(): void
	destroy(): void
}

/**
 * Represents the interpretation orchestrator — the sole public entry point, mirroring
 * `reasons`' `Reason` orchestrator shape.
 *
 * @remarks
 * `interpret` is genuinely SYNCHRONOUS — it returns its
 * {@link Interpretation} directly, never a `Promise`. `add` / `remove` /
 * `template` / `templates` name the same acts as the
 * {@link TemplateManagerInterface} they delegate to, and expose plain
 * {@link Template} data rather than the richer versioned record — which is why
 * `add` returns `void` where `TemplateManagerInterface#add` returns the record
 * it minted. `remove` carries the same batch overloads as that delegate, so
 * the shared verb promises no form the orchestrator lacks. `describe` /
 * `narrate` are the reverse direction — structure-to-prose, complementing
 * (never duplicating) raters' `describe*` family. After `destroy()` every
 * method except the `emitter` getter and `destroy` itself throws
 * `InterpretError('DESTROYED', …)`; `destroy()` is idempotent, tears down the
 * template registry and the context it constructed itself — never a `context`
 * the caller supplied, which outlives this orchestrator — and tears the
 * emitter down LAST.
 */
export interface InterpretInterface {
	readonly emitter: EmitterInterface<InterpretEventMap>
	interpret(text: string): Interpretation
	add(template: Template): void
	remove(ids: readonly string[]): boolean
	remove(id: string): boolean
	remove(): void
	template(id: string): Template | undefined
	templates(): readonly Template[]
	describe(definition: Definition): string
	narrate(result: ReasonResult): string
	destroy(): void
}
