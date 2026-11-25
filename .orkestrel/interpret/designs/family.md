# Design: the family's results

Part of 0.0.27, on the user's ruling of 2026-11-25 that one publication holds the words and the family's results. `describe`, `narrate`, and `audit` take a qualification, a rating, or a program definition with its result, by structural types, with no runtime dependency on `@orkestrel/qualifier`, `@orkestrel/rater`, or `@orkestrel/program`.

## The methods

`Narrator`'s methods overload: one verb per act, and the argument's shape picks the document as `reasoning` already does. The documents themselves are a class of their own, `FamilyNarrator`, over the narrator's public methods, which `Narrator` hands a family definition to; it was split so the release's writers could work at once, and it's exported as every class is. A qualification has `passes`, a rating has `lines`, a program has `qualification`, and none has `reasoning`. Each guard checks only the members interpret reads and admits everything else. The vocabulary members are typed `string`, and a word the lexicon lacks prints as the engine's own, as `phrase` already does.

```ts
/** One check as a family result holds it: qualifier's `Premise`, rater's `Evidence`. */
export interface FamilyPremise {
	readonly field?: FieldPath
	readonly actual?: unknown
	readonly state?: CheckState
}

/** A finding of qualifier or a determination of program, as interpret reads it. */
export interface FamilyFinding {
	readonly id: string
	readonly effect: string
	readonly state: CheckState
	readonly pass?: string
	readonly rule?: string
	readonly scope?: string
	readonly message?: string
	readonly premises: readonly FamilyPremise[]
}

export interface FamilyRuling {
	readonly id: string
	readonly pass: string
	readonly rule: string
	readonly effect: string
	readonly scope?: string
	readonly message?: string
}

export interface FamilyQualification {
	readonly id: string
	readonly name: string
	readonly description?: string
	readonly passes: readonly (QuantitativeDefinition | LogicalDefinition)[]
	readonly rulings?: readonly FamilyRuling[]
}

export interface FamilyDerivation {
	readonly id: string
	readonly value: number
	readonly success: boolean
}

export interface FamilyQualificationResult {
	readonly id: string
	readonly name: string
	readonly eligibility: string
	readonly scopes: Readonly<Record<string, string>>
	readonly findings: readonly FamilyFinding[]
	readonly derivations: readonly FamilyDerivation[]
	readonly success: boolean
	readonly errors: readonly string[] // counted, never read
	readonly faults: readonly AuditFault[]
}

export interface FamilyLine {
	readonly id: string
	readonly name: string
	readonly description?: string
	readonly rate: QuantitativeDefinition
}

export interface FamilyRating {
	readonly id: string
	readonly name: string
	readonly description?: string
	readonly lines: readonly FamilyLine[]
}

export interface FamilyWorksheetFactor {
	readonly id: string
	readonly applied: boolean
	readonly value?: number
	readonly evidence: readonly FamilyPremise[]
}

export interface FamilyWorksheetGroup {
	readonly id: string
	readonly applied: boolean
	readonly value: number
	readonly factors: readonly FamilyWorksheetFactor[]
}

export interface FamilyWorksheet {
	readonly value: number
	readonly groups: readonly FamilyWorksheetGroup[]
	readonly success: boolean
	readonly errors: readonly string[] // counted, never read
	readonly faults: readonly AuditFault[]
}

export interface FamilyLineResult {
	readonly id: string
	readonly name: string
	readonly amount?: number
	readonly worksheet: FamilyWorksheet
}

export interface FamilyRatingResult {
	readonly lines: readonly FamilyLineResult[]
	readonly total?: number
	readonly success: boolean
	readonly faults: readonly AuditFault[]
}

export interface FamilyNotice {
	readonly id: string
	readonly message: string
	readonly scope?: string
}

export interface FamilyProgram {
	readonly id: string
	readonly name: string
	readonly description?: string
	readonly qualification: FamilyQualification
	readonly rating?: FamilyRating
	readonly notices?: readonly FamilyNotice[]
	readonly authority?: LogicalDefinition
}

export interface FamilyProgramResult {
	readonly id: string
	readonly name: string
	readonly eligibility: string
	readonly status: string
	readonly decision?: string
	readonly qualification: FamilyQualificationResult
	readonly rating?: FamilyRatingResult
	readonly determinations: readonly FamilyFinding[]
	readonly success: boolean
	readonly errors: readonly string[] // counted, never read
	readonly faults: readonly AuditFault[]
}

/** Anything a guide can be written for. */
export type AccountDefinition = Definition | FamilyQualification | FamilyRating | FamilyProgram

export interface NarratorInterface {
	describe(definition: AccountDefinition): Account
	narrate(definition: Definition, result: ReasonResult): Account
	narrate(definition: FamilyQualification, result: FamilyQualificationResult): Account
	narrate(definition: FamilyRating, result: FamilyRatingResult): Account
	narrate(definition: FamilyProgram, result: FamilyProgramResult): Account
	audit(definitions: readonly AccountDefinition[]): readonly GlossaryGap[]
}

export interface Glossary {
	/** A scope's name, keyed by scope id, where no rating line of that id supplies one. */
	readonly scopes?: Readonly<Record<string, string>>
}
// GlossaryGap.part gains 'pass' | 'line' | 'scope'.
// AccountSource gains finding?, scope?, line?, and pass?, each a string.
// FrameName gains:
'result.outcome' // {{name}}: {{outcome}}
'result.decided' // {{name}}: {{outcome}}, because {{reasons}}
'result.decision' // Decision: {{decision}}
'finding.effect' // {{effect}}: {{finding}}
'finding.scope' // {{scope}}: {{outcome}}
```

## The domain half

- **A message is the domain's sentence.** interpret prints a finding's `message` as the result holds it and fills nothing in it.
- **A message's slots** are qualifier's to fill in this release. A guide prints a ruling's message, or a rule's description, only when it holds no slot, and `audit` asks nothing for a message.
- **A scope's name** is the rating line's `name` of that id when a program is written, else the glossary's `scopes` entry, else the id with a gap.
- **A line's name** is its definition's `name`, and `audit` asks a name where a name is its id.
- **A derived number** (`qualification.<pass>`) and an authority's outcome field (`outcome.total`) take a glossary label like any field.
- **A unit** for a rating's total is `values[rating.id]`, and a line's is `values[line.rate.id]`.

## The documents

| Document | Sections, in order |
| --- | --- |
| Qualification result | the verdict `{{name}}: {{eligibility}}`, with the met unscoped findings that fix it as reasons; met findings as `{{effect}}: {{message}}`, restrictions, then referrals, then conditions; each scope as `{{scope}}: {{eligibility}}` with its met findings nested; at `full`, each derived number, then findings that didn't apply, then findings that couldn't be decided |
| Qualification guide | the name and description; each ruling's rule name with its effect, scope, description, slot-free message, and condition; at `full`, each numeric pass as a worksheet guide |
| Rating result | the total, or the refusal; each line as `{{name}}: {{amount}}` with its worksheet nested |
| Rating guide | each line's name, description, and worksheet guide |
| Program result | the verdict `{{name}}: {{status}}`; `Decision: {{decision}}` when the result holds one; each notice and each limit; the qualification's sections; the rating's sections |
| Program guide | the name and description; the notices that hold no slot; the authority's rules as a rule guide; the qualification's guide; the rating's guide |

- A finding with no message prints its rule's name with the `rules` word, and a finding that isn't `met` never prints its message.
- An absent decision prints nothing: interpret doesn't guess which cause removed it.

## A finding under `not`

interpret finds the finding's rule in its pass, pairs the rule's atoms in `extractAtoms` order with the finding's premises, and runs the same reasons rule over that pairing, so a flat reading never happens. Where the premise count or a premise's field doesn't match its atom, or the recomputed state differs from the finding's, the line prints without reasons. A reason under a key another rule concludes prints as a plain fact, because a finding holds no other rule's result.

## A rating's worksheet

`@orkestrel/rater`'s worksheet factor drops the raw value. The adapter sets it to `value` only where a factor authors no changes and no bounds. Otherwise a lookup or range with a fallback prints `source.either`, no `before its changes` line prints, and a factor with no value prints `found no value to use` without naming a missed entry. Part two of the family's removal carries `raw` and lifts this.

## Truth

| # | Rule | Proof |
| --- | --- | --- |
| T19 | A message prints only for a finding whose state is `met` | a real qualifier run over a definition where most rules don't fire; no unfired rule's message is in the text |
| T20 | A finding's cited checks fix its state, as T3 | generated trees to depth 3 with all five connectives through the real qualifier; a misaligned premise list gives no reasons |
| T21 | The verdict word is the result's own, and a result whose errors outnumber its faults states none. A program is judged by its qualification's counts alone, because its status is read from the qualification and the rating before the authority runs; a limit prints only where the program's own errors don't outnumber its faults | real refused runs of each engine, a failed rating with no fault (`unrated`), and an authority that reads a total no rating gave |
| T22 | A line states an amount only when its result holds one, and never an entry over a fallback it can't tell apart | a lookup whose fallback equals an entry, through the real rater |
| T23 | interpret reads no worded member of a family result | results whose `label`, `expression`, `steps`, `trace`, and `errors` entries are replaced with other text give the same account |
| T24 | A text holding an unfilled slot never prints | a message and a description with a `{{slot}}`, in each guide |

These, and T11's sweep of the family's own tables, run over the three packages as development dependencies, on the user's word of 2026-11-25: "Interpret may use use qualifier, rater, and program in its tests only". No file under `src/` imports them.

## What the family's removal must keep

Nothing here breaks under parts one and two, provided they keep `message`, `premises[].field`, `premises[].actual`, every `state`, and the length of `errors`. If part one hands interpret an unfilled message with its values, filling it is an added step.
