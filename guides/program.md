# Program

> The program composition layer: a pure, JSON-serializable `ProgramDefinition`
> that composes one qualification with an optional rating, plus notices,
> authority, and batch aggregate policy, and a `Program` that executes that
> definition in one direction — qualify, select, rate, derive status, then decide.

Qualification decides whether rating happens: a globally ineligible, referred, or
failed subject never reaches the rater, and scoped ineligibility removes only the
matching line before the first rating call. Omitting `rating` authors a
first-class eligibility-only program — the rater is never invoked, an eligible
subject resolves to `'eligible'` (or `'conditional'` under an applied condition),
and status is never `'unrated'`; an authored rating with zero lines still yields
`'unrated'`, unchanged. A definition's `shape` is read at the door before anything else reads the
subject, and missing information reads `'incomplete'` with eligibility `'referral'` and no decision.
The rater always receives what the door admitted; qualification and aggregate working projections
stay private to orchestration.
`Program` executes synchronously. Its result is repeatable only while inputs and
options stay unchanged and dependency behavior remains unchanged and deterministic.

`Program` performs no reasoning arithmetic. It owns orchestration and business
outcomes — notices, authority, status, decisions, and batch aggregates — while
delegating eligibility to `Qualifier`, amounts and worksheets to `Rater`, and
logical or quantitative mechanics to the shared `@orkestrel/reason` engine behind
them. Every output is a fresh `ProgramResult` or `AggregateResult` carrying the
nested qualification and rating evidence, program determinations, trace, errors,
status, optional decision, and the `faults`, `repairs`, and `defaulted` a caller asks and reports from.
`Program` either receives injected qualifier,
rater, and engine instances (never destroyed by `Program`) or creates and owns
one shared quantitative-plus-logical engine (`bail: false`), destroyed in
`destroy()`. Every `execute` call fires through `Program`'s typed `emitter`.
Source: [`src/core`](../src/core). Surfaced through the `@src/core` barrel.

## Surface

Create a program, execute one subject, and inspect the nested results:

```ts
import { buildProgramDefinition, createProgram } from '@orkestrel/program'
import { createQualificationDefinition, createRuling } from '@orkestrel/qualifier'
import { buildLineDefinition, buildRatingDefinition } from '@orkestrel/rater'
import {
	createAtom,
	createFactorGroup,
	createLogicalDefinition,
	createQuantitativeDefinition,
	createRule,
	createStaticFactor,
} from '@orkestrel/reason'

const gates = createLogicalDefinition('gates', 'Eligibility gates', [
	createRule(
		'licensed',
		[createAtom('licensed', 'equals', false)],
		createAtom('blocked', 'equals', true),
	),
])

const qualification = createQualificationDefinition(
	'standard-qualification',
	'Standard qualification',
	[gates],
	{
		rulings: [
			createRuling('license', 'gates', 'licensed', 'restriction', {
				message: 'A license is required',
			}),
		],
	},
)

const base = buildLineDefinition(
	'base',
	'Base premium',
	createQuantitativeDefinition('base-rate', 'Base rate', [
		createFactorGroup('amount', 'sum', [createStaticFactor('minimum', 100)]),
	]),
)

const rating = buildRatingDefinition('standard-rating', 'Standard rating', [base])
const definition = buildProgramDefinition('standard', 'Standard program', qualification, rating)
const program = createProgram(definition)

const eligible = program.execute({ id: 'risk-1', licensed: true })
eligible.status // 'eligible'
eligible.rating?.total // 100

const ineligible = program.execute({ id: 'risk-2', licensed: false })
ineligible.status // 'ineligible'
ineligible.rating // undefined — the rater was not called

program.destroy()
```

The array overload is declared first and performs one aggregate-aware batch
execution:

```ts
const result = program.execute([
	{ id: 'a', licensed: true, amount: 10 },
	{ id: 'b', licensed: false, amount: 20 },
])

result.count // 2
result.subjects[0]?.status // 'eligible'
result.subjects[1]?.status // 'ineligible'
result.tallies.eligible.count // 1
result.tallies.ineligible.count // 1
```

A `ProgramManager` stores compiled programs without hiding them behind a second
business facade — the manager owns collection lifecycle, each `Program` owns
execution:

```ts
import { createProgramManager } from '@orkestrel/program'

const manager = createProgramManager()
manager.add(definition)

const standard = manager.program('standard')
standard?.execute(subject)

manager.destroy()
```

### Types

| Name                      | Kind      | Signature                                                                                                                                                                                                                                                                                                                                                                               | Summary                                                                                                |
| ------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `Decision`                | type      | `'approved' \| 'denied' \| 'submitted'`                                                                                                                                                                                                                                                                                                                                                 | Identifies a final authority outcome, derived from global eligibility.                                 |
| `Status`                  | type      | `(typeof STATUSES)[number]`                                                                                                                                                                                                                                                                                                                                                             | Identifies the presentation and tally status derived from eligibility, conditions, and rating success. |
| `ProgramEffect`           | type      | `'notice' \| 'limit'`                                                                                                                                                                                                                                                                                                                                                                   | Identifies a post-qualification program determination effect.                                          |
| `ProgramErrorCode`        | type      | `'DUPLICATE' \| 'MISSING' \| 'DEFINITION' \| 'MISMATCH' \| 'RESERVED' \| 'DESTROYED'`                                                                                                                                                                                                                                                                                                   | Identifies a coded `ProgramError` programmer-error code.                                               |
| `ProgramInput`            | interface | `{ description?, notices?, authority?, aggregate?, metadata?, shape? }`                                                                                                                                                                                                                                                                                                                 | Describes the optional fields accepted by `buildProgramDefinition`.                                    |
| `NoticeInput`             | interface | `{ scope? }`                                                                                                                                                                                                                                                                                                                                                                            | Describes the optional fields accepted by `buildNotice`.                                               |
| `AggregateInput`          | interface | `{ partition?, gates? }`                                                                                                                                                                                                                                                                                                                                                                | Describes the optional fields accepted by `buildAggregateDefinition`.                                  |
| `Notice`                  | interface | `{ id, message, scope? }`                                                                                                                                                                                                                                                                                                                                                               | Describes an authored, unconditional program notice.                                                   |
| `Determination`           | interface | `{ id, effect, state, scope?, message?, premises }`                                                                                                                                                                                                                                                                                                                                     | Describes one resolved notice or authority-limit outcome.                                              |
| `AggregateDefinition`     | interface | `{ fields, partition?, gates? }`                                                                                                                                                                                                                                                                                                                                                        | Describes batch aggregate fields, an optional partition field, and optional gates.                     |
| `AggregateProjection`     | interface | `{ count, sums, group? }`                                                                                                                                                                                                                                                                                                                                                               | Describes one subject's private aggregate working projection.                                          |
| `AggregateGroup`          | interface | `{ key, count, sums }`                                                                                                                                                                                                                                                                                                                                                                  | Describes one batch aggregate partition.                                                               |
| `Tally`                   | interface | `{ count, sums }`                                                                                                                                                                                                                                                                                                                                                                       | Describes a status tally — a count plus summed aggregate fields.                                       |
| `ProgramDefinition`       | interface | `{ id, name, description?, qualification, rating?, notices?, authority?, aggregate?, metadata?, shape? }`                                                                                                                                                                                                                                                                               | Describes a pure authored program definition.                                                          |
| `ProgramResult`           | interface | `{ id, name, eligibility, status, decision?, qualification, rating?, determinations, success, trace, errors, faults, repairs, defaulted }`                                                                                                                                                                                                                                              | Describes one subject's complete program outcome.                                                      |
| `AggregateResult`         | interface | `{ id, name, subjects, determinations, groups, tallies, count, sums, success, trace, errors, faults, repairs, defaulted }`                                                                                                                                                                                                                                                              | Describes a batch program outcome across every subject.                                                |
| `ProgramEventMap`         | type      | `{ readonly qualify: readonly [result: QualificationResult]; readonly rate: readonly [result: RatingResult]; readonly determine: readonly [result: Determination]; readonly decide: readonly [decision: Decision, result: ProgramResult]; readonly execute: readonly [result: ProgramResult]; readonly aggregate: readonly [result: AggregateResult]; readonly destroy: readonly []; }` | Describes the push observation surface of a `ProgramInterface`.                                        |
| `ProgramOptions`          | interface | `{ qualifier?, rater?, engine?, validate?, labels?, on?, error? }`                                                                                                                                                                                                                                                                                                                      | Describes the options for `createProgram` / the `Program` constructor.                                 |
| `ProgramInterface`        | interface | `{ id, name, definition, emitter, execute(), validate(), destroy() }`                                                                                                                                                                                                                                                                                                                   | Defines one compiled program that composes one qualifier and one rater over a shared reason engine.    |
| `ProgramManagerEventMap`  | type      | `{ readonly add: readonly [id: string]; readonly remove: readonly [id: string]; readonly destroy: readonly []; }`                                                                                                                                                                                                                                                                       | Describes the push observation surface of a `ProgramManagerInterface`.                                 |
| `ProgramManagerOptions`   | interface | `{ qualifier?, rater?, engine?, programs?, validate?, labels?, on?, error? }`                                                                                                                                                                                                                                                                                                           | Describes the options for `createProgramManager` / the `ProgramManager` constructor.                   |
| `ProgramManagerInterface` | interface | `{ emitter, count, has(), program(), programs(), add(), remove(), destroy() }`                                                                                                                                                                                                                                                                                                          | Defines an ordered manager over compiled programs, sharing one qualifier and rater.                    |

Every public data member is `readonly`, every optional key is omitted rather than
`undefined`, and each name is single-word within its entity. Qualifier
supplies `Eligibility`, `Premise`, `QualificationDefinition`, and `QualificationResult`;
rater supplies `RatingDefinition` and `RatingResult`; reason supplies
`LogicalDefinition`, `Subject`, the engine, and the `ReasonValidationResult` type
`validate` returns; contract supplies `FieldPath` and
`JSONValue`; the emitter supplies the observation types.

### Constants

| Name                       | Kind  | Signature                                                                                 | Summary                                                                                                  |
| -------------------------- | ----- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `PROGRAM_EFFECTS`          | const | `readonly ProgramEffect[]`                                                                | Lists every `ProgramEffect` literal, the source the determination shape reads.                           |
| `DECISIONS`                | const | `readonly Decision[]`                                                                     | Lists every `Decision` literal, the source the decision shape reads.                                     |
| `DEFAULT_PROGRAM_VALIDATE` | const | `true`                                                                                    | Names the default definition validation policy, `true`, for `createProgram` / `ProgramManager.add`.      |
| `STATUSES`                 | const | `readonly ["ineligible", "referral", "incomplete", "conditional", "unrated", "eligible"]` | Lists every `Status` literal in tally order — the source the union and its guard derive from.            |
| `ELIGIBILITY_DECISIONS`    | const | `Readonly<Record<Eligibility, Decision>>`                                                 | Maps each global eligibility to its deterministic authority decision.                                    |
| `AGGREGATE_KEY`            | const | `"aggregate"`                                                                             | Names the reserved working-subject key a batch's aggregate projection is written under, `'aggregate'`.   |
| `OUTCOME_KEY`              | const | `"outcome"`                                                                               | Names the reserved working-subject key the authority's outcome projection is written under, `'outcome'`. |

`STATUSES` and `ELIGIBILITY_DECISIONS` are `Object.freeze`d; the reserved keys and
the validation default are primitives. The reserved keys exist only for composed
program execution — neither sibling package reserves these subject keys.
`completeTallies` writes every `Status` member as a literal record, and `isTallies`
checks membership through `STATUSES`.

### Errors

The error guard recognizes the shared brand across package copies and accepts
subclasses without requiring their name. It refuses transparent proxies and
unbranded look-alikes.

| Name             | Kind     | Signature                                                                                           | Summary                                                                                                                           |
| ---------------- | -------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `ProgramError`   | class    | `new (code: ProgramErrorCode, message: string, context?: unknown, cause?: unknown) => ProgramError` | Reports a coded programmer error thrown by the program layer, carrying a machine-readable code and an optional context and cause. |
| `isProgramError` | function | `(value: unknown) => value is ProgramError`                                                         | Determines whether a caught value is a `ProgramError`.                                                                            |

```ts
import { isProgramError, ProgramError } from '@orkestrel/program'

try {
	throw new ProgramError('RESERVED', 'Subject contains a reserved program key', 'aggregate')
} catch (error) {
	if (isProgramError(error)) error.code // 'RESERVED'
}
```

Eligibility and rating failures remain nested result evidence rather than throws.

### Validators

All guards are total: adversarial input returns `false`, never throws. Authored
inputs use exact-record posture. `isNotice` stays exact because `Notice` appears
only in authored definitions; result notices are `Determination` values.

Result guards use open posture. They admit unknown members and class instances,
refuse arrays, and accept an optional member when it is absent or `undefined`.
Use `isProgramResult` and `isAggregateResult` when a result arrives through a
borrowed `ProgramInterface`. Each composite guard checks the full nested closure,
except the string-dictionary leaves (`sums`, `scopes`), which certify own members
only — a value carrying them on a prototype is admitted unchecked.
Holding `isProgramResult` therefore also holds qualifier's published
`isQualificationResult` closure and rater's published `isRatingResult` closure.
A `validate` result belongs to `@orkestrel/reason`, so narrow one with the
`isReasonValidationResult` guard from that package.

| Name                    | Kind     | Signature                                                       | Summary                                                              |
| ----------------------- | -------- | --------------------------------------------------------------- | -------------------------------------------------------------------- |
| `isDecision`            | const    | `Guard<Decision>`                                               | Determines whether a value is a `Decision` literal.                  |
| `isStatus`              | const    | `Guard<Status>`                                                 | Determines whether a value is a `Status` literal.                    |
| `isProgramEffect`       | const    | `Guard<ProgramEffect>`                                          | Determines whether a value is a `ProgramEffect` literal.             |
| `isNotice`              | function | `(value: unknown) => value is Notice`                           | Determines whether a value is an exact `Notice` record.              |
| `isAggregateDefinition` | function | `(value: unknown) => value is AggregateDefinition`              | Determines whether a value is an exact `AggregateDefinition` record. |
| `isProgramDefinition`   | function | `(value: unknown) => value is ProgramDefinition`                | Determines whether a value is an exact `ProgramDefinition` record.   |
| `isProgramSums`         | function | `(value: unknown) => value is Readonly<Record<string, number>>` | Determines whether a value is an open program sums record.           |
| `isDetermination`       | const    | `Guard<Determination>`                                          | Determines whether a value is an open result-side `Determination`.   |
| `isAggregateGroup`      | const    | `Guard<AggregateGroup>`                                         | Determines whether a value is an open result-side `AggregateGroup`.  |
| `isTally`               | const    | `Guard<Tally>`                                                  | Determines whether a value is an open result-side `Tally`.           |
| `isTallies`             | function | `(value: unknown) => value is Readonly<Record<Status, Tally>>`  | Determines whether a value is a total open status-tally record.      |
| `isProgramResult`       | const    | `Guard<ProgramResult>`                                          | Determines whether a value is an open `ProgramResult`.               |
| `isAggregateResult`     | const    | `Guard<AggregateResult>`                                        | Determines whether a value is an open `AggregateResult`.             |

`isProgramSums` checks every own string-named member, including non-enumerable
members, as a JavaScript `number`; it ignores inherited and symbol-named members.
`isTallies` requires every status in `STATUSES`, while admitting unknown
members because `Record<Status, Tally>` does not forbid them.

```ts
import {
	isAggregateDefinition,
	isAggregateResult,
	isDecision,
	isDetermination,
	isNotice,
	isProgramDefinition,
	isProgramResult,
	isStatus,
} from '@orkestrel/program'

isDecision('approved') // true
isStatus('conditional') // true
isNotice({ id: 'file', message: 'Subject retained for audit' }) // true
isAggregateDefinition({ fields: ['amount'], partition: 'location' }) // true
isProgramDefinition(definition) // true
isDetermination({ id: 'audit', effect: 'notice', state: 'met', premises: [] }) // true
isProgramResult(program.execute(subject)) // true
isAggregateResult(program.execute(subjects)) // true
```

`isProgramDefinition` establishes exact shape only. `Program.validate` additionally
checks semantic references and delegates nested validation to qualifier and rater.

### Helpers

The program helpers are pure orchestration leaves. They do not reproduce qualifier,
rater, or reason logic — message interpolation and rich premise construction for
authority and aggregate-gate rules reuse `@orkestrel/qualifier`'s own
`interpolateMessage`, `findRule`, and `ruleToPremises` (all public qualifier exports,
generic over any `Rule`) rather than re-implementing them, so a premise reports what the rule
itself read.

| Name                        | Kind     | Signature                                                                                                                                                                                                                                                                                              | Summary                                                                                                                              |
| --------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `projectAggregateResult`    | function | `(result: AggregateResult) => JSONValue \| undefined`                                                                                                                                                                                                                                                  | Projects a batch result to the JSON its contract reads.                                                                              |
| `projectProgramResult`      | function | `(result: ProgramResult) => JSONValue \| undefined`                                                                                                                                                                                                                                                    | Projects a result to the JSON its contract reads.                                                                                    |
| `scanProgramShape`          | function | `(definition: ProgramDefinition) => ShapeScan`                                                                                                                                                                                                                                                         | Describes what is wrong with a program's shape, against the program itself.                                                          |
| `findAggregateGap`          | function | `(shape: ContractShape, field: FieldPath) => string \| undefined`                                                                                                                                                                                                                                      | Reads what a shape says about an aggregate field or the partition.                                                                   |
| `buildRefusedQualification` | function | `(definition: QualificationDefinition, admission: SubjectAdmission) => QualificationResult`                                                                                                                                                                                                            | Builds the qualification a subject refused at the program's door stands in for.                                                      |
| `matchesNumberField`        | function | `(shape: ContractShape, field: FieldPath) => boolean`                                                                                                                                                                                                                                                  | Determines whether a field a shape declares can only hold a number a sum can read.                                                   |
| `isSettledResult`           | function | `(result: LogicalResult) => boolean`                                                                                                                                                                                                                                                                   | Determines whether a borrowed authority or gate read everything it needed.                                                           |
| `isDefinitionRefusal`       | function | `(error: unknown) => boolean`                                                                                                                                                                                                                                                                          | Determines whether an error says a borrowed part refused a definition.                                                               |
| `isInputFault`              | function | `(fault: AuditFault) => boolean`                                                                                                                                                                                                                                                                       | Determines whether a fault names an input a question can be asked about.                                                             |
| `selectProgramLines`        | function | `(lines: readonly LineDefinition[], scopes: Readonly<Record<string, Eligibility>>) => readonly LineDefinition[]`                                                                                                                                                                                       | Selects the rating lines a subject may be rated on from scoped eligibility.                                                          |
| `deriveStatus`              | function | `(definition: ProgramDefinition, qualification: QualificationResult, rating?: RatingResult) => Status`                                                                                                                                                                                                 | Derives the final program `Status` from a definition's rating policy and qualification/rating evidence.                              |
| `decideEligibility`         | function | `(eligibility: Eligibility) => Decision`                                                                                                                                                                                                                                                               | Maps a global `Eligibility` to its deterministic authority `Decision`.                                                               |
| `buildNoticeDeterminations` | function | `(notices: readonly Notice[], subject: Readonly<Record<string, unknown>>) => readonly Determination[]`                                                                                                                                                                                                 | Resolves authored `Notice` values into unconditionally-applied `notice` `Determination` values.                                      |
| `buildLimitDeterminations`  | function | `(definition: LogicalDefinition, result: LogicalResult, working: Readonly<Record<string, unknown>>, labels?: Readonly<Record<string, string>>) => readonly Determination[]`                                                                                                                            | Converts a logical result's applied rules into `limit` `Determination` values.                                                       |
| `buildProgramResult`        | function | `(definition: ProgramDefinition, qualification: QualificationResult, rating: RatingResult \| undefined, determinations: readonly Determination[], status: Status, options?: { readonly authority?: LogicalResult; readonly admission?: SubjectAdmission; }) => ProgramResult`                          | Assembles a `ProgramResult` from its qualification, rating, and determination parts — before or after authority.                     |
| `buildOutcomeProjection`    | function | `(result: ProgramResult) => Readonly<Record<string, unknown>>`                                                                                                                                                                                                                                         | Builds the private authority outcome projection from an assembled program result.                                                    |
| `buildQualificationSubject` | function | `(subject: Subject, aggregate?: AggregateProjection) => Subject`                                                                                                                                                                                                                                       | Adds optional aggregate context to a private subject copy for qualification.                                                         |
| `findMissingScopes`         | function | `(definition: ProgramDefinition) => readonly string[]`                                                                                                                                                                                                                                                 | Returns authored scopes (qualification ruling scopes or notice scopes) that name no rating line on the program.                      |
| `hasProgramKey`             | function | `(subject: Readonly<Record<string, unknown>>) => boolean`                                                                                                                                                                                                                                              | Determines whether a caller subject already carries a reserved program key.                                                          |
| `assertProgramSubject`      | function | `(subject: unknown) => asserts subject is Subject`                                                                                                                                                                                                                                                     | Asserts a value is a valid program `Subject`, narrowing it in place.                                                                 |
| `assertProgramDefinition`   | function | `(definition: ProgramDefinition) => void`                                                                                                                                                                                                                                                              | Asserts a program definition's always-on construction invariants — missing scope references and duplicate rating-line or notice ids. |
| `validateProgramDefinition` | function | `(definition: ProgramDefinition, qualifier: QualifierInterface, engine: ReasonInterface) => ReasonValidationResult`                                                                                                                                                                                    | Validates a program definition's shape, references, and nested definitions.                                                          |
| `formatGroupKey`            | function | `(subject: Subject, partition: FieldPath) => string`                                                                                                                                                                                                                                                   | Coerces a subject's partition-key field to its group-key string.                                                                     |
| `sumFields`                 | function | `(sums: Readonly<Record<string, number>>, subject: Subject, fields: readonly FieldPath[]) => Readonly<Record<string, number>>`                                                                                                                                                                         | Folds one subject's finite aggregate field values into a sums record.                                                                |
| `aggregateSums`             | function | `(subjects: readonly Subject[], fields: readonly FieldPath[]) => Readonly<Record<string, number>>`                                                                                                                                                                                                     | Sums aggregate fields across a batch of subjects.                                                                                    |
| `aggregateGroups`           | function | `(subjects: readonly Subject[], fields: readonly FieldPath[], partition?: FieldPath) => readonly AggregateGroup[]`                                                                                                                                                                                     | Partitions a batch of subjects by a field, summing aggregate fields per key.                                                         |
| `buildAggregateProjection`  | function | `(subject: Subject, count: number, sums: Readonly<Record<string, number>>, groups: readonly AggregateGroup[], partition?: FieldPath) => AggregateProjection`                                                                                                                                           | Builds one subject's overall and optional group aggregate projection.                                                                |
| `buildAggregateRecord`      | function | `(count: number, sums: Readonly<Record<string, number>>, groups: readonly AggregateGroup[]) => Readonly<Record<string, unknown>>`                                                                                                                                                                      | Builds the reserved-key record a batch aggregate-gate definition runs against.                                                       |
| `buildEmptySums`            | function | `(fields: readonly FieldPath[]) => Readonly<Record<string, number>>`                                                                                                                                                                                                                                   | Builds a zero-sum record for a set of aggregate fields.                                                                              |
| `buildEmptyTallies`         | function | `(fields: readonly FieldPath[]) => Readonly<Record<Status, Tally>>`                                                                                                                                                                                                                                    | Builds complete zero status tallies in `STATUSES` order.                                                                             |
| `completeTallies`           | function | `(entries: Partial<Record<Status, Tally>>) => Readonly<Record<Status, Tally>>`                                                                                                                                                                                                                         | Completes a partial status tally record with zero entries for every missing `Status`.                                                |
| `tallySubject`              | function | `(tallies: Readonly<Record<Status, Tally>>, result: ProgramResult, subject: Subject, fields: readonly FieldPath[]) => Readonly<Record<Status, Tally>>`                                                                                                                                                 | Adds one subject's aggregate contribution to a status tally record.                                                                  |
| `buildAggregateResult`      | function | `(definition: ProgramDefinition, subjects: readonly ProgramResult[], determinations: readonly Determination[], groups: readonly AggregateGroup[], tallies: Readonly<Record<Status, Tally>>, sums: Readonly<Record<string, number>>, options?: { readonly gates?: LogicalResult; }) => AggregateResult` | Assembles one batch `AggregateResult` from its per-subject and aggregate parts.                                                      |
| `buildProgramDefinition`    | function | `(id: string, name: string, qualification: QualificationDefinition, rating?: RatingDefinition, input?: ProgramInput) => ProgramDefinition`                                                                                                                                                             | Builds a fresh `ProgramDefinition`.                                                                                                  |
| `buildNotice`               | function | `(id: string, message: string, input?: NoticeInput) => Notice`                                                                                                                                                                                                                                         | Builds a fresh `Notice`.                                                                                                             |
| `buildAggregateDefinition`  | function | `(fields: readonly FieldPath[], input?: AggregateInput) => AggregateDefinition`                                                                                                                                                                                                                        | Builds a fresh `AggregateDefinition`.                                                                                                |

The per-subject orchestration leaves guard the subject, select surviving lines, and
map eligibility to a decision:

```ts
import {
	assertProgramDefinition,
	assertProgramSubject,
	decideEligibility,
	hasProgramKey,
	selectProgramLines,
} from '@orkestrel/program'

hasProgramKey({ id: 'r1' }) // false
hasProgramKey({ id: 'r1', aggregate: {} }) // true
assertProgramSubject({ id: 'r1' }) // narrows to Subject; throws ProgramError('RESERVED') on a reserved key
assertProgramDefinition(definition) // throws ProgramError('MISSING' | 'DUPLICATE') at construction, regardless of options.validate
selectProgramLines(lines, { wind: 'ineligible' }) // every line except the 'wind' line
decideEligibility('eligible') // 'approved'
```

The batch leaves sum configured fields, partition subjects, and seed zero records:

```ts
import {
	aggregateGroups,
	aggregateSums,
	buildEmptySums,
	formatGroupKey,
	sumFields,
} from '@orkestrel/program'

const subjects = [
	{ id: 'a', location: 'west', total: 100 },
	{ id: 'b', location: 'west', total: 200 },
	{ id: 'c', location: 'east', total: 50 },
]

aggregateSums(subjects, ['total']) // { total: 350 }
aggregateGroups(subjects, ['total'], 'location') // [{ key: 'west', count: 2, sums: { total: 300 } }, { key: 'east', count: 1, sums: { total: 50 } }]
formatGroupKey({ location: 'west' }, 'location') // 'west' — String-coerced, so a missing field and '' land in the same partition
sumFields({ total: 0 }, subjects[0], ['total']) // { total: 100 } — a fresh record, only finite numbers contribute
buildEmptySums(['total']) // { total: 0 }
```

The definition leaves build the authored program values. Each returns a fresh value,
copies collections, and omits absent optional keys entirely:

```ts
import { buildAggregateDefinition, buildNotice, buildProgramDefinition } from '@orkestrel/program'

const aggregate = buildAggregateDefinition(['amount'], { partition: 'location' })
const notice = buildNotice('audit', 'Program {{program}} executed')

const definition = buildProgramDefinition('standard', 'Standard', qualification, rating, {
	notices: [notice],
	aggregate,
})
```

### Factories

| Name                              | Kind     | Signature                                                                       | Summary                                                                       |
| --------------------------------- | -------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `createProgramDefinitionContract` | function | `() => ContractInterface<unknown>`                                              | Creates a `ProgramDefinition` as a contract. Cross it on `is`, never `parse`. |
| `createProgram`                   | function | `(definition: ProgramDefinition, options?: ProgramOptions) => ProgramInterface` | Creates one compiled `ProgramInterface` over a qualifier and rater.           |
| `createProgramManager`            | function | `(options?: ProgramManagerOptions) => ProgramManagerInterface`                  | Creates one ordered `ProgramManagerInterface` over compiled programs.         |

The factories compile entities. The authored definitions they compile are plain
values, so their builders are helper leaves rather than factories.

#### Compile a program and a manager

Compile a definition into a program and a manager, execute a subject, and tear each down:

```ts
import { buildProgramDefinition, createProgram, createProgramManager } from '@orkestrel/program'

const definition = buildProgramDefinition('standard', 'Standard', qualification, rating)

const program = createProgram(definition)
const manager = createProgramManager({ programs: [definition] })

program.execute({ id: 'risk-1' })

program.destroy()
manager.destroy()
```

### Shapes

The definition and results as `ContractShape` values.

| Name                           | Kind     | Signature             | Summary                                                |
| ------------------------------ | -------- | --------------------- | ------------------------------------------------------ |
| `aggregateResultShape`         | const    | `ContractShape`       | Describes an `AggregateResult` in its JSON projection. |
| `tallyShape`                   | const    | `ContractShape`       | Describes a `Tally` in its JSON projection.            |
| `programSumsShape`             | const    | `ContractShape`       | Describes a sums record in its JSON projection.        |
| `programResultShape`           | const    | `ContractShape`       | Describes a `ProgramResult` in its JSON projection.    |
| `determinationShape`           | const    | `ContractShape`       | Describes a `Determination` in its JSON projection.    |
| `createProgramDefinitionShape` | function | `() => ContractShape` | Creates the shape of a `ProgramDefinition`.            |
| `noticeShape`                  | const    | `ContractShape`       | Describes a `Notice`.                                  |

### Contracts

The compiled contracts of what is flat enough to compile at import.

| Name                      | Kind  | Signature                    | Summary                                                                                                |
| ------------------------- | ----- | ---------------------------- | ------------------------------------------------------------------------------------------------------ |
| `aggregateResultContract` | const | `ContractInterface<unknown>` | Publishes an `AggregateResult`'s JSON projection as a contract, read through `projectAggregateResult`. |
| `programResultContract`   | const | `ContractInterface<unknown>` | Publishes a `ProgramResult`'s JSON projection as a contract, read through `projectProgramResult`.      |

### Classes

| Name             | Kind  | Signature                                                                           | Summary                                                                                                                                                       |
| ---------------- | ----- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Program`        | class | `new (definition: ProgramDefinition, options?: ProgramOptions) => ProgramInterface` | Composes one qualifier and one rater over a shared reason engine, compiling one authored definition and executing single subjects or aggregate-aware batches. |
| `ProgramManager` | class | `new (options?: ProgramManagerOptions) => ProgramManagerInterface`                  | Manages compiled `ProgramInterface` programs in order, sharing one qualifier, rater, and reason engine across every program it compiles.                      |

The package has no entity named `Rater`. Rating remains a sibling concern.

## Methods

#### `ProgramInterface`

The array overload is declared first, so the `execute` row's `Summary` carries the
batch form and the single-subject form returns one `ProgramResult` through the same
call. `execute` is the correct verb because it performs a composed workflow rather
than qualification or rating alone.

| Method     | Returns                              | Summary                                                          |
| ---------- | ------------------------------------ | ---------------------------------------------------------------- |
| `execute`  | `AggregateResult` or `ProgramResult` | Executes a subject list as one aggregate-aware batch.            |
| `validate` | `ReasonValidationResult`             | Validates this program's definition and every nested definition. |
| `destroy`  | `void`                               | Destroys this program, idempotently.                             |

```ts
const aggregate = program.execute(subjects)
const single = program.execute(subject)
const validation = program.validate()

program.destroy()
```

After destroy, `execute` and `validate` throw `ProgramError('DESTROYED')`.

#### `ProgramManagerInterface`

The manager follows the singular/plural accessor and batch-removal conventions. The
id-list overload of `remove` is declared first, so that row's `Summary` carries the
list form; one id removes that program and returns a `boolean`, and no argument
removes every compiled program and returns `void`.

| Method     | Returns                         | Summary                                                   |
| ---------- | ------------------------------- | --------------------------------------------------------- |
| `has`      | `boolean`                       | Reports whether an id names a compiled program.           |
| `program`  | `ProgramInterface \| undefined` | Looks one compiled program up by id.                      |
| `programs` | `readonly ProgramInterface[]`   | Returns every compiled program, in insertion order.       |
| `add`      | `ProgramInterface`              | Compiles one definition and appends it to the collection. |
| `remove`   | `boolean` or `void`             | Removes every listed id, destroying each removed program. |
| `destroy`  | `void`                          | Destroys this manager, idempotently.                      |

```ts
const manager = createProgramManager()

manager.add(definition)
manager.has(definition.id) // true
manager.program(definition.id)?.execute(subject)
manager.programs()
manager.remove(definition.id)
manager.remove()
manager.destroy()
```

The manager does not expose `execute`. Consumers deliberately choose a program, which
keeps execution and collection responsibilities separate.

## Contract

### Error codes

| Code         | Meaning                                                                                                        |
| ------------ | -------------------------------------------------------------------------------------------------------------- |
| `DUPLICATE`  | A manager already contains the program id, or an authored definition has a duplicate rating-line or notice id. |
| `MISSING`    | A notice, ruling scope, or other authored reference names no rating line.                                      |
| `DEFINITION` | Program, qualification, rating, authority, or aggregate policy is invalid.                                     |
| `MISMATCH`   | An injected entity or returned result has the wrong contract.                                                  |
| `RESERVED`   | A subject already carries `aggregate` or `outcome`.                                                            |
| `DESTROYED`  | An operation was attempted after teardown.                                                                     |

### Execution order

For one subject:

1. assert subject shape and reserved-key safety
2. admit the subject at the door, and on a refusal emit `qualify` with what the door said and go
   to step 10 with nothing rated
3. qualify what it admitted against the optional private aggregate projection
   and emit `qualify`
4. stop if qualification failed
5. stop if global eligibility is `ineligible` or `referral`
6. select rating lines from scoped eligibility
7. skip rating when no line remains
8. rate the selected lines against what the door admitted
9. emit `rate`
10. build notices
11. derive status
12. build the preliminary program result
13. run optional authority against the private outcome projection, unless the status is
    `incomplete`, whose outcome holds no answer to read
14. build and emit limit determinations
15. derive the optional decision
16. emit `decide` when present
17. emit `execute`

Every stop still returns a complete, successful business result when the terminal
eligibility itself was valid.

When `ProgramDefinition.rating` is omitted, line selection reads an empty line list,
rating is always skipped, and `rating` stays `undefined` for the whole execution —
the program is eligibility-only and the rater is never invoked, yet the remaining
steps (notices, status, authority, decision) still run.

### Qualification is terminal

A globally `ineligible` or `referral` qualification — or a failed one — is terminal:
the rater is never called and `rating` stays `undefined`.

```ts
const result = program.execute({ id: 'risk-2', licensed: false })

result.eligibility // 'ineligible'
result.rating // undefined — the rater was never called
result.success // true — a valid ineligible outcome still succeeds
```

`ineligible` and `referral` are outcomes, not technical failures, so they do not make
`ProgramResult.success` false; only a qualification, rating, or authority error does.

### Scoped eligibility

A scope names a rating-line id.

| Scoped result | Rating behavior | Program status                                             |
| ------------- | --------------- | ---------------------------------------------------------- |
| absent        | line selected   | unchanged                                                  |
| `eligible`    | line selected   | unchanged                                                  |
| `ineligible`  | line omitted    | `conditional` when another line rates; otherwise `unrated` |
| `referral`    | line omitted    | `referral`                                                 |

This table applies when `rating` is authored — see Eligibility-only (Patterns) for
the omitted-rating case, where `unrated` never occurs. Line selection happens before
the first rating call — an excluded line is never evaluated merely to discard its
amount. A ruling or notice scope naming no line in `ProgramDefinition.rating?.lines`
(including every scope when `rating` is omitted entirely) is a hard authoring error —
`assertProgramDefinition` throws `ProgramError('MISSING')` at construction.

### Conditions

An applied `condition` never removes a line — every eligible line still rates, and the
result becomes `conditional`. A scoped `restriction` behaves the same way for status:
it removes its own line but leaves the program `conditional` rather than globally
`ineligible` (an unscoped `restriction` already determines global ineligibility in
`Qualifier`).

### Rating failures

A rating failure is not converted into ineligibility:

- qualification remains eligible
- the failed line amount remains absent
- rating evidence remains nested
- program status becomes `unrated`
- program success becomes false because execution encountered technical errors
- authority receives `rated: true` and `status: 'unrated'`
- authority still runs and may emit `limit` determinations; the `decision` is suppressed because `status` is `unrated` (a decision gate, listed later)

Scoped referral keeps global eligibility `eligible` while status remains `referral`, so a clean authority still yields an `approved` decision.

### Notices

Notices are unconditional authored output. They:

- are emitted whether the subject is eligible or terminal
- may carry a scope for presentation
- never affect eligibility, status, line selection, or decision
- interpolate against the original subject
- are represented as `Determination` with `effect: 'notice'`

### Authority

Authority is optional and runs last, over a private `outcome` projection of the
assembled result — its id, eligibility, status, whether it rated, total, and scoped
eligibility — never the mutable internal state of either sibling engine. Applied
authority rules become `limit` determinations. A `decision` is present only when
every gate holds:

1. an authority definition exists on the program
2. execution succeeded — qualification, rating (when it ran), and authority all produced no errors
3. no `limit` determination applied
4. status is not `unrated`

A technically-failed qualification therefore never yields a decision, even when an
authority definition exists and would otherwise fire cleanly.

The decision is deterministic in global eligibility (`eligible → approved`,
`ineligible → denied`, `referral → submitted`), preserving the distinction between
approved-with-conditions and denied — a scoped restriction can yield
`status: 'conditional'` with `decision: 'approved'`.

### Aggregate execution

For a subject array:

1. validate every subject and reserved key, and admit each at the door
2. collect aggregate fields from `definition.aggregate`
3. compute overall sums from what the door admitted
4. compute optional groups the same way
5. build each subject's aggregate projection, unless the door refused a subject
6. execute subjects in input order
7. tally every result by status
8. run optional aggregate gates against the batch aggregate record (`count`, `sums`, `groups`),
   unless the door refused a subject
9. convert applied rules to batch `limit` determinations
10. emit `aggregate`

The aggregate-gate evaluation's `trace` and `errors` fold into
`AggregateResult.trace` / `AggregateResult.errors` alongside every subject's own, and
`AggregateResult.success` additionally requires the gate evaluation to have produced
no errors — a gate evaluation failure fails the batch result even when every subject
execution succeeded.

While the door has refused any subject the sums are not the batch's, so no subject reads the
`aggregate` projection and no gate runs. Such a batch fails, and its `sums` hold only what was
admitted.

Batch aggregation does not modify individual rating subjects.

### Aggregate projection

The qualifier may read aggregate context through the reserved `aggregate` key on a
private subject copy:

```ts
{
	...subject,
	aggregate: { count, sums, group },
}
```

The rater receives the original `subject`, never that private copy. This difference is
intentional and is covered by integration tests.

### Reserved keys

Caller subjects must not contain `aggregate` or `outcome` — these keys are private
program namespaces used only for reason-engine projections. A subject that already
carries either key is rejected with `ProgramError('RESERVED')` before qualification.

### Status

Status is explicit policy, not an opaque severity reducer. It resolves in this order:

1. global ineligible
2. a fault on an input the answer needs → `incomplete`, with eligibility `referral` and no decision
3. global or scoped referral
4. `ProgramDefinition.rating` is omitted (eligibility-only program) → `conditional` under an applied condition or scoped restriction, otherwise `eligible`, never `unrated`
5. no successful rating, an authored rating with zero lines included → `unrated`
6. applied condition or scoped restriction → `conditional`
7. otherwise → `eligible`

`incomplete` is the question a caller can answer, and `faults` names what to ask for: the door's
refusals, and any input a rule or a factor could not read. A later restriction still outranks it.
`referral` stays what a rule refers. A read of the `aggregate` projection is the program's own, so it
fails the run and asks nobody, and so does anything an authority could not read: write
`and(outcome.rated equals true, outcome.total above 100)` so the read is only reached when it holds.

### Decision

`Decision` is authority output:

| Eligibility  | Decision    |
| ------------ | ----------- |
| `eligible`   | `approved`  |
| `ineligible` | `denied`    |
| `referral`   | `submitted` |

No decision is emitted without an authority definition.

### The door

`ProgramDefinition.shape` declares the subject, and a program is its one root: a qualification, a
rating, or a line carrying a shape of its own is a `validate` error, because the program has already
read the subject once. An authority and an aggregate's `gates` keep theirs, because they read a
projection. With a shape, `validate` also refuses a field a pass, a line, or a notice reads that the
shape does not declare, and an aggregate field or partition that may be absent or `null` with no
default, because a sum would skip it and a partition would pool it. `validate` refuses an authority
over a qualification with no passes, which has nothing to decide on. A program that only rates is
allowed.

An `AggregateResult` gathers its subjects' `faults`, `repairs`, and `defaulted`, each once by path, and
each subject keeps its own. A result crosses a boundary as `projectProgramResult` or
`projectAggregateResult`, which `programResultContract` and `aggregateResultContract` admit. A
definition crosses on `createProgramDefinitionContract().is`, never `parse`. The contract validates
a nested `shape` through `shapeShape`, so both its `is` method and the `isProgramDefinition` guard
refuse a malformed declaration such as `shape: 42`.

### Success

`ProgramResult.success` indicates execution integrity:

- valid ineligibility can succeed
- valid referral can succeed
- an `incomplete` result fails
- qualification errors fail
- rating errors fail
- authority errors fail
- notices do not fail
- a deliberately unrated result caused only by scoped exclusions can succeed

`AggregateResult.success` requires every subject execution to succeed and the batch
aggregate-gate evaluation (when configured) to have produced no errors.

### Ownership

A standalone `Program`:

- reads the caller's definition once into an owned snapshot, runs construction
  assertions against that copy, seals its plain-object graph, and exposes only the
  sealed copy; a `Map`, `Set`, or `Date` reached through a reason `Check.value` is
  cloned but its contents remain mutable because the seal cannot reach its internal
  slots
- refuses a value that structured cloning cannot copy, or a non-empty typed array
  that cannot be frozen, with `ProgramError('DEFINITION')` and the host error as its
  cause
- borrows an injected reason engine or creates one shared quantitative-plus-logical engine
- injects that engine into any internally created qualifier and rater
- borrows independently injected qualifier and rater instances
- destroys only owned dependencies, its emitter last, and is idempotent — `destroy()`
  sets the destroyed flag first, so a listener re-entering `destroy()` is a no-op
- when construction fails (an invalid definition under `options.validate`), tears down
  everything already allocated — owned dependencies and the emitter, firing `destroy`
  — before rethrowing

A `ProgramManager`:

- creates or borrows one shared quantitative-plus-logical reason engine
- injects the same qualifier, rater, and engine into every compiled program
- destroys programs first, then owned shared dependencies, then its emitter last —
  reentrancy-safe the same way, the destroyed flag is set first
- when a seed program fails during construction, tears the manager down — draining
  and destroying every program already compiled (each firing `remove` first), then
  owned shared dependencies, then the emitter — before rethrowing the original error

### Events

Single execution event order:

```text
qualify
rate?             only when at least one line is selected
determine*        notices, then limits
decide?           only when authority permits
execute
```

Batch execution emits the per-subject events first, then aggregate determinations,
then `aggregate`. Events are synchronous, and listener failures are isolated by the
owned emitter.

### Validation

The program's subject shape cannot declare `outcome`, `aggregate`, or a qualification rule's
conclusion field. Ruling message tokens are checked against that root shape. An authority reads
only the computed outcome projection or its own derived conclusions; subject fields and unknown
outcome fields are refused at validation. The projection declares `id`, `eligibility`, `status`,
`rated`, `total`, and `scopes` keyed by rating-line id. A declared field can still be absent at
execution: `total` is absent when rating did not run, and an unread authority produces no decision.

`Program.validate` (`validateProgramDefinition`) checks:

1. exact shape through `isProgramDefinition` — this alone establishes rating structure and authority/gates shape, so validate performs no redundant re-check of either
2. non-empty id
3. non-empty name
4. nested qualification validation, delegated to the injected qualifier and prefixed `qualification:`
5. duplicate rating-line ids (when a rating is authored)
6. every qualification ruling scope names an existing rating line — when no rating is authored, any scope is an error, because no line exists to match
7. duplicate notice ids
8. every notice scope names an existing rating line — same empty-line rule when no rating is authored
9. authority validated semantically by the shared reason engine, prefixed `authority:`
10. aggregate fields are unique and non-empty
11. aggregate `partition` is non-empty when present
12. aggregate gates validated semantically by the shared reason engine, prefixed `aggregate:`

Always-on construction assertions run independently of `Program.validate` and of
`options.validate`: `assertProgramDefinition` rejects a missing scope reference
(`ProgramError('MISSING')`) and a duplicate rating-line or notice id
(`ProgramError('DUPLICATE')`) at construction, every time.

Qualification passes project their derivations under `qualification.<passId>` (the
qualifier reserves the `qualification` subject key), and authority runs against a
program-built private record whose only key is `outcome` — so an authored pass or
rule id can never collide with a caller subject key or either reserved working key;
there is no separate collision check to run.

Warnings stay conservative (validators do not attempt full logical theorem proving)
and include:

- a program whose rating defines no lines validates with the warning `Program rating has no lines`, and every eligible subject then resolves to `status: 'unrated'` because no line can rate (an omitted rating produces no such warning — it is eligibility-only by design, never `unrated`)
- aggregate gates defined without aggregate fields

## Patterns

### Globally ineligible

Execute a subject that qualification rejects globally:

```ts
const result = program.execute({ id: 'risk-1', licensed: false })

result.qualification.eligibility // 'ineligible'
result.rating // undefined
result.status // 'ineligible'
```

No quantitative reasoner call occurs.

### Eligibility-only

Execute an eligible subject without an authored rating:

```ts
const definition = buildProgramDefinition('gate-only', 'Gate only', qualification)
const program = createProgram(definition)

const result = program.execute({ id: 'risk-1', licensed: true })

result.rating // undefined — the rater is never invoked
result.status // 'eligible', never 'unrated'
```

Omitting `rating` authors an eligibility-only program: qualification and its optional
authority still run in full, but rating and its rating-line references disappear from
the workflow entirely.

### Rating-only

Execute an empty qualification before rating every authored line:

```ts
const qualification = createQualificationDefinition('all', 'All risks', [])
const definition = buildProgramDefinition('rate-only', 'Rate only', qualification, rating)
const program = createProgram(definition)

const result = program.execute({ id: 'risk-1' })

result.qualification.eligibility // 'eligible' — an empty qualification qualifies every subject
result.rating?.lines.length // every authored line rates
```

An empty qualification (no logical passes) qualifies every subject `eligible` with no
scoped exclusions, so every authored line rates unconditionally.

### Scoped exclusion

Exclude the scoped rating line through a qualification restriction:

```ts
const qualification = createQualificationDefinition(
	'property-qualification',
	'Property qualification',
	[windGates],
	{
		rulings: [
			createRuling('frame', 'wind-gates', 'frame', 'restriction', {
				scope: 'wind',
				message: 'Wind is unavailable for Frame construction',
			}),
		],
	},
)

const rating = buildRatingDefinition('property-rating', 'Property rating', [
	buildLineDefinition('wind', 'Wind', windRate),
	buildLineDefinition('exWind', 'Ex-Wind', exWindRate),
])

const result = createProgram(
	buildProgramDefinition('property', 'Property', qualification, rating),
).execute({
	id: 'risk-1',
	construction: 'Frame',
})

result.rating?.lines.map((line) => line.id) // ['exWind']
result.status // 'conditional'
```

The wind definition is not evaluated.

### Scoped referral

Author a scoped referral that omits the matching rating line:

```ts
createRuling('coastal-review', 'wind-gates', 'coastal-review', 'referral', {
	scope: 'wind',
	message: 'Wind requires underwriter review',
})
```

The wind line is omitted and program status is `referral`.

### Conditions

Author a condition that keeps every eligible rating line:

```ts
createRuling('protective-device', 'gates', 'protective-device', 'condition', {
	message: 'Install an approved protective device',
})
```

All eligible lines rate. The result becomes `conditional`.

### Notices

Attach an unconditional notice to a program definition:

```ts
const notice = buildNotice('minimum', 'Minimum earned premium applies')

const definition = buildProgramDefinition('standard', 'Standard', qualification, rating, {
	notices: [notice],
})
```

### Authority

Apply final authority to a conditional program result:

```ts
const authority = createLogicalDefinition('authority', 'Final authority', [
	createRule(
		'manual',
		[createAtom(['outcome', 'status'], 'equals', 'conditional')],
		createAtom('limited', 'equals', true),
		{
			name: 'Manual authority required',
			description: 'Conditional outcomes require manual authority',
		},
	),
])

const definition = buildProgramDefinition('standard', 'Standard', qualification, rating, {
	authority,
})
```

A conditional result receives a `limit` determination and no decision.

### Aggregate qualification

Qualify each subject against its private aggregate projection:

```ts
const aggregate = buildAggregateDefinition(['total'], { partition: 'location' })

const qualification = createQualificationDefinition(
	'portfolio-qualification',
	'Portfolio qualification',
	[
		createLogicalDefinition('aggregate-gates', 'Aggregate gates', [
			createRule(
				'location-cap',
				[createAtom(['aggregate', 'group', 'sums', 'total'], 'above', 5_000_000)],
				createAtom('blocked', 'equals', true),
			),
		]),
	],
	{
		rulings: [
			createRuling('location-cap', 'aggregate-gates', 'location-cap', 'restriction', {
				message: 'Location total exceeds the program maximum',
			}),
		],
	},
)
```

Each subject qualifies against its own group projection while rating still receives
the original subject.

### Aggregate gates

Apply the aggregate-gate logical definition to the completed batch aggregate:

```ts
const gates = createLogicalDefinition('batch-gates', 'Batch gates', [
	createRule(
		'portfolio-cap',
		[createAtom(['aggregate', 'sums', 'total'], 'above', 20_000_000)],
		createAtom('limited', 'equals', true),
	),
])

const aggregate = buildAggregateDefinition(['total'], { gates })
```

These gates create batch determinations. They do not retroactively change individual
qualification or rating results.

### Shared dependencies

Inject caller-owned qualifier, rater, and reason instances into a manager:

```ts
const reason = createReason({
	reasoners: [createQuantitativeReasoner(), createLogicalReasoner()],
	bail: false,
})
const qualifier = createQualifier({ engine: reason })
const rater = createRater({ engine: reason })

const manager = createProgramManager({ qualifier, rater, engine: reason, programs: definitions })

manager.destroy()

// Injected dependencies remain caller-owned.
qualifier.destroy()
rater.destroy()
reason.destroy()
```

Build an injected shared engine with `bail: false`, as the preceding example shows — matching the
engine `Program` creates when none is injected. Ordinary evaluation failures (a failed
factor, an unresolvable field) surface as nested result evidence regardless of `bail`;
`bail` governs only a reasoner's own internal throw, which `bail: true` rethrows
through `program.execute` as the sibling's error instead of nesting it. An engine
missing a required reasoner always throws on dispatch, bypassing `bail` entirely —
`Program.validate` reports that misconfiguration up front.

### Observing

Subscribe to every program event through the typed emitter hooks:

```ts
const program = createProgram(definition, {
	on: {
		qualify: (result) => audit.qualification(result),
		rate: (result) => audit.rating(result),
		determine: (result) => audit.determination(result),
		decide: (decision, result) => audit.decision(decision, result),
		execute: (result) => audit.program(result),
		aggregate: (result) => audit.aggregate(result),
	},
	error: (error, event) => audit.listenerError(error, event),
})
```

## Tests

Tests mirror the source structure under `tests/src/core` —
`validators.test.ts`, `helpers.test.ts`, and `factories.test.ts` for the centralized
surfaces, `programs/Program.test.ts` and `programs/ProgramManager.test.ts` for the
entities, and the reserved `integration.test.ts` for cross-entity composition — and
use real qualifier, rater, and reason instances rather than mocks.

### Program cases

The program suite proves the composed workflow: it qualifies before rating; never
rates a globally ineligible, referred, or failed subject; rates only eligible scopes
and skips rating when no scope remains; passes the original subject to the rater;
keeps the aggregate projection private to qualification; preserves nested
qualification findings and rating worksheets; derives conditional, referral, and
unrated status; runs authority last and omits the decision when a limit applies,
status is `unrated`, or execution technically failed; maps eligibility to decision;
emits events in contract order; destroys only owned dependencies; rejects reserved
subject keys and post-destroy calls; and never mutates definitions, subjects, or
sibling results.

The hardened suite additionally proves: an aggregate-gate evaluation error fails and
surfaces on `AggregateResult`; a technically-failed qualification never yields a
decision even with a clean authority; eligibility-only programs resolve status and
decisions correctly, never call the rater, and still tally correctly in a batch;
batch execution rejects a reserved-key subject before any work runs; an all-lines
scoped-out subject resolves `unrated`; listener throws are isolated through each
entity's `error` handler; `destroy`/`execute` reentrancy from within a listener, and
`ProgramManager` reentrancy from a `remove` listener, are all no-ops or safe; a
construction failure tears down everything already allocated (firing `destroy` /
`remove` hooks) while leaving injected dependencies untouched; duplicate rating-line
and notice ids are rejected at construction even under `validate: false`; hostile
subjects carrying `__proto__` / `constructor` keys never pollute a prototype;
aggregate numeric edges (`NaN`, `Infinity`, non-numeric, and absent values all
contribute zero; nested field paths sum correctly) plus group-key coercion
collisions, first-seen group order, large batches, and duplicate subject ids are all
covered; validation branch messages match exactly; notice interpolation handles a
missing token, nested paths, and en-US thousands grouping; and a limit determination
for a description-less rule omits `message`.

### No-rate and original-subject proofs

A recorder-backed rater — a real `RaterInterface` that records every subject and line
selection it receives without rating — proves the load-bearing invariants directly: a
globally ineligible subject produces no recorded call, an aggregate execution records
only original subjects (never the private `aggregate` projection), and a scoped
restriction records only the surviving line ids. The recorder's leading-underscore
callback parameters are justified callback-conformance bindings in the shared test
collaborator, not production source.

### Batch and manager cases

The batch suite proves overall sums, first-seen group order, per-subject group
projections, complete zero tallies, aggregate gates running once, and an empty batch.
The manager suite proves ordered seeding, duplicate-id rejection, defensive program
arrays, removal of one / listed / all programs, and that one shared qualifier, rater,
and engine back every program.

### Shared-engine ownership

An integration test injects one shared reason engine (plus a qualifier and rater over
it) into a manager and asserts the injected trio survives `manager.destroy()`, while a
standalone program destroys its own engine exactly once and idempotently.

### Public parity

`tests/src/core/integration.test.ts` asserts the barrel exports only program
concerns — it must not re-export quantitative reason or rating implementation
symbols such as `QuantitativeReasoner`, `Factor`, `WorksheetFactor`, or `Rater`. It
consumes `RaterInterface` without claiming ownership of `Rater`.

### Gates

Run scoped gates before commit:

```text
npm run format
npm run lint
npm run check
npm run build
npm run test:src:core
```

[`tests/guides.test.ts`](../tests/guides.test.ts) proves guide parity: every
backticked export resolves, every `ProgramInterface` and `ProgramManagerInterface`
method is documented, and the equality gate holds — every `Summary` cell against its
declaration's description paragraph, the titled `Compile a program and a manager`
fence against the `@example` block of that title, and the README pitch against this
guide's tagline. It also runs the flagship fences and asserts the values their
comments claim.

## Practices

1. Define `types.ts` before implementation.
2. Keep `execute` as the program verb.
3. Keep `qualify` and `rate` on their owning entities.
4. Qualify before selecting or rating lines.
5. Stop on global ineligibility, referral, or qualification failure.
6. Select scopes before the first rater call.
7. Pass the original subject to the rater.
8. Keep aggregate and outcome projections private.
9. Preserve sibling results as nested values.
10. Derive status explicitly, not through opaque precedence reduction.
11. Treat decisions as authority output.
12. Keep notices informational.
13. Share dependencies deliberately and document ownership.
14. Return fresh objects and defensive arrays.
15. Reserve throws for caller misuse and lifecycle errors.
16. Add no unsolicited dependency.
17. Keep helpers pure and self-descriptive.
18. Keep program management separate from execution.
19. Keep docs and exports bijective.
20. Add no compatibility re-exports for moved symbols.
