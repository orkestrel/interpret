import type {
	FrameName,
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
 * Holds the general words a `Narrator` merges an override over: complete, in English, and with
 * no domain's noun.
 */
export const DEFAULT_LEXICON: Lexicon = Object.freeze({
	comparisons: Object.freeze({
		equals: Object.freeze({ holds: 'is', fails: 'is not' }),
		not: Object.freeze({ holds: 'is not', fails: 'is' }),
		above: Object.freeze({ holds: 'is more than', fails: 'is not more than' }),
		below: Object.freeze({ holds: 'is less than', fails: 'is not less than' }),
		from: Object.freeze({ holds: 'is at least', fails: 'is less than' }),
		to: Object.freeze({ holds: 'is at most', fails: 'is more than' }),
		any: Object.freeze({ holds: 'is one of', fails: 'is not one of' }),
		none: Object.freeze({ holds: 'is not one of', fails: 'is one of' }),
		between: Object.freeze({ holds: 'is in the range', fails: 'is outside the range' }),
		outside: Object.freeze({ holds: 'is outside the range', fails: 'is in the range' }),
	}),
	checks: Object.freeze({ met: 'met', unmet: 'not met', unread: 'not known' }),
	rules: Object.freeze({
		met: 'applies',
		unmet: 'does not apply',
		unread: 'cannot be decided',
	}),
	verdicts: Object.freeze({
		met: 'holds',
		unmet: 'does not hold',
		unread: 'cannot be decided',
	}),
	aggregations: Object.freeze({
		sum: 'Total',
		product: 'Product',
		average: 'Average',
		minimum: 'Lowest',
		maximum: 'Highest',
	}),
	faults: Object.freeze({
		type: 'not a value that can be used',
		missing: 'not known',
		constraint: 'not a value that is allowed',
		variant: 'in none of the allowed forms',
		oneOf: 'not in exactly one of the allowed forms',
		extra: 'not expected',
		hidden: 'hidden and cannot be read',
	}),
	expected: Object.freeze({
		string: 'text',
		date: 'a date',
		number: 'a number',
		integer: 'a whole number',
		boolean: 'true or false',
		null: 'none',
		literal: 'one of its allowed values',
		array: 'a list',
		object: 'a record',
		union: 'one of its allowed forms',
		json: 'plain data',
		shape: 'a shape description',
		function: 'a function',
		undefined: 'absent',
	}),
	constraints: Object.freeze({
		min: 'at least {{limit}}',
		over: 'more than {{limit}}',
		max: 'at most {{limit}}',
		under: 'less than {{limit}}',
		pattern: 'in the expected form',
		date: 'a valid date',
		integer: 'a whole number',
	}),
	lengths: Object.freeze({
		min: 'a length of at least {{limit}}',
		max: 'a length of at most {{limit}}',
	}),
	operations: Object.freeze({
		add: '{{left}} + {{right}}',
		subtract: '{{left}} - {{right}}',
		multiply: '{{left}} × {{right}}',
		divide: '{{left}} ÷ {{right}}',
		percentage: '{{right}}% of {{left}}',
		minimum: 'the lower of {{left}} and {{right}}',
		maximum: 'the higher of {{left}} and {{right}}',
		average: 'the average of {{left}} and {{right}}',
		power: '{{left}} to the power of {{right}}',
		round: '{{left}} rounded to a whole number',
		ceil: '{{left}} rounded up to a whole number',
		floor: '{{left}} rounded down to a whole number',
		abs: 'the absolute value of {{left}}',
	}),
	transforms: Object.freeze({
		add: 'plus {{operand}}',
		subtract: 'minus {{operand}}',
		multiply: 'times {{operand}}',
		divide: 'divided by {{operand}}',
		percentage: '{{operand}}% of it',
		minimum: 'the lower of it and {{operand}}',
		maximum: 'the higher of it and {{operand}}',
		average: 'averaged with {{operand}}',
		power: 'to the power of {{operand}}',
		round: 'rounded to a whole number',
		ceil: 'rounded up to a whole number',
		floor: 'rounded down to a whole number',
		abs: 'without its sign',
	}),
	refusals: Object.freeze({
		'preceding-word': '{{text}} was not taken, because the way it is written makes it uncertain',
		'following-word': '{{text}} was not taken, because what comes after it makes it uncertain',
		unreadable: '{{text}} was not taken, because it could not be read as an exact number',
		'anchor-tie':
			'{{text}} was not taken, because it is not clear which number goes with which value',
		'anchor-conflict':
			'{{text}} was not taken, because the text gives more than one number for the same value',
		correction: '{{text}} was not taken, because the text may be correcting or replacing it',
		negation: '{{text}} was not taken, because the same part of the text holds a negation',
		unanchored: '{{text}} was not taken, because it could not be tied to a value',
		collection: '{{text}} was not taken, because another number in the same list was not',
	}),
	unreadables: Object.freeze({
		undeclared: 'it is not written as a plain number',
		fraction: 'it is a fraction',
		'foreign currency': 'it is in a currency unit other than dollars',
		grouping: 'its digits are grouped in a way that could mean two numbers',
		signed: 'it carries a sign',
		shorthand: 'it is written in shorthand',
		spoken: 'it is written the way it is spoken',
		joined: 'its words can be joined in more than one way',
		frequency: 'it says how often, not how many',
		loose: 'it is not an exact amount',
		range: 'it is part of a range or a choice',
		dimensions: 'it is part of a set of dimensions',
		overflow: 'it is too large to hold exactly',
		precision: 'it has more decimal places than can be kept',
	}),
	eligibilities: Object.freeze({
		eligible: 'eligible',
		ineligible: 'not eligible',
		referral: 'referred for review',
	}),
	effects: Object.freeze({
		restriction: 'Restriction',
		referral: 'Referral',
		condition: 'Condition',
		notice: 'Notice',
		limit: 'Limit',
	}),
	statuses: Object.freeze({
		ineligible: 'not eligible',
		referral: 'referred for review',
		incomplete: 'incomplete',
		conditional: 'eligible with conditions',
		unrated: 'not fully rated',
		eligible: 'eligible',
	}),
	decisions: Object.freeze({
		approved: 'approved',
		denied: 'denied',
		submitted: 'submitted for review',
	}),
	values: Object.freeze({ true: 'true', false: 'false', null: 'none' }),
	joins: Object.freeze({ reasons: '; ', last: '; and ', steps: ', then ', terms: ', ' }),
	frames: Object.freeze({
		'fact.equal': '{{label}} is {{actual}}',
		'fact.compared': '{{label}} is {{actual}}, which {{comparison}} {{expected}}',
		'fact.listed': '{{label}} is {{actual}}, which {{comparison}} the {{count}} listed',
		'fact.unread': '{{label}} is {{missing}}',
		'fact.stated': '{{predicate}}({{terms}})',
		'fact.confidence': '{{fact}} (confidence {{confidence}})',
		'fact.proved': 'proved through {{name}}',
		'fault.type': '{{label}} must be {{expected}}, and {{received}} is not',
		'fault.missing': '{{label}} is {{missing}}, and must be {{expected}}',
		'fault.constraint': '{{label}} must be {{constraint}}, and {{received}} is not',
		'fault.length': '{{label}} must have {{constraint}}',
		'refusal.unreadable': '{{text}} was not taken, because {{cause}}',
		'refusal.field': '{{refusal}} (considered for {{label}})',
		'value.range': '{{minimum}} to {{maximum}}',
		'value.minimum': 'at least {{minimum}}',
		'value.maximum': 'at most {{maximum}}',
		'value.quoted': '"{{value}}"',
		'value.any': 'any value',
		'condition.when': 'applies when {{condition}}',
		'condition.equal': '{{label}} is {{expected}}',
		'condition.compared': '{{label}} {{comparison}} {{expected}}',
		'condition.xor': 'either {{first}} or {{second}}, but not both',
		'condition.group': '({{condition}})',
		'condition.not': 'not ({{condition}})',
		'reason.rule': '{{name}} {{verdict}} ({{reasons}})',
		'reason.step': '{{outcome}} ({{reasons}})',
		'reason.more': '{{count}} more',
		'rule.settled': '{{name}} {{verdict}}',
		'rule.because': '{{name}} {{verdict}}, because {{reasons}}',
		'rule.condition': '{{name}} applies when {{condition}}',
		'result.refused': '{{name}} gave no answer',
		'result.because': '{{name}} gave no answer, because {{reasons}}',
		'result.count': 'Rules of {{name}} that apply: {{met}} of {{total}}',
		'result.applied': 'Rules of {{name}} that apply: {{met}} of {{total}} ({{rules}})',
		'result.value': '{{name}}: {{value}}',
		'result.solution': '{{label}} is {{value}}',
		'result.derived': 'Facts derived: {{count}}',
		'result.outcome': '{{name}}: {{outcome}}',
		'result.decided': '{{name}}: {{outcome}}, because {{reasons}}',
		'result.decision': 'Decision: {{decision}}',
		'finding.effect': '{{effect}}: {{finding}}',
		'finding.scope': '{{scope}}: {{outcome}}',
		'worksheet.group': '{{name}}: {{value}}',
		'worksheet.factor': '{{name}}: {{value}}',
		'worksheet.applied': '{{name}} applied',
		'worksheet.unapplied': '{{name}} did not apply',
		'worksheet.blocked': '{{name}} did not apply, because {{reasons}}',
		'worksheet.empty': '{{name}} found no value to use',
		'worksheet.raw': 'before its changes: {{value}}',
		'worksheet.base': 'base: {{value}}',
		'worksheet.weight': 'weight: {{value}}',
		'worksheet.bounds': 'bounds: {{bounds}}',
		'worksheet.total': '{{aggregation}}: {{value}}',
		'worksheet.fallback': 'fallback: {{value}}',
		'worksheet.changes': 'changes: {{changes}}',
		'worksheet.required': 'must apply',
		'worksheet.strict': 'applies only when all of its values apply',
		'worksheet.precision': 'decimal places: {{places}}',
		'source.static': 'fixed at {{value}}',
		'source.field': 'taken from {{label}}',
		'source.lookup': 'looked up by {{label}}',
		'source.range': 'set by the first range {{label}} falls in',
		'source.entry': '{{key}}: {{value}}',
		'source.band': '{{range}}: {{value}}',
		'source.missed': 'no entry matches {{label}}',
		'source.fallback': 'its fallback, because no entry matches {{label}}',
		'source.either': 'looked up by {{label}}, or its fallback',
		'group.aggregation': '{{aggregation}} of the values that apply',
		'equation.target': 'solves for {{label}}',
		'equation.form': '{{left}} = {{right}}',
		'equation.group': '({{expression}})',
		'inference.rule': '{{conclusion}}, when {{premises}}',
		'inference.confidence': 'confidence: {{confidence}}',
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
	limits: Object.freeze({ list: 4, reasons: 4 }),
	missing: 'not known',
})

/** Lists the slots each framed word table of a `Lexicon` offers; a word naming any other is refused. */
export const WORD_SLOTS: Readonly<
	Record<'operations' | 'transforms' | 'constraints' | 'lengths' | 'refusals', readonly string[]>
> = Object.freeze({
	operations: Object.freeze(['left', 'right']),
	transforms: Object.freeze(['operand']),
	constraints: Object.freeze(['limit']),
	lengths: Object.freeze(['limit']),
	refusals: Object.freeze(['text']),
})

/** Lists the slots each frame of a `Lexicon` offers; a frame naming any other slot is refused. */
export const FRAME_SLOTS: Readonly<Record<FrameName, readonly string[]>> = Object.freeze({
	'fact.equal': Object.freeze(['label', 'actual']),
	'fact.compared': Object.freeze(['label', 'actual', 'comparison', 'expected']),
	'fact.listed': Object.freeze(['label', 'actual', 'comparison', 'count']),
	'fact.unread': Object.freeze(['label', 'missing']),
	'fact.stated': Object.freeze(['predicate', 'terms']),
	'fact.confidence': Object.freeze(['fact', 'confidence']),
	'fact.proved': Object.freeze(['name']),
	'fault.type': Object.freeze(['label', 'expected', 'received']),
	'fault.missing': Object.freeze(['label', 'missing', 'expected']),
	'fault.constraint': Object.freeze(['label', 'constraint', 'received']),
	'fault.length': Object.freeze(['label', 'constraint']),
	'refusal.unreadable': Object.freeze(['text', 'cause']),
	'refusal.field': Object.freeze(['refusal', 'label']),
	'value.range': Object.freeze(['minimum', 'maximum']),
	'value.minimum': Object.freeze(['minimum']),
	'value.maximum': Object.freeze(['maximum']),
	'value.quoted': Object.freeze(['value']),
	'value.any': Object.freeze([]),
	'condition.when': Object.freeze(['condition']),
	'condition.equal': Object.freeze(['label', 'expected']),
	'condition.compared': Object.freeze(['label', 'comparison', 'expected']),
	'condition.xor': Object.freeze(['first', 'second']),
	'condition.group': Object.freeze(['condition']),
	'condition.not': Object.freeze(['condition']),
	'reason.rule': Object.freeze(['name', 'verdict', 'reasons']),
	'reason.step': Object.freeze(['outcome', 'reasons']),
	'reason.more': Object.freeze(['count']),
	'rule.settled': Object.freeze(['name', 'verdict']),
	'rule.because': Object.freeze(['name', 'verdict', 'reasons']),
	'rule.condition': Object.freeze(['name', 'condition']),
	'result.refused': Object.freeze(['name']),
	'result.because': Object.freeze(['name', 'reasons']),
	'result.count': Object.freeze(['name', 'met', 'total']),
	'result.applied': Object.freeze(['name', 'met', 'total', 'rules']),
	'result.value': Object.freeze(['name', 'value']),
	'result.solution': Object.freeze(['label', 'value']),
	'result.derived': Object.freeze(['count']),
	'result.outcome': Object.freeze(['name', 'outcome']),
	'result.decided': Object.freeze(['name', 'outcome', 'reasons']),
	'result.decision': Object.freeze(['decision']),
	'finding.effect': Object.freeze(['effect', 'finding']),
	'finding.scope': Object.freeze(['scope', 'outcome']),
	'worksheet.group': Object.freeze(['name', 'value']),
	'worksheet.factor': Object.freeze(['name', 'value']),
	'worksheet.applied': Object.freeze(['name']),
	'worksheet.unapplied': Object.freeze(['name']),
	'worksheet.blocked': Object.freeze(['name', 'reasons']),
	'worksheet.empty': Object.freeze(['name']),
	'worksheet.raw': Object.freeze(['value']),
	'worksheet.base': Object.freeze(['value']),
	'worksheet.weight': Object.freeze(['value']),
	'worksheet.bounds': Object.freeze(['bounds']),
	'worksheet.total': Object.freeze(['aggregation', 'value']),
	'worksheet.fallback': Object.freeze(['value']),
	'worksheet.changes': Object.freeze(['changes']),
	'worksheet.required': Object.freeze([]),
	'worksheet.strict': Object.freeze([]),
	'worksheet.precision': Object.freeze(['places']),
	'source.static': Object.freeze(['value']),
	'source.field': Object.freeze(['label']),
	'source.lookup': Object.freeze(['label']),
	'source.range': Object.freeze(['label']),
	'source.entry': Object.freeze(['key', 'value']),
	'source.band': Object.freeze(['range', 'value']),
	'source.missed': Object.freeze(['label']),
	'source.fallback': Object.freeze(['label']),
	'source.either': Object.freeze(['label']),
	'group.aggregation': Object.freeze(['aggregation']),
	'equation.target': Object.freeze(['label']),
	'equation.form': Object.freeze(['left', 'right']),
	'equation.group': Object.freeze(['expression']),
	'inference.rule': Object.freeze(['conclusion', 'premises']),
	'inference.confidence': Object.freeze(['confidence']),
	'subject.fields': Object.freeze(['fields']),
	'subject.empty': Object.freeze([]),
	'prompt.base': Object.freeze(['verb', 'name']),
	'prompt.entities': Object.freeze(['fields']),
	'prompt.defaults': Object.freeze(['fields']),
	'prompt.ambiguities': Object.freeze(['questions']),
	'ambiguity.entity': Object.freeze(['entity']),
	'ambiguity.intent': Object.freeze([]),
	'ambiguity.confidence': Object.freeze([]),
})

/**
 * Holds the number formats every `Narrator` carries: `plain` (no grouping), `count` (grouped),
 * and `percent` (at most two decimals).
 *
 * @remarks
 * `plain` and `count` keep 17 significant digits, which round-trips every finite number.
 */
export const DEFAULT_FORMATS: Readonly<
	Record<'plain' | 'count' | 'percent', Readonly<Intl.NumberFormatOptions>>
> = Object.freeze({
	plain: Object.freeze({ useGrouping: false, maximumSignificantDigits: 17 }),
	count: Object.freeze({ useGrouping: true, maximumSignificantDigits: 17 }),
	percent: Object.freeze({ style: 'percent', maximumFractionDigits: 2 }),
})

/**
 * Holds what ends a line of text: every Unicode line and paragraph break, as one run.
 *
 * @remarks
 * Carries no global flag, so a `test` call keeps no position.
 */
export const TEXT_BREAK_PATTERN = /[\n\v\f\r\x85\p{Zl}\p{Zp}]+/u

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

/** Caps text accepted by the built-in normalizer and number reader at 65,536 UTF-16 units. */
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
	'LEXICON',
	'GLOSSARY',
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
	'preceding-word',
	'following-word',
	'unreadable',
	'anchor-tie',
	'anchor-conflict',
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
