import type {
	InterpretErrorCode,
	InterpretStage,
	Lexicon,
	NumberForeign,
	NumberUnreadable,
	NumberRefusalReason,
	ProvenanceCategory,
} from './types.js'

// Frozen default data for the interprets module — the sole home for its
// module-scope literal defaults. Every vocabulary map here is intentionally
// neutral and small: domain worldview (insurance verbs, en-US misspelling
// corrections, business domains) is the caller's business, supplied through
// options rather than baked in here.

/**
 * Names the default `floor` for `createInterpret` and `matchRecipe`, 0.3 — the
 * minimum intent confidence a recipe match, or the classified intent itself, must
 * clear.
 */
export const DEFAULT_INTERPRET_FLOOR = 0.3

/** Names the default `history` cap for an `InterpretContext`'s `previous()` ring buffer, 0 (carry is opt-in). */
export const DEFAULT_INTERPRET_HISTORY = 0

/** Names the confidence assigned to an exact keyword-proximity entity match, 1. */
export const CONFIDENCE_EXACT = 1

/** Names the confidence assigned to an exact alias-phrase entity match, 0.9. */
export const CONFIDENCE_ALIAS = 0.9

/**
 * Names the confidence assigned when a single entity mapping collects every extracted
 * number, 0.9.
 */
export const CONFIDENCE_COLLECT = 0.9

/** Names the confidence assigned to a same-domain carried-over field, 0.7. */
export const CONFIDENCE_CARRIED = 0.7

/** Names the confidence assigned to a default the door filled, 1. */
export const CONFIDENCE_DEFAULT = 1

/** Names the most a computed field may be trusted, 0.9: its inputs can only lower it. */
export const CONFIDENCE_COMPUTED = 0.9

/**
 * Holds what ends a clause: closing punctuation, a comma or dot no digit follows, a newline, and
 * a joining word. A colon stays inside, because "rate: 6" says one thing.
 *
 * @remarks
 * Carries the global flag, so every call site builds a fresh `RegExp` from it.
 */
export const CLAUSE_BREAK_PATTERN = /[!?;\n]|[.,](?!\d)|\b(?:and|but|while|though|although)\b/gi

/**
 * Holds the digit-only pattern for `extractNumbers`: an optional currency prefix, grouped digits,
 * an optional decimal fraction, and an optional trailing `%`.
 *
 * @remarks
 * Carries the global flag, so every call site builds a fresh `RegExp` from
 * `.source` / `.flags` (mirrors the core-root `PLACEHOLDER_PATTERN` pattern)
 * rather than sharing this instance's mutable `lastIndex` across scans.
 */
export const NUMBER_PATTERN = /(?:\$\s*)?(\d+(?:,\d{3})*(?:\.\d+)?)\s*%?/g

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
 * `subject.empty` for `renderSubject`. The forward direction is keyed by
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
	'proposed',
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

/** Caps raw text accepted by the built-in normalizer at 65,536 UTF-16 units. */
export const INTERPRET_TEXT_LIMIT = 65_536

/**
 * Lists every `InterpretErrorCode` literal, frozen — the one home the result guards
 * check the union from.
 */
export const INTERPRET_ERROR_CODES: readonly InterpretErrorCode[] = Object.freeze([
	'TEXT_LIMIT',
	'NORMALIZE_FAILED',
	'EXTRACT_FAILED',
	'CLARIFY_FAILED',
	'FORMAT_FAILED',
	'GENERATE_FAILED',
	'NO_RECIPE',
	'LOW_CONFIDENCE',
	'DEFINITION',
	'DESTROYED',
])

// === The number reader's vocabulary: general English, no domain's

/**
 * Holds the shapes `NumberReader` recognizes a number by.
 *
 * @remarks
 * `admitted` checks the whole digit-holding token. The currency, digit, and word scanners carry
 * the sticky flag, so their call sites build a fresh `RegExp` from each.
 */
export const READER_SHAPES = Object.freeze({
	admitted:
		/^(?:(?:(?:us\$|usd|\$)\s?)?(?:(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|\.\d+)(?:%|k|mil|mill|million|thousand|grand|ish)?|(?:us\$|usd|\$)\s?(?:(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|\.\d+)(?:m|mm|b|bn))$/i,
	currency: /(?:us\$|c\$|a\$|usd\s?(?=\.?\d)|\$|\u20ac|\u00a3|\u00a5)\s?(?=\.?\d)/iy,
	digit: /\d+(?:,\d+)*(?:\.\d+)?|\.\d+/y,
	word: /[a-z]+(?:'[a-z]+)*/iy,
})

/** Holds the values number words and scale words read to. */
export const READER_SCALES = Object.freeze({
	digit: Object.freeze<Record<string, number>>({
		thousand: 1e3,
		k: 1e3,
		grand: 1e3,
		hundred: 100,
		million: 1e6,
		mil: 1e6,
		mill: 1e6,
		mn: 1e6,
		billion: 1e9,
		bn: 1e9,
	}),
	word: Object.freeze<Record<string, number>>({
		thousand: 1e3,
		grand: 1e3,
		million: 1e6,
		mil: 1e6,
		billion: 1e9,
	}),
	units: Object.freeze<Record<string, number>>({
		zero: 0,
		one: 1,
		two: 2,
		three: 3,
		four: 4,
		five: 5,
		six: 6,
		seven: 7,
		eight: 8,
		nine: 9,
		ten: 10,
		eleven: 11,
		twelve: 12,
		thirteen: 13,
		fourteen: 14,
		fifteen: 15,
		sixteen: 16,
		seventeen: 17,
		eighteen: 18,
		nineteen: 19,
	}),
	tens: Object.freeze<Record<string, number>>({
		twenty: 20,
		thirty: 30,
		forty: 40,
		fifty: 50,
		sixty: 60,
		seventy: 70,
		eighty: 80,
		ninety: 90,
	}),
})

/** Holds the word lists `NumberReader` reads a number's surroundings by. */
export const READER_WORDS = Object.freeze({
	synonyms: Object.freeze<Record<string, string>>({
		hr: 'hour',
		hrs: 'hour',
		min: 'minute',
		mins: 'minute',
		yr: 'year',
		yrs: 'year',
		mo: 'month',
		mos: 'month',
		mth: 'month',
		mths: 'month',
		wk: 'week',
		wks: 'week',
		kilo: 'kg',
		kilos: 'kg',
		kgs: 'kg',
		kilogram: 'kg',
		kilograms: 'kg',
		kilogramme: 'kg',
		kilogrammes: 'kg',
		kms: 'km',
		kilometer: 'km',
		kilometers: 'km',
		kilometre: 'km',
		kilometres: 'km',
		gal: 'gallon',
		gals: 'gallon',
		sq: 'square',
		ft: 'foot',
		feet: 'foot',
		footage: 'foot',
		bdrm: 'bedroom',
		bdrms: 'bedroom',
		people: 'person',
		persons: 'person',
		ppl: 'person',
	}),
	per: Object.freeze(new Set('per a an each every /'.split(' '))),
	months: Object.freeze(
		new Set(
			'january february march april may june july august september october november december jan feb mar apr jun jul aug sep sept oct nov dec'.split(
				' ',
			),
		),
	),
	yearCues: Object.freeze(
		new Set(
			'in since from by until till year during back before after of for spring summer fall autumn winter early late mid fiscal fy class'.split(
				' ',
			),
		),
	),
	references: Object.freeze(
		new Set(
			'ext extension x no number phone tel telephone fax cell mobile call text order invoice ticket case ref reference account acct id zip zipcode code apt apartment unit flat suite ste room rm building bldg floor page pg version ver model part route hwy highway box po pin step option phase line gate dock bay lot site tier level group batch employee badge form chapter'.split(
				' ',
			),
		),
	),
	referenceLinks: Object.freeze(new Set('is : = # number no'.split(' '))),
	streets: Object.freeze(
		new Set(
			'street st avenue ave road rd boulevard blvd drive dr lane ln way court ct place pl terrace'.split(
				' ',
			),
		),
	),
	generalUnits: Object.freeze(
		new Set(
			'second minute hour day week month year decade kg gram pound lb lbs ton tonne ounce oz km mile meter metre foot inch yard acre hectare liter litre gallon sqft'.split(
				' ',
			),
		),
	),
	timeUnits: Object.freeze(new Set('second minute hour day week month year decade'.split(' '))),
	calendarPeriods: Object.freeze(new Set('day week month year'.split(' '))),
	countedOver: Object.freeze(new Set('for over'.split(' '))),
	foreignCurrency: Object.freeze(
		new Set('euro eur gbp cad aud yen rupee peso franc sterling cent'.split(' ')),
	),
	dollars: Object.freeze(new Set('dollars dollar bucks buck usd'.split(' '))),
	hedgesBefore: Object.freeze(
		new Set(
			'about around approximately approx roughly nearly almost estimated under maximum minimum max somewhere'.split(
				' ',
			),
		),
	),
	hedgesNear: Object.freeze(new Set('maybe perhaps probably possibly'.split(' '))),
	hedgePairs: Object.freeze(
		new Set(
			'close_to up_to at_least at_most no_more no_less more_than less_than fewer_than just_under just_over well_over slightly_over little_over something_like not_exceeding'.split(
				' ',
			),
		),
	),
	doubtPairs: Object.freeze(
		new Set('i_think i_guess i_believe not_sure might_be could_be may_be'.split(' ')),
	),
	hedgesAfter: Object.freeze(new Set('ish max tops minimum something odd'.split(' '))),
	hedgeAfterPairs: Object.freeze(
		new Set('or_so or_thereabouts give_or at_most at_least or_more or_less'.split(' ')),
	),
	corrections: Object.freeze(
		new Set(
			'wait actually correction scratch rather instead mistake mistaken oops typo meant previously formerly previous prior former ago been old original originally initially earlier'.split(
				' ',
			),
		),
	),
	correctionPairs: Object.freeze(new Set('used_to make_that i_mean hang_on'.split(' '))),
	suspectBefore: Object.freeze(new Set('last past not'.split(' '))),
	offsetBefore: Object.freeze(new Set('in within after'.split(' '))),
	verbLastBefore: Object.freeze(
		new Set("will would should could might may can to it'll they'll we'll that'll".split(' ')),
	),
	putInBefore: Object.freeze(new Set('put puts putting logged clocked'.split(' '))),
	changes: Object.freeze(
		new Set(
			'was were now new old changed change update updated raised lowered increased decreased reduced dropped went going up down instead rather actually before then originally but'.split(
				' ',
			),
		),
	),
	compositeCues: Object.freeze(new Set('twice thrice double triple respectively'.split(' '))),
	loose: Object.freeze(
		new Set('couple few several handful dozens hundreds thousands pair trio'.split(' ')),
	),
	magnitudes: Object.freeze(new Set('hundred thousand grand million k'.split(' '))),
	gluedScales: Object.freeze(new Set('k mil mill million thousand grand'.split(' '))),
	functions: Object.freeze(
		new Set(
			'a an the this that these those my our your his her their its it i we you he she they me us them and or but plus so if then than while though although because as at by for from in into of off on onto out over per to under up via with within without about around between before after during until till through across is are was were be been being am do does did has have had will would should can could may might must shall need needs want wants get gets getting got take takes taking took make makes making made use using used put puts pay pays paying paid spend spending charge charges charging cost costs running run runs not no yes also too very just only still now here there what which who how when where why each every all both some any more most much many other another please thanks thank hi hello today tomorrow yesterday tonight next again however looking trying hoping going gonna wondering calculate compute estimate figure work quote extra additional separate different regular'.split(
				' ',
			),
		),
	),
	abbreviations: Object.freeze(
		new Set(
			'sq ft ext approx no mr mrs ms dr st vs est apt ste hrs hr yrs yr mos mo mins min wk wks kg kgs km kms lb lbs oz gal gals'.split(
				' ',
			),
		),
	),
	notOneBefore: Object.freeze(
		new Set('no this that the another which each every any a an my our some only'.split(' ')),
	),
	notOneAfter: Object.freeze(new Set('of more last thing question off'.split(' '))),
	workOut: Object.freeze(new Set('work worked working works figure figured figuring'.split(' '))),
	dimensions: Object.freeze(new Set(['x', '\u00d7', 'by', 'times'])),
	alternatives: Object.freeze(new Set('range to or'.split(' '))),
	sentenceEnds: Object.freeze(new Set('. ! ? ;'.split(' '))),
	segmentMarks: Object.freeze(new Set(', : ( ) and but plus while though although'.split(' '))),
	ageBefore: Object.freeze(new Set("age aged turned turning i'm im he's she's".split(' '))),
})

/** Lists every `NumberUnreadable` reason, frozen, for the shape that describes a read number. */
export const NUMBER_UNREADABLE_REASONS: readonly NumberUnreadable[] = Object.freeze([
	'undeclared',
	'fraction',
	'foreign currency',
	'grouping',
	'signed',
	'shorthand',
	'spoken',
	'joined',
	'frequency',
	'loose',
	'range',
	'dimensions',
	'overflow',
	'precision',
])

/** Limits the refusal records carried by one compilation or interpretation to 32. */
export const NUMBER_REFUSAL_LIMIT = 32

/** Lists the frozen vocabulary of first refusal decisions described by `NumberRefusalReason`. */
export const NUMBER_REFUSAL_REASONS: readonly NumberRefusalReason[] = Object.freeze([
	'following-word',
	'unreadable',
	'anchor-tie',
	'correction',
	'negation',
	'unanchored',
	'collection',
])

/** Lists every `NumberForeign` kind, frozen, for the shape that describes a read number. */
export const NUMBER_FOREIGN_KINDS: readonly NumberForeign[] = Object.freeze([
	'plan',
	'phone',
	'date',
	'time',
	'identifier',
	'ordinal',
	'list',
	'age',
	'past',
	'period',
	'reference',
	'zip',
	'address',
	'year',
])
