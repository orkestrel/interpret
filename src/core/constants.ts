import type { InterpretErrorCode, InterpretStage, Lexicon, ProvenanceCategory } from './types.js'

// Frozen default data for the interprets module — the sole home for its
// module-scope literal defaults. Every vocabulary map here is intentionally
// NEUTRAL and small: domain worldview (insurance verbs, en-US misspelling
// corrections, business domains) is the caller's business, supplied through
// options rather than baked in here.

/**
 * Names the default `similarity` for `createInterpret` / `matchAlias` — the
 * fuzzy alias-match score threshold (0..1).
 *
 * @remarks
 * Domain-qualified (not a bare `DEFAULT_SIMILARITY`) so the name stays free
 * of collision on the shared `@src/core` barrel, mirroring the
 * `DEFAULT_REASON_BAIL` precedent.
 */
export const DEFAULT_INTERPRET_SIMILARITY = 0.8

/**
 * Names the default `floor` for `createInterpret` / `matchTemplate` — the
 * minimum intent confidence a template match (or the classified intent itself) must
 * clear.
 */
export const DEFAULT_INTERPRET_FLOOR = 0.3

/** Names the default `history` cap for an `InterpretContext`'s `previous()` ring buffer. */
export const DEFAULT_INTERPRET_HISTORY = 16

/** Names the confidence assigned to an exact keyword-proximity entity match. */
export const CONFIDENCE_EXACT = 1

/** Names the confidence assigned to an exact alias-phrase entity match. */
export const CONFIDENCE_ALIAS = 0.9

/** Names the confidence assigned when a single entity mapping collects every extracted number. */
export const CONFIDENCE_COLLECT = 0.9

/** Names the confidence assigned to a positional (order-based) entity match fallback. */
export const CONFIDENCE_POSITIONAL = 0.7

/** Names the confidence assigned to a same-domain carried-over field. */
export const CONFIDENCE_CARRIED = 0.7

/** Names the confidence assigned to a template default fill. */
export const CONFIDENCE_DEFAULT = 1

/** Names the confidence assigned to a successfully resolved computed field. */
export const CONFIDENCE_COMPUTED = 0.9

/**
 * Holds the numeric-entity extraction pattern shared by `extractNumbers` and
 * `assignEntities` — an optional leading `$`, thousands-comma-grouped digits,
 * an optional decimal fraction, and an optional trailing `%`.
 *
 * @remarks
 * Carries the global flag, so every call site builds a fresh `RegExp` from
 * `.source` / `.flags` (mirrors the core-root `PLACEHOLDER_PATTERN` pattern)
 * rather than sharing this instance's mutable `lastIndex` across scans.
 */
export const NUMBER_PATTERN = /(?:\$\s*)?(\d+(?:,\d{3})*(?:\.\d+)?)\s*%?/g

/**
 * Lists the prototype-pollution-unsafe field-path segments — `setField` refuses
 * to write ANY path containing one, returning its input unchanged.
 */
export const UNSAFE_FIELD_SEGMENTS: readonly string[] = Object.freeze([
	'__proto__',
	'prototype',
	'constructor',
])

/**
 * Holds the neutral built-in contraction expansions for `Normalizer` — small on
 * purpose; callers merge their own map over this one.
 */
export const DEFAULT_CONTRACTIONS: Readonly<Record<string, string>> = Object.freeze({
	"can't": 'cannot',
	"won't": 'will not',
	"it's": 'it is',
	"don't": 'do not',
})

/**
 * Holds the neutral default `Lexicon` a `Narrator` merges caller data over.
 *
 * @remarks
 * `phrases` and `labels` are empty — there is no built-in vocabulary and no
 * label override, because wording is mechanism rather than policy.
 * `templates` carries the structural, display-neutral strings both directions
 * would otherwise hardcode. The reverse direction is keyed by
 * `{table}.{reasoning}` per reasons kind, plus `result.quantitative.failed`
 * for the quantitative-result failure suffix and `subject.fields` /
 * `subject.empty` for `describeSubject`. The forward direction is keyed by
 * `prompt.*` for the `Formatter`'s clause assembly and `ambiguity.*` for the
 * questions a `Clarifier` and the orchestrator's match gates raise. Every
 * string is a plain @orkestrel/template `fillTemplate` template —
 * `{{name}}`-style placeholders resolved against the caller-supplied `values`
 * record, so a caller reworded any line by overriding its key.
 */
export const DEFAULT_LEXICON: Lexicon = Object.freeze({
	phrases: Object.freeze({}),
	labels: Object.freeze({}),
	templates: Object.freeze({
		'definition.quantitative': '{{name}}: {{count}} factor group(s)',
		'definition.logical': '{{name}}: {{count}} rule(s), strategy {{strategy}}',
		'definition.symbolic': '{{name}}: solve {{count}} equation(s)',
		'definition.inferential':
			'{{name}}: {{facts}} fact(s)/{{inferences}} inference(s), {{strategy}}',
		'result.quantitative': 'scored {{value}} across {{count}} group(s)',
		'result.quantitative.failed': '; failed: {{errors}}',
		'result.logical': '{{status}}: {{count}} rule(s)',
		'result.symbolic': 'solved {{solved}}',
		'result.inferential': 'derived {{count}} fact(s)',
		'subject.fields': 'with {{fields}}',
		'subject.empty': 'with no fields',
		'prompt.base': '{{verb}} {{name}}',
		'prompt.entities': ' with {{fields}}',
		'prompt.defaults': ' (defaults: {{fields}})',
		'prompt.ambiguities': ' needed: {{questions}}',
		'ambiguity.entity': 'What is your {{entity}}?',
		'ambiguity.intent': 'Which domain and action did you mean?',
		'ambiguity.confidence': 'Which did you mean? The intent was too weak to act on.',
	}),
})

/**
 * Lists every `ProvenanceCategory` literal, frozen — the one home the result guards
 * check the union from, so a new category added to `types.ts` is added here
 * rather than silently rejected by `isProvenance`.
 */
export const PROVENANCE_CATEGORIES: readonly ProvenanceCategory[] = Object.freeze([
	'extracted',
	'carried',
	'default',
	'computed',
	'subject',
])

/**
 * Lists every `InterpretStage` literal in pipeline order, frozen — the one home
 * the result guards check the union from.
 */
export const INTERPRET_STAGES: readonly InterpretStage[] = Object.freeze([
	'normalize',
	'extract',
	'clarify',
	'format',
	'generate',
])

/**
 * Lists every `InterpretErrorCode` literal, frozen — the one home the result guards
 * check the union from.
 */
export const INTERPRET_ERROR_CODES: readonly InterpretErrorCode[] = Object.freeze([
	'NORMALIZE_FAILED',
	'EXTRACT_FAILED',
	'CLARIFY_FAILED',
	'FORMAT_FAILED',
	'GENERATE_FAILED',
	'NO_TEMPLATE',
	'LOW_CONFIDENCE',
	'DESTROYED',
])
