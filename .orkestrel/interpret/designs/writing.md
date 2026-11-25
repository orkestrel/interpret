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
	readonly text: string
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
| Symbolic and inferential | `narrate` | the verdict line alone |

- **Detail:** `line` prints the verdict alone; `reasons` adds the deciding lines; `full` adds every line. Nested lines indent two spaces a level.
- **A rule that doesn't hold** prints its name, the not-holding word, and the facts that decided it. A fact under a derived key prints the concluding rule's name and state, with that rule's own line nested.
- **An unread value** prints its label and the not-known words, with the fault as the line's source.
- **An empty section** is omitted, except the verdict, which always prints. Every text is one line.

## Reasons

A rule's reasons are the checks that fix its state. interpret pairs the rule's atoms, in `extractAtoms` order, with its result's checks, recomputes each connective with `combineStates`, and cites: every operand of a met `and`; the first unmet operand of an unmet `and`; the first met operand of a met `or`; every operand of an unmet `or`; the operand of `not`; for `implies`, the unmet first operand or the met second one when met, and both when unmet; every operand of `xor`; and, for an unread connective, the operands that made it unread. Each cited check prints as a fact: a true sentence about its field, whichever way it read. When the recomputed state differs from the engine's, the line prints without reasons.

## Truth

Each rule is proved against the real `reason` engine, with a mutation probe on its deciding line.

| # | Rule | Proof |
| --- | --- | --- |
| T1 | A result whose `success` is false states no value, count, or solution, and names what it couldn't read | the four refused results; the field's label is in the text and the value isn't |
| T2 | A rule prints as holding only when its state is `met` | every rule line's words agree with its state, over every fixture result |
| T3 | A cited set fixes the state: no change elsewhere moves it | every state assignment over generated trees to depth 3 with all five connectives |
| T4 | A missing number's cause comes from its evidence | a gated factor's line names its unmet check |
| T5 | No blank and no guess | no text across the fixtures and a hostile-input matrix holds `undefined`, `NaN`, an empty slot, or a line break |
| T6 | One field formats one way | one value prints identically in a fact, a condition, and a step |
| T7 | A supplied word keeps its case | a label with odd casing appears byte for byte |
| T8 | A count names what it counts | `Rules that hold: 2 of 3` |
| T9 | One word is overridable alone | one comparison's one wording overridden changes only its sentences |
| T10 | A missing domain word is reported | a removed label, unit, format, and name give exactly those gaps, from `audit` and on the lines |
