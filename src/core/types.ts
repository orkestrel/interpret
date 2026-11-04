import type { AuditFault, ContractShape, FieldPath, JSONValue } from '@orkestrel/contract'
import type { EmitterErrorHandler, EmitterHooks, EmitterInterface } from '@orkestrel/emitter'
import type { Definition, ReasonResult, Subject, SymbolicExpression } from '@orkestrel/reason'

// Interprets — a synchronous, deterministic bidirectional
// bridge between natural language and the reasons engine, plus the manager
// that owns the interpretation lifecycle. Forward: raw text is normalized,
// classified into an intent, matched against an added `Recipe`, mined
// for numeric entities, clarified (carry-over / defaults / computed fields),
// formatted into a refined prompt, then generated into a `Subject` +
// `Definition` pair ready for `Reason.reason`. Reverse: `Definition` /
// `Subject` / `ReasonResult` render to display-neutral prose, complementing
// (never duplicating) raters' `describe*` family. Nothing here is an LLM,
// provider, or agent — the `prompt` a result carries is written for an external
// model, never consumed internally. Types are the source of truth, and every
// discriminant names its axis, never `kind` / `type`: `stage` splits pipeline
// phases, `category` splits provenance, `code` splits coded errors.

// === Vocabulary

/**
 * Names how one {@link FieldMapping} or {@link Entity} value was obtained.
 *
 * @remarks
 * `extracted` — mined from the raw text through keyword / alias
 * matching. `carried` — reused from a same-domain prior turn in an
 * {@link InterpretContextInterface}. `default` — filled from a
 * default in a {@link Recipe}'s `shape`. `computed` — derived by evaluating
 * a {@link ComputedField}'s expression. `subject` — already present on an
 * injected base subject, untouched by this interpretation.
 */
export type ProvenanceCategory = 'extracted' | 'carried' | 'default' | 'computed' | 'subject'

/**
 * Names the fixed pipeline phases an {@link InterpretInterface#interpret} run
 * produces one {@link StageRecord} for, in order.
 *
 * @remarks
 * Deliberately not named `Stage` — raters already owns that identifier for
 * its worksheet derivation axis (`'factor' | 'group' | 'total'`); the two are
 * unrelated concepts on the shared `@src/core` barrel.
 */
export type InterpretStage = 'normalize' | 'extract' | 'clarify' | 'format' | 'generate'

/**
 * Names the coded misuse or failure conditions thrown as an {@link InterpretError} or
 * carried on a {@link StageFailure}.
 *
 * @remarks
 * `NORMALIZE_FAILED` / `EXTRACT_FAILED` / `CLARIFY_FAILED` / `FORMAT_FAILED`
 * / `GENERATE_FAILED` — an injected stage implementation threw during that
 * phase. `NO_RECIPE` — no added {@link Recipe} scored at or above
 * the confidence floor (or the registry is empty). `LOW_CONFIDENCE` — a
 * recipe matched but the classified {@link Intent}'s confidence fell below
 * the floor. `DEFINITION` — a {@link Recipe} is malformed, or its `shape` does not stand or
 * does not declare a field it maps or computes. `DESTROYED` — any use of a destroyed entity.
 * `TEXT_LIMIT` — raw text exceeds {@link INTERPRET_TEXT_LIMIT} UTF-16 units.
 */
export type InterpretErrorCode =
	| 'TEXT_LIMIT'
	| 'NORMALIZE_FAILED'
	| 'EXTRACT_FAILED'
	| 'CLARIFY_FAILED'
	| 'FORMAT_FAILED'
	| 'GENERATE_FAILED'
	| 'NO_RECIPE'
	| 'LOW_CONFIDENCE'
	| 'DEFINITION'
	| 'DESTROYED'

// === Recipe data model — pure JSON-serializable, versionable, diffable, hashable

/**
 * Represents one entity-extraction rule inside a {@link Recipe}: which literal aliases
 * identify a value, and which subject field it lands on.
 *
 * @remarks
 * `aliases` are literal strings (no `RegExp` — recipes stay JSON), matched exactly,
 * case-insensitively, as in-order token sequences surrounding an extracted number. Whether the
 * field is required is the {@link Recipe}'s `shape` to say.
 */
export interface EntityMapping {
	readonly entity: string
	readonly aliases: readonly string[]
	readonly field: FieldPath
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
 * than a closure, so a `Recipe` stays JSON-serializable end to end. A
 * `ComputedField` declares no dependency list of its own — `variablesOf`
 * derives every dependency from the tree. A `Variable` names a resolved field,
 * or one numeric element of an array-valued field as `{field}.{index}`, so a
 * computation addressing each element in turn declares an aggregate over a
 * collection of known length; a collection whose length varies per turn has no
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
 * Represents a named, versionable interpretation recipe: which intents it answers,
 * how to mine entities for it, its computed fields, the shape of what it produces, and
 * the reasons `Definition` it ultimately produces a `Subject` for.
 *
 * @remarks
 * `definition` is inline and already expressed in `@orkestrel/reason`
 * vocabulary (`reasoning` / `Check` / `terms` / `form` / `origin`). A
 * `Recipe` and its `Definition` are one authored record, and their ids stay
 * independent: nothing requires `recipe.id` to equal `definition.id`.
 * `intents` lists the `Intent.action` values this recipe answers. `shape` is the generated
 * subject's shape, read at the door after clarify and computations: it says which fields are
 * required, which are optional, and what an optional one defaults to.
 */
export interface Recipe {
	readonly id: string
	readonly name: string
	readonly domain: string
	readonly intents: readonly string[]
	readonly mappings: readonly EntityMapping[]
	readonly computations: readonly ComputedField[]
	readonly definition: Definition
	readonly shape: ContractShape
}

/** Represents one default a {@link Recipe}'s `shape` holds, by the field it fills. */
export interface ShapeDefault {
	readonly field: readonly string[]
	readonly value: JSONValue
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
 * auto-classification from an added recipe's own `domain` name. An axis
 * the vocabularies leave unmatched is absent (`undefined`), never an empty
 * string, so a reader tells "unclassified" from "classified as `''`".
 */
export interface Intent {
	readonly action?: string
	readonly domain?: string
	readonly confidence: number
}

/**
 * Represents one value assigned to a recipe's entity mapping, with its provenance and confidence.
 *
 * @remarks
 * `field` is where a value no mapping names lands, as a default or a computed field does.
 */
export interface Entity {
	readonly name: string
	readonly field?: FieldPath
	readonly value: unknown
	readonly provenance: Provenance
	readonly confidence: number
}

/**
 * Represents an unresolved field surfaced as a human-readable question, never bare prose.
 *
 * @remarks
 * `fault` is what the door refused, when it refused: the question a caller asks can be derived
 * from it. A value read below the floor, a number no anchor claimed, and an unmatched intent
 * carry none. `candidates` lists the numbers no anchor claimed, which may hold the answer.
 */
export interface Ambiguity {
	readonly field: FieldPath
	readonly question: string
	readonly candidates: readonly string[]
	readonly required: boolean
	readonly fault?: AuditFault
}

/**
 * Represents one audited field of the built subject — its resolved value, provenance,
 * and confidence.
 *
 * @remarks
 * Emitted for every field that lands in the generated subject, including
 * defaults and computed fields.
 */
export interface FieldMapping {
	readonly field: FieldPath
	readonly entity?: string
	readonly value: unknown
	readonly provenance: Provenance
	readonly confidence: number
}

/** Represents where something sits in a text: `start` inclusive, `end` exclusive. */
export interface TextSpan {
	readonly start: number
	readonly end: number
}

/**
 * Names the decision that first prevented a numeric occurrence from being assigned.
 *
 * @remarks
 * `following-word`: a following word fails the compiler's anchor/link check.
 * `unreadable`: the selected occurrence has no exact value or has an unreadable mark.
 * `anchor-tie`: an anchor has equally near numbers, or a number has competing nearest anchors.
 * `correction`: an explicit correction cue refuses a suspect or changed occurrence.
 * `negation`: the anchor's clause is negated, refusing its numeric occurrences.
 * `unanchored`: compilation ends without a claim or an earlier refusal for the occurrence.
 * `collection`: a sole array mapping refuses its entire collection after one member fails.
 */
export type NumberRefusalReason =
	| 'following-word'
	| 'unreadable'
	| 'anchor-tie'
	| 'correction'
	| 'negation'
	| 'unanchored'
	| 'collection'

/**
 * Represents one refused numeric occurrence, its normalized position, and its first decision.
 *
 * @remarks
 * `text` and `word` use the contract's bounded `preview`, including string quotes.
 * Spans index `Interpretation.normalized`, or the text supplied to `compileEntities` after
 * `createNormalizer().normalize(text).text`. The compiler produces start at or before end;
 * the structural shape and guard accept any nonnegative integer pair, including reversed pairs.
 * `field` names the mapping available at that decision, not a guessed intended field.
 * It is absent for competing anchors and unanchored occurrences. `unreadable` is the reader's
 * existing detail when that check refuses. No offset map to the original input is supplied.
 */
export interface NumberRefusal extends TextSpan {
	readonly text: string
	readonly reason: NumberRefusalReason
	readonly unreadable?: NumberUnreadable
	readonly word?: string
	readonly field?: FieldPath
}

/** Represents bounded refusal records and the count omitted after the published cap. */
export interface NumberRefusals {
	readonly items: readonly NumberRefusal[]
	readonly omitted: number
}

/** Represents assigned entities and any bounded evidence of refused numeric occurrences. */
export interface EntityCompilation {
	readonly entities: readonly Entity[]
	readonly refusals?: NumberRefusals
}

/** Represents the first refusal decision retained before bounded record construction. */
export interface NumberRefusalDecision {
	readonly reason: NumberRefusalReason
	readonly word?: string
	readonly field?: FieldPath
}

/** Observes the input occurrence index and the refusal decided by an anchor check. */
export type AnchorRefusalHandler = (index: number, reason: 'negation' | 'anchor-tie') => void

/**
 * Names why a number's value cannot be read exactly.
 *
 * @remarks
 * `fraction` — "1/2", "½", or "half". `foreign currency` — not dollars. `grouping` — digits grouped
 * another way, "200.000". `signed` — a leading sign. `shorthand` — "1.2m" with no currency to say
 * it is money, "20s". `spoken` — "twelve fifty". `joined` — "two thousand and five hundred" joined
 * ambiguously. `frequency` — "twice a week". `loose` — "a couple". `range` — "12 to 18", "5 or 6".
 * `dimensions` — "20 x 30". `overflow` — past what a number holds exactly.
 * `precision` — scaling would change under six-decimal rounding. Unsupported exponents use
 * `shorthand`; unsupported scale compositions use `joined`.
 */
export type NumberUnreadable =
	| 'fraction'
	| 'foreign currency'
	| 'grouping'
	| 'signed'
	| 'shorthand'
	| 'spoken'
	| 'joined'
	| 'frequency'
	| 'loose'
	| 'range'
	| 'dimensions'
	| 'overflow'
	| 'precision'

/** Names what a number that belongs to no quantity is: a year, a date, a time, a reference, and so on. */
export type NumberForeign =
	| 'plan'
	| 'phone'
	| 'date'
	| 'time'
	| 'identifier'
	| 'ordinal'
	| 'list'
	| 'age'
	| 'past'
	| 'period'
	| 'reference'
	| 'zip'
	| 'address'
	| 'year'

/**
 * Represents one number read from a text, with its span and what the words around it say.
 *
 * @remarks
 * `value` is present only when digits or words read exactly; `unreadable` omits the value
 * instead of exposing a partial reading. `foreign` says it is no quantity. `money`, `percent`,
 * and `unit` say what it measures, `scaled` that a suffix multiplied it, and `word` that it was
 * written out. `hedged` says the writer marks it inexact, `suspect` that the sentence dates, corrects,
 * or negates it, `changed` that the sentence holds a change word, and `composite` that it needs
 * arithmetic. `loose`, `magnitude`, `weak`, `tail`, `yearish`, and `phone` are weaker readings
 * for a caller to weigh. `reference` names the word that introduced it as an identifier. `sentence`
 * and `segment` count where it sits.
 */
export interface ReadNumber extends TextSpan {
	readonly raw: string
	readonly value?: number
	readonly unreadable?: NumberUnreadable
	readonly foreign?: NumberForeign
	readonly money?: boolean
	readonly percent?: boolean
	readonly scaled?: boolean
	readonly word?: boolean
	readonly hedged?: boolean
	readonly suspect?: boolean
	readonly changed?: boolean
	readonly composite?: boolean
	readonly loose?: boolean
	readonly magnitude?: boolean
	readonly weak?: boolean
	readonly tail?: boolean
	readonly yearish?: boolean
	readonly phone?: boolean
	readonly reference?: string
	readonly unit?: string
	readonly sentence: number
	readonly segment: number
}

/** Names what one scanned token is to `NumberReader`: a number, a word, or a mark. */
export type ReaderTokenForm = 'number' | 'word' | 'mark'

/** Represents what the number reader's passes have marked on one token so far. */
export interface ReaderMarks extends Omit<ReadNumber, 'raw' | 'start' | 'unit'> {
	readonly index: number
	readonly attached?: boolean
	readonly glued?: boolean
	readonly abbreviated?: boolean
}

/** Represents a written-out cardinal as far as it has been read. */
export interface CardinalResult {
	readonly value: number
	readonly part: number
	readonly next: number
	readonly last: string
	readonly unreadable?: NumberUnreadable
	readonly money: boolean
}

/** Represents a written-out number, as the token it reads to and where the walk resumes. */
export interface WordNumberResult {
	readonly token: ReaderTokenInterface
	readonly next: number
}

/** Declares one scanned token the number reader's passes mark as they walk a sentence. */
export interface ReaderTokenInterface {
	readonly form: ReaderTokenForm
	readonly raw: string
	readonly lower: string
	readonly canon: string
	readonly start: number
	readonly marks: ReaderMarks
	/**
	 * Adds marks to the token.
	 *
	 * @param marks - The marks to add, each replacing any it names
	 */
	mark(marks: Partial<ReaderMarks>): void
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
 * Represents the `Extractor` stage's output: intent classification plus exact reader values.
 *
 * @remarks
 * Recipe-agnostic by design — extraction never sees a `Recipe`, only the
 * text. Unreadable occurrences contribute no value; word forms do. `numbers`, not recipe-named entities; entity assignment is a
 * separate orchestrator step run only after a recipe has matched (see
 * `assignEntities` in `compilers.ts`).
 */
export interface ExtractResult {
	readonly intent: Intent
	readonly numbers: readonly number[]
}

/**
 * Represents the `Clarifier` stage's output: resolved entities plus any remaining ambiguities.
 *
 * @remarks
 * `repairs` and `defaulted` are what the door accepted and filled.
 */
export interface ClarifyResult {
	readonly entities: readonly Entity[]
	readonly ambiguities: readonly Ambiguity[]
	readonly repairs: readonly AuditFault[]
	readonly defaulted: readonly FieldPath[]
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
 * `subject` / `definition` are absent on an incomplete `NO_RECIPE` /
 * `LOW_CONFIDENCE` result — there is never a fabricated fallback recipe. `subject`
 * is also absent while a required ambiguity is open, because a subject the door refused
 * is no subject. An interpretation is complete when `ambiguities` and `failures` are
 * both empty; no stored flag repeats that fact. `repairs` and `defaulted` are what
 * the door accepted and filled. `recipe` and `version` name the recipe matched, since a
 * `definition`'s id is independent of it. `stages` always holds one record per
 * phase, `[normalize, extract, clarify, format, generate]`,
 * in order. `digest` is `digestValue` over `{text, recipeId,
 * version, subject, definition}` — re-running the same original text
 * against the same recipe version reproduces the same digest (the replay
 * contract).
 * `refusals` is absent when compilation refused nothing, otherwise bounded by
 * `NUMBER_REFUSAL_LIMIT`, with additional occurrences counted in `omitted`.
 * These records do not enter the digest: two results can share a digest while their
 * refusal records differ. Positions address `normalized`, not the original `text`.
 */
export interface Interpretation {
	readonly refusals?: NumberRefusals
	readonly text: string
	readonly normalized: string
	readonly intent: Intent
	readonly recipe?: string
	readonly version?: number
	readonly entities: readonly Entity[]
	readonly subject?: Subject
	readonly definition?: Definition
	readonly mappings: readonly FieldMapping[]
	readonly ambiguities: readonly Ambiguity[]
	readonly repairs: readonly AuditFault[]
	readonly defaulted: readonly FieldPath[]
	readonly prompt: string
	readonly stages: readonly StageRecord[]
	readonly failures: readonly StageFailure[]
	readonly confidence: number
	readonly digest: string
}

// === Versioned, content-hashed records

/**
 * Represents a versioned, content-hashed {@link Recipe} as held by a
 * {@link RecipeManagerInterface}.
 *
 * @remarks
 * `version` bumps only when `hash` (derived from `recipe`'s content, not
 * `id`) actually changes — an identical re-add keeps the same version.
 */
export interface RecipeRecord {
	readonly id: string
	readonly recipe: Recipe
	readonly version: number
	readonly hash: string
}

/**
 * Represents a versioned, content-hashed {@link Subject} as held by a
 * {@link SubjectManagerInterface}.
 *
 * @remarks
 * `id` is the manager's own minted identity — never `definition.id` — so
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
 * incomplete — visibility is the point. `add` fires when a recipe is added,
 * carrying its id, and names the same act as the {@link RecordEventMap} row
 * the call forwards to. `error` fires with the raw thrown value when an
 * injected stage implementation throws. `destroy` fires once on teardown.
 * Listener isolation is the emitter's own — never routed onto this map.
 */
export type InterpretEventMap = {
	/** Fires when an `interpret()` call completes — carries the full result. */
	readonly interpret: readonly [result: Interpretation]
	/** Fires when a recipe is added — carries its id. */
	readonly add: readonly [recipeId: string]
	/** Fires when an injected stage implementation throws — carries the raw thrown value. */
	readonly error: readonly [error: unknown]
	/** Fires when the orchestrator is destroyed. */
	readonly destroy: readonly []
}

/**
 * Represents the push observation surface shared by every record registry — an id-keyed
 * collection, so `add` and `remove` are the events (never ordered-list
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

/** Represents the push observation surface of a {@link RecipeManagerInterface}. */
export type RecipeManagerEventMap = RecordEventMap

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
 * data supplied here, never a core literal.
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

/** Represents the options for `createNarrator` and the `Narrator` constructor. */
export interface NarratorOptions {
	readonly lexicon?: Lexicon
	readonly formatters?: Readonly<Record<string, NarratorFormatter>>
}

// === Options records

/**
 * Represents the options for `createNormalizer` and the `Normalizer` constructor.
 *
 * @remarks
 * The maps apply in order — contractions → abbreviations → corrections —
 * before whitespace collapse. `contractions` merges over
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
 * Represents the options for `createExtractor` and the `Extractor` constructor.
 *
 * @remarks
 * `actions` / `domains` are the caller's intent vocabulary — there is no
 * built-in worldview. The confidence floor gate is the orchestrator's
 * `matchRecipe` step, never the classifier itself.
 */
export interface ExtractorOptions {
	readonly actions?: Readonly<Record<string, string>>
	readonly domains?: Readonly<Record<string, readonly string[]>>
}

/**
 * Represents the options for `createClarifier` and the `Clarifier` constructor.
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
 * Represents the options for `createFormatter` and the `Formatter` constructor.
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

/** Represents the options for `createRecipeManager` and the `RecipeManager` constructor — the initial seed collection. */
export interface RecipeManagerOptions {
	readonly recipes?: readonly Recipe[]
	readonly on?: EmitterHooks<RecipeManagerEventMap>
	readonly error?: EmitterErrorHandler
}

/** Represents the options for `createSubjectManager` and the `SubjectManager` constructor — the initial seed collection. */
export interface SubjectManagerOptions {
	readonly subjects?: readonly Subject[]
	readonly on?: EmitterHooks<SubjectManagerEventMap>
	readonly error?: EmitterErrorHandler
}

/** Represents the options for `createDefinitionManager` and the `DefinitionManager` constructor — the initial seed collection. */
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
 * `hash` is derived from the held value's content alone (id-independent), and
 * `version` bumps only when that hash changes at a reused id — so an
 * identical re-add keeps its version. Every record type in this module
 * (`RecipeRecord` / `SubjectRecord` / `DefinitionRecord`) carries `id`,
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
 * `RecipeManager` names it `recipe`, `SubjectManager` names it `subject`,
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
 * implementation serves `RecipeManagerInterface`,
 * `SubjectManagerInterface`, and `DefinitionManagerInterface`. Each concrete
 * manager keeps its own accessor noun pair, its own id source, and its own
 * {@link RecordFunction}; everything else lives here. `remove`'s batch form is
 * all-or-nothing: any missing id in the list leaves the collection untouched
 * and returns `false`. `destroy()` is idempotent and tears the emitter down
 * last; every method afterwards throws `InterpretError('DESTROYED', …)`.
 */
export interface RecordManagerInterface<TValue, TRecord extends RecordStamp> {
	readonly emitter: EmitterInterface<RecordEventMap>
	readonly count: number
	/**
	 * Reports whether a record with the given id is held.
	 *
	 * @param id - The record id to look for
	 * @returns True if a record with that id is held; false otherwise
	 */
	has(id: string): boolean
	/**
	 * Looks up one held record by id — the singular accessor.
	 *
	 * @param id - The record id to look up
	 * @returns The held record, or `undefined` when none carries that id
	 */
	record(id: string): TRecord | undefined
	/**
	 * Lists every held record — the plural accessor.
	 *
	 * @returns Every held record, in insertion order
	 */
	records(): readonly TRecord[]
	/**
	 * Stamps a value with its id, version, and content hash, builds the record, holds it, and
	 * emits `add`.
	 *
	 * @param id - The record id to hold the value under
	 * @param value - The value the record holds
	 * @param build - The function building the concrete record from its stamp and its value
	 * @returns The stamped record the registry holds
	 */
	add(id: string, value: TValue, build: RecordFunction<TValue, TRecord>): TRecord
	/**
	 * Removes the listed records by id, one record by id, or every record, and emits `remove`
	 * per removed id.
	 *
	 * @param ids - The record ids to remove, all-or-nothing; omit the argument to remove every record
	 * @returns True if every listed id was held; false otherwise
	 */
	remove(ids: readonly string[]): boolean
	remove(id: string): boolean
	remove(): void
	/**
	 * Tears the record registry down idempotently — clears the collection, emits
	 * `destroy`, then destroys the emitter last.
	 */
	destroy(): void
}

/**
 * Represents the per-call options for the record a manager's `add` mints.
 *
 * @remarks
 * `id` overrides the minted record id. `RecipeManagerInterface#add` /
 * `DefinitionManagerInterface#add` default to the added value's own `id`
 * field when omitted; `SubjectManagerInterface#add` mints a fresh id when
 * omitted, because a `Subject` carries no `id` field of its own.
 */
export interface RecordOptions {
	readonly id?: string
}

/** Represents the options for `createInterpretContext` and the `InterpretContext` constructor. */
export interface InterpretContextOptions {
	readonly session?: string
	/** Caps retained turns; defaults to 0, disabling carry. */
	readonly history?: number
	readonly on?: EmitterHooks<InterpretContextEventMap>
	readonly error?: EmitterErrorHandler
}

/**
 * Represents the options for `createInterpret` and the `Interpret` constructor.
 *
 * @remarks
 * `recipes` seeds the registry. `context` supplies a shared
 * {@link InterpretContextInterface} (a fresh one is constructed when
 * omitted); a supplied context stays the caller's to tear down, and
 * `destroy()` leaves it alive for the other orchestrators sharing it. Each
 * stage slot is bring-your-own — a supplied implementation is
 * used as-is, else the built-in stage is constructed with its own defaults,
 * so a caller who wants a configured stage constructs that stage and supplies
 * the instance. There are no per-stage option keys here: `floor` is the one
 * value threaded into a built-in stage, reaching the `Clarifier`.
 * `floor` sets the intent confidence floor (default `DEFAULT_INTERPRET_FLOOR`).
 * `history` caps a newly constructed context's `previous()` ring buffer (default 0,
 * no carry). Configure a supplied context's history on that context. `narrator` groups the
 * wording settings the orchestrator builds its own {@link NarratorInterface}
 * from, keeping them clear of the `formatter` stage slot beside them. `on` —
 * initial event listeners. `error` — the emitter's listener-error handler.
 */
export interface InterpretOptions {
	readonly recipes?: readonly Recipe[]
	readonly context?: InterpretContextInterface
	readonly normalizer?: NormalizerInterface
	readonly extractor?: ExtractorInterface
	readonly clarifier?: ClarifierInterface
	readonly formatter?: FormatterInterface
	readonly generator?: GeneratorInterface
	readonly floor?: number
	readonly history?: number
	readonly narrator?: NarratorOptions
	readonly on?: EmitterHooks<InterpretEventMap>
	readonly error?: EmitterErrorHandler
}

// === Class interfaces — an exact bijection with the implementing class

/** Represents the `Normalizer` stage contract: raw text in, cleaned text + applied changes out. */
export interface NormalizerInterface {
	/**
	 * Applies the contraction, abbreviation, and correction substitutions in order, then
	 * collapses whitespace.
	 *
	 * @param text - The raw text to clean
	 * @returns The cleaned text plus every substitution applied
	 * @throws {@link InterpretError} with `TEXT_LIMIT` from the built-in normalizer when raw text exceeds {@link INTERPRET_TEXT_LIMIT} UTF-16 units.
	 */
	normalize(text: string): NormalizeResult
}

/** Represents the `Extractor` stage contract: recipe-agnostic intent classification and exact reader values. */
export interface ExtractorInterface {
	/**
	 * Classifies the intent and returns exact values from the number reader.
	 *
	 * @param text - The text to read
	 * @returns The classified intent plus readable digit and word values, omitting unreadable occurrences
	 */
	extract(text: string): ExtractResult
}

/**
 * Represents the `Clarifier` stage contract: resolve carry-over and computed
 * fields against a set of already-assigned entities, surfacing ambiguities
 * for anything required that stays unresolved.
 */
export interface ClarifierInterface {
	/**
	 * Resolves carry-over and computed fields, admits the result through the recipe's shape,
	 * and surfaces an {@link Ambiguity} for everything the door refused, every value read below
	 * the floor, and every mapped field left to a default or a prior turn while a number nobody
	 * claimed could be its value, with its question from the shape's `description` or the
	 * narrator's `ambiguity.entity` line.
	 *
	 * @remarks
	 * A computation addresses one numeric element of an array-valued field as
	 * `{field}.{index}`, so only a collection of known length has a declarable aggregate.
	 *
	 * @param entities - The entities extraction already assigned
	 * @param recipe - The matched recipe supplying the mappings, computations, and shape
	 * @param context - The cross-turn context carry-over reads from, or `undefined` for none
	 * @param intent - The classified intent, whose domain gates carry-over
	 * @param unclaimed - The numbers read that no mapping's anchor claimed, none when omitted
	 * @returns The resolved entities plus every remaining ambiguity
	 */
	clarify(
		entities: readonly Entity[],
		recipe: Recipe,
		context: InterpretContextInterface | undefined,
		intent: Intent,
		unclaimed?: ReadonlyArray<number | string>,
	): ClarifyResult
}

/** Represents the `Formatter` stage contract: render the refined natural-language prompt for a matched recipe. */
export interface FormatterInterface {
	/**
	 * Renders the refined natural-language prompt for a matched recipe, clause by clause
	 * through the narrator's `prompt.*` lines.
	 *
	 * @param intent - The classified intent supplying the display verb
	 * @param recipe - The matched recipe supplying the prompt's name
	 * @param entities - The resolved entities rendered as the prompt's fields
	 * @param ambiguities - The unresolved fields rendered as the prompt's questions
	 * @returns The refined natural-language prompt
	 */
	format(
		intent: Intent,
		recipe: Recipe,
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
 * {@link Recipe} declared — a mapping, a default, or a
 * {@link ComputedField}. The stage derives no field of its own, so a subject
 * never gains a sibling the recipe author did not ask for.
 */
export interface GeneratorInterface {
	/**
	 * Builds the final subject and definition pair plus its complete field audit, deriving no
	 * field the recipe did not declare.
	 *
	 * @param entities - The fully resolved entities the subject is built from
	 * @param recipe - The matched recipe supplying the mappings and the definition
	 * @returns The built subject and definition, every field mapping, and the mean confidence
	 */
	generate(entities: readonly Entity[], recipe: Recipe): GenerateResult
}

/**
 * Represents the `Narrator` contract — a stateless, total, lexicon-driven rendering
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
	/**
	 * Looks up a two-level `table` and `key` pair in the lexicon's `phrases`, falling back to
	 * `fallback` or to `key`.
	 *
	 * @param table - The phrase table to read
	 * @param key - The phrase key within that table
	 * @param fallback - The phrase to render when the lookup misses. Default: `key`
	 * @returns The looked-up phrase, or the fallback
	 */
	phrase(table: string, key: string, fallback?: string): string
	/**
	 * Renders a field's display label from `labels`, falling back to `formatField`.
	 *
	 * @param field - The field path to label
	 * @returns The field's display label
	 */
	label(field: FieldPath): string
	/**
	 * Interpolates a named `templates` entry against `values`, falling back to an empty string
	 * when the id is absent.
	 *
	 * @param id - The template id to render
	 * @param values - The values the template's placeholders resolve against
	 * @returns The rendered line, or an empty string when no template carries `id`
	 */
	line(id: string, values: Readonly<Record<string, unknown>>): string
	/**
	 * Runs a named formatter over a raw value, catching a throw and falling back to
	 * `String(raw)`.
	 *
	 * @param unit - The formatter name to run
	 * @param raw - The value to format
	 * @returns The formatted value, or `String(raw)` when no formatter returns
	 */
	value(unit: string, raw: unknown): string
	/**
	 * Renders a reasons `Definition` to a one-line, display-neutral description.
	 *
	 * @param definition - The definition to describe
	 * @returns The one-line description
	 */
	describe(definition: Definition): string
	/**
	 * Renders a reasons `ReasonResult` to a one-line, display-neutral description.
	 *
	 * @param result - The result to narrate
	 * @returns The one-line description
	 */
	narrate(result: ReasonResult): string
}

/**
 * Represents the recipe registry — a self-owning, versioned/hashed record-holder with
 * the singular/plural accessor pair and the batch `remove` overloads.
 *
 * @remarks
 * `count` is the registry's lone tally. `remove`'s batch form is
 * all-or-nothing: any missing id in the list leaves the collection untouched
 * and returns `false`.
 */
export interface RecipeManagerInterface {
	readonly emitter: EmitterInterface<RecipeManagerEventMap>
	readonly count: number
	/**
	 * Reports whether a recipe with the given id has been added.
	 *
	 * @param id - The record id to look for
	 * @returns True if a recipe with that id has been added; false otherwise
	 */
	has(id: string): boolean
	/**
	 * Looks up one added recipe record by id — the singular accessor.
	 *
	 * @param id - The record id to look up
	 * @returns The added recipe record, or `undefined` when none carries that id
	 */
	recipe(id: string): RecipeRecord | undefined
	/**
	 * Lists every added recipe record — the plural accessor.
	 *
	 * @returns Every added recipe record, in insertion order
	 */
	recipes(): readonly RecipeRecord[]
	/**
	 * Adds, or re-adds, one recipe from its data, and emits `add`.
	 *
	 * @param recipe - The recipe data to hold
	 * @param options - The record id overriding `recipe.id`. Default: `recipe.id`
	 * @returns The versioned, content-hashed record the registry holds
	 */
	add(recipe: Recipe, options?: RecordOptions): RecipeRecord
	/**
	 * Removes the listed recipes by id, one recipe by id, or every recipe, and emits
	 * `remove` per removed id.
	 *
	 * @param ids - The record ids to remove, all-or-nothing; omit the argument to remove every recipe
	 * @returns True if every listed id was added; false otherwise
	 */
	remove(ids: readonly string[]): boolean
	remove(id: string): boolean
	remove(): void
	/**
	 * Tears the recipe registry down idempotently — clears the collection, emits
	 * `destroy`, then destroys the emitter last.
	 */
	destroy(): void
}

/**
 * Represents the subject registry — a self-owning, versioned/hashed record-holder
 * that mints its own record ids (a `Subject` carries none).
 */
export interface SubjectManagerInterface {
	readonly emitter: EmitterInterface<SubjectManagerEventMap>
	readonly count: number
	/**
	 * Reports whether a subject with the given id has been added.
	 *
	 * @param id - The record id to look for
	 * @returns True if a subject with that id has been added; false otherwise
	 */
	has(id: string): boolean
	/**
	 * Looks up one added subject record by id — the singular accessor.
	 *
	 * @param id - The record id to look up
	 * @returns The added subject record, or `undefined` when none carries that id
	 */
	subject(id: string): SubjectRecord | undefined
	/**
	 * Lists every added subject record — the plural accessor.
	 *
	 * @returns Every added subject record, in insertion order
	 */
	subjects(): readonly SubjectRecord[]
	/**
	 * Adds one subject, minting a fresh record id when the caller supplies none, and emits
	 * `add`.
	 *
	 * @param subject - The subject to hold
	 * @param options - The record id overriding the minted one. Default: a freshly minted id
	 * @returns The versioned, content-hashed record the registry holds
	 */
	add(subject: Subject, options?: RecordOptions): SubjectRecord
	/**
	 * Removes the listed subjects by id, one subject by id, or every subject, and emits
	 * `remove` per removed id.
	 *
	 * @param ids - The record ids to remove, all-or-nothing; omit the argument to remove every subject
	 * @returns True if every listed id was added; false otherwise
	 */
	remove(ids: readonly string[]): boolean
	remove(id: string): boolean
	remove(): void
	/**
	 * Tears the subject registry down idempotently — clears the collection, emits
	 * `destroy`, then destroys the emitter last.
	 */
	destroy(): void
}

/** Represents the definition registry — a self-owning, versioned/hashed record-holder. */
export interface DefinitionManagerInterface {
	readonly emitter: EmitterInterface<DefinitionManagerEventMap>
	readonly count: number
	/**
	 * Reports whether a definition with the given id has been added.
	 *
	 * @param id - The record id to look for
	 * @returns True if a definition with that id has been added; false otherwise
	 */
	has(id: string): boolean
	/**
	 * Looks up one added definition record by id — the singular accessor.
	 *
	 * @param id - The record id to look up
	 * @returns The added definition record, or `undefined` when none carries that id
	 */
	definition(id: string): DefinitionRecord | undefined
	/**
	 * Lists every added definition record — the plural accessor.
	 *
	 * @returns Every added definition record, in insertion order
	 */
	definitions(): readonly DefinitionRecord[]
	/**
	 * Adds, or re-adds, one definition, and emits `add`.
	 *
	 * @param definition - The definition to hold
	 * @param options - The record id overriding `definition.id`. Default: `definition.id`
	 * @returns The versioned, content-hashed record the registry holds
	 */
	add(definition: Definition, options?: RecordOptions): DefinitionRecord
	/**
	 * Removes the listed definitions by id, one definition by id, or every definition, and
	 * emits `remove` per removed id.
	 *
	 * @param ids - The record ids to remove, all-or-nothing; omit the argument to remove every definition
	 * @returns True if every listed id was added; false otherwise
	 */
	remove(ids: readonly string[]): boolean
	remove(id: string): boolean
	remove(): void
	/**
	 * Tears the definition registry down idempotently — clears the collection, emits
	 * `destroy`, then destroys the emitter last.
	 */
	destroy(): void
}

/**
 * Represents the cross-turn interpretation context: a capped, replayable history plus the
 * subject/definition registries carry-over reads from.
 *
 * @remarks
 * `previous()` returns the ring buffer newest-last, capped at the
 * configured `history` (default 0, no carry). `entities()`
 * flattens every entity recorded across the buffered history, most recent
 * last — the read carry-over consults. `add` pushes one completed
 * {@link Interpretation}, dropping the oldest entry after the cap is reached.
 */
export interface InterpretContextInterface {
	readonly emitter: EmitterInterface<InterpretContextEventMap>
	readonly session: string | undefined
	readonly subjects: SubjectManagerInterface
	readonly definitions: DefinitionManagerInterface
	/**
	 * Lists the buffered history, newest last, capped at `history`.
	 *
	 * @returns Every buffered interpretation, newest last
	 */
	previous(): readonly Interpretation[]
	/**
	 * Flattens every entity recorded across the buffered history, most recent last.
	 *
	 * @returns Every entity across the buffered history, most recent last
	 */
	entities(): readonly Entity[]
	/**
	 * Pushes one completed {@link Interpretation}, dropping the oldest entry past the cap.
	 *
	 * @param result - The completed interpretation to buffer
	 */
	add(result: Interpretation): void
	/**
	 * Resets the history, the subject registry, and the definition registry without
	 * destroying the context.
	 */
	clear(): void
	/**
	 * Tears the context down idempotently — the subject registry, then the definition
	 * registry, then the emitter last.
	 */
	destroy(): void
}

/**
 * Represents the interpretation orchestrator — the sole public entry point, mirroring
 * `reasons`' `Reason` orchestrator shape.
 *
 * @remarks
 * `interpret` is genuinely synchronous — it returns its
 * {@link Interpretation} directly, never a `Promise`. `add` / `remove` /
 * `recipe` / `recipes` name the same acts as the
 * {@link RecipeManagerInterface} they delegate to, and expose plain
 * {@link Recipe} data rather than the richer versioned record — which is why
 * `add` returns `void` where `RecipeManagerInterface#add` returns the record
 * it minted. `remove` carries the same batch overloads as that delegate, so
 * the shared verb promises no form the orchestrator lacks. `describe` /
 * `narrate` are the reverse direction — structure-to-prose, complementing
 * (never duplicating) raters' `describe*` family. After `destroy()` every
 * method except the `emitter` getter and `destroy` itself throws
 * `InterpretError('DESTROYED', …)`; `destroy()` is idempotent, tears down the
 * recipe registry and the context it constructed itself — never a `context`
 * the caller supplied, which outlives this orchestrator — and tears the
 * emitter down last.
 */
export interface InterpretInterface {
	readonly emitter: EmitterInterface<InterpretEventMap>
	/**
	 * Runs the `[normalize, extract, clarify, format, generate]` pipeline over raw text,
	 * returning a complete or a visibly incomplete result.
	 *
	 * @param text - The raw text to interpret
	 * @returns The full, replayable outcome of the run
	 */
	interpret(text: string): Interpretation
	/**
	 * Adds one recipe, and emits `add`.
	 *
	 * @param recipe - The recipe data to add
	 */
	add(recipe: Recipe): void
	/**
	 * Removes the listed recipes by id, one recipe by id, or every recipe.
	 *
	 * @param ids - The recipe ids to remove, all-or-nothing; omit the argument to remove every recipe
	 * @returns True if every listed id was added; false otherwise
	 */
	remove(ids: readonly string[]): boolean
	remove(id: string): boolean
	remove(): void
	/**
	 * Looks up one added recipe's plain data by id.
	 *
	 * @param id - The recipe id to look up
	 * @returns The recipe's plain data, or `undefined` when none carries that id
	 */
	recipe(id: string): Recipe | undefined
	/**
	 * Lists every added recipe's plain data.
	 *
	 * @returns Every added recipe's plain data, in insertion order
	 */
	recipes(): readonly Recipe[]
	/**
	 * Renders a reasons `Definition` to a one-line, display-neutral description.
	 *
	 * @param definition - The definition to describe
	 * @returns The one-line description
	 */
	describe(definition: Definition): string
	/**
	 * Renders a reasons `ReasonResult` to a one-line, display-neutral description.
	 *
	 * @param result - The result to narrate
	 * @returns The one-line description
	 */
	narrate(result: ReasonResult): string
	/**
	 * Tears the orchestrator down idempotently — the recipe registry, the context it
	 * constructed itself, then the emitter last.
	 */
	destroy(): void
}
