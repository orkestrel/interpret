# Design: the writing side

## Why

- **Today's output.** `Narrator.describe` and `Narrator.narrate` write one line and drop the rules, checks, and values behind it. Four refused results are misstated: logical `unread: 0 rule(s)` names no field, quantitative `scored 10 …` states a value the engine says is no answer, symbolic `solved ` says nothing, and inferential `derived 1 fact(s)` ignores a depth cap. A logical count is of met rules and reads as a total.
- **Two applications on earlier versions** hand-wrote the account over `phrase`, `label`, `value`, and `line`. Of 153 places a person reads text, 52 were general, 37 a general frame with a domain noun, and 64 domain. Of 122 lines of wording code in one, 78 were general. One printed every one of 268 rules that didn't fire in the words written for firing, and named a missing table entry for 8 of 14 rates a rule had blocked.
- **The family disagrees.** Almost no closed vocabulary is worded, and where one is, two packages word it differently: `qualifier` says `is more than`, an application said `over`, and an unread check is `unknown` in one place and `unread` in another.

## The split

| Word | Class | Supplied by |
| --- | --- | --- |
| The ten comparisons, each in two wordings (holding and failing) | general | the lexicon |
| Check states, rule states, the five connectives, aggregations, fault reasons | general | the lexicon |
| Frames, the list limit, the word for a value nobody read, the words for `true`, `false`, and `null` | general | the lexicon |
| Number grouping, list joining, and percent | general | `Intl`, by locale, through shipped formats |
| A field's label; a unit for each field compared as a number; a format for each unit past the shipped ones | domain, required | the glossary |
| A rule's, group's, factor's, equation's, inference's, and definition's name and description | domain, required | the definition |
| The unit of a definition's value; an application's own phrase tables and lines | domain, optional | the glossary |

A mixed line is the lexicon's frame with the domain's noun in a slot. The definition is the first home of domain words, and the glossary holds only what a definition can't.

## Customization

- An override merges word by word: one comparison's one wording, one frame, one limit.
- Another language is a complete lexicon and a locale. Frames carry word order, and `Intl.NumberFormat` and `Intl.ListFormat` carry numbers and lists. Every shipped frame reads correctly for any count, so no plural rule is needed.
- interpret never changes a supplied word, its case included.
- Code, not a frame, picks the holding or failing wording from the evidence's state. Slots fill only from evidence. Construction refuses a frame that names a slot its frame doesn't offer, an empty word, and a word with a line break.
- A general word is overridden in the lexicon, never in the glossary: the glossary refuses a phrase table or a line whose name the lexicon owns.

## Missing domain words

- `audit(definitions)` returns every gap: a field read without a label, a field compared as a number without a unit, a unit without a format, and a part whose name is its id.
- Construction throws only for a malformed lexicon or glossary.
- At run time nothing throws and nothing prints blank: the field's path prints where the label would, a number with no unit prints ungrouped, and the line carries its gaps as data.

## The public surface

`Narrator` grows, and no class is added. Names are settled in the types unit against `scaffold surface`; `Evidence`, `Outcome`, `Gap`, `Statement`, and `Refusal` are owned by other packages.

```ts
/** The two wordings of one comparison. */
export interface ComparisonPhrase {
	readonly holds: string
	readonly fails: string
}

export type FrameName =
	// the account
	| 'fact.equal' // {{label}} is {{actual}}
	| 'fact.compared' // {{label}} is {{actual}}, which {{comparison}} {{expected}}
	| 'fact.listed' // {{label}} is {{actual}}, which {{comparison}} the {{count}} listed
	| 'fact.unread' // {{label}} {{missing}}
	| 'value.range' // {{minimum}} and {{maximum}}
	| 'condition.compared' // {{label}} {{comparison}} {{expected}}
	| 'condition.listed' // {{label}} {{comparison}} the {{count}} listed
	| 'rule.settled' // {{name}} {{verdict}}
	| 'rule.because' // {{name}} {{verdict}}, because {{reasons}}
	| 'rule.condition' // {{name}} holds when {{condition}}
	| 'result.refused' // {{name}} gave no answer
	| 'result.count' // Rules that hold: {{met}} of {{total}}
	| 'result.value' // {{name}} is {{value}}
	| 'result.solution' // {{label}} is {{value}}
	| 'result.derived' // Facts derived: {{count}}
	| 'worksheet.group' // {{name}}: {{value}}
	| 'worksheet.factor' // {{name}}: {{value}}
	| 'worksheet.blocked' // {{name}} did not apply, because {{reasons}}
	| 'worksheet.empty' // {{name}} found no value to use
	| 'worksheet.total' // {{aggregation}}: {{value}}
	// the forward direction, kept
	| 'subject.fields'
	| 'subject.empty'
	| 'prompt.base'
	| 'prompt.entities'
	| 'prompt.defaults'
	| 'prompt.ambiguities'
	| 'ambiguity.entity'
	| 'ambiguity.intent'
	| 'ambiguity.confidence'

/** The general words interpret ships, complete. */
export interface Lexicon {
	readonly comparisons: Readonly<Record<Comparison, ComparisonPhrase>>
	readonly checks: Readonly<Record<CheckState, string>>
	readonly rules: Readonly<Record<CheckState, string>>
	readonly connectives: Readonly<Record<LogicalOperator, string>>
	readonly aggregations: Readonly<Record<Aggregation, string>>
	readonly faults: Readonly<Record<AuditFault['reason'], string>>
	readonly values: { readonly true: string; readonly false: string; readonly null: string }
	readonly frames: Readonly<Record<FrameName, string>>
	readonly limits: { readonly list: number }
	readonly missing: string
}

/** Any word of any table, on its own. */
export type LexiconInput = { /* each table partial, a comparison's two wordings partial too */ }

/** The domain words a consumer supplies. */
export interface Glossary {
	readonly labels: Readonly<Record<string, string>> // keyed by formatField(path)
	readonly units?: Readonly<Record<string, string>> // a field's unit, keyed the same way
	readonly values?: Readonly<Record<string, string>> // a definition's value's unit, keyed by its id
	readonly formats?: Readonly<Record<string, Intl.NumberFormatOptions>> // a unit's format
	readonly phrases?: Readonly<Record<string, Readonly<Record<string, string>>>>
	readonly templates?: Readonly<Record<string, string>>
}

/** One domain word a definition needs and the glossary lacks. */
export interface GlossaryGap {
	readonly word: 'label' | 'unit' | 'format' | 'name'
	readonly field?: FieldPath
	readonly unit?: string
	readonly part?: 'definition' | 'rule' | 'group' | 'factor' | 'equation' | 'inference'
	readonly id?: string
}

export type AccountRole = 'verdict' | 'reason' | 'condition' | 'step'
export type AccountDetail = 'line' | 'reasons' | 'full'

/** The data one line was written from. */
export interface AccountSource {
	readonly rule?: string
	readonly group?: string
	readonly factor?: string
	readonly check?: Check
	readonly result?: CheckResult
	readonly fault?: AuditFault
}

export interface AccountLine {
	readonly role: AccountRole
	readonly state?: CheckState
	readonly decisive: boolean
	readonly text: string // the outcome alone
	readonly summary: string // the outcome with its reasons; `text` when it has none
	readonly source: AccountSource
	readonly gaps: readonly GlossaryGap[]
	readonly lines: readonly AccountLine[]
}

export interface Account {
	readonly id: string
	readonly name: string
	readonly success?: boolean // absent for a guide
	readonly lines: readonly AccountLine[]
}

export interface NarratorOptions {
	readonly lexicon?: LexiconInput
	readonly glossary?: Glossary
	readonly formatters?: Readonly<Record<string, NarratorFormatter>> // a unit's function, over its format
	readonly locale?: string // Default: 'en-US'
}

export interface NarratorInterface {
	phrase(table: string, key: string, fallback?: string): string
	label(field: FieldPath): string
	value(field: FieldPath, raw: unknown): string
	line(id: string, values: Readonly<Record<string, unknown>>): string
	describe(definition: Definition): Account
	narrate(definition: Definition, result: ReasonResult): Account
	audit(definitions: readonly Definition[]): readonly GlossaryGap[]
}
```

- **Shipped formats:** `plain` (no grouping), `count` (grouped), and `percent` (at most two decimals). A unit the glossary formats wins over a shipped one.
- **`phrase`** reads the glossary's phrase tables, then the lexicon's string tables by name (a comparison reads its holding wording), then the fallback, then the key.
- **`line`** fills the glossary's templates, then the lexicon's frames, with `fillTemplate` under `missing: 'empty'`, and gives an empty string for an unknown id.
- **`value`** finds the field's unit itself. A list joins through `Intl.ListFormat`; past the list limit, the frame that counts it applies.
- **Helpers:** `mergeLexicon`, `scanLexicon`, `scanGlossary`, `collectGaps`, and `renderAccount(account, { detail })`. `InterpretErrorCode` gains `LEXICON` and `GLOSSARY`.
- **`InterpretInterface.describe` and `narrate`** delegate and take the same arguments.

## The documents

| Document | Method | Sections, in order |
| --- | --- | --- |
| Verdict with its reasons | `narrate`, logical | the verdict with its reasons; rules that hold; rules that don't; rules that couldn't be read |
| Worksheet of one number | `narrate`, quantitative | the value, or the refusal and its cause; each group with its factors; the total |
| Guide to the rules | `describe` | each rule's name, its description when authored, and its condition |
| Solutions of equations | `narrate`, symbolic | each solution, with its equation nested |
| Derived facts | `narrate`, inferential | each derived fact as a sentence, with its confidence below 1; for a backward run, the conclusion and the inference that proved it |
| One value not taken | `explain` | one sentence for a fault or a number refusal |

- **Detail:** `line` prints the verdict alone; `reasons` adds the deciding lines; `full` adds every line. Nested lines indent two spaces a level.
- **A rule that doesn't hold** prints its name, the not-holding word, and the facts that decided it. A fact under a derived key prints the concluding rule's name and state, with that rule's own line nested.
- **An unread value** prints its label and the not-known words, with the fault as the line's source.
- **An empty section** is omitted, except the verdict, which always prints. Every text is one line.

## Reasons

A rule's reasons are the checks that fix its state. interpret pairs the rule's atoms, in `extractAtoms` order, with its result's checks, recomputes each connective with `combineStates`, and cites: every operand of a met `and`; the first unmet operand of an unmet `and`; the first met operand of a met `or`; every operand of an unmet `or`; the operand of `not`; for `implies`, the unmet first operand or the met second one when met, and both when unmet; every operand of a settled `xor`; and, for an unread connective, its unread operands alone, down to the unread checks. Each cited check prints as a fact: a true sentence about its field, whichever way it read. When the recomputed state differs from the engine's, the line prints without reasons.

- **A reason under a derived key** prints the concluding rule's name and state with that rule's own facts in parentheses, one level deep (`reason.rule`), and nests the rule's own line.
- **A line has two forms.** `text` states the outcome alone, and `summary` adds its reasons: at most `limits.reasons` of them, then how many more. The `line` detail prints the verdict's `summary`; the other details print `text` and the nested lines, so no fact prints twice.
- **Reasons join** by the lexicon's `joins.reasons` (`; `) and `joins.last` (`; and `), because a fact holds a comma. A list of values joins through `Intl.ListFormat`.

## Conditions

A condition is a check with no subject: `condition.equal` (`{{label}} is {{expected}}`), `condition.compared`, or `condition.listed`. Under `not`, the check takes its failing words. A conclusion key reads as its concluding rule's name with `rules.met`, or `rules.unmet` under `not`. `and` and `or` join through `Intl.ListFormat`, conjunction and disjunction; `implies` reads `condition.implies` (`if {{first}}, then {{second}}`); `xor` reads `condition.xor` (`either {{first}} or {{second}}, but not both`); and a compound inside another takes `condition.group` (`({{condition}})`). A `not` over a compound takes `condition.not` (`not ({{condition}})`).

## Rulings from the review of 2026-11-25

- **A refused run derives nothing it can't vouch for.** Where every entry of `errors` is a fault's (`errors` holds no more entries than `faults`), a logical account still prints its settled rules, because a rule settled in strong Kleene logic stays settled whatever the missing input. Where `errors` holds more, the account prints the refusal and its faults alone: no rule's state, no reason, and no verdict word. The count compares lengths and reads no string.
- **A condition is the whole rule.** A list in a condition prints every member, whatever the limit, so `condition.listed` leaves. A fact still counts past the limit.
- **A list's members are recoverable from its text.** Where a member holds one of the list's own joining texts (`Intl.ListFormat.formatToParts` gives them), every member of that list prints through `value.quoted` (`"{{value}}"`). A list under `any` or `none` joins as a disjunction, and any other as a conjunction.
- **A factor's source line reads its raw value wherever the result carries one,** a refused factor's included, under one rule: an entry, the fallback, or `source.either`.
- **A source the result can't settle says so.** Where a factor's raw value equals both its fallback and an entry's value, its line reads `source.either` (`looked up by {{label}}, or its fallback`), for a lookup and a range alike. A weight prints only under an aggregation that uses weights.
- **Plain data in.** `describe`, `narrate`, and `audit` read a definition and a result as `reason`'s guards admit them, and say so; a hostile accessor can throw what it throws. The constructor reads every option safely and refuses an unreadable one with `LEXICON` or `GLOSSARY`. The lookups stay total.
- **Verbatim lookups.** `value`, `label`, `line`, `phrase`, `Account.name`, and `Account.id` give the supplied text as it is; the one-line law binds a line's `text` and `summary`.
- **An account owns what it holds.** A line's source and gaps are copies, so no two accounts, and no account and its definition or result, share a mutable object.
- **A line carries every gap of its `text` and its `summary`,** a condition's and a static source's included.

## The verdict of a logical definition

`reason`'s `conclusion` is the last evaluated rule's state, so it's a verdict only where that rule is a goal. A definition has a goal when it has one enabled rule, or when its last enabled rule reads a key another enabled rule concludes.

- **With a goal,** the verdict is the goal rule's outcome under the definition's name: `{{name}} {{verdict}}`, and its reasons.
- **Without one,** the rules are independent gates, and the verdict counts them: `result.count` (`Rules of {{name}} that apply: {{met}} of {{total}}`), with the names of the rules that apply in its `summary` (`result.applied`, bounded by `limits.reasons`). A refused run without a goal prints `result.refused` and its causes.

The rule came from running one application's own definitions, where a list of gates printed as not holding because its last gate, on an unrelated field, didn't apply.

## Words ruled on 2026-11-25, from the second unit's output

- **A rule applies everywhere:** `result.count` (reworded in § The completion before the release), `rule.condition` (`{{name}} applies when {{condition}}`), and the guide's nested line `condition.when` (`applies when {{condition}}`), so a guide names a rule once.
- **`implies`** reads as its equivalent, the failing words of its first operand `or` its second, so `applies when` reads before it; `condition.implies` leaves.
- **`between` and `outside`** read `is in the range` and `is outside the range`.
- **`result.value`** is `{{name}}: {{value}}`, as a worksheet's lines are, so a plural name reads.
- **A lookup or range that found no entry** says so: `source.missed` (`no entry matches {{label}}`), and the fallback's line uses the same words.
- **A worksheet shows what its numbers rest on:** a base (`worksheet.base`), a weight (`worksheet.weight`), and a bound (`worksheet.bounds`), wherever the definition authors one, so its lines account for its value.
- **`limits.reasons`** is 4.

## Words ruled on 2026-11-25, from the first unit's output

- **Rules and verdicts take two tables:** `rules` (`applies`, `does not apply`, `cannot be decided`) for a rule's line, and `verdicts` (`holds`, `does not hold`, `cannot be decided`) for a definition's. A logical verdict is the last enabled rule's, under the definition's name.
- **`missing`** is `not known`, and `fact.unread` is `{{label}} is {{missing}}`.
- **`between` and `outside`** read `is within` and `is outside`, over `value.range` (`{{minimum}} to {{maximum}}`), because the test is inclusive.
- **`connectives`** leaves the lexicon: the condition frames and `Intl.ListFormat` carry them.

## The completion before the release

Ruled on 2026-11-25, on the user's condition that the release hold "all the general words that it needs" and be "thoroughly done and useful". The release takes every general word and `reason`'s own documents whole. The family's results are `family.md`'s, in the release after it. Nothing here reads a string an engine words.

**Which vocabularies take words.** A word ships when a document interpret writes prints it, or when it words a result an application already shows through `phrase`. `Reasoning`, `ChainStrategy`, `WorksheetStage`, `NumberForeign`, and `ProvenanceCategory` take none, because no document prints them.

### The tables

`Lexicon` gains each of these, `LexiconInput` each as a partial, and the glossary refuses a phrase table under any of their names. `@orkestrel/qualifier` and `@orkestrel/program` own `Eligibility`, `Status`, `Decision`, and the effects, so interpret mirrors their members under names of its own, checked with `scaffold surface` first.

```ts
/** Mirrors `Eligibility` of `@orkestrel/qualifier`. */
export type EligibilityKey = 'eligible' | 'ineligible' | 'referral'
/** Mirrors `QualificationEffect` of `@orkestrel/qualifier` and `ProgramEffect` of `@orkestrel/program`. */
export type EffectKey = 'restriction' | 'referral' | 'condition' | 'notice' | 'limit'
/** Mirrors `Status` of `@orkestrel/program`. */
export type StatusKey = 'ineligible' | 'referral' | 'incomplete' | 'conditional' | 'unrated' | 'eligible'
/** Mirrors `Decision` of `@orkestrel/program`. */
export type DecisionKey = 'approved' | 'denied' | 'submitted'

export interface Lexicon {
	// the tables before this section stay
	readonly operations: Readonly<Record<MathOperation, string>> // frames: left, right
	readonly transforms: Readonly<Record<MathOperation, string>> // frames: operand
	readonly expected: Readonly<Record<FaultKind, string>>
	readonly constraints: Readonly<Record<FaultConstraint, string>> // frames: limit
	readonly lengths: { readonly min: string; readonly max: string } // frames: limit
	readonly refusals: Readonly<Record<NumberRefusalReason, string>> // frames: text
	readonly unreadables: Readonly<Record<NumberUnreadable, string>>
	readonly eligibilities: Readonly<Record<EligibilityKey, string>>
	readonly effects: Readonly<Record<EffectKey, string>>
	readonly statuses: Readonly<Record<StatusKey, string>>
	readonly decisions: Readonly<Record<DecisionKey, string>>
	readonly joins: { readonly reasons: string; readonly last: string; readonly steps: string }
}
```

The shipped words:

```ts
operations: {
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
},
transforms: {
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
},
expected: {
	string: 'text',
	date: 'a date',
	number: 'a number',
	integer: 'a whole number',
	boolean: 'true or false',
	null: 'empty',
	literal: 'one of its allowed values',
	array: 'a list',
	object: 'a record',
	union: 'one of its allowed forms',
	json: 'plain data',
	shape: 'a shape description',
	function: 'a function',
	undefined: 'absent',
},
constraints: {
	min: 'at least {{limit}}',
	over: 'more than {{limit}}',
	max: 'at most {{limit}}',
	under: 'less than {{limit}}',
	pattern: 'in the expected form',
	date: 'a valid date',
	integer: 'a whole number',
},
lengths: {
	min: 'a length of at least {{limit}}',
	max: 'a length of at most {{limit}}',
},
refusals: {
	'preceding-word': '{{text}} was not taken, because what comes before it makes it uncertain',
	'following-word': '{{text}} was not taken, because what comes after it makes it uncertain',
	unreadable: '{{text}} was not taken, because it could not be read as an exact number',
	'anchor-tie': '{{text}} was not taken, because it is not clear which value it belongs to',
	'anchor-conflict': '{{text}} was not taken, because the text gives more than one number for the same value',
	correction: '{{text}} was not taken, because the text marks it as corrected or changed',
	negation: '{{text}} was not taken, because the text negates it',
	unanchored: '{{text}} was not taken, because nothing in the text says what it is',
	collection: '{{text}} was not taken, because another number in the same list was not',
},
unreadables: {
	undeclared: 'it is not written as a plain number',
	fraction: 'it is a fraction',
	'foreign currency': 'it is in a currency other than dollars',
	grouping: 'its digits are grouped in a way that could mean two numbers',
	signed: 'it carries a sign',
	shorthand: 'it is written in shorthand',
	spoken: 'it is written the way it is spoken',
	joined: 'its words can be joined in more than one way',
	frequency: 'it says how often, not how many',
	loose: 'it is not an exact amount',
	range: 'it gives a range or a choice',
	dimensions: 'it gives dimensions',
	overflow: 'it is too large to hold exactly',
	precision: 'it has more decimal places than can be kept',
},
eligibilities: { eligible: 'eligible', ineligible: 'not eligible', referral: 'referred for review' },
effects: {
	restriction: 'Restriction',
	referral: 'Referral',
	condition: 'Condition',
	notice: 'Notice',
	limit: 'Limit',
},
statuses: {
	ineligible: 'not eligible',
	referral: 'referred for review',
	incomplete: 'incomplete',
	conditional: 'eligible with conditions',
	unrated: 'not fully rated',
	eligible: 'eligible',
},
decisions: { approved: 'approved', denied: 'denied', submitted: 'submitted for review' },
joins: { reasons: '; ', last: '; and ', steps: ', then ' },
```

`unrated` reads `not fully rated`, because that status also covers a rating that failed. Each word is the writer's to correct where the engine's own code makes it false, and each correction is recorded.

### Counts

`result.count` is `Rules of {{name}} that apply: {{met}} of {{total}}`, and `result.applied` is `Rules of {{name}} that apply: {{met}} of {{total}} ({{rules}})`. Both read for any count.

### Faults and number refusals

```ts
// FrameName gains:
'fault.type' // {{label}} must be {{expected}}, and {{received}} is not
'fault.missing' // {{label}} is {{missing}}, and must be {{expected}}
'fault.constraint' // {{label}} must be {{constraint}}, and {{received}} is not
'fault.length' // {{label}} must have {{constraint}}
'refusal.unreadable' // {{text}} was not taken, because {{cause}}
'refusal.field' // {{refusal}} (near {{label}})

export interface NarratorInterface {
	/** Writes why one value was not taken, as one line. */
	explain(fault: AuditFault): string
	explain(refusal: NumberRefusal): string
}
```

- A number's limit prints in its field's unit. `min` and `max` on a string or an array are lengths, so they take `fault.length` and print plain.
- `received` is `contract`'s own bounded preview, printed as it is.
- `variant`, `oneOf`, `extra`, and `hidden` keep the words `fact.unread` gives them.
- A refusal with an `unreadable` cause takes `refusal.unreadable`, and one with a `field` takes `refusal.field` around it. No shipped sentence needs `word`, because the record doesn't always hold one.
- The account's fault lines and `explain` share one writer.

### How a number is set

```ts
// FrameName gains:
'source.entry' // {{key}}: {{value}}
'source.band' // {{range}}: {{value}}
'value.any' // any value
'worksheet.fallback' // fallback: {{value}}
'worksheet.changes' // changes: {{changes}}
'worksheet.required' // must apply
'worksheet.strict' // applies only when all of its values apply
'worksheet.precision' // decimal places: {{places}}
// reworded:
'source.range' // set by the first range {{label}} falls in
```

- The guide lists every lookup entry and every band under its factor, at detail `full` alone, with the base, weight, bounds, fallback, changes, `required`, `strict`, and an authored precision.
- `first` enters `source.range`, because bands can overlap and the first match wins.
- A band prints its bounds in the field's unit through the range frames, and one with no bounds prints `value.any`. An entry's key prints as the table holds it.
- The worksheet adds `changes:` after `before its changes:`, joined by `joins.steps`: `changes: times 3, then rounded up to a whole number`.

### Symbolic and inferential

```ts
// FrameName gains:
'equation.form' // {{left}} = {{right}}
'equation.group' // ({{expression}})
'fact.stated' // {{predicate}}({{terms}})
'fact.confidence' // {{fact}} (confidence {{confidence}})
'fact.proved' // proved through {{name}}
'inference.rule' // {{conclusion}}, when {{premises}}
'inference.confidence' // confidence: {{confidence}}

export interface Glossary {
	/** A predicate's sentence, keyed by predicate, with slots {{1}}, {{2}}, … by position and {{terms}}. */
	readonly predicates?: Readonly<Record<string, string>>
}
// GlossaryGap.word gains 'predicate', whose `id` holds the predicate.
// AccountSource gains equation?: string, inference?: string, and fact?: string.
```

- **An equation** prints in the guide under its name, and in the account nested under its solution. A variable prints its label, a constant prints plain, and an operation inside another always takes `equation.group`, so the text has one reading. An input's value prints only where `solutions` holds it, because the result carries no other binding. `audit` asks a label for every variable an equation names.
- **A predicate's sentence is a domain word.** `parent: '{{1}} is a parent of {{2}}'` gives `alice is a parent of bob`. Without one, the fact prints `parent(alice, bob)` and the line carries the gap; `audit` asks one for each predicate a fact, a premise, or a conclusion names.
- **A subject's fact** `has(key, value)` prints through `fact.equal`, with the key's label and unit. A variable prints as written, `?x`. Confidence prints through the shipped `percent` format, and only below 1.
- **The guide** prints each inference: `?x is a grandparent of ?z, when ?x is a parent of ?y and ?y is a parent of ?z`.
- **A backward account** prints the conclusion as the result holds it and `proved through {{name}}` from the proof's root, and nothing below it: an inner node holds the goal pattern's id, and no fact.

## Truth

Each rule is proved against the real `reason` engine, with a mutation probe on its deciding line.

| # | Rule | Proof |
| --- | --- | --- |
| T1 | A result whose `success` is false states no value, count, or solution, and names what it couldn't read | the four refused results; the field's label is in the text and the value isn't |
| T2 | A rule prints as holding only when its state is `met` | every rule line's words agree with its state, over every fixture result |
| T3 | A cited set fixes a settled state: no change elsewhere moves it. For an unread state, every cited check is unread, and settling all of them settles the rule | every state assignment over generated trees to depth 3 with all five connectives |
| T4 | A missing number's cause comes from its evidence | a gated factor's line names its unmet check |
| T5 | No blank and no guess | no text across the fixtures and a hostile-input matrix holds `undefined`, `NaN`, an empty slot, or a line break |
| T6 | One field formats one way | one value prints identically in a fact, a condition, and a step |
| T7 | A supplied word keeps its case | a label with odd casing appears byte for byte |
| T8 | A count names what it counts, and reads for any number | the count frame at totals of 0, 1, and 5 |
| T9 | One word is overridable alone | one comparison's one wording overridden changes only its sentences |
| T10 | A missing domain word is reported | a removed label, unit, format, and name give exactly those gaps, from `audit` and on the lines |
| T11 | Every member of every closed vocabulary a person meets has a word, one line and not blank | a sweep over the list each package exports; a deleted word fails it |
| T12 | An operation's words say what the engine computes | operation, operands, and the value the English states, through `reason`'s `applyOperation` and `resolveOperand`; the two slots of `percentage` swapped fail it |
| T13 | A fault's sentence states only what its fault holds | faults from the real subject door for each reason and kind: the label, the expected word, the received preview, and the limit are in the text, and a `missing` fault's text holds no received value |
| T14 | `explain` is total and true | real texts compiled until each number refusal reason and each unreadable cause occurs; each sentence holds the refused text on one line |
| T15 | The guide's table is the definition's table | for each printed entry, the engine run on that key gives the printed value; for each band, a value inside it gives the printed value unless an earlier band holds it; no entry prints at `reasons` |
| T16 | A worksheet's changes account for its number | for each operation, the raw value taken through the worded changes and bounds by plain arithmetic equals the engine's value |
| T17 | An equation prints its own tree | generated trees to depth 3 over every operation: each node's words and operand order match, and every nested operation is in parentheses |
| T18 | A derived fact prints its own terms and confidence | a forward run: each sentence holds every term in its frame's order; a removed predicate gives the fallback and exactly that gap, from `audit` and on the line |
