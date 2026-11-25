# Rater

> A typed quantitative rating layer over `@orkestrel/reason`'s shared engine: authored
> lines, each a plain reason `QuantitativeDefinition` joined to display metadata, rated
> against one subject to produce a `LineResult` per line — an `amount` and its
> `Worksheet` audit trail — and one `RatingResult` carrying every line's outcome and a
> derived `total`.

A subject is a plain data record, and the caller decides which lines to rate for it:
`Rater` rates the lines it is handed, reports what each one resolved to, and performs no
evaluation arithmetic of its own. Rating never mutates its inputs, so every result is a
fresh object. A rater either receives an injected `ReasonInterface`, which it never
destroys, or builds and owns its own quantitative-only engine (`bail: false`) and
destroys that engine in `destroy()`. An injected engine must be able to dispatch a
quantitative definition: one it cannot dispatch surfaces the engine's own error, which
this package never wraps. Every `rate` call fires once through the rater's typed
`emitter`. Source: [`src/core`](../src/core). Surfaced through the `@src/core` barrel.

## Surface

Create a rater, rate one subject against a list of lines (or a full rating
definition), read the derived total:

```ts
import { buildLineDefinition, createRater } from '@orkestrel/rater'
import {
	createFactorGroup,
	createQuantitativeDefinition,
	createStaticFactor,
} from '@orkestrel/reason'

const rater = createRater()

const base = buildLineDefinition(
	'base',
	'Base Amount',
	createQuantitativeDefinition('base', 'Base', [
		createFactorGroup('amount', 'sum', [createStaticFactor('flat', 100)]),
	]),
)

const result = rater.rate([base], { id: 'subject-1' })
result.lines[0]?.amount // 100
result.total // 100

rater.emitter.on('rate', (subject, rated) => rated.success)

rater.destroy()
```

`rate` dispatches by input shape — the array-of-lines overload is declared first so a
plain line list resolves to that form; a `RatingDefinition` resolves the same way
through its own `lines`. Each overload rates exactly one subject — there is no batch
overload, and the subject must be a plain record or `rate` throws `RaterError`
`'MISMATCH'`; an input that is neither an array of lines nor a `RatingDefinition`
throws `RaterError` `'DEFINITION'`, and so does a line definition the engine's `validate` refuses. A line that cannot resolve (a missing field, a lookup miss with no `fallback`, a failed required factor) is a rating failure reported on its own `LineResult`
(`worksheet.success: false`, no `amount`, a `worksheet.refusals` entry naming the cause, and `worksheet.faults` when an input is what it could not read) — the caller decides
what to do with a failed line, and `Rater` reports exactly what each line resolved
to. `total` is derived from every line's `amount` by a `TotalHandler` (default
`sumAmounts`, overridable through `RaterOptions.total`), only when every line rated, because a total over a line that refused would read as an answer for the whole subject. A `LineResult` carries an
`amount` only when its `worksheet.success` is `true`, and a `RatingResult`'s `success`
is `true` only when every line's `worksheet.success` is `true`. A `RatingResult` names what stopped it: `faults` lists each input no line could read, once per field, and `refusals` holds each other cause as typed state, with no sentence of this package's. A fault is never repeated as a refusal, so `success` is `false` exactly when `refusals` or `faults` holds an entry. Each refusal a line gave opens its `path` with that line's id, and a worksheet's own `refusals` are the engine's, with no `path` of this package's. A total that is not a finite number is a `value` refusal with no `path`.

The rater reads each answer of the engine once, into plain objects it owns, and fails closed. An answer that is no quantitative result is `malformed` alone. A success is `malformed` beside a refusal or a fault, once for each enabled group or factor of the definition it omits and for each group id, or factor id within a group, it lists more than once, whatever the entries hold (named in `group` and `factor`), and for a value that is not a finite number (held in `actual`). A failure that names no refusal and no fault is `silent`. A group or a factor the answer holds no result for carries no `value` on the worksheet, so a worksheet reports no number the engine did not give. A line whose id an earlier line of the rating holds is rated like any other, and adds a `definition` refusal with its id in `path` and its place in `index`, so the rating refuses and says which line repeats; no `total` is derived. The wording of each cause belongs to `@orkestrel/interpret`, which a consumer hands the result to.

A `RatingDefinition` may carry a `shape`, which admits the subject through `reason`'s door before any line reads it. A refusal rates no line and names each fault, and `repairs` and `defaulted` report what the door changed. The shape is checked once per definition against what its lines read, and a shape that cannot stand or misses a field throws `RaterError` `'DEFINITION'`. A plain line list has no door.

A definition crosses a boundary on `ratingDefinitionContract.is`, never `parse`. The contract checks nested shapes structurally, so `shape: 42` fails both the contract and `isRatingDefinition`. A result crosses as `projectRatingResult`, which `ratingResultContract` admits, because a factor's `actual`, a check's `actual`, and a refusal's `actual` hold whatever the subject held and a worksheet's numbers may be `NaN`.

A worksheet factor reads back what its source and its checks read: `checks` holds each check beside what it read, `actual` is what the source read at its field, `raw` is the source value before transforms and bounds, and `fallback` is `true` when the factor's fallback supplied `raw`. A factor that never ran has no checks:

```ts
import { buildLineDefinition, createRater } from '@orkestrel/rater'
import {
	createCheck,
	createFactorGroup,
	createLookupFactor,
	createQuantitativeDefinition,
	createStaticFactor,
} from '@orkestrel/reason'

const rater = createRater()
const risk = buildLineDefinition(
	'risk',
	'Risk',
	createQuantitativeDefinition('risk', 'Risk', [
		createFactorGroup('drivers', 'sum', [
			createStaticFactor('flag', 10, { checks: [createCheck('age', 'above', 18)] }),
			createLookupFactor('region', 'region', { east: 1 }, { fallback: 7 }),
		]),
	]),
)

const [flag, region] =
	rater.rate([risk], { age: 25, region: 'north' }).lines[0]?.worksheet.groups[0]?.factors ?? []
flag?.checks[0]?.state // 'met'
flag?.checks[0]?.actual // 25
region?.raw // 7
region?.actual // 'north'
region?.fallback // true

rater.destroy()
```

### Types

| Name               | Kind      | Signature                                                                                                           | Summary                                                                              |
| ------------------ | --------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `WorksheetStage`   | type      | `'factor' \| 'group' \| 'total'`                                                                                    | Names a worksheet derivation step stage.                                             |
| `RaterErrorCode`   | type      | `'DEFINITION' \| 'MISMATCH' \| 'DESTROYED'`                                                                         | Names a coded `RaterError` programmer-error code.                                    |
| `TotalHandler`     | type      | `(lines: readonly LineResult[]) => number \| undefined`                                                             | Represents a pure total port over resolved lines.                                    |
| `LineDefinition`   | interface | `{ id, name, description?, rate, metadata? }`                                                                       | Represents one rateable line — a quantitative definition joined to display metadata. |
| `RatingDefinition` | interface | `{ id, name, description?, lines, metadata?, shape? }`                                                              | Represents a pure authored rating — a named, ordered set of lines.                   |
| `WorksheetFactor`  | interface | `{ id, name?, description?, applied, value?, raw?, actual?, fallback, checks }`                                     | Represents a resolved quantitative factor, joined to its authored metadata.          |
| `WorksheetGroup`   | interface | `{ id, name?, description?, applied, value?, factors }`                                                             | Represents a resolved quantitative group, joined to its authored metadata.           |
| `Step`             | interface | `{ stage, id?, name?, value }`                                                                                      | Represents a display-neutral worksheet derivation step.                              |
| `Worksheet`        | interface | `{ id, name, aggregation, precision?, value, groups, steps, trace, refusals, success, faults, repairs, defaulted }` | Represents a quantitative definition joined to its result — the rating audit trail.  |
| `LineResult`       | interface | `{ id, name, amount?, worksheet }`                                                                                  | Represents one line's rating outcome.                                                |
| `RatingResult`     | interface | `{ lines, total?, success, refusals, faults, repairs, defaulted }`                                                  | Represents a rated outcome across every line of one `rate` call.                     |
| `RaterEventMap`    | type      | `{ readonly rate: readonly [subject: Subject, result: RatingResult]; }`                                             | Represents the push observation surface of a `RaterInterface`.                       |
| `RaterOptions`     | interface | `{ on?, error?, engine?, total? }`                                                                                  | Configures `createRater` and the `Rater` constructor.                                |
| `RaterInterface`   | interface | `{ emitter, rate(), destroy() }`                                                                                    | Represents the rating orchestrator over the shared quantitative reasoning engine.    |

`RaterInterface`'s `emitter` is a `readonly` data member and stays in this table's
`Signature` cell; the interface's call-signature members are documented under
[Methods](#methods).

### Errors

Every `RaterError` carries a `code` — `'DEFINITION'`, `'MISMATCH'`, or `'DESTROYED'` —
and an optional `context` record of structured detail beside its message.

| Name           | Kind     | Signature                                                                                                | Summary                                                         |
| -------------- | -------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `RaterError`   | class    | `new (code: RaterErrorCode, message: string, context?: Readonly<Record<string, unknown>>) => RaterError` | Represents a coded programmer error thrown by the rating layer. |
| `isRaterError` | function | `(value: unknown) => value is RaterError`                                                                | Narrows a caught value to a `RaterError`.                       |

The `isRaterError` guard narrows a caught value, so a handler reads the `code` member
off it:

The guard recognizes the error's own identity brand across package copies and module
formats. It accepts subclasses regardless of their `name` and refuses transparent
proxies, unbranded look-alikes, and plain branded objects.

```ts
import { isRaterError, RaterError } from '@orkestrel/rater'

try {
	throw new RaterError('DESTROYED', 'Rater has been destroyed')
} catch (error) {
	if (isRaterError(error)) error.code // 'DESTROYED'
}
```

### Validators

Total guards composed from `@orkestrel/contract` combinators — adversarial input
(junk, cycles, hostile prototypes) returns `false`, never throws. The guards take their
posture from who produces the value. Authored definitions supplied to this package use
exact `recordOf` guards because this package owns that input shape; extra keys fail.
Results returned by a borrowed `RaterInterface` use open `objectOf` guards because
another valid implementation may return class instances, inherited members,
or extra members. `isRatingResult` is the borrowed-engine boundary: it and its nested
result guards reject arrays and check every published typed member without narrowing
plain numbers, strings, or unknown values.

| Name                 | Kind     | Signature                                       | Summary                                                                |
| -------------------- | -------- | ----------------------------------------------- | ---------------------------------------------------------------------- |
| `isWorksheetStage`   | const    | `Guard<WorksheetStage>`                         | Determines whether a value is a `WorksheetStage` literal.              |
| `isLineDefinition`   | function | `(value: unknown) => value is LineDefinition`   | Determines whether a value is an exact `LineDefinition` record.        |
| `isRatingDefinition` | function | `(value: unknown) => value is RatingDefinition` | Determines whether a value is an exact `RatingDefinition` record.      |
| `isWorksheetFactor`  | function | `(value: unknown) => value is WorksheetFactor`  | Determines whether a value is an open `WorksheetFactor` result object. |
| `isWorksheetGroup`   | function | `(value: unknown) => value is WorksheetGroup`   | Determines whether a value is an open `WorksheetGroup` result object.  |
| `isStep`             | function | `(value: unknown) => value is Step`             | Determines whether a value is an open `Step` result object.            |
| `isWorksheet`        | function | `(value: unknown) => value is Worksheet`        | Determines whether a value is an open `Worksheet` result object.       |
| `isLineResult`       | function | `(value: unknown) => value is LineResult`       | Determines whether a value is an open `LineResult` object.             |
| `isRatingResult`     | function | `(value: unknown) => value is RatingResult`     | Determines whether a value is an open `RatingResult` object.           |

Each guard answers `true` for a value of its own shape:

```ts
import { isLineDefinition, isRatingDefinition, isWorksheetStage } from '@orkestrel/rater'
import {
	createFactorGroup,
	createQuantitativeDefinition,
	createStaticFactor,
} from '@orkestrel/reason'

isWorksheetStage('group') // true
isLineDefinition({
	id: 'base',
	name: 'Base Amount',
	rate: createQuantitativeDefinition('base', 'Base', [
		createFactorGroup('amount', 'sum', [createStaticFactor('flat', 100)]),
	]),
}) // true
isRatingDefinition({ id: 'r1', name: 'Rating', lines: [] }) // true
```

### Helpers

Pure, exported utility functions — the definition builders, the worksheet-joining behind
`Rater`'s `rate` projection, and the check of an engine's answer.

| Name                    | Kind     | Signature                                                                                                                                                  | Summary                                                                                                                                                     |
| ----------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `projectRatingResult`   | function | `(result: RatingResult) => JSONValue \| undefined`                                                                                                         | Projects a result to the JSON its contract reads.                                                                                                           |
| `buildLineDefinition`   | function | `(id: string, name: string, rate: QuantitativeDefinition, overrides?: Partial<Omit<LineDefinition, 'id' \| 'name' \| 'rate'>>) => LineDefinition`          | Builds a fresh `LineDefinition` from a line id, a display name, and the line's quantitative rating definition, with `overrides` merged over those defaults. |
| `buildRatingDefinition` | function | `(id: string, name: string, lines: readonly LineDefinition[], overrides?: Partial<Omit<RatingDefinition, 'id' \| 'name' \| 'lines'>>) => RatingDefinition` | Builds a fresh `RatingDefinition` from a rating id, a display name, and the rating's ordered lines, with `overrides` merged over those defaults.            |
| `buildWorksheetFactor`  | function | `(definition: Factor, results: readonly FactorResult[]) => WorksheetFactor`                                                                                | Joins one authored quantitative factor to its evaluated `FactorResult`.                                                                                     |
| `buildWorksheetGroup`   | function | `(definition: QuantitativeDefinition['groups'][number], results: readonly GroupResult[]) => WorksheetGroup`                                                | Joins one authored quantitative group to its evaluated `GroupResult`.                                                                                       |
| `buildWorksheetStep`    | function | `(stage: WorksheetStage, id: string \| undefined, name: string \| undefined, value: number) => Step`                                                       | Builds one display-neutral `Step` row.                                                                                                                      |
| `buildWorksheetSteps`   | function | `(definition: QuantitativeDefinition, result: QuantitativeResult, groups: readonly WorksheetGroup[]) => readonly Step[]`                                   | Builds the ordered `Step` rows for a resolved `Worksheet`.                                                                                                  |
| `buildWorksheet`        | function | `(definition: QuantitativeDefinition, result: QuantitativeResult) => Worksheet`                                                                            | Joins a `QuantitativeDefinition` and its `QuantitativeResult` into a `Worksheet` — the rating audit trail.                                                  |
| `buildLineResult`       | function | `(definition: LineDefinition, result: QuantitativeResult) => LineResult`                                                                                   | Builds a rated `LineResult` from a line's evaluated `QuantitativeResult`.                                                                                   |
| `copyResult`            | function | `(result: QuantitativeResult) => QuantitativeResult`                                                                                                       | Copies a quantitative result into plain objects and arrays this package owns, reading each member of it once.                                               |
| `findUnansweredParts`   | function | `(definition: QuantitativeDefinition, result: QuantitativeResult) => ReadonlyArray<Pick<ReasonRefusal, 'group' \| 'factor'>>`                              | Finds each enabled group of a definition that a result omits, and each enabled factor an answered group omits.                                              |
| `findRepeatedParts`     | function | `(result: QuantitativeResult) => ReadonlyArray<Pick<ReasonRefusal, 'group' \| 'factor'>>`                                                                  | Finds each group id a result lists more than once, and each factor id one of its groups lists more than once.                                               |
| `findRepeatedLines`     | function | `(lines: readonly LineDefinition[]) => readonly ReasonRefusal[]`                                                                                           | Finds each line whose id an earlier line of the list holds.                                                                                                 |
| `settleResult`          | function | `(answer: unknown, definition: QuantitativeDefinition) => QuantitativeResult`                                                                              | Holds an engine's answer to what its own members and the definition support.                                                                                |
| `buildMalformedResult`  | function | `() => QuantitativeResult`                                                                                                                                 | Builds the failed `QuantitativeResult` for an engine answer that is no quantitative result.                                                                 |
| `sumAmounts`            | function | `(lines: readonly LineResult[]) => number \| undefined`                                                                                                    | Sums defined line amounts.                                                                                                                                  |

Each definition builder returns a fresh object and omits an absent optional key
entirely:

```ts
import { buildLineDefinition, buildRatingDefinition } from '@orkestrel/rater'
import {
	createFactorGroup,
	createQuantitativeDefinition,
	createStaticFactor,
} from '@orkestrel/reason'

const base = buildLineDefinition(
	'base',
	'Base Amount',
	createQuantitativeDefinition('base', 'Base', [
		createFactorGroup('amount', 'sum', [createStaticFactor('flat', 100)]),
	]),
)
buildRatingDefinition('r1', 'Rating', [base])
buildRatingDefinition('r1', 'Rating', [base], { description: 'A rating' }) // overrides merged over the defaults
```

Worksheet joining and line assembly — one authored quantitative definition and its
evaluated result, walked into the display-neutral `Worksheet` audit trail and then a
rated `LineResult`:

```ts
import {
	buildLineDefinition,
	buildLineResult,
	buildWorksheet,
	buildWorksheetFactor,
	buildWorksheetGroup,
	buildMalformedResult,
	buildWorksheetStep,
	buildWorksheetSteps,
	copyResult,
	findRepeatedLines,
	findRepeatedParts,
	findUnansweredParts,
	settleResult,
	sumAmounts,
} from '@orkestrel/rater'
import {
	createFactorGroup,
	createFieldFactor,
	createQuantitativeDefinition,
	createQuantitativeReasoner,
	createReason,
} from '@orkestrel/reason'

const definition = createQuantitativeDefinition('risk', 'Risk', [
	createFactorGroup('drivers', 'sum', [createFieldFactor('age', 'age')]),
])
const engine = createReason({ reasoners: [createQuantitativeReasoner()] })
const result = engine.reason({ age: 25 }, definition)

if (result.reasoning === 'quantitative') {
	const group = definition.groups[0]
	const groupResult = result.groups[0]
	if (group !== undefined && groupResult !== undefined) {
		const factor = group.factors[0]
		if (factor !== undefined) buildWorksheetFactor(factor, groupResult.factors) // one factor joined to its result
		buildWorksheetGroup(group, result.groups) // one group joined to its result
	}
	buildWorksheetStep('total', definition.id, definition.name, result.value) // { stage: 'total', id: 'risk', name: 'Risk', value: 25 }
	buildWorksheetSteps(
		definition,
		result,
		definition.groups.map((entry) => buildWorksheetGroup(entry, result.groups)),
	) // the full ordered step list: factors, groups, then the total
	buildWorksheet(definition, result) // the whole worksheet — groups, steps, trace, refusals, success

	const line = buildLineDefinition('risk', 'Risk', definition)
	buildLineResult(line, result) // the line's rated LineResult — amount present only on a successful worksheet
	copyResult(result) === result // false — a fresh result that holds each member as it read
	settleResult(result, definition).success // true — it claims nothing its members or the definition contradict
	findUnansweredParts(definition, result) // [] — every enabled group and factor is answered
	findUnansweredParts(definition, { ...result, groups: [] }) // [{ group: 'drivers' }]
	findRepeatedParts({ ...result, groups: [...result.groups, ...result.groups] }) // [{ group: 'drivers' }]
	findRepeatedLines([line, line]) // [{ cause: 'definition', path: ['risk'], index: 1 }]
}

sumAmounts([]) // undefined — no line carries an amount
buildMalformedResult().refusals // [{ cause: 'malformed' }] — what an engine answer that is no quantitative result becomes
```

### Factories

| Name          | Kind     | Signature                                    | Summary                                                                                                                         |
| ------------- | -------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `createRater` | function | `(options?: RaterOptions) => RaterInterface` | Creates a rating orchestrator over the shared quantitative engine, seeded from `RaterOptions` and returning a `RaterInterface`. |

`createRater` returns a live entity that owns an engine unless one is injected, so every
rater is destroyed when its work is done.

#### Create a rater

The demonstration builds a rater over its own engine and destroys that rater:

```ts
import { createRater } from '@orkestrel/rater'

const rater = createRater()
rater.destroy()
```

### Shapes

The definition and result as `ContractShape` values.

| Name                    | Kind  | Signature       | Summary                                               |
| ----------------------- | ----- | --------------- | ----------------------------------------------------- |
| `ratingResultShape`     | const | `ContractShape` | Describes a `RatingResult` in its JSON projection.    |
| `lineResultShape`       | const | `ContractShape` | Describes a `LineResult` in its JSON projection.      |
| `worksheetShape`        | const | `ContractShape` | Describes a `Worksheet` in its JSON projection.       |
| `worksheetStepShape`    | const | `ContractShape` | Describes a `Step` in its JSON projection.            |
| `worksheetGroupShape`   | const | `ContractShape` | Describes a `WorksheetGroup` in its JSON projection.  |
| `worksheetFactorShape`  | const | `ContractShape` | Describes a `WorksheetFactor` in its JSON projection. |
| `ratingDefinitionShape` | const | `ContractShape` | Describes a `RatingDefinition`.                       |
| `lineDefinitionShape`   | const | `ContractShape` | Describes a `LineDefinition`.                         |

### Contracts

The compiled contracts. Cross a definition on `is`, never `parse`, and a result as `projectRatingResult`.

| Name                       | Kind  | Signature                    | Summary                                                                                         |
| -------------------------- | ----- | ---------------------------- | ----------------------------------------------------------------------------------------------- |
| `ratingResultContract`     | const | `ContractInterface<unknown>` | Publishes a `RatingResult`'s JSON projection as a contract, read through `projectRatingResult`. |
| `ratingDefinitionContract` | const | `ContractInterface<unknown>` | Publishes a `RatingDefinition` as a contract. Cross it on `is`, never `parse`.                  |

### Constants

| Name               | Kind  | Signature                               | Summary                                                     |
| ------------------ | ----- | --------------------------------------- | ----------------------------------------------------------- |
| `WORKSHEET_STAGES` | const | `readonly ['factor', 'group', 'total']` | Lists the stages a worksheet derivation step can belong to. |

### Classes

| Name    | Kind  | Signature                                        | Summary                                                                                                                                   |
| ------- | ----- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `Rater` | class | `new (options?: RaterOptions) => RaterInterface` | Orchestrates rating — owns (or receives) the shared quantitative reasoning engine and projects results into the rating domain vocabulary. |

## Methods

The public methods of `RaterInterface` — one table, keyed by its backticked name, every
call-signature member listed, and the `readonly` data member `emitter` left off it.
`Rater` exposes exactly its interface's methods, so this doubles as the per-instance
method surface.

#### `RaterInterface`

The array-of-lines overload of `rate` is declared first so a plain line list resolves
to that form; each overload rates exactly one subject. `destroy()` is idempotent — it
destroys an owned engine (never an injected one), then the emitter last. Afterwards
every other method throws `RaterError` `'DESTROYED'`.

| Method    | Returns        | Summary                                                                                                    |
| --------- | -------------- | ---------------------------------------------------------------------------------------------------------- |
| `rate`    | `RatingResult` | Rates an array of lines, or a `RatingDefinition`, against one subject over the shared quantitative engine. |
| `destroy` | `void`         | Destroys an owned engine and then the emitter, and does nothing on a later call.                           |

The array-of-lines and rating-definition forms of `rate` each take one subject and
return equal results for the same lines:

```ts
import { buildLineDefinition, createRater } from '@orkestrel/rater'
import {
	createFactorGroup,
	createQuantitativeDefinition,
	createStaticFactor,
} from '@orkestrel/reason'

const rater = createRater()
const base = buildLineDefinition(
	'base',
	'Base Amount',
	createQuantitativeDefinition('base', 'Base', [
		createFactorGroup('amount', 'sum', [createStaticFactor('flat', 100)]),
	]),
)

rater.rate([base], { id: 'subject-1' }) // the array-of-lines overload
rater.rate({ id: 'r1', name: 'Rating', lines: [base] }, { id: 'subject-1' }) // the RatingDefinition overload

rater.destroy()
```

## Migration: wording is interpret's

This package holds no sentence of its own, and `@orkestrel/interpret` words each result. Change each caller as follows:

- Read `refusals` where a caller read `errors`, on a `RatingResult` and on a `Worksheet`. A refusal names its `cause`; hand the result to interpret's `narrate` function for the sentence. Tell the line a refusal belongs to by `path[0]`, which holds the line's id.
- Read `faults` for an input a line could not read. A fault is no longer repeated in `errors`, so comparing the count of `errors` with the count of `faults` no longer separates the two.
- Read `factor.checks`, `raw`, `actual`, and `fallback` where a caller read `factor.evidence`. Read a check's field, operator, and expected value as `checks[n].check.field`, `checks[n].check.operator`, and `checks[n].check.value`.
- Expect a factor's `checks` to list only the checks that ran, where `evidence` had a row for each authored check, so a factor that never ran has `checks: []` and no row for an authored check. Read an authored check from the definition.
- Delete each read of `Step.expression`, and the `expression` argument of `buildWorksheetStep`; the step's `stage`, `id`, and `value` carry the same facts. A group the result holds no answer for adds no group step.
- Delete the `labels` option of `createRater`, the `labels` parameter of `buildWorksheetFactor`, `buildWorksheetGroup`, `buildWorksheet`, and `buildLineResult`, and put each label in interpret's glossary.
- Delete the `Evidence` type, `buildEvidence`, `buildEvidenceRows`, `isEvidence`, and `evidenceShape`.
- Read a worksheet group's `value` as absent for a group the result holds no answer for, where it read `0`.
- Pass `settleResult` the engine's answer and the definition it ran, `settleResult(answer, definition)`, where it took a result alone; it returns a copy.
- Expect a success an engine claims beside a refusal, a fault, a group or an enabled factor it omits, a group id or a factor id it lists more than once, or a value that is not a finite number to fail closed as `malformed`, once for each, and a failure that names nothing to be `silent`.
- Expect a line whose id an earlier line holds to add a `definition` refusal, to fail the rating, and to leave the `total` undefined.

## Tests

- [`tests/guides.test.ts`](../tests/guides.test.ts) — the `## Surface` ↔ `src/core` bijection (value and type exports), the `RaterInterface` ↔ `Rater` method bijection, and the equality gate: every `Summary` cell against its declaration's description paragraph, the titled `Create a rater` fence against the `@example` block of that title (pinned so the titled pair cannot be retired silently), and the README pitch against this guide's tagline. It also runs the flagship fences and asserts the values their comments claim.
- [`tests/src/core/Rater.test.ts`](../tests/src/core/Rater.test.ts) — line selection (only the supplied lines are evaluated, exactly once each, and an omitted line never is), the result shape (`LineResult` carries an `amount` only on a successful worksheet; `RatingResult` carries a `total` only when one is defined), quantitative-only dispatch against an injected engine that also carries a logical reasoner, rating failures (a missing lookup key with no fallback, a failed required check), totals (a custom `TotalHandler`, an all-failed rating, an empty line list), immutability against frozen inputs, engine ownership and `destroy` (idempotence, `'DESTROYED'` afterwards, an injected engine surviving), the array-of-lines and rating-definition `rate` overloads agreeing, the `'DEFINITION'` and `'MISMATCH'` errors, the `rate` event firing once per call, the checks, raw value, source value, and fallback a worksheet factor reads back, the defensive fallback for a non-quantitative or malformed engine result, an engine that says nothing, contradicts itself, omits a group or a factor, or answers differently on each read failing closed, a repeated line id refusing the rating, and the finite-arithmetic guarantees.
- [`tests/src/core/integration.test.ts`](../tests/src/core/integration.test.ts) — the ownership proof: a passing rating and a refused rating for each cause this package reaches, every string of each result outside `trace` found in the definition, the subject, a closed vocabulary, or a fault, a `thrown` refusal carrying the thrown message, each line refusal opening its `path` with its line, `success` failing exactly when a refusal or a fault says why, each cause named beside its emitter, and a barrel that exports no name opening with `render` or `interpolate`.
- [`tests/src/core/factories.test.ts`](../tests/src/core/factories.test.ts) — `createRater` returns a rater usable immediately, threads an injected engine, a total override, and an `on.rate` hook together, and tears down an owned engine on `destroy` while leaving an injected one working.
- [`tests/src/core/helpers.test.ts`](../tests/src/core/helpers.test.ts) — the factor and group joins with their defaults for an absent result, the step ordering (applied factors, then the group, then the total), the full worksheet join passing `trace`, `refusals`, and `success` through, `buildLineResult` carrying an `amount` only on success, `settleResult` reading an answer once and failing a contradicting success closed (beside a refusal, a fault, an omitted group or factor, or a value that is not finite) and naming a silent failure, `copyResult` sharing no group, factor, or check with its source, `findUnansweredParts`, `findRepeatedParts` (a group or factor id listed twice with contradicting contents, identically, or three times), `findRepeatedLines`, `buildMalformedResult`, `sumAmounts` over defined, negative-zero, overflowing, `NaN`, and opposing-infinity amounts, the definition builders' override merge and optional-key omission, and the round trip from each builder back through its guard.
- [`tests/src/core/validators.test.ts`](../tests/src/core/validators.test.ts) — each guard against its accepted shapes, its wrong-typed and missing members, adversarial input (junk, cycles, hostile prototypes, revoked proxies) answered without throwing, the exact `recordOf` posture rejecting an extra key on an authored definition, and the open `objectOf` posture admitting unknown members, prototypes, and class instances on a borrowed result.
