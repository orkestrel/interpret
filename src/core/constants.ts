import type { Lexicon } from './types.js'

// Frozen default data for the interprets module (AGENTS §5 — constants are
// UPPER_SNAKE_CASE data, the sole home for module-scope literal defaults).
// Every vocabulary map here is intentionally NEUTRAL and small — domain
// worldview (insurance verbs, en-US misspelling corrections, business
// domains) is the caller's business, supplied via options (AGENTS-flagged
// scsr defect: a "generic" core module baked in ~100 hardcoded corrections).

/**
 * Default `similarity` for `createInterpret` / `matchAlias` — the fuzzy
 * alias-match score threshold (0..1).
 *
 * @remarks
 * Domain-qualified (not a bare `DEFAULT_SIMILARITY`) so the name stays free
 * of collision on the shared `@src/core` barrel, mirroring the
 * `DEFAULT_REASON_BAIL` precedent.
 */
export const DEFAULT_INTERPRET_SIMILARITY = 0.8

/**
 * Default `floor` for `createInterpret` / `matchTemplate` — the minimum
 * intent confidence a template match (or the classified intent itself) must
 * clear.
 */
export const DEFAULT_INTERPRET_FLOOR = 0.3

/** Default `history` cap for an `InterpretContext`'s `previous()` ring buffer. */
export const DEFAULT_INTERPRET_HISTORY = 16

/** Default `id` for an `Interpret` orchestrator. */
export const INTERPRET_ID = 'interpret'

/** Confidence assigned to an exact keyword-proximity entity match. */
export const CONFIDENCE_EXACT = 1

/** Confidence assigned to an exact alias-phrase entity match. */
export const CONFIDENCE_ALIAS = 0.9

/** Confidence assigned when a single entity mapping collects every extracted number. */
export const CONFIDENCE_COLLECT = 0.9

/** Confidence assigned to a positional (order-based) entity match fallback. */
export const CONFIDENCE_POSITIONAL = 0.7

/** Confidence assigned to a same-domain carried-over field. */
export const CONFIDENCE_CARRIED = 0.7

/** Confidence assigned to a template default fill. */
export const CONFIDENCE_DEFAULT = 1

/** Confidence assigned to a successfully resolved computed field. */
export const CONFIDENCE_COMPUTED = 0.9

/**
 * The numeric-entity extraction pattern shared by `extractNumbers` and
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
 * Neutral built-in contraction expansions for `Normalizer` — small on
 * purpose; callers merge their own map over this one.
 */
export const DEFAULT_CONTRACTIONS: Readonly<Record<string, string>> = Object.freeze({
	"can't": 'cannot',
	"won't": 'will not',
	"it's": 'it is',
	"don't": 'do not',
})

/** Neutral built-in abbreviation expansions for `Normalizer` — empty by default. */
export const DEFAULT_ABBREVIATIONS: Readonly<Record<string, string>> = Object.freeze({})

/** Neutral built-in misspelling corrections for `Normalizer` — empty by default. */
export const DEFAULT_CORRECTIONS: Readonly<Record<string, string>> = Object.freeze({})

/** Neutral built-in action-verb vocabulary for `Extractor#extract`'s intent classification — empty by default. */
export const DEFAULT_ACTIONS: Readonly<Record<string, string>> = Object.freeze({})

/** Neutral built-in domain-keyword vocabulary for `Extractor#extract`'s intent classification — empty by default. */
export const DEFAULT_DOMAINS: Readonly<Record<string, readonly string[]>> = Object.freeze({})

/** Neutral built-in intent-verb phrasing for `Formatter#format` — empty by default. */
export const DEFAULT_VERBS: Readonly<Record<string, string>> = Object.freeze({})

/**
 * The neutral default `Lexicon` a `Narrator` merges caller data over.
 *
 * @remarks
 * `phrases` and `labels` are empty — there is no built-in vocabulary or
 * label overrides (AGENTS §21 mechanism-never-policy). `templates` carries
 * the structural, display-neutral strings the reverse helpers formerly
 * hardcoded, keyed by
 * `{table}.{reasoning}` for the four reasons kinds, `result.quantitative.failed`
 * for the quantitative-result failure suffix, and `subject.fields` /
 * `subject.empty` for `describeSubject`. Every string is a plain
 * `interpolateMessage` template — `{{name}}`-style placeholders resolved
 * against the caller-supplied `values` record.
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
	}),
})
