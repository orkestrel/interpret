# Interpret

> A synchronous, deterministic bidirectional bridge between natural language and the
> `@orkestrel/reason` engine: a forward pipeline that normalizes raw text, classifies its
> intent, matches an added `Recipe`, clarifies the fields extraction left open, and
> generates a `Subject` and `Definition` pair ready for `Reason.reason`, plus a reverse
> direction that renders a `Definition`, a `Subject`, or a `ReasonResult` to
> display-neutral prose through a lexicon-driven `Narrator`.

Nothing here is an LLM, a provider, or an agent: the `prompt` a result carries is written for
an external model and is never consumed internally, and the reverse direction complements the
raters' `describe*` family rather than duplicating it. `normalize` applies contraction,
abbreviation, and correction substitutions; `extract` classifies intent without ever seeing a
recipe and reads exact numeric values; `clarify` resolves same-domain carry-over and
dependency-ordered computed fields, then admits the subject they build through the recipe's
`shape`, which says what is required, what is optional, and what an optional field defaults
to. A subject the door refuses is no subject: `subject` stays absent and each refusal is an
`Ambiguity` carrying its fault, with the question from the shape's `description`. Every
discriminant names its axis rather
than `kind` or `type`: `stage` splits the pipeline phases, `category` splits provenance, and
`code` splits coded errors. Source: [`src/core`](../src/core). Surfaced through the
`@src/core` barrel.

## Surface

### Interpret text against an added recipe

Add a recipe, interpret text through the normalize, extract, clarify, format, and generate
pipeline, then render the result back to prose:

```ts
import { numberShape, objectShape } from '@orkestrel/contract'
import { createExtractor, createInterpret } from '@orkestrel/interpret'
import {
	createFactorGroup,
	createFieldFactor,
	createQuantitativeDefinition,
} from '@orkestrel/reason'

const interpret = createInterpret({
	extractor: createExtractor({
		actions: { calculate: 'calculate' },
		domains: { arithmetic: ['arithmetic'] },
	}),
	recipes: [
		{
			id: 't1',
			name: 'Arithmetic',
			domain: 'arithmetic',
			intents: ['calculate'],
			mappings: [{ entity: 'value', aliases: [], field: 'value' }],
			shape: objectShape({ value: numberShape() }),
			computations: [],
			definition: createQuantitativeDefinition('t1', 'Arithmetic', [
				createFactorGroup('total', 'sum', [createFieldFactor('value', 'value')]),
			]),
		},
	],
})

const result = interpret.interpret('calculate arithmetic value 42')
result.subject // { value: 42 }
result.ambiguities // []
result.failures // []

interpret.emitter.on('interpret', (interpretation) => interpretation.digest)
interpret.describe(result.definition ?? createQuantitativeDefinition('t1', 'Arithmetic', []))
interpret.destroy()
```

`interpret()` is genuinely synchronous and runs the fixed pipeline
`[normalize, extract, clarify, format, generate]`. A `NO_RECIPE` or `LOW_CONFIDENCE`
non-match, and a thrown stage, each yield a visible incomplete `Interpretation` rather than
throwing, and never an arbitrary fallback recipe. An interpretation is complete when
`ambiguities` and `failures` are both empty; no stored flag repeats that fact.

### Reading a recipe's shape

`Recipe.shape` is the generated subject's shape, read at the door after clarify and
computations. A required field absent is a question; an optional field with a default is
filled, and `defaulted` lists what the door filled; a lossless repair, a number on a string
field for one, is accepted and listed in `repairs`; anything else the door refuses is a
question too, and it blocks whether or not the field is required. A question carries the
`fault` it came from.

```ts
import { numberShape, objectShape, optionalShape } from '@orkestrel/contract'
import { createExtractor, createInterpret } from '@orkestrel/interpret'
import { createLogicalDefinition } from '@orkestrel/reason'

const interpret = createInterpret({
	extractor: createExtractor({
		actions: { check: 'check' },
		domains: { loans: ['loan'] },
	}),
	recipes: [
		{
			id: 'r',
			name: 'Loan',
			domain: 'loans',
			intents: ['check'],
			mappings: [{ entity: 'age', aliases: [], field: 'age' }],
			computations: [],
			definition: createLogicalDefinition('r', 'Loan', []),
			shape: objectShape({
				age: numberShape({ description: 'How old are you?' }),
				term: optionalShape(numberShape(), { default: 12 }),
			}),
		},
	],
})

const asked = interpret.interpret('check loan')
asked.subject // undefined
asked.ambiguities[0]?.question // 'How old are you?'
asked.ambiguities[0]?.fault // { reason: 'missing', path: ['age'], expected: 'number' }

const read = interpret.interpret('check loan age 30')
read.subject // { age: 30, term: 12 }
read.defaulted // [['term']]
interpret.destroy()
```

A computation may read a default, and a computed value stands over one. A computed field is
trusted no more than the least of what it read.

Choosing a recipe asks rather than picks: a text naming two domains or two actions names
neither, a recipe needs its own domain named, because an action alone names no recipe, and a tie
for the best score matches nothing. Each of these reaches the `NO_RECIPE` question. A result names
the recipe it matched in `recipe` and `version`.

A number fills a field only through an anchor: the mapping's entity name or an alias, matched
exactly against a token or an in-order sequence of tokens in the same clause. Fuzzy aliases claim nothing.
For single-value assignment, conflict detection groups all mappings by their target field.
Each mapping's selected anchor always counts as a mention. Among overlapping entity and alias
spans, it keeps the later start, then the longer span at equal starts. If the kept span links
no number, the overlapping span it displaced speaks instead; a silent span hides nothing.
A span wholly inside another field's longer declared anchor contributes no mention unless
it is a selected anchor. That ownership applies only when the longer anchor lies within one
clause. A declared phrase owns its words: `training hours` does not contribute an `hours`
mention to another field when that field selects the later `hours` in `training hours 30. hours 40`.
Every nearest linked number is a candidate, including every number in a tie. A negated clause
or an unlinked span contributes none. Each numeric occurrence counts once, even when several
spans reach it. Equal readable values count as one value; an occurrence without a value
differs from every other occurrence, never from itself.
Distinct values withhold every mapping on that field and record `anchor-conflict` with the field.
First-reason-wins still applies: an earlier refusal keeps its reason, and correction-marked
candidates keep `correction` under an explicit correction cue. Otherwise the last anchor
remains selected, even when it has no number; an earlier occurrence supplies no fallback.
A lone array mapping is exempt even without a claim. A non-lone array mapping still receives
one anchored value and participates in conflict detection. Another field can claim a refused
candidate through its own anchor; the withheld mapping still participates in rivalry.
This deliberately costs a question on a revision such as `hours 30. now hours 40`, which
supplies no value instead of choosing the revision. Only whitespace,
`is`, `of`, `at`, `to`, `=`, and `:` may link the spans; an article also links when the number
follows the anchor. A preceding `$125,000 a year` therefore supplies no value for `year`.
Negation anywhere in the clause blocks its claims. No other number may sit as close, and no
other anchor may sit closer. Other intervening words and distance across clauses are guesses, so
they fill nothing. A value read below the floor asks, whether or not the field is required,
because it is evidence a value was stated. A mapped field left to a default or a prior turn
asks too while a number nobody claimed could be its value, with those numbers as `candidates`.
A number `scanNumbers` marks foreign still participates in anchor-conflict detection; excluding
it would guess its intended role. The clarifier otherwise sets unclaimed foreign numbers aside.
A host may supply an entity with provenance `proposed` after checking a reader's proposal.
The clarifier treats it as stated, like `extracted` and `computed`, so an unclaimed number
does not by itself cast doubt on that field. Confidence and shape checks still apply.
A `default` value still asks when an unclaimed number could be its value. This package
does not produce `proposed` entities itself.
Every one of these blocks the subject, and what a blocked turn read stays in `entities`, so the
next turn can carry it when history is enabled: only what was stated carries, because a computed or defaulted value is
worked out again, and only within one recipe. Only a mapping whose field's shape is an array collects many numbers, and collection requires
an anchor. An unreadable occurrence asks instead of supplying digit fragments or an empty array.

A tied anchor still contests both adjacent numbers, so another anchor cannot take one
merely because the tied anchor could not choose. A number's next neighbor must be the end
of the text, an attached sentence end (`.`, `!`, `?`, or `;`), a whole declared anchor, or a
conditional link. Sentence punctuation must touch the number and precede whitespace or the
text's end: `years 3.` and `years 3. Next` claim, while `amount 3 . 000 . 000` asks.
A newline alone does not end a sentence. Every other neighbor asks, including words in any script, punctuation,
and adjacent numbers. This applies to scalar claims and array collection.
The links `is`, `of`, `at`, `to`, `a`, `an`, `the`, `and`, and `with` all require a declared
anchor next, allowing one article (`a`, `an`, or `the`) between. An alias must match its
whole token sequence: `monthly payments` does not stand for `monthly income`. A numeric target asks,
whether written in digits or words: `amount 5 of 3000000`, `amount 3 and 5`,
`amount 50000 and 60000`, `years 3 and 6 months`, and `amount 50000 with a 20000 deposit`
hold no value for that field. `3 and a half` remains one numeric form, so it meets no link check.
Array collection follows the same rule: `value 10 and 20 and 30` asks, while
`value 10 and value 20 and value 30` collects when `value` is the declared array anchor.
Thus `amount 50000 and income 120000` holds both fields, while `amount 50000 and up`
asks for amount and retains no amount value. `amount 50000 income 120000` asks for both
fields with no entity: the unchanged tie rule records `anchor-tie` for each occurrence.

Both sides are read when a number precedes its anchor. A preceding lone punctuation token,
another number, or the reader's existing `hedged` flag refuses that backward claim with
`preceding-word` and the immediate predecessor in `word`. Thus `1 – 3 years`, `150 90000 amount`,
and `under 2 years` ask without holding a value for that field. The preceding-number check
stops at trailing sentence punctuation: `income 120000, 3 years` keeps years 3.
`3 years`, `for 3 years`, and `have 3 years` also keep 3. No hedge vocabulary is added.
An anchor's trailing colon permits only a forward claim. Consequently
`amount: 50000 income: 120000 years: 3` holds those three values, including when written
on separate lines before normalization. Its comma-separated form reads the same.
The glued `amount:50000` remains an undeclared numeric token.

A comma admits unless a number follows it: `value 25, now` and
`amount 50000, income 120000` still claim, whereas `amount 3, 000, 000` asks.
Known limits retained by the comma admission: `years 3, months` holds 3 and
`amount 50000, and up` holds 50000.

Every maximal nonspace run holding a digit, less trailing sentence punctuation, must match
a declared numeric form whole. The forms are unsigned digits or comma groups, optionally
with a decimal fraction, or a leading-dot decimal; an optional dollar prefix (`$`, `US$`,
or `USD`, allowing one space); and an optional `%`, `k`, `mil`, `mill`, `million`, `thousand`,
`grand`, or `ish` suffix. With a dollar prefix, `m`, `mm`, `b`, and `bn` also admit.
Letters match without case. A currency prefix can include its one separating space.
That prefix must pass the same admission even inside an earlier token: `amount:€ 50000`
and `amount=€ 50000` refuse the currency-prefixed number.
Other digit-holding forms, including `3_000_000`, `3+`, `~3`, ordinals, numeric dates,
times, and hyphenated phone numbers, carry `unreadable: 'undeclared'` with no `value`.
Their span and `raw` cover the whole rejected token. `401k` is the declared `k` suffix and
reads 401000; the reader no longer exempts that token as a plan number.

Whole-token admission precedes exact reading: ambiguous grouping such as `3.000` and
space-grouped `3 000 000`, ranges, and inexact arithmetic still refuse. Word forms retain
their existing grammar, including separated scales such as `3 mn`. An unsupported scale
word is left after the numeric span and refuses assignment by neighbor admission; it needs
no scale refusal list. `WHOLE_NUMBER_FORMS` in `tests/setup.ts` pins exact readings and
refusals, beside seeded tables of admitted tokens, undeclared tokens, and neighbors.
`3 and a half` reads exactly 3.5, and `six and a half` reads exactly 6.5.
A fraction joins only a plain number. `3 million and a half`, `$3m and a half`,
`three million and a half`, `3 million and a quarter`, and `3k and a half` are unreadable.
The numeric phrase in `3 and a half months` still reads 3.5. In `years 3 and a half months`,
the following-word test refuses the assignment because `months` is neither an anchor nor a link.

An explicit correction in the text makes occurrences marked `suspect` or `changed` ask:
`sorry` (except `sorry to/for`), `hang on`, `used to be`, `was/were going to be`, and `wait` (except `wait to`).
Assignment never substitutes a rival value. Ordinary `now` statements do not trigger this
correction refusal; they can still trigger `anchor-conflict` when the same field names distinct
values. An array collection refuses when any occurrence meets the correction rule.

`add` and the `recipes` option refuse with `InterpretError('DEFINITION')` a recipe that is malformed,
whose shape does not compile, stand, or declare a field it maps or computes, with a required field
nothing fills, or with a computation reading a variable nothing fills.

An `Interpretation` crosses a boundary as `projectInterpretation`, which
`interpretationContract` admits. A recipe crosses on `createRecipeContract().is`, never `parse`. `is` reads a nested `shape` as any
JSON value and the guard reads it as a shape, so `shape: 42` passes `is` and `isRecipe` refuses it:
a recipe crossing a boundary goes through the guard as well.

### Reading numbers

`scanNumbers` reads every number in a text exactly, or says why it cannot, with its span and what
the words around it say. `extractNumbers` reads digits only; this also reads shorthand and word
forms. It never assigns a number to a field, so read it beside a recipe, for a check that a
proposed value appears in the text, or to set aside a number that belongs to no quantity.

```ts
import { scanNumbers } from '@orkestrel/interpret'

scanNumbers('$75k at 6%').map((number) => number.value) // [75000, 6]
scanNumbers('three hundred thousand dollars')[0]?.money // true
scanNumbers('twelve fifty')[0]?.unreadable // 'spoken'
scanNumbers('12 to 18')[0]?.unreadable // 'range'
scanNumbers('call 555-0142')[0]?.unreadable // 'undeclared'
scanNumbers('in 2019')[0]?.foreign // 'year'
scanNumbers('about 40 hours')[0]?.hedged // true
scanNumbers('about 40 hours')[0]?.unit // 'hour'
```

A value is present when the digits or words read to a number. Read it with `unreadable`, which
says the reading is not exact, and `foreign`, which says it is no quantity. A value past what a
number holds exactly reads as `unreadable: 'overflow'`, with no value. `readNumbersContract` is
the contract of what it returns. Exponent notation is unreadable shorthand, unsupported scale
compositions are unreadable joins, and a scaled value changed by six-decimal rounding carries
`unreadable: 'precision'`. Scaling retains its unrounded product.

### Refusal evidence

`compileEntities` is the composition entry for assignment with evidence. `assignEntities`
returns only its entities. `Interpretation.refusals` carries the same optional record:
at most `NUMBER_REFUSAL_LIMIT` (32) items, with the remaining count in `omitted`.
It is absent when no occurrence was refused. Records follow occurrence order, retain
the first decision for each occurrence, and exclude every occurrence eventually claimed.
Only retained records render their `text` and following `word` through the contract's
bounded `preview`; strings therefore include quotes.

Positions are UTF-16 offsets into `Interpretation.normalized`, start inclusive and end
exclusive. Stage compositions obtain that text from `createNormalizer().normalize(text).text`
and pass it to both `scanNumbers` and `compileEntities`. No original-input offset map is
provided. The compiler produces ordered spans. The shape and guard validate nonnegative
integer positions structurally and accept reversed pairs.

The reasons record existing decisions: `preceding-word` for a backward claim refused by
preceding punctuation, another number, or a hedge flag; `following-word` for a failed following-word
anchor/link check; `unreadable` for a selected occurrence without an exact value or with
an unreadable mark; `anchor-tie` for equally near numbers or competing nearest anchors;
`anchor-conflict` for distinct values linked to a field's retained anchor spans, ties included;
`correction` for a suspect or changed occurrence under an explicit correction cue;
`negation` for occurrences in a negated anchor clause; `unanchored` when compilation
ends with neither a claim nor an earlier refusal; and `collection` for the other members
of a sole array mapping withheld after one member fails. The unreadable check carries
its existing `unreadable` detail; both neighbor checks carry `word`.
A decision carries `field` only when its mapping is available. Competing anchors and
unanchored occurrences have no unique field. No intended field or deeper linguistic
explanation is inferred.

Refusals do not change entities, questions, subjects, or the digest. The digest excludes
the record, so two results may share a digest while their refusal records differ.
The extraction stage now returns exact reader values, including word forms, and omits
unreadable occurrences: `3 000 000` contributes no fragments. This also changes direct
`Extractor.extract` callers. The separately published `extractNumbers` remains digit-only.

| Name                     | Kind      | Signature                                                                                                                                                 | Summary                                                                                        |
| ------------------------ | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `NumberRefusalReason`    | type      | `'preceding-word' \| 'following-word' \| 'unreadable' \| 'anchor-tie' \| 'anchor-conflict' \| 'correction' \| 'negation' \| 'unanchored' \| 'collection'` | Names the decision that first prevented a numeric occurrence from being assigned.              |
| `NumberRefusal`          | interface | `{ text, reason, unreadable?, word?, field? }`                                                                                                            | Represents one refused numeric occurrence, its normalized position, and its first decision.    |
| `NumberRefusals`         | interface | `{ items, omitted }`                                                                                                                                      | Represents bounded refusal records and the count omitted after the published cap.              |
| `EntityCompilation`      | interface | `{ entities, refusals? }`                                                                                                                                 | Represents assigned entities and any bounded evidence of refused numeric occurrences.          |
| `NumberRefusalDecision`  | interface | `{ reason, word?, field? }`                                                                                                                               | Represents the first refusal decision retained before bounded record construction.             |
| `AnchorRefusalHandler`   | type      | `(index: number, reason: 'negation' \| 'anchor-tie') => void`                                                                                             | Observes the input occurrence index and the refusal decided by an anchor check.                |
| `NUMBER_REFUSAL_LIMIT`   | const     | `32`                                                                                                                                                      | Limits the refusal records carried by one compilation or interpretation to 32.                 |
| `NUMBER_REFUSAL_REASONS` | const     | `readonly NumberRefusalReason[]`                                                                                                                          | Lists the frozen vocabulary of first refusal decisions described by `NumberRefusalReason`.     |
| `compileEntities`        | function  | `(numbers: readonly ReadNumber[], mappings: readonly EntityMapping[], text: string, shape: ContractShape) => EntityCompilation`                           | Compiles exact reader occurrences into entities and bounded refusal evidence.                  |
| `isNumberRefusal`        | function  | `(value: unknown) => value is NumberRefusal`                                                                                                              | Determines whether a value is a structurally valid refusal record.                             |
| `isNumberRefusals`       | function  | `(value: unknown) => value is NumberRefusals`                                                                                                             | Determines whether a value holds bounded refusal items and a valid omitted count.              |
| `numberRefusalShape`     | const     | `ContractShape`                                                                                                                                           | Describes one refusal record with structurally valid, unordered nonnegative integer positions. |
| `numberRefusalsShape`    | const     | `ContractShape`                                                                                                                                           | Describes bounded refusal items and a nonnegative integer omitted count.                       |

```ts
import { numberShape, objectShape } from '@orkestrel/contract'
import { compileEntities, createNormalizer, scanNumbers } from '@orkestrel/interpret'

const text = createNormalizer().normalize('years 3 months').text
const result = compileEntities(
	scanNumbers(text),
	[{ entity: 'years', aliases: [], field: 'years' }],
	text,
	objectShape({ years: numberShape() }),
)
result.entities // []
result.refusals?.items[0]?.reason // 'following-word'
result.refusals?.items[0]?.start // 6

const range = '1 – 3 years'
const refused = compileEntities(
	scanNumbers(range),
	[{ entity: 'years', aliases: [], field: 'years' }],
	range,
	objectShape({ years: numberShape() }),
)
refused.entities // []
refused.refusals?.items[1]?.reason // 'preceding-word'
refused.refusals?.items[1]?.word // '"–"'
```

### Types

| Name                         | Kind      | Signature                                                                                                                                                                                                     | Summary                                                                                                                                                                                                                                |
| ---------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ReaderTokenInterface`       | interface | `{ form, raw, lower, canon, start, marks, mark() }`                                                                                                                                                           | Declares one scanned token the number reader's passes mark as they walk a sentence.                                                                                                                                                    |
| `WordNumberResult`           | interface | `{ token, next }`                                                                                                                                                                                             | Represents a written-out number, as the token it reads to and where the walk resumes.                                                                                                                                                  |
| `CardinalResult`             | interface | `{ value, part, next, last, unreadable?, money }`                                                                                                                                                             | Represents a written-out cardinal as far as it has been read.                                                                                                                                                                          |
| `ReaderMarks`                | interface | `{ index, glued? }`                                                                                                                                                                                           | Represents what the number reader's passes have marked on one token so far.                                                                                                                                                            |
| `ReaderTokenForm`            | type      | `'number' \| 'word' \| 'mark'`                                                                                                                                                                                | Names what one scanned token is to `NumberReader`: a number, a word, or a mark.                                                                                                                                                        |
| `ReadNumber`                 | interface | `{ raw, value?, unreadable?, foreign?, money?, percent?, scaled?, word?, hedged?, suspect?, changed?, composite?, loose?, magnitude?, weak?, tail?, yearish?, phone?, reference?, unit?, sentence, segment }` | Represents one number read from a text, with its span and what the words around it say.                                                                                                                                                |
| `NumberForeign`              | type      | `'plan' \| 'phone' \| 'date' \| 'time' \| 'identifier' \| 'ordinal' \| 'list' \| 'age' \| 'past' \| 'period' \| 'reference' \| 'zip' \| 'address' \| 'year'`                                                  | Names what a number that belongs to no quantity is: a year, a date, a time, a reference, and so on.                                                                                                                                    |
| `NumberUnreadable`           | type      | `'undeclared' \| 'fraction' \| 'foreign currency' \| 'grouping' \| 'signed' \| 'shorthand' \| 'spoken' \| 'joined' \| 'frequency' \| 'loose' \| 'range' \| 'dimensions' \| 'overflow' \| 'precision'`         | Names why a number's value cannot be read exactly.                                                                                                                                                                                     |
| `TextSpan`                   | interface | `{ start, end }`                                                                                                                                                                                              | Represents where something sits in a text: `start` inclusive, `end` exclusive.                                                                                                                                                         |
| `AnchorPosition`             | interface | `{ index }`                                                                                                                                                                                                   | Represents a numeric span's input position in a prepared anchor lookup.                                                                                                                                                                |
| `AnchorCandidate`            | interface | `{ index, gap }`                                                                                                                                                                                              | Represents a linked number and its distance from an anchor.                                                                                                                                                                            |
| `AnchorLookup`               | interface | `{ text, numbers, starts, ends, breaks, negations }`                                                                                                                                                          | Holds clause boundaries and ordered numeric spans for one compilation.                                                                                                                                                                 |
| `AnchorProbe`                | interface | `{ clause, negated, candidates }`                                                                                                                                                                             | Represents a span's clause and nearest linked candidates, including ties.                                                                                                                                                              |
| `EntityAnchor`               | interface | `{ mapping, position, end, confidence, detail, anchors }`                                                                                                                                                     | Holds a mapping's occurrences and its selected assignment anchor.                                                                                                                                                                      |
| `ShapeDefault`               | interface | `{ field, value }`                                                                                                                                                                                            | Represents one default a `Recipe`'s `shape` holds, by the field it fills.                                                                                                                                                              |
| `ProvenanceCategory`         | type      | `'extracted' \| 'proposed' \| 'carried' \| 'default' \| 'computed' \| 'subject'`                                                                                                                              | Names how one `FieldMapping` or `Entity` value was obtained.                                                                                                                                                                           |
| `InterpretStage`             | type      | `'normalize' \| 'extract' \| 'clarify' \| 'format' \| 'generate'`                                                                                                                                             | Names the fixed pipeline phases an `InterpretInterface#interpret` run produces one `StageRecord` for, in order.                                                                                                                        |
| `InterpretErrorCode`         | type      | `'TEXT_LIMIT' \| 'NORMALIZE_FAILED' \| 'EXTRACT_FAILED' \| 'CLARIFY_FAILED' \| 'FORMAT_FAILED' \| 'GENERATE_FAILED' \| 'NO_RECIPE' \| 'LOW_CONFIDENCE' \| 'DEFINITION' \| 'DESTROYED'`                        | Names the coded misuse or failure conditions thrown as an `InterpretError` or carried on a `StageFailure`.                                                                                                                             |
| `EntityMapping`              | interface | `{ entity, aliases, field }`                                                                                                                                                                                  | Represents one entity-extraction rule inside a `Recipe`: which literal aliases identify a value, and which subject field it lands on.                                                                                                  |
| `ComputedField`              | interface | `{ field, expression }`                                                                                                                                                                                       | Represents a declaratively computed field: evaluate `expression` against the entities already resolved for this interpretation, and land the result on `field`.                                                                        |
| `Recipe`                     | interface | `{ id, name, domain, intents, mappings, computations, definition, shape }`                                                                                                                                    | Represents a named, versionable interpretation recipe: which intents it answers, how to mine entities for it, its computed fields, the shape of what it produces, and the reasons `Definition` it ultimately produces a `Subject` for. |
| `Provenance`                 | interface | `{ category, detail? }`                                                                                                                                                                                       | Describes how one value landed — its origin category plus an optional strategy detail.                                                                                                                                                 |
| `Intent`                     | interface | `{ action?, domain?, confidence }`                                                                                                                                                                            | Represents the classified action + domain for one interpretation, with a combined confidence.                                                                                                                                          |
| `Entity`                     | interface | `{ name, field?, value, provenance, confidence }`                                                                                                                                                             | Represents one value assigned to a recipe's entity mapping, with its provenance and confidence.                                                                                                                                        |
| `Ambiguity`                  | interface | `{ field, question, candidates, required, fault? }`                                                                                                                                                           | Represents an unresolved field surfaced as a human-readable question, never bare prose.                                                                                                                                                |
| `FieldMapping`               | interface | `{ field, entity?, value, provenance, confidence }`                                                                                                                                                           | Represents one audited field of the built subject — its resolved value, provenance, and confidence.                                                                                                                                    |
| `TextChange`                 | interface | `{ from, to }`                                                                                                                                                                                                | Represents one normalization substitution applied to the raw text.                                                                                                                                                                     |
| `StageRecord`                | interface | `{ stage, input, output, failed, error? }`                                                                                                                                                                    | Represents a structured input/output snapshot of one pipeline phase.                                                                                                                                                                   |
| `StageFailure`               | interface | `{ stage, code, message }`                                                                                                                                                                                    | Represents a visible marker for a stage that threw, carrying its coded reason.                                                                                                                                                         |
| `NormalizeResult`            | interface | `{ text, changes }`                                                                                                                                                                                           | Represents the `Normalizer` stage's output: the cleaned text plus every substitution applied.                                                                                                                                          |
| `ExtractResult`              | interface | `{ intent, numbers }`                                                                                                                                                                                         | Represents the `Extractor` stage's output: intent classification plus exact reader values.                                                                                                                                             |
| `ClarifyResult`              | interface | `{ entities, ambiguities, repairs, defaulted }`                                                                                                                                                               | Represents the `Clarifier` stage's output: resolved entities plus any remaining ambiguities.                                                                                                                                           |
| `FormatResult`               | interface | `{ prompt }`                                                                                                                                                                                                  | Represents the `Formatter` stage's output: the refined natural-language prompt.                                                                                                                                                        |
| `GenerateResult`             | interface | `{ subject, definition, mappings, confidence }`                                                                                                                                                               | Represents the `Generator` stage's output: the built subject/definition pair plus its full field audit.                                                                                                                                |
| `Interpretation`             | interface | `{ refusals?, text, normalized, intent, recipe?, version?, entities, subject?, definition?, mappings, ambiguities, repairs, defaulted, prompt, stages, failures, confidence, digest }`                        | Represents the full, replayable outcome of one `interpret()` call.                                                                                                                                                                     |
| `RecipeRecord`               | interface | `{ id, recipe, version, hash }`                                                                                                                                                                               | Represents a versioned, content-hashed `Recipe` as held by a `RecipeManagerInterface`.                                                                                                                                                 |
| `SubjectRecord`              | interface | `{ id, subject, version, hash }`                                                                                                                                                                              | Represents a versioned, content-hashed `Subject` as held by a `SubjectManagerInterface`.                                                                                                                                               |
| `DefinitionRecord`           | interface | `{ id, definition, version, hash }`                                                                                                                                                                           | Represents a versioned, content-hashed `Definition` as held by a `DefinitionManagerInterface`.                                                                                                                                         |
| `InterpretEventMap`          | type      | `{ readonly interpret: readonly [result: Interpretation]; readonly add: readonly [recipeId: string]; readonly error: readonly [error: unknown]; readonly destroy: readonly []; }`                             | Represents the push observation surface of an `InterpretInterface`.                                                                                                                                                                    |
| `RecordEventMap`             | type      | `{ readonly add: readonly [id: string]; readonly remove: readonly [id: string]; readonly destroy: readonly []; }`                                                                                             | Represents the push observation surface shared by every record registry — an id-keyed collection, so `add` and `remove` are the events (never ordered-list `append`/`prepend`).                                                        |
| `RecipeManagerEventMap`      | type      | `RecordEventMap`                                                                                                                                                                                              | Represents the push observation surface of a `RecipeManagerInterface`.                                                                                                                                                                 |
| `SubjectManagerEventMap`     | type      | `RecordEventMap`                                                                                                                                                                                              | Represents the push observation surface of a `SubjectManagerInterface`, whose `add` carries the own-minted record id.                                                                                                                  |
| `DefinitionManagerEventMap`  | type      | `RecordEventMap`                                                                                                                                                                                              | Represents the push observation surface of a `DefinitionManagerInterface`.                                                                                                                                                             |
| `InterpretContextEventMap`   | type      | `{ readonly add: readonly [digest: string]; readonly clear: readonly []; readonly destroy: readonly []; }`                                                                                                    | Represents the push observation surface of an `InterpretContextInterface`.                                                                                                                                                             |
| `NarratorFormatter`          | type      | `(value: unknown) => string`                                                                                                                                                                                  | Represents a pure formatting function for one lexicon `value()` unit.                                                                                                                                                                  |
| `Lexicon`                    | interface | `{ phrases?, labels?, templates? }`                                                                                                                                                                           | Represents caller-injected wording data for the reverse direction — mechanism, never policy. Every phrase, label, and template string a `Narrator` renders is data supplied here, never a core literal.                                |
| `NarratorOptions`            | interface | `{ lexicon?, formatters? }`                                                                                                                                                                                   | Represents the options for `createNarrator` and the `Narrator` constructor.                                                                                                                                                            |
| `NormalizerOptions`          | interface | `{ contractions?, abbreviations?, corrections? }`                                                                                                                                                             | Represents the options for `createNormalizer` and the `Normalizer` constructor.                                                                                                                                                        |
| `ExtractorOptions`           | interface | `{ actions?, domains? }`                                                                                                                                                                                      | Represents the options for `createExtractor` and the `Extractor` constructor.                                                                                                                                                          |
| `ClarifierOptions`           | interface | `{ floor?, narrator? }`                                                                                                                                                                                       | Represents the options for `createClarifier` and the `Clarifier` constructor.                                                                                                                                                          |
| `FormatterOptions`           | interface | `{ verbs?, narrator? }`                                                                                                                                                                                       | Represents the options for `createFormatter` and the `Formatter` constructor.                                                                                                                                                          |
| `RecipeManagerOptions`       | interface | `{ recipes?, on?, error? }`                                                                                                                                                                                   | Represents the options for `createRecipeManager` and the `RecipeManager` constructor — the initial seed collection.                                                                                                                    |
| `SubjectManagerOptions`      | interface | `{ subjects?, on?, error? }`                                                                                                                                                                                  | Represents the options for `createSubjectManager` and the `SubjectManager` constructor — the initial seed collection.                                                                                                                  |
| `DefinitionManagerOptions`   | interface | `{ definitions?, on?, error? }`                                                                                                                                                                               | Represents the options for `createDefinitionManager` and the `DefinitionManager` constructor — the initial seed collection.                                                                                                            |
| `RecordStamp`                | interface | `{ id, version, hash }`                                                                                                                                                                                       | Represents the identity, version, and content hash a `RecordManagerInterface` derives for one record before its concrete shape is built.                                                                                               |
| `RecordFunction`             | type      | `(stamp: RecordStamp, value: TValue) => TRecord`                                                                                                                                                              | Builds one concrete record from the `RecordStamp` its registry derived and the value that record holds.                                                                                                                                |
| `RecordManagerOptions`       | interface | `{ entity, on?, error? }`                                                                                                                                                                                     | Represents the options for the `RecordManager` constructor.                                                                                                                                                                            |
| `RecordManagerInterface`     | interface | `{ emitter, count, has(), record(), records(), add(), remove(), destroy() }`                                                                                                                                  | Represents the shared registry engine every record manager composes — the `Map`, the content-hash and version rule, the batch `remove` overloads, and teardown.                                                                        |
| `RecordOptions`              | interface | `{ id? }`                                                                                                                                                                                                     | Represents the per-call options for the record a manager's `add` mints.                                                                                                                                                                |
| `InterpretContextOptions`    | interface | `{ session?, history?, on?, error? }`                                                                                                                                                                         | Represents the options for `createInterpretContext` and the `InterpretContext` constructor.                                                                                                                                            |
| `InterpretOptions`           | interface | `{ recipes?, context?, normalizer?, extractor?, clarifier?, formatter?, generator?, floor?, history?, narrator?, on?, error? }`                                                                               | Represents the options for `createInterpret` and the `Interpret` constructor.                                                                                                                                                          |
| `NormalizerInterface`        | interface | `{ normalize() }`                                                                                                                                                                                             | Represents the `Normalizer` stage contract: raw text in, cleaned text + applied changes out.                                                                                                                                           |
| `ExtractorInterface`         | interface | `{ extract() }`                                                                                                                                                                                               | Represents the `Extractor` stage contract: recipe-agnostic intent classification and exact reader values.                                                                                                                              |
| `ClarifierInterface`         | interface | `{ clarify() }`                                                                                                                                                                                               | Represents the `Clarifier` stage contract: resolve carry-over and computed fields against a set of already-assigned entities, surfacing ambiguities for anything required that stays unresolved.                                       |
| `FormatterInterface`         | interface | `{ format() }`                                                                                                                                                                                                | Represents the `Formatter` stage contract: render the refined natural-language prompt for a matched recipe.                                                                                                                            |
| `GeneratorInterface`         | interface | `{ generate() }`                                                                                                                                                                                              | Represents the `Generator` stage contract: build the final subject/definition pair plus its field audit.                                                                                                                               |
| `NarratorInterface`          | interface | `{ phrase(), label(), line(), value(), describe(), narrate() }`                                                                                                                                               | Represents the `Narrator` contract — a stateless, total, lexicon-driven rendering engine for the reverse direction.                                                                                                                    |
| `RecipeManagerInterface`     | interface | `{ emitter, count, has(), recipe(), recipes(), add(), remove(), destroy() }`                                                                                                                                  | Represents the recipe registry — a self-owning, versioned/hashed record-holder with the singular/plural accessor pair and the batch `remove` overloads.                                                                                |
| `SubjectManagerInterface`    | interface | `{ emitter, count, has(), subject(), subjects(), add(), remove(), destroy() }`                                                                                                                                | Represents the subject registry — a self-owning, versioned/hashed record-holder that mints its own record ids (a `Subject` carries none).                                                                                              |
| `DefinitionManagerInterface` | interface | `{ emitter, count, has(), definition(), definitions(), add(), remove(), destroy() }`                                                                                                                          | Represents the definition registry — a self-owning, versioned/hashed record-holder.                                                                                                                                                    |
| `InterpretContextInterface`  | interface | `{ emitter, session, subjects, definitions, previous(), entities(), add(), clear(), destroy() }`                                                                                                              | Represents the cross-turn interpretation context: a capped, replayable history plus the subject/definition registries carry-over reads from.                                                                                           |
| `InterpretInterface`         | interface | `{ emitter, interpret(), add(), remove(), recipe(), recipes(), describe(), narrate(), destroy() }`                                                                                                            | Represents the interpretation orchestrator — the sole public entry point, mirroring `reasons`' `Reason` orchestrator shape.                                                                                                            |

### Constants

| Name                        | Kind  | Signature                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Summary                                                                                                                                                                                                      |
| --------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `NUMBER_FOREIGN_KINDS`      | const | `readonly NumberForeign[]`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Lists every `NumberForeign` kind, frozen, for the shape that describes a read number.                                                                                                                        |
| `NUMBER_UNREADABLE_REASONS` | const | `readonly NumberUnreadable[]`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Lists every `NumberUnreadable` reason, frozen, for the shape that describes a read number.                                                                                                                   |
| `READER_WORDS`              | const | `Readonly<{ synonyms: Readonly<Record<string, string>>; per: Readonly<Set<string>>; months: Readonly<Set<string>>; yearCues: Readonly<Set<string>>; references: Readonly<Set<string>>; referenceLinks: Readonly<Set<string>>; streets: Readonly<Set<string>>; generalUnits: Readonly<Set<string>>; timeUnits: Readonly<Set<string>>; calendarPeriods: Readonly<Set<string>>; countedOver: Readonly<Set<string>>; foreignCurrency: Readonly<Set<string>>; dollars: Readonly<Set<string>>; hedgesBefore: Readonly<Set<string>>; hedgesNear: Readonly<Set<string>>; hedgePairs: Readonly<Set<string>>; doubtPairs: Readonly<Set<string>>; hedgesAfter: Readonly<Set<string>>; hedgeAfterPairs: Readonly<Set<string>>; corrections: Readonly<Set<string>>; correctionPairs: Readonly<Set<string>>; suspectBefore: Readonly<Set<string>>; offsetBefore: Readonly<Set<string>>; verbLastBefore: Readonly<Set<string>>; putInBefore: Readonly<Set<string>>; changes: Readonly<Set<string>>; compositeCues: Readonly<Set<string>>; loose: Readonly<Set<string>>; magnitudes: Readonly<Set<string>>; gluedScales: Readonly<Set<string>>; functions: Readonly<Set<string>>; abbreviations: Readonly<Set<string>>; notOneBefore: Readonly<Set<string>>; notOneAfter: Readonly<Set<string>>; workOut: Readonly<Set<string>>; dimensions: Readonly<Set<string>>; alternatives: Readonly<Set<string>>; sentenceEnds: Readonly<Set<string>>; segmentMarks: Readonly<Set<string>>; ageBefore: Readonly<Set<string>>; }>` | Holds the word lists `NumberReader` reads a number's surroundings by.                                                                                                                                        |
| `READER_SCALES`             | const | `Readonly<{ digit: Readonly<Record<string, number>>; word: Readonly<Record<string, number>>; units: Readonly<Record<string, number>>; tens: Readonly<Record<string, number>>; }>`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Holds the values number words and scale words read to.                                                                                                                                                       |
| `READER_SHAPES`             | const | `Readonly<{ admitted: RegExp; currency: RegExp; digit: RegExp; word: RegExp; }>`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Holds the shapes `NumberReader` recognizes a number by.                                                                                                                                                      |
| `CLAUSE_BREAK_PATTERN`      | const | `RegExp`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Holds what ends a clause: closing punctuation, a comma or dot no digit follows, a newline, and a joining word. A colon stays inside, because "rate: 6" says one thing.                                       |
| `DEFAULT_INTERPRET_FLOOR`   | const | `0.3`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Names the default `floor` for `createInterpret` and `matchRecipe`, 0.3 — the minimum intent confidence a recipe match, or the classified intent itself, must clear.                                          |
| `DEFAULT_INTERPRET_HISTORY` | const | `0`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Names the default `history` cap for an `InterpretContext`'s `previous()` ring buffer, 0 (carry is opt-in).                                                                                                   |
| `PROVENANCE_CATEGORIES`     | const | `readonly ProvenanceCategory[]`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Lists every `ProvenanceCategory` literal, frozen — the one home the result guards check the union from, so a new category added to `types.ts` is added here rather than silently rejected by `isProvenance`. |
| `INTERPRET_STAGES`          | const | `readonly InterpretStage[]`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Lists every `InterpretStage` literal in pipeline order, frozen — the one home the result guards check the union from.                                                                                        |
| `INTERPRET_TEXT_LIMIT`      | const | `65536`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Caps text accepted by the built-in normalizer and number reader at 65,536 UTF-16 units.                                                                                                                      |
| `INTERPRET_ERROR_CODES`     | const | `readonly InterpretErrorCode[]`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Lists every `InterpretErrorCode` literal, frozen — the one home the result guards check the union from.                                                                                                      |
| `CONFIDENCE_EXACT`          | const | `1`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Names the confidence assigned to an exact keyword-proximity entity match, 1.                                                                                                                                 |
| `CONFIDENCE_ALIAS`          | const | `0.9`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Names the confidence assigned to an exact alias-phrase entity match, 0.9.                                                                                                                                    |
| `CONFIDENCE_COLLECT`        | const | `0.9`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Names the confidence assigned when a single entity mapping collects every extracted number, 0.9.                                                                                                             |
| `CONFIDENCE_CARRIED`        | const | `0.7`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Names the confidence assigned to a same-domain carried-over field, 0.7.                                                                                                                                      |
| `CONFIDENCE_DEFAULT`        | const | `1`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Names the confidence assigned to a default the door filled, 1.                                                                                                                                               |
| `CONFIDENCE_COMPUTED`       | const | `0.9`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Names the most a computed field may be trusted, 0.9: its inputs can only lower it.                                                                                                                           |
| `NUMBER_PATTERN`            | const | `RegExp`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Holds the digit-only pattern for `extractNumbers`: an optional currency prefix, grouped digits, an optional decimal fraction, and an optional trailing `%`.                                                  |
| `DEFAULT_CONTRACTIONS`      | const | `Readonly<Record<string, string>>`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Holds the neutral built-in contraction expansions for `Normalizer` — small on purpose; callers merge their own map over this one.                                                                            |
| `DEFAULT_LEXICON`           | const | `Lexicon`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Holds the neutral default `Lexicon` a `Narrator` merges caller data over.                                                                                                                                    |

```ts
import {
	CONFIDENCE_ALIAS,
	CONFIDENCE_CARRIED,
	CONFIDENCE_COLLECT,
	CONFIDENCE_COMPUTED,
	CONFIDENCE_DEFAULT,
	CONFIDENCE_EXACT,
	DEFAULT_CONTRACTIONS,
	DEFAULT_INTERPRET_FLOOR,
	DEFAULT_INTERPRET_HISTORY,
	DEFAULT_LEXICON,
	NUMBER_PATTERN,
} from '@orkestrel/interpret'

DEFAULT_INTERPRET_FLOOR // 0.3
DEFAULT_INTERPRET_HISTORY // 0
CONFIDENCE_EXACT // 1
CONFIDENCE_ALIAS // 0.9
CONFIDENCE_COLLECT // 0.9
CONFIDENCE_CARRIED // 0.7
CONFIDENCE_DEFAULT // 1
CONFIDENCE_COMPUTED // 0.9
NUMBER_PATTERN.source // the numeric-entity pattern
DEFAULT_CONTRACTIONS["can't"] // 'cannot'
DEFAULT_LEXICON.templates?.['subject.empty'] // 'with no fields'
DEFAULT_LEXICON.templates?.['prompt.base'] // '{{verb}} {{name}}'
DEFAULT_LEXICON.templates?.['ambiguity.entity'] // 'What is your {{entity}}?'
```

### Errors

| Name               | Kind     | Signature                                                                                                        | Summary                                                                                                                |
| ------------------ | -------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `InterpretError`   | class    | `new (code: InterpretErrorCode, message: string, context?: Readonly<Record<string, unknown>>) => InterpretError` | Represents an error thrown by the interprets layer, carrying an `InterpretErrorCode` and an optional `context` record. |
| `isInterpretError` | function | `(value: unknown) => value is InterpretError`                                                                    | Narrows an unknown caught value to an `InterpretError`.                                                                |

```ts
import { InterpretError, isInterpretError } from '@orkestrel/interpret'

try {
	throw new InterpretError('DESTROYED', 'Interpret has been destroyed')
} catch (error) {
	if (isInterpretError(error)) error.code // 'DESTROYED'
}
```

### Validators

Total guards composed from `@orkestrel/contract` combinators and `@orkestrel/reason` guards —
adversarial input (junk, cycles, hostile prototypes) returns `false`, never throws.

The posture splits by who produces the value. An input-record guard is exact: an extra key
fails, because an input this package owns that drifted from its declared shape is rejected
loudly. A result guard is open: an unknown member and a class instance pass when every
published member conforms, because a foreign engine's return is not this package's to narrow.
`InterpretInterface` is borrowable, so a consumer holding a borrowed engine guards its
`interpret` return with `isInterpretation` before dereferencing `intent`, `entities`, or
`ambiguities`. Each row's `Summary` names the posture its guard takes.

| Name               | Kind     | Signature                                     | Summary                                                                                                                                            |
| ------------------ | -------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `isEntityMapping`  | function | `(value: unknown) => value is EntityMapping`  | Determines whether a value is an exact `EntityMapping` input record — a literal alias-phrase extraction rule pointing at a subject field.          |
| `isComputedField`  | function | `(value: unknown) => value is ComputedField`  | Determines whether a value is an exact `ComputedField` input record — a declaratively computed field carrying a reasons `SymbolicExpression` tree. |
| `isRecipe`         | function | `(value: unknown) => value is Recipe`         | Determines whether a value is an exact `Recipe` input record — a named, versionable interpretation recipe.                                         |
| `isProvenance`     | function | `(value: unknown) => value is Provenance`     | Determines whether a value is an open `Provenance` result record.                                                                                  |
| `isIntent`         | function | `(value: unknown) => value is Intent`         | Determines whether a value is an open `Intent` result record.                                                                                      |
| `isEntity`         | function | `(value: unknown) => value is Entity`         | Determines whether a value is an open `Entity` result record.                                                                                      |
| `isFieldMapping`   | function | `(value: unknown) => value is FieldMapping`   | Determines whether a value is an open `FieldMapping` result record.                                                                                |
| `isAmbiguity`      | function | `(value: unknown) => value is Ambiguity`      | Determines whether a value is an open `Ambiguity` result record.                                                                                   |
| `isStageRecord`    | function | `(value: unknown) => value is StageRecord`    | Determines whether a value is an open `StageRecord` result record.                                                                                 |
| `isStageFailure`   | function | `(value: unknown) => value is StageFailure`   | Determines whether a value is an open `StageFailure` result record.                                                                                |
| `isInterpretation` | function | `(value: unknown) => value is Interpretation` | Determines whether a value is an open `Interpretation` result record.                                                                              |

```ts
import { objectShape } from '@orkestrel/contract'
import {
	createInterpret,
	isAmbiguity,
	isComputedField,
	isEntity,
	isEntityMapping,
	isFieldMapping,
	isIntent,
	isInterpretation,
	isProvenance,
	isStageFailure,
	isStageRecord,
	isRecipe,
} from '@orkestrel/interpret'
import {
	createFactorGroup,
	createFieldFactor,
	createQuantitativeDefinition,
} from '@orkestrel/reason'

isEntityMapping({ entity: 'age', aliases: ['years old'], field: 'age' }) // true
isComputedField({
	field: 'monthly',
	expression: {
		form: 'operation',
		operator: 'divide',
		left: { form: 'variable', name: 'deductible' },
		right: { form: 'constant', value: 12 },
	},
}) // true
isRecipe({
	id: 't1',
	name: 'Arithmetic',
	domain: 'arithmetic',
	intents: ['calculate'],
	mappings: [],
	shape: objectShape({}),
	computations: [],
	definition: createQuantitativeDefinition('t1', 'Arithmetic', [
		createFactorGroup('total', 'sum', [createFieldFactor('value', 'value')]),
	]),
}) // true
isProvenance({ category: 'extracted', detail: 'alias', metadata: true }) // true — open
isIntent({ action: 'calculate', domain: 'arithmetic', confidence: 1 }) // true
isEntity({ name: 'value', value: 42, provenance: { category: 'extracted' }, confidence: 1 }) // true
isFieldMapping({ field: 'value', provenance: { category: 'extracted' }, confidence: 1 }) // true
isAmbiguity({ field: 'value', question: 'Which value?', candidates: ['42'], required: true }) // true
isStageRecord({ stage: 'normalize', input: 'raw', output: 'clean', failed: false }) // true
isStageFailure({ stage: 'format', code: 'FORMAT_FAILED', message: 'failed' }) // true

const guardEngine = createInterpret()
isInterpretation(guardEngine.interpret('unmatched text')) // true
guardEngine.destroy()
```

### Helpers

Pure, exported utility functions — the referentially-transparent leaves
behind the `Interpret` orchestrator and its stages.

| Name                    | Kind     | Signature                                                                                                                                                          | Summary                                                                                                                                 |
| ----------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `matchesFilledField`    | function | `(field: string, filled: readonly string[]) => boolean`                                                                                                            | Determines whether a field is filled by one of the given fields: itself, one above it, or one inside it.                                |
| `collectRequiredFields` | function | `(shape: ContractShape, path?: readonly string[]) => readonly string[]`                                                                                            | Lists the fields a shape requires, each as its dot-joined path.                                                                         |
| `scanNumbers`           | function | `(text: string) => readonly ReadNumber[]`                                                                                                                          | Reads every number in a text exactly, or says why it cannot.                                                                            |
| `findUnclaimedNumbers`  | function | `(numbers: readonly ReadNumber[], entities: readonly Entity[]) => ReadonlyArray<number \| string>`                                                                 | Finds the numbers no entity claimed.                                                                                                    |
| `findAnchoredNumber`    | function | `(text: string, anchor: TextSpan, numbers: readonly TextSpan[], refused?: AnchorRefusalHandler) => { readonly index: number; readonly gap: number; } \| undefined` | Finds the nearest directly linked number in an unnegated clause, refusing ties.                                                         |
| `findSpanOffset`        | function | `(spans: readonly TextSpan[], position: number, edge?: 'start' \| 'end', lower?: number, upper?: number) => number`                                                | Finds the first span whose selected edge is at or beyond a position.                                                                    |
| `findLinkedNumbers`     | function | `(text: string, anchor: TextSpan, numbers: readonly TextSpan[], clause: TextSpan) => readonly AnchorCandidate[]`                                                   | Finds directly linked numeric spans ordered by distance within a supplied clause.                                                       |
| `projectInterpretation` | function | `(result: Interpretation) => JSONValue \| undefined`                                                                                                               | Projects an interpretation to JSON, so it can cross a boundary.                                                                         |
| `assertRecipe`          | function | `(recipe: unknown) => asserts recipe is Recipe`                                                                                                                    | Asserts a value is a recipe that stands.                                                                                                |
| `scanRecipeShape`       | function | `(recipe: Recipe) => readonly string[]`                                                                                                                            | Describes what is wrong with a recipe's shape, against the recipe itself.                                                               |
| `settleEntities`        | function | `(entities: readonly Entity[], mappings: readonly EntityMapping[], admission: SubjectAdmission) => readonly Entity[]`                                              | Settles entities against what the door admitted.                                                                                        |
| `collectShapeDefaults`  | function | `(shape: ContractShape, subject?: unknown, path?: readonly string[]) => readonly ShapeDefault[]`                                                                   | Collects each default a shape holds, keyed by its field.                                                                                |
| `findFieldDescription`  | function | `(shape: ContractShape, field: FieldPath) => string \| undefined`                                                                                                  | Finds the description a shape gives a field, which words the question for it.                                                           |
| `matchesArrayField`     | function | `(shape: ContractShape, field: FieldPath) => boolean`                                                                                                              | Determines whether a shape's field holds an array, so a mapping onto it collects many.                                                  |
| `buildSubject`          | function | `(entities: readonly Entity[], mappings: readonly EntityMapping[]) => Subject`                                                                                     | Builds a subject from entities, each on the field it lands on.                                                                          |
| `findEntityField`       | function | `(entity: Entity, mappings: readonly EntityMapping[]) => FieldPath`                                                                                                | Finds the field an entity lands on.                                                                                                     |
| `setField`              | function | `(subject: Subject, field: FieldPath, value: unknown) => Subject`                                                                                                  | Writes a value at a (possibly nested) field path on a subject, copy-on-write.                                                           |
| `applyReplacements`     | function | `(text: string, map: Readonly<Record<string, string>>) => string`                                                                                                  | Replaces every whole-word occurrence of a map's keys with their values.                                                                 |
| `collapseWhitespace`    | function | `(text: string) => string`                                                                                                                                         | Collapses every run of whitespace to a single space and trims the ends.                                                                 |
| `tokenize`              | function | `(text: string) => readonly string[]`                                                                                                                              | Splits text into lowercase tokens, stripping punctuation outside a small numeric/currency-safe allowlist.                               |
| `extractNumbers`        | function | `(text: string) => readonly number[]`                                                                                                                              | Mines every numeric literal from text — optional leading `$`, thousands commas, an optional decimal fraction, an optional trailing `%`. |
| `assignEntities`        | function | `(numbers: readonly ReadNumber[], mappings: readonly EntityMapping[], text: string, shape: ContractShape) => readonly Entity[]`                                    | Assigns exact reader occurrences to a matched recipe's entity mappings.                                                                 |
| `classifyIntent`        | function | `(text: string, actions: Readonly<Record<string, string>>, domains: Readonly<Record<string, readonly string[]>>) => Intent`                                        | Classifies the action + domain intent of a text against caller-supplied vocabularies.                                                   |
| `canonicalize`          | function | `(value: unknown) => string`                                                                                                                                       | Renders a value into a canonical, key-order-stable string — the pre-image of `digestValue`.                                             |
| `canonicalizeNode`      | function | `(value: unknown, ancestors: ReadonlySet<object>) => string`                                                                                                       | Renders one node of a value into its canonical, key-order-stable string, against the object ancestors already on the recursion path.    |
| `digestValue`           | function | `(value: unknown) => string`                                                                                                                                       | Computes a canonical structural digest of a pure-JSON value — a key-order-stable FNV-1a hash rendered as an 8-hex-digit string.         |
| `scoreRecipe`           | function | `(intent: Intent, recipe: Recipe) => number`                                                                                                                       | Scores how well a classified intent matches one recipe's domain + action.                                                               |
| `matchRecipe`           | function | `(intent: Intent, recipes: readonly Recipe[], floor: number) => Recipe \| undefined`                                                                               | Finds the best-scoring added recipe for a classified intent, gated by a confidence floor.                                               |
| `variablesOf`           | function | `(expression: SymbolicExpression) => readonly string[]`                                                                                                            | Collects every variable name referenced by a symbolic expression tree, in first-occurrence order.                                       |
| `resolveExpression`     | function | `(expression: SymbolicExpression, bindings: Readonly<Record<string, number>>) => number \| undefined`                                                              | Evaluates a symbolic expression tree against resolved bindings.                                                                         |
| `renderSubject`         | function | `(subject: Subject, narrator: NarratorInterface) => string`                                                                                                        | Renders a one-line, display-neutral description of a reasons `Subject`, through an injected `Narrator`.                                 |

```ts
import { applyReplacements, collapseWhitespace, setField, tokenize } from '@orkestrel/interpret'

setField({ age: 25 }, 'age', 30) // { age: 30 }
setField({}, ['address', 'city'], 'Reno') // { address: { city: 'Reno' } }
applyReplacements("can't stop", { "can't": 'cannot' }) // 'cannot stop'
collapseWhitespace('  a   b\t c ') // 'a b c'
tokenize('The rate is 85%.') // ['the', 'rate', 'is', '85%.']
```

Extraction, classification, and assignment — the leaves behind
`Extractor#extract` and recipe entity assignment:

```ts
import { numberShape, objectShape } from '@orkestrel/contract'
import { assignEntities, classifyIntent, extractNumbers, scanNumbers } from '@orkestrel/interpret'

extractNumbers('income was $50,000, age 25') // [50000, 25]
const mappings = [
	{ entity: 'age', aliases: ['years old'], field: 'age' },
	{ entity: 'score', aliases: ['credit score'], field: 'score' },
]
const shape = objectShape({ age: numberShape(), score: numberShape() })
assignEntities(scanNumbers('age 25 with score 720'), mappings, 'age 25 with score 720', shape)
// Both values are assigned; `with` keeps age because the declared score anchor follows it.
classifyIntent('calculate my rate', { calculate: 'compute' }, { rating: ['rate'] })
```

Digest, recipe matching, computed-field resolution, and the reverse
direction:

```ts
import { objectShape } from '@orkestrel/contract'
import type { Recipe } from '@orkestrel/interpret'
import {
	canonicalize,
	canonicalizeNode,
	createNarrator,
	digestValue,
	matchRecipe,
	renderSubject,
	resolveExpression,
	scoreRecipe,
	variablesOf,
} from '@orkestrel/interpret'

canonicalize({ b: 1, a: 2 }) === canonicalize({ a: 2, b: 1 }) // true
canonicalizeNode({ b: 1, a: 2 }, new Set()) // '{"a":2,"b":1}'
digestValue({ a: 1 }) === digestValue({ a: 1 }) // true — deterministic
matchRecipe({ confidence: 0 }, [], 0.3) // undefined — empty registry
variablesOf({
	form: 'operation',
	operator: 'divide',
	left: { form: 'variable', name: 'deductible' },
	right: { form: 'constant', value: 12 },
}) // ['deductible']
resolveExpression(
	{
		form: 'operation',
		operator: 'divide',
		left: { form: 'variable', name: 'deductible' },
		right: { form: 'constant', value: 12 },
	},
	{ deductible: 6000 },
) // 500
renderSubject({ age: 25, income: 50000 }, createNarrator()) // 'with age: 25, income: 50000'

const gate = { action: 'compute', domain: 'rating', confidence: 1 }
const recipe: Recipe = {
	id: 't1',
	name: 'T',
	domain: 'rating',
	intents: ['compute'],
	mappings: [],
	shape: objectShape({}),
	computations: [],
	definition: { reasoning: 'symbolic', id: 't1', name: 'T', equations: [], variables: {} },
}
scoreRecipe(gate, recipe) // 1
```

### Parsers

Coercers — each returns its type or `undefined` off-shape, and never throws.
Recipe intake is total: an off-shape recipe returns `undefined`, and a
caller who wants a throw raises its own error from that `undefined`.

| Name          | Kind     | Signature                                | Summary                                                                                                |
| ------------- | -------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `parseRecipe` | function | `(value: string) => Recipe \| undefined` | Parses a JSON string into a `Recipe`, or `undefined` on invalid JSON or a shape that fails `isRecipe`. |

```ts
import { parseRecipe } from '@orkestrel/interpret'

parseRecipe('not json') // undefined
```

### Factories

| Name                      | Kind     | Signature                                                            | Summary                                                                                                                                                                      |
| ------------------------- | -------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createInterpret`         | function | `(options?: InterpretOptions) => InterpretInterface`                 | Creates an interpretation orchestrator, returning an `InterpretInterface` seeded from `InterpretOptions`.                                                                    |
| `createNormalizer`        | function | `(options?: NormalizerOptions) => NormalizerInterface`               | Creates a text normalizer, returning a stateless `NormalizerInterface`.                                                                                                      |
| `createExtractor`         | function | `(options?: ExtractorOptions) => ExtractorInterface`                 | Creates a recipe-agnostic intent classifier and number extractor, returning a stateless `ExtractorInterface`.                                                                |
| `createClarifier`         | function | `(options?: ClarifierOptions) => ClarifierInterface`                 | Creates a clarifier — carry-over, computed-field resolution, and the door's reading of the recipe's shape against an assigned entity set — returning a `ClarifierInterface`. |
| `createFormatter`         | function | `(options?: FormatterOptions) => FormatterInterface`                 | Creates a prompt formatter, returning a stateless `FormatterInterface`.                                                                                                      |
| `createGenerator`         | function | `() => GeneratorInterface`                                           | Creates a subject and definition generator, returning a stateless `GeneratorInterface`.                                                                                      |
| `createRecipeManager`     | function | `(options?: RecipeManagerOptions) => RecipeManagerInterface`         | Creates a recipe registry, returning a working `RecipeManagerInterface`.                                                                                                     |
| `createSubjectManager`    | function | `(options?: SubjectManagerOptions) => SubjectManagerInterface`       | Creates a subject registry, returning a working `SubjectManagerInterface`.                                                                                                   |
| `createDefinitionManager` | function | `(options?: DefinitionManagerOptions) => DefinitionManagerInterface` | Creates a definition registry, returning a working `DefinitionManagerInterface`.                                                                                             |
| `createInterpretContext`  | function | `(options?: InterpretContextOptions) => InterpretContextInterface`   | Creates a cross-turn interpretation context, returning a working `InterpretContextInterface`.                                                                                |
| `createNarrator`          | function | `(options?: NarratorOptions) => NarratorInterface`                   | Creates a lexicon-driven reverse-direction rendering engine, returning a stateless `NarratorInterface`.                                                                      |

```ts
import { numberShape, objectShape } from '@orkestrel/contract'
import {
	createClarifier,
	createDefinitionManager,
	createExtractor,
	createFormatter,
	createGenerator,
	createInterpret,
	createInterpretContext,
	createNarrator,
	createNormalizer,
	createSubjectManager,
	createRecipeManager,
} from '@orkestrel/interpret'
import {
	createFactorGroup,
	createFieldFactor,
	createQuantitativeDefinition,
} from '@orkestrel/reason'

const interpret = createInterpret()
interpret.destroy()

createNormalizer().normalize("it's  cold") // { text: 'it is cold', changes: [...] }
createExtractor({ actions: { calculate: 'calculate' }, domains: { arithmetic: ['arithmetic'] } })
createClarifier({ floor: 0.5 })
createFormatter({ verbs: { calculate: 'Calculate' } })
createGenerator()
createInterpretContext({ session: 'turn-1', history: 4 })
createNarrator({ lexicon: { templates: { 'subject.empty': 'nothing here' } } })

const recipes = createRecipeManager({
	recipes: [
		{
			id: 't1',
			name: 'Arithmetic',
			domain: 'arithmetic',
			intents: ['calculate'],
			mappings: [{ entity: 'value', aliases: [], field: 'value' }],
			shape: objectShape({ value: numberShape() }),
			computations: [],
			definition: createQuantitativeDefinition('t1', 'Arithmetic', [
				createFactorGroup('total', 'sum', [createFieldFactor('value', 'value')]),
			]),
		},
	],
})
recipes.count // 1
recipes.destroy()

createSubjectManager({ subjects: [{ value: 1 }] }).count // 1
createDefinitionManager({
	definitions: [
		createQuantitativeDefinition('d1', 'D1', [
			createFactorGroup('total', 'sum', [createFieldFactor('value', 'value')]),
		]),
	],
}).count // 1
```

### Shapes

The definition and result as `ContractShape` values.

| Name                  | Kind     | Signature             | Summary                                               |
| --------------------- | -------- | --------------------- | ----------------------------------------------------- |
| `readNumberShape`     | const    | `ContractShape`       | Describes a number `scanNumbers` read.                |
| `interpretationShape` | const    | `ContractShape`       | Describes an `Interpretation` in its JSON projection. |
| `stageFailureShape`   | const    | `ContractShape`       | Describes a `StageFailure`.                           |
| `stageRecordShape`    | const    | `ContractShape`       | Describes a `StageRecord` in its JSON projection.     |
| `fieldMappingShape`   | const    | `ContractShape`       | Describes a `FieldMapping` in its JSON projection.    |
| `ambiguityShape`      | const    | `ContractShape`       | Describes an `Ambiguity`.                             |
| `entityShape`         | const    | `ContractShape`       | Describes an `Entity` in its JSON projection.         |
| `intentShape`         | const    | `ContractShape`       | Describes an `Intent`.                                |
| `provenanceShape`     | const    | `ContractShape`       | Describes a `Provenance`.                             |
| `createRecipeShape`   | function | `() => ContractShape` | Creates the shape of a `Recipe`.                      |
| `entityMappingShape`  | const    | `ContractShape`       | Describes an `EntityMapping`.                         |

### Contracts

The compiled contract of what is flat enough to compile at import.

| Name                     | Kind     | Signature                          | Summary                                                                                              |
| ------------------------ | -------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `readNumbersContract`    | const    | `ContractInterface<unknown>`       | Publishes what `scanNumbers` returns as a contract.                                                  |
| `interpretationContract` | const    | `ContractInterface<unknown>`       | Publishes an `Interpretation`'s JSON projection as a contract, read through `projectInterpretation`. |
| `createRecipeContract`   | function | `() => ContractInterface<unknown>` | Creates a `Recipe` as a contract. Cross it on `is`, never `parse`.                                   |

### Classes

| Name                | Kind  | Signature                                                                                                             | Summary                                                                                                                                                                                                                                                                                                      |
| ------------------- | ----- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Interpret`         | class | `new (options?: InterpretOptions) => InterpretInterface`                                                              | Implements the interpretation orchestrator — the sole public entry point of the `interprets` module, mirroring the reasons `Reason` orchestrator shape: it runs the `[normalize, extract, clarify, format, generate]` pipeline, owns the recipe registry and the context, and exposes the reverse direction. |
| `Narrator`          | class | `new (options?: NarratorOptions) => NarratorInterface`                                                                | Implements a stateless, total, lexicon-driven rendering engine for the reverse direction — the reverse-direction mirror of the forward `Formatter`'s `verbs` seam, supplying mechanism rather than wording policy.                                                                                           |
| `Normalizer`        | class | `new (options?: NormalizerOptions) => NormalizerInterface`                                                            | Implements the normalize stage: applies contraction, abbreviation, and correction substitutions in order, then collapses whitespace.                                                                                                                                                                         |
| `Extractor`         | class | `new (options?: ExtractorOptions) => ExtractorInterface`                                                              | Implements the extract stage: recipe-agnostic intent classification plus exact reader values.                                                                                                                                                                                                                |
| `Clarifier`         | class | `new (options?: ClarifierOptions) => ClarifierInterface`                                                              | Implements the clarify stage: resolves same-domain carry-over and declaratively computed fields against an already-assigned entity set, admits the subject they build through the recipe's shape, and surfaces an `Ambiguity` for everything the door refused.                                               |
| `Formatter`         | class | `new (options?: FormatterOptions) => FormatterInterface`                                                              | Implements the format stage: renders the refined natural-language prompt for a matched recipe.                                                                                                                                                                                                               |
| `Generator`         | class | `new () => GeneratorInterface`                                                                                        | Implements the generate stage: builds the final `Subject` from a fully resolved entity set, plus its complete field audit.                                                                                                                                                                                   |
| `RecordManager`     | class | `new <TValue, TRecord extends RecordStamp>(options: RecordManagerOptions) => RecordManagerInterface<TValue, TRecord>` | Implements the shared registry engine behind every record manager in this module — it owns the `Map`, the content-hash and version rule, the batch `remove` overloads, and teardown.                                                                                                                         |
| `RecipeManager`     | class | `new (options?: RecipeManagerOptions) => RecipeManagerInterface`                                                      | Implements the recipe registry — a self-owning, versioned and content-hashed record-holder for the `Recipe`s an `Interpret` orchestrator matches against.                                                                                                                                                    |
| `SubjectManager`    | class | `new (options?: SubjectManagerOptions) => SubjectManagerInterface`                                                    | Implements the subject registry — a self-owning, versioned and content-hashed record-holder that mints its own record identity for every `Subject` (a `Subject` carries no `id` field of its own).                                                                                                           |
| `DefinitionManager` | class | `new (options?: DefinitionManagerOptions) => DefinitionManagerInterface`                                              | Implements the definition registry — a self-owning, versioned and content-hashed record-holder for the reasons `Definition`s an interpretation produces.                                                                                                                                                     |
| `InterpretContext`  | class | `new (options?: InterpretContextOptions) => InterpretContextInterface`                                                | Implements the cross-turn interpretation context — a capped, replayable history of completed `Interpretation`s plus the subject and definition registries carry-over reads from.                                                                                                                             |

## Methods

The public methods of each behavioral interface — one table per type, keyed
by its backticked name, every call-signature member listed (the `readonly`
data members — `emitter` on every stage-adjacent manager and `Interpret`;
`count` on every record registry; `session`, `subjects`, and `definitions` on
`InterpretContext` — stay off the method tables). Each implementing class
exposes exactly its interface's methods, so this doubles as the per-instance
method surface.

#### `NormalizerInterface`

| Method      | Returns           | Summary                                                                                                  |
| ----------- | ----------------- | -------------------------------------------------------------------------------------------------------- |
| `normalize` | `NormalizeResult` | Applies the contraction, abbreviation, and correction substitutions in order, then collapses whitespace. |

```ts
import { createNormalizer } from '@orkestrel/interpret'

const normalizer = createNormalizer({ contractions: { "can't": 'cannot' } })
normalizer.normalize("can't   stop") // { text: 'cannot stop', changes: [{ from: "can't", to: 'cannot' }] }
```

#### `ExtractorInterface`

| Method    | Returns         | Summary                                                                |
| --------- | --------------- | ---------------------------------------------------------------------- |
| `extract` | `ExtractResult` | Classifies the intent and returns exact values from the number reader. |

```ts
import { createExtractor } from '@orkestrel/interpret'

const extractor = createExtractor({
	actions: { calculate: 'compute' },
	domains: { rating: ['rate'] },
})
extractor.extract('calculate my rate at 85')
// { intent: { action: 'compute', domain: 'rating', confidence: 1 }, numbers: [85] }
```

#### `ClarifierInterface`

| Method    | Returns         | Summary                                                                                                                                                                                                                                                                                                                                                                                      |
| --------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `clarify` | `ClarifyResult` | Resolves carry-over and computed fields, admits the result through the recipe's shape, and surfaces an `Ambiguity` for everything the door refused, every value read below the floor, and every mapped field left to a default or a prior turn while a number nobody claimed could be its value, with its question from the shape's `description` or the narrator's `ambiguity.entity` line. |

```ts
import { numberShape, objectShape } from '@orkestrel/contract'
import { createClarifier } from '@orkestrel/interpret'

const clarifier = createClarifier({ floor: 0.3 })
clarifier.clarify(
	[],
	{
		id: 't1',
		name: 'Arithmetic',
		domain: 'arithmetic',
		intents: ['calculate'],
		mappings: [{ entity: 'value', aliases: [], field: 'value' }],
		shape: objectShape({ value: numberShape() }),
		computations: [],
		definition: {
			reasoning: 'symbolic',
			id: 't1',
			name: 'Arithmetic',
			equations: [],
			variables: {},
		},
	},
	undefined,
	{ action: 'calculate', domain: 'arithmetic', confidence: 1 },
) // { entities: [], ambiguities: [{ field: 'value', ... }] }
```

A computation addresses one numeric element of an array-valued field as
`{field}.{index}`, so a recipe whose collection has a known length declares an
aggregate over it:

```ts
import { arrayShape, numberShape, objectShape } from '@orkestrel/contract'
import { createClarifier } from '@orkestrel/interpret'
import { createOperation, createVariable } from '@orkestrel/reason'

// `value.0` and `value.1` name the first two elements of the array-valued
// `value` field. A collection whose length varies per turn has no declarable
// aggregate: `resolveExpression` returns `undefined` for an unbound variable,
// so a recipe naming `value.2` against a two-element array lands no `total`
// at all.
const clarifier = createClarifier({ floor: 0.3 })
clarifier.clarify(
	[{ name: 'value', value: [2, 3], provenance: { category: 'extracted' }, confidence: 1 }],
	{
		id: 't2',
		name: 'Total',
		domain: 'arithmetic',
		intents: ['calculate'],
		mappings: [{ entity: 'value', aliases: [], field: 'value' }],
		shape: objectShape({ value: arrayShape(numberShape()), total: numberShape() }),
		computations: [
			{
				field: 'total',
				expression: createOperation('add', createVariable('value.0'), createVariable('value.1')),
			},
		],
		definition: {
			reasoning: 'symbolic',
			id: 't2',
			name: 'Total',
			equations: [],
			variables: {},
		},
	},
	undefined,
	{ action: 'calculate', domain: 'arithmetic', confidence: 1 },
) // total lands as 5, at CONFIDENCE_COMPUTED, with no ambiguity
```

#### `FormatterInterface`

Primitive strings retain their text. Other values use the contract package's total
`preview` renderer. Objects and arrays, including the door's null-prototype defaults,
render as `object` and `array` without coercion or traversal.

| Method   | Returns        | Summary                                                                                                                     |
| -------- | -------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `format` | `FormatResult` | Renders the refined natural-language prompt for a matched recipe, clause by clause through the narrator's `prompt.*` lines. |

```ts
import { objectShape } from '@orkestrel/contract'
import { createFormatter } from '@orkestrel/interpret'

const formatter = createFormatter({ verbs: { calculate: 'Calculate' } })
formatter.format(
	{ action: 'calculate', domain: 'arithmetic', confidence: 1 },
	{
		id: 't1',
		name: 'Arithmetic',
		domain: 'arithmetic',
		intents: ['calculate'],
		mappings: [],
		shape: objectShape({}),
		computations: [],
		definition: {
			reasoning: 'symbolic',
			id: 't1',
			name: 'Arithmetic',
			equations: [],
			variables: {},
		},
	},
	[],
	[],
) // { prompt: 'Calculate Arithmetic' }
```

#### `GeneratorInterface`

| Method     | Returns          | Summary                                                                                                                   |
| ---------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `generate` | `GenerateResult` | Builds the final subject and definition pair plus its complete field audit, deriving no field the recipe did not declare. |

```ts
import { numberShape, objectShape } from '@orkestrel/contract'
import { createGenerator } from '@orkestrel/interpret'

const generator = createGenerator()
generator.generate(
	[
		{
			name: 'value',
			value: 42,
			provenance: { category: 'extracted', detail: 'collect' },
			confidence: 0.9,
		},
	],
	{
		id: 't1',
		name: 'Arithmetic',
		domain: 'arithmetic',
		intents: ['calculate'],
		mappings: [{ entity: 'value', aliases: [], field: 'value' }],
		shape: objectShape({ value: numberShape() }),
		computations: [],
		definition: {
			reasoning: 'symbolic',
			id: 't1',
			name: 'Arithmetic',
			equations: [],
			variables: {},
		},
	},
) // { subject: { value: 42 }, mappings: [...], confidence: 0.9, ... }
```

#### `NarratorInterface`

Every method is total and never throws: a lookup miss degrades to its documented fallback,
because wording is mechanism rather than policy.

| Method     | Returns  | Summary                                                                                                         |
| ---------- | -------- | --------------------------------------------------------------------------------------------------------------- |
| `phrase`   | `string` | Looks up a two-level `table` and `key` pair in the lexicon's `phrases`, falling back to `fallback` or to `key`. |
| `label`    | `string` | Renders a field's display label from `labels`, falling back to `formatField`.                                   |
| `line`     | `string` | Interpolates a named `templates` entry against `values`, falling back to an empty string when the id is absent. |
| `value`    | `string` | Runs a named formatter over a raw value, catching a throw and falling back to `String(raw)`.                    |
| `describe` | `string` | Renders a reasons `Definition` to a one-line, display-neutral description.                                      |
| `narrate`  | `string` | Renders a reasons `ReasonResult` to a one-line, display-neutral description.                                    |

```ts
import { createNarrator } from '@orkestrel/interpret'
import { createQuantitativeDefinition } from '@orkestrel/reason'

const narrator = createNarrator({
	lexicon: { phrases: { comparison: { equals: 'is' } } },
	formatters: { money: (value) => `$${String(value)}` },
})
narrator.phrase('comparison', 'equals', 'equals') // 'is'
narrator.label('age') // 'age'
narrator.line('subject.empty', {}) // 'with no fields'
narrator.value('money', 5) // '$5'
narrator.describe(createQuantitativeDefinition('risk', 'Risk', []))
narrator.narrate({
	reasoning: 'quantitative',
	value: 5,
	count: 1,
	groups: [],
	trace: [],
	errors: [],
	success: true,
})
```

#### `RecordManagerInterface`

The shared registry engine every record manager composes. `add` derives each record's `hash`
from the value's content and bumps `version` only when that hash changes at a reused id; the
concrete record shape comes from the `RecordFunction` the caller passes, which is where a
manager names its own value field. `count` is the registry's lone tally. `remove`'s array form
is all-or-nothing. A call after `destroy()` throws `InterpretError('DESTROYED', …)` naming the
configured `entity`.

| Method    | Returns                | Summary                                                                                                               |
| --------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `has`     | `boolean`              | Reports whether a record with the given id is held.                                                                   |
| `record`  | `TRecord \| undefined` | Looks up one held record by id — the singular accessor.                                                               |
| `records` | `readonly TRecord[]`   | Lists every held record — the plural accessor.                                                                        |
| `add`     | `TRecord`              | Stamps a value with its id, version, and content hash, builds the record, holds it, and emits `add`.                  |
| `remove`  | `boolean` (or `void`)  | Removes the listed records by id, one record by id, or every record, and emits `remove` per removed id.               |
| `destroy` | `void`                 | Tears the record registry down idempotently — clears the collection, emits `destroy`, then destroys the emitter last. |

```ts
import { RecordManager } from '@orkestrel/interpret'

interface NoteRecord {
	readonly id: string
	readonly note: string
	readonly version: number
	readonly hash: string
}

const notes = new RecordManager<string, NoteRecord>({ entity: 'Note' })
const note = notes.add('n1', 'first', (stamp, value) => ({
	id: stamp.id,
	note: value,
	version: stamp.version,
	hash: stamp.hash,
}))
note.version // 1
notes.count // 1
notes.has('n1') // true
notes.record('n1') // the NoteRecord, or undefined
notes.records() // every held record
notes.remove('n1') // true
notes.destroy()
```

#### `RecipeManagerInterface`

The self-owning, ordered registry over recipes. `add` derives each record's `hash` from the
recipe's content and bumps `version` only when that hash changes. `remove`'s array form is
all-or-nothing. A call after `destroy()` throws `InterpretError('DESTROYED', …)`.

| Method    | Returns                     | Summary                                                                                                               |
| --------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `has`     | `boolean`                   | Reports whether a recipe with the given id has been added.                                                            |
| `recipe`  | `RecipeRecord \| undefined` | Looks up one added recipe record by id — the singular accessor.                                                       |
| `recipes` | `readonly RecipeRecord[]`   | Lists every added recipe record — the plural accessor.                                                                |
| `add`     | `RecipeRecord`              | Adds, or re-adds, one recipe from its data, and emits `add`.                                                          |
| `remove`  | `boolean` (or `void`)       | Removes the listed recipes by id, one recipe by id, or every recipe, and emits `remove` per removed id.               |
| `destroy` | `void`                      | Tears the recipe registry down idempotently — clears the collection, emits `destroy`, then destroys the emitter last. |

```ts
import { objectShape } from '@orkestrel/contract'
import { createRecipeManager } from '@orkestrel/interpret'
import {
	createFactorGroup,
	createFieldFactor,
	createQuantitativeDefinition,
} from '@orkestrel/reason'

const recipes = createRecipeManager()
const record = recipes.add({
	id: 't1',
	name: 'Arithmetic',
	domain: 'arithmetic',
	intents: ['calculate'],
	mappings: [],
	shape: objectShape({}),
	computations: [],
	definition: createQuantitativeDefinition('t1', 'Arithmetic', [
		createFactorGroup('total', 'sum', [createFieldFactor('value', 'value')]),
	]),
})
record.version // 1
recipes.count // 1
recipes.has('t1') // true
recipes.recipe('t1') // the RecipeRecord, or undefined
recipes.recipes() // every added record
recipes.remove('t1') // true
recipes.destroy()
```

#### `SubjectManagerInterface`

Mirrors `RecipeManagerInterface`, minting its own record ids (a `Subject`
carries no `id` field of its own) unless the caller overrides through
`RecordOptions.id`.

| Method     | Returns                      | Summary                                                                                                                |
| ---------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `has`      | `boolean`                    | Reports whether a subject with the given id has been added.                                                            |
| `subject`  | `SubjectRecord \| undefined` | Looks up one added subject record by id — the singular accessor.                                                       |
| `subjects` | `readonly SubjectRecord[]`   | Lists every added subject record — the plural accessor.                                                                |
| `add`      | `SubjectRecord`              | Adds one subject, minting a fresh record id when the caller supplies none, and emits `add`.                            |
| `remove`   | `boolean` (or `void`)        | Removes the listed subjects by id, one subject by id, or every subject, and emits `remove` per removed id.             |
| `destroy`  | `void`                       | Tears the subject registry down idempotently — clears the collection, emits `destroy`, then destroys the emitter last. |

```ts
import { createSubjectManager } from '@orkestrel/interpret'

const subjects = createSubjectManager()
const first = subjects.add({ age: 25 })
subjects.count // 1
subjects.has(first.id) // true
subjects.subject(first.id) // the SubjectRecord
subjects.subjects() // every added record
subjects.remove(first.id) // true
subjects.destroy()
```

#### `DefinitionManagerInterface`

Mirrors `RecipeManagerInterface`, defaulting each record id to the
definition's own `id`.

| Method        | Returns                         | Summary                                                                                                                   |
| ------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `has`         | `boolean`                       | Reports whether a definition with the given id has been added.                                                            |
| `definition`  | `DefinitionRecord \| undefined` | Looks up one added definition record by id — the singular accessor.                                                       |
| `definitions` | `readonly DefinitionRecord[]`   | Lists every added definition record — the plural accessor.                                                                |
| `add`         | `DefinitionRecord`              | Adds, or re-adds, one definition, and emits `add`.                                                                        |
| `remove`      | `boolean` (or `void`)           | Removes the listed definitions by id, one definition by id, or every definition, and emits `remove` per removed id.       |
| `destroy`     | `void`                          | Tears the definition registry down idempotently — clears the collection, emits `destroy`, then destroys the emitter last. |

```ts
import { createDefinitionManager } from '@orkestrel/interpret'
import {
	createFactorGroup,
	createFieldFactor,
	createQuantitativeDefinition,
} from '@orkestrel/reason'

const definitions = createDefinitionManager()
const record = definitions.add(
	createQuantitativeDefinition('d1', 'D1', [
		createFactorGroup('total', 'sum', [createFieldFactor('value', 'value')]),
	]),
)
definitions.count // 1
definitions.has(record.id) // true
definitions.definition(record.id) // the DefinitionRecord
definitions.definitions() // every added record
definitions.remove(record.id) // true
definitions.destroy()
```

#### `InterpretContextInterface`

`previous()` returns the ring buffer newest-last, capped at the configured
`history` (default 0). `entities()` flattens every entity across the buffered history,
most recent last. `clear()` resets the history, the subject registry, and the
definition registry without tearing the context down.

| Method     | Returns                     | Summary                                                                                                          |
| ---------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `previous` | `readonly Interpretation[]` | Lists the buffered history, newest last, capped at `history`.                                                    |
| `entities` | `readonly Entity[]`         | Flattens every entity recorded across the buffered history, most recent last.                                    |
| `add`      | `void`                      | Pushes one completed `Interpretation`, dropping the oldest entry past the cap.                                   |
| `clear`    | `void`                      | Resets the history, the subject registry, and the definition registry without destroying the context.            |
| `destroy`  | `void`                      | Tears the context down idempotently — the subject registry, then the definition registry, then the emitter last. |

```ts
import { createInterpretContext } from '@orkestrel/interpret'

const context = createInterpretContext({ session: 'turn-1', history: 4 })
context.previous() // []
context.entities() // []
context.add({
	text: '42',
	normalized: '42',
	intent: { confidence: 0 },
	entities: [],
	mappings: [],
	ambiguities: [],
	prompt: '',
	stages: [],
	failures: [],
	confidence: 0,
	digest: 'abc',
})
context.clear()
context.destroy()
```

#### `InterpretInterface`

`interpret` is genuinely synchronous. `add`, `remove`, `recipe`, and `recipes` name the
same acts as the internal `RecipeManagerInterface` they delegate to, and `add` returns
`void` where the manager returns the record it minted. `describe` and `narrate` are the
reverse direction. After `destroy()` every method except the `emitter` getter and `destroy`
itself throws `InterpretError('DESTROYED', …)`; `destroy()` is idempotent, leaves a `context`
the caller supplied alive, and tears the emitter down last. You observe only the
supplied-context half of that rule: `InterpretInterface` publishes no context accessor, so
nothing outside reads the state of a context the orchestrator constructed itself or
subscribes to its emitter.

| Method      | Returns               | Summary                                                                                                                                 |
| ----------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `interpret` | `Interpretation`      | Runs the `[normalize, extract, clarify, format, generate]` pipeline over raw text, returning a complete or a visibly incomplete result. |
| `add`       | `void`                | Adds one recipe, and emits `add`.                                                                                                       |
| `remove`    | `boolean` (or `void`) | Removes the listed recipes by id, one recipe by id, or every recipe.                                                                    |
| `recipe`    | `Recipe \| undefined` | Looks up one added recipe's plain data by id.                                                                                           |
| `recipes`   | `readonly Recipe[]`   | Lists every added recipe's plain data.                                                                                                  |
| `describe`  | `string`              | Renders a reasons `Definition` to a one-line, display-neutral description.                                                              |
| `narrate`   | `string`              | Renders a reasons `ReasonResult` to a one-line, display-neutral description.                                                            |
| `destroy`   | `void`                | Tears the orchestrator down idempotently — the recipe registry, the context it constructed itself, then the emitter last.               |

```ts
import { numberShape, objectShape } from '@orkestrel/contract'
import { createExtractor, createInterpret } from '@orkestrel/interpret'
import {
	createFactorGroup,
	createFieldFactor,
	createQuantitativeDefinition,
} from '@orkestrel/reason'

const interpret = createInterpret({
	extractor: createExtractor({
		actions: { calculate: 'calculate' },
		domains: { arithmetic: ['arithmetic'] },
	}),
})
interpret.add({
	id: 't1',
	name: 'Arithmetic',
	domain: 'arithmetic',
	intents: ['calculate'],
	mappings: [{ entity: 'value', aliases: [], field: 'value' }],
	shape: objectShape({ value: numberShape() }),
	computations: [],
	definition: createQuantitativeDefinition('t1', 'Arithmetic', [
		createFactorGroup('total', 'sum', [createFieldFactor('value', 'value')]),
	]),
})
const result = interpret.interpret('calculate arithmetic value 42')
result.subject // { value: 42 }
interpret.recipe('t1') // the plain Recipe data
interpret.recipes() // every added recipe
interpret.describe(createQuantitativeDefinition('t1', 'Arithmetic', []))
interpret.narrate({
	reasoning: 'symbolic',
	solutions: {},
	solved: [],
	trace: [],
	errors: [],
	success: true,
})
interpret.remove('t1') // true
interpret.destroy()
```

## Migration: text length is bounded

`INTERPRET_TEXT_LIMIT` is 65,536 UTF-16 units, measured by the raw string's `length`.
The built-in `Normalizer.normalize` throws `InterpretError('TEXT_LIMIT')` above that
limit, before substitutions or whitespace cleanup. `scanNumbers` and direct
`Extractor.extract` calls meet the same limit. There is no option to raise it.
Custom normalizer implementations must honor the same input bound.

`Interpret.interpret` captures this refusal as a `TEXT_LIMIT` stage failure, emits the
original error, and returns an incomplete interpretation with no subject. A direct stage
caller catches the coded error. Callers that previously sent larger messages must shorten
them or divide them into independently meaningful requests before calling the reader.

## Migration: carrying is opt-in

A reused `Interpret` no longer carries values between messages by default.
`DEFAULT_INTERPRET_HISTORY` is 0. This prevents one person's unstated fields
from being filled by another person's earlier request.

For turns belonging to one person, set `history: 16` on `createInterpret` or
`Interpret` to retain the previous window. When supplying a shared `context`,
set `history` on that context instead. Any positive cap enables history;
there is no minimum of three. With the default, `previous()` and `entities()`
are empty even after a result is added. Subject and definition registries
remain separate and are still populated for generated results.

## Tests

- [`tests/guides.test.ts`](../tests/guides.test.ts) — the `## Surface` ↔ `src/core` bijection (value and type exports), each behavioral interface ↔ its implementing class method bijection, and the equality gate: every `Summary` cell against its declaration's description paragraph, the titled `Interpret text against an added recipe` fence against the `@example` block of that title (pinned so the titled pair cannot be retired silently), and the README pitch against this guide's tagline. It also runs the flagship fences and asserts the values their comments claim.
- [`tests/src/core/Interpret.test.ts`](../tests/src/core/Interpret.test.ts) — the orchestrator: the fixed pipeline and its per-stage records, the `NO_RECIPE` and `LOW_CONFIDENCE` incomplete results, a thrown stage marked on its record and on `failures`, the replay digest, the emitter surface, and teardown.
- [`tests/src/core/InterpretContext.test.ts`](../tests/src/core/InterpretContext.test.ts) — the capped ring buffer, the flattened entity read carry-over consults, `clear` against `destroy`, and the emitted events.
- [`tests/src/core/Narrator.test.ts`](../tests/src/core/Narrator.test.ts) — every lookup total against an adversarial key, the documented fallback of each primitive, and the composed `describe` and `narrate` renderings.
- [`tests/src/core/factories.test.ts`](../tests/src/core/factories.test.ts) — each factory returns a working entity, and honors the options it declares.
- [`tests/src/core/helpers.test.ts`](../tests/src/core/helpers.test.ts) — the pure leaves: escaping, copy-on-write field writes and their prototype-pollution refusal, replacement and whitespace collapse, tokenizing, numeric mining, entity assignment, intent classification, canonicalization and digesting, recipe scoring and matching, expression variables and resolution, and subject rendering.
- [`tests/src/core/parsers.test.ts`](../tests/src/core/parsers.test.ts) — `parseRecipe` returns a recipe, or `undefined` on invalid JSON and on a shape that fails `isRecipe`.
- [`tests/src/core/validators.test.ts`](../tests/src/core/validators.test.ts) — every guard stays total against junk, cycles, and hostile prototypes, with the exact posture for an input record and the open posture for a result record.
- [`tests/src/core/stages/Normalizer.test.ts`](../tests/src/core/stages/Normalizer.test.ts) — the substitution order, the recorded changes, and the final whitespace collapse.
- [`tests/src/core/stages/Extractor.test.ts`](../tests/src/core/stages/Extractor.test.ts) — intent classification against caller vocabularies, and numeric mining, with no recipe in sight.
- [`tests/src/core/stages/Clarifier.test.ts`](../tests/src/core/stages/Clarifier.test.ts) — resolution order across fresh entities, same-domain carry-over, what the door fills, repairs, and refuses, and dependency-ordered computed fields, plus the ambiguity every refusal and every below-floor required mapping raises.
- [`tests/src/core/stages/Formatter.test.ts`](../tests/src/core/stages/Formatter.test.ts) — the clause assembly through the narrator's `prompt.*` lines, and the verb fallback.
- [`tests/src/core/stages/Generator.test.ts`](../tests/src/core/stages/Generator.test.ts) — the entity-to-field rule, the single-element unwrap, the mean confidence, and the field audit.
- [`tests/src/core/managers/RecordManager.test.ts`](../tests/src/core/managers/RecordManager.test.ts) — the content hash and version rule, the all-or-nothing batch `remove`, the emitted events, and idempotent teardown.
- [`tests/src/core/managers/RecipeManager.test.ts`](../tests/src/core/managers/RecipeManager.test.ts) — the recipe accessors, the record id defaulting to `recipe.id`, and re-add versioning.
- [`tests/src/core/managers/SubjectManager.test.ts`](../tests/src/core/managers/SubjectManager.test.ts) — the minted record identity, the caller override, and the subject accessors.
- [`tests/src/core/managers/DefinitionManager.test.ts`](../tests/src/core/managers/DefinitionManager.test.ts) — the definition accessors and the record id defaulting to the definition's own `id`.
- [`tests/src/core/integration.test.ts`](../tests/src/core/integration.test.ts) — the forward and reverse directions driven together over a real corpus, through the public API.
