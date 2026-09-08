# Interpret

> A synchronous, deterministic bidirectional bridge between natural language and the
> `@orkestrel/reason` engine: a forward pipeline that normalizes raw text, classifies its
> intent, matches an added `Template`, clarifies the fields extraction left open, and
> generates a `Subject` and `Definition` pair ready for `Reason.reason`, plus a reverse
> direction that renders a `Definition`, a `Subject`, or a `ReasonResult` to
> display-neutral prose through a lexicon-driven `Narrator`.

Nothing here is an LLM, a provider, or an agent: the `prompt` a result carries is written for
an external model and is never consumed internally, and the reverse direction complements the
raters' `describe*` family rather than duplicating it. `normalize` applies contraction,
abbreviation, and correction substitutions; `extract` classifies intent without ever seeing a
template and mines the raw numbers; `clarify` resolves same-domain carry-over, template
defaults, and dependency-ordered computed fields. Every discriminant names its axis rather
than `kind` or `type`: `stage` splits the pipeline phases, `category` splits provenance, and
`code` splits coded errors. Source: [`src/core`](../src/core). Surfaced through the
`@src/core` barrel.

## Surface

### Interpret text against an added template

Add a template, interpret text through the normalize, extract, clarify, format, and generate
pipeline, then render the result back to prose:

```ts
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
	templates: [
		{
			id: 't1',
			name: 'Arithmetic',
			domain: 'arithmetic',
			intents: ['calculate'],
			mappings: [{ entity: 'value', aliases: [], field: 'value' }],
			defaults: [],
			computations: [],
			definition: createQuantitativeDefinition('t1', 'Arithmetic', [
				createFactorGroup('total', 'sum', [createFieldFactor('value', 'value')]),
			]),
		},
	],
})

const result = interpret.interpret('calculate arithmetic 42')
result.subject // { value: 42 }
result.ambiguities // []
result.failures // []

interpret.emitter.on('interpret', (interpretation) => interpretation.digest)
interpret.describe(result.definition ?? createQuantitativeDefinition('t1', 'Arithmetic', []))
interpret.destroy()
```

`interpret()` is genuinely synchronous and runs the fixed pipeline
`[normalize, extract, clarify, format, generate]`. A `NO_TEMPLATE` or `LOW_CONFIDENCE`
non-match, and a thrown stage, each yield a visible incomplete `Interpretation` rather than
throwing, and never an arbitrary fallback template. An interpretation is complete when
`ambiguities` and `failures` are both empty; no stored flag repeats that fact.

### Types

A `Shape` cell holds an interface's data members as bare names in braces, `?` marking an optional member and `plus` introducing its call-signature members, and a type alias's own type literal with a union's arms escaped as `\|`.

| Type                         | Kind      | Shape                                                                                                                                                    | Summary                                                                                                                                                                                                                      |
| ---------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ProvenanceCategory`         | type      | `'extracted' \| 'carried' \| 'default' \| 'computed' \| 'subject'`                                                                                       | Names how one `FieldMapping` or `Entity` value was obtained.                                                                                                                                                                 |
| `InterpretStage`             | type      | `'normalize' \| 'extract' \| 'clarify' \| 'format' \| 'generate'`                                                                                        | Names the fixed pipeline phases an `InterpretInterface#interpret` run produces one `StageRecord` for, in order.                                                                                                              |
| `InterpretErrorCode`         | type      | `'NORMALIZE_FAILED' \| 'EXTRACT_FAILED' \| 'CLARIFY_FAILED' \| 'FORMAT_FAILED' \| 'GENERATE_FAILED' \| 'NO_TEMPLATE' \| 'LOW_CONFIDENCE' \| 'DESTROYED'` | Names the coded misuse or failure conditions thrown as an `InterpretError` or carried on a `StageFailure`.                                                                                                                   |
| `EntityMapping`              | interface | `{ entity, aliases, field, required? }`                                                                                                                  | Represents one entity-extraction rule inside a `Template`: which literal alias phrases identify a value, and which subject field it lands on.                                                                                |
| `FieldDefault`               | interface | `{ field, value }`                                                                                                                                       | Represents a fallback value a `Template` fills onto a field left unresolved by extraction.                                                                                                                                   |
| `ComputedField`              | interface | `{ field, expression }`                                                                                                                                  | Represents a declaratively computed field: evaluate `expression` against the entities already resolved for this interpretation, and land the result on `field`.                                                              |
| `Template`                   | interface | `{ id, name, domain, intents, mappings, defaults, computations, definition }`                                                                            | Represents a named, versionable interpretation template: which intents it answers, how to mine entities for it, its fallback data, its computed fields, and the reasons `Definition` it ultimately produces a `Subject` for. |
| `Provenance`                 | interface | `{ category, detail? }`                                                                                                                                  | Describes how one value landed — its origin category plus an optional strategy detail.                                                                                                                                       |
| `Intent`                     | interface | `{ action?, domain?, confidence }`                                                                                                                       | Represents the classified action + domain for one interpretation, with a combined confidence.                                                                                                                                |
| `Entity`                     | interface | `{ name, value, provenance, confidence }`                                                                                                                | Represents one value assigned to a template's entity mapping, with its provenance and confidence.                                                                                                                            |
| `Ambiguity`                  | interface | `{ field, question, candidates, required }`                                                                                                              | Represents an unresolved field surfaced as a human-readable question, never bare prose.                                                                                                                                      |
| `FieldMapping`               | interface | `{ field, entity?, value, provenance, confidence }`                                                                                                      | Represents one audited field of the built subject — its resolved value, provenance, and confidence.                                                                                                                          |
| `TextChange`                 | interface | `{ from, to }`                                                                                                                                           | Represents one normalization substitution applied to the raw text.                                                                                                                                                           |
| `StageRecord`                | interface | `{ stage, input, output, failed, error? }`                                                                                                               | Represents a structured input/output snapshot of one pipeline phase.                                                                                                                                                         |
| `StageFailure`               | interface | `{ stage, code, message }`                                                                                                                               | Represents a visible marker for a stage that threw, carrying its coded reason.                                                                                                                                               |
| `NormalizeResult`            | interface | `{ text, changes }`                                                                                                                                      | Represents the `Normalizer` stage's output: the cleaned text plus every substitution applied.                                                                                                                                |
| `ExtractResult`              | interface | `{ intent, numbers }`                                                                                                                                    | Represents the `Extractor` stage's output: intent classification plus raw numbers.                                                                                                                                           |
| `ClarifyResult`              | interface | `{ entities, ambiguities }`                                                                                                                              | Represents the `Clarifier` stage's output: resolved entities plus any remaining ambiguities.                                                                                                                                 |
| `FormatResult`               | interface | `{ prompt }`                                                                                                                                             | Represents the `Formatter` stage's output: the refined natural-language prompt.                                                                                                                                              |
| `GenerateResult`             | interface | `{ subject, definition, mappings, confidence }`                                                                                                          | Represents the `Generator` stage's output: the built subject/definition pair plus its full field audit.                                                                                                                      |
| `Interpretation`             | interface | `{ text, normalized, intent, entities, subject?, definition?, mappings, ambiguities, prompt, stages, failures, confidence, digest }`                     | Represents the full, replayable outcome of one `interpret()` call.                                                                                                                                                           |
| `TemplateRecord`             | interface | `{ id, template, version, hash }`                                                                                                                        | Represents a versioned, content-hashed `Template` as held by a `TemplateManagerInterface`.                                                                                                                                   |
| `SubjectRecord`              | interface | `{ id, subject, version, hash }`                                                                                                                         | Represents a versioned, content-hashed `Subject` as held by a `SubjectManagerInterface`.                                                                                                                                     |
| `DefinitionRecord`           | interface | `{ id, definition, version, hash }`                                                                                                                      | Represents a versioned, content-hashed `Definition` as held by a `DefinitionManagerInterface`.                                                                                                                               |
| `InterpretEventMap`          | type      | `{ interpret, add, error, destroy }`                                                                                                                     | Represents the push observation surface of an `InterpretInterface`.                                                                                                                                                          |
| `RecordEventMap`             | type      | `{ add, remove, destroy }`                                                                                                                               | Represents the push observation surface shared by every record registry — an id-keyed collection, so `add` and `remove` are the events (never ordered-list `append`/`prepend`).                                              |
| `TemplateManagerEventMap`    | type      | `RecordEventMap`                                                                                                                                         | Represents the push observation surface of a `TemplateManagerInterface`.                                                                                                                                                     |
| `SubjectManagerEventMap`     | type      | `RecordEventMap`                                                                                                                                         | Represents the push observation surface of a `SubjectManagerInterface`, whose `add` carries the own-minted record id.                                                                                                        |
| `DefinitionManagerEventMap`  | type      | `RecordEventMap`                                                                                                                                         | Represents the push observation surface of a `DefinitionManagerInterface`.                                                                                                                                                   |
| `InterpretContextEventMap`   | type      | `{ add, clear, destroy }`                                                                                                                                | Represents the push observation surface of an `InterpretContextInterface`.                                                                                                                                                   |
| `NarratorFormatter`          | type      | `(value: unknown) => string`                                                                                                                             | Represents a pure formatting function for one lexicon `value()` unit.                                                                                                                                                        |
| `Lexicon`                    | interface | `{ phrases?, labels?, templates? }`                                                                                                                      | Represents caller-injected wording data for the reverse direction — mechanism, never policy. Every phrase, label, and template string a `Narrator` renders is data supplied here, never a core literal.                      |
| `NarratorOptions`            | interface | `{ lexicon?, formatters? }`                                                                                                                              | Represents the options for `createNarrator` and the `Narrator` constructor.                                                                                                                                                  |
| `NormalizerOptions`          | interface | `{ contractions?, abbreviations?, corrections? }`                                                                                                        | Represents the options for `createNormalizer` and the `Normalizer` constructor.                                                                                                                                              |
| `ExtractorOptions`           | interface | `{ actions?, domains? }`                                                                                                                                 | Represents the options for `createExtractor` and the `Extractor` constructor.                                                                                                                                                |
| `ClarifierOptions`           | interface | `{ floor?, narrator? }`                                                                                                                                  | Represents the options for `createClarifier` and the `Clarifier` constructor.                                                                                                                                                |
| `FormatterOptions`           | interface | `{ verbs?, narrator? }`                                                                                                                                  | Represents the options for `createFormatter` and the `Formatter` constructor.                                                                                                                                                |
| `TemplateManagerOptions`     | interface | `{ templates?, on?, error? }`                                                                                                                            | Represents the options for `createTemplateManager` and the `TemplateManager` constructor — the initial seed collection.                                                                                                      |
| `SubjectManagerOptions`      | interface | `{ subjects?, on?, error? }`                                                                                                                             | Represents the options for `createSubjectManager` and the `SubjectManager` constructor — the initial seed collection.                                                                                                        |
| `DefinitionManagerOptions`   | interface | `{ definitions?, on?, error? }`                                                                                                                          | Represents the options for `createDefinitionManager` and the `DefinitionManager` constructor — the initial seed collection.                                                                                                  |
| `RecordStamp`                | interface | `{ id, version, hash }`                                                                                                                                  | Represents the identity, version, and content hash a `RecordManagerInterface` derives for one record before its concrete shape is built.                                                                                     |
| `RecordFunction`             | type      | `(stamp: RecordStamp, value: TValue) => TRecord`                                                                                                         | Builds one concrete record from the `RecordStamp` its registry derived and the value that record holds.                                                                                                                      |
| `RecordManagerOptions`       | interface | `{ entity, on?, error? }`                                                                                                                                | Represents the options for the `RecordManager` constructor.                                                                                                                                                                  |
| `RecordManagerInterface`     | interface | `{ emitter, count } plus has, record, records, add, remove, destroy`                                                                                     | Represents the shared registry engine every record manager composes — the `Map`, the content-hash and version rule, the batch `remove` overloads, and teardown.                                                              |
| `RecordOptions`              | interface | `{ id? }`                                                                                                                                                | Represents the per-call options for the record a manager's `add` mints.                                                                                                                                                      |
| `InterpretContextOptions`    | interface | `{ session?, history?, on?, error? }`                                                                                                                    | Represents the options for `createInterpretContext` and the `InterpretContext` constructor.                                                                                                                                  |
| `InterpretOptions`           | interface | `{ templates?, context?, normalizer?, extractor?, clarifier?, formatter?, generator?, similarity?, floor?, history?, narrator?, on?, error? }`           | Represents the options for `createInterpret` and the `Interpret` constructor.                                                                                                                                                |
| `NormalizerInterface`        | interface | `{} plus normalize`                                                                                                                                      | Represents the `Normalizer` stage contract: raw text in, cleaned text + applied changes out.                                                                                                                                 |
| `ExtractorInterface`         | interface | `{} plus extract`                                                                                                                                        | Represents the `Extractor` stage contract: template-agnostic intent classification + raw number mining.                                                                                                                      |
| `ClarifierInterface`         | interface | `{} plus clarify`                                                                                                                                        | Represents the `Clarifier` stage contract: resolve carry-over, defaults, and computed fields against a set of already-assigned entities, surfacing ambiguities for anything required that stays unresolved.                  |
| `FormatterInterface`         | interface | `{} plus format`                                                                                                                                         | Represents the `Formatter` stage contract: render the refined natural-language prompt for a matched template.                                                                                                                |
| `GeneratorInterface`         | interface | `{} plus generate`                                                                                                                                       | Represents the `Generator` stage contract: build the final subject/definition pair plus its field audit.                                                                                                                     |
| `NarratorInterface`          | interface | `{} plus phrase, label, line, value, describe, narrate`                                                                                                  | Represents the `Narrator` contract — a stateless, total, lexicon-driven rendering engine for the reverse direction.                                                                                                          |
| `TemplateManagerInterface`   | interface | `{ emitter, count } plus has, template, templates, add, remove, destroy`                                                                                 | Represents the template registry — a self-owning, versioned/hashed record-holder with the singular/plural accessor pair and the batch `remove` overloads.                                                                    |
| `SubjectManagerInterface`    | interface | `{ emitter, count } plus has, subject, subjects, add, remove, destroy`                                                                                   | Represents the subject registry — a self-owning, versioned/hashed record-holder that mints its own record ids (a `Subject` carries none).                                                                                    |
| `DefinitionManagerInterface` | interface | `{ emitter, count } plus has, definition, definitions, add, remove, destroy`                                                                             | Represents the definition registry — a self-owning, versioned/hashed record-holder.                                                                                                                                          |
| `InterpretContextInterface`  | interface | `{ emitter, session, subjects, definitions } plus previous, entities, add, clear, destroy`                                                               | Represents the cross-turn interpretation context: a capped, replayable history plus the subject/definition registries carry-over reads from.                                                                                 |
| `InterpretInterface`         | interface | `{ emitter } plus interpret, add, remove, template, templates, describe, narrate, destroy`                                                               | Represents the interpretation orchestrator — the sole public entry point, mirroring `reasons`' `Reason` orchestrator shape.                                                                                                  |

### Constants

A `Shape` cell holds the constant's declared type.

| API                            | Kind  | Shape                              | Summary                                                                                                                                                                                                            |
| ------------------------------ | ----- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DEFAULT_INTERPRET_SIMILARITY` | const | `number`                           | Names the default `similarity` for `createInterpret` and `matchAlias`, 0.8 — the fuzzy alias-match score threshold, between 0 and 1.                                                                               |
| `DEFAULT_INTERPRET_FLOOR`      | const | `number`                           | Names the default `floor` for `createInterpret` and `matchTemplate`, 0.3 — the minimum intent confidence a template match, or the classified intent itself, must clear.                                            |
| `DEFAULT_INTERPRET_HISTORY`    | const | `number`                           | Names the default `history` cap for an `InterpretContext`'s `previous()` ring buffer, 16.                                                                                                                          |
| `PROVENANCE_CATEGORIES`        | const | `readonly ProvenanceCategory[]`    | Lists every `ProvenanceCategory` literal, frozen — the one home the result guards check the union from, so a new category added to `types.ts` is added here rather than silently rejected by `isProvenance`.       |
| `INTERPRET_STAGES`             | const | `readonly InterpretStage[]`        | Lists every `InterpretStage` literal in pipeline order, frozen — the one home the result guards check the union from.                                                                                              |
| `INTERPRET_ERROR_CODES`        | const | `readonly InterpretErrorCode[]`    | Lists every `InterpretErrorCode` literal, frozen — the one home the result guards check the union from.                                                                                                            |
| `CONFIDENCE_EXACT`             | const | `number`                           | Names the confidence assigned to an exact keyword-proximity entity match, 1.                                                                                                                                       |
| `CONFIDENCE_ALIAS`             | const | `number`                           | Names the confidence assigned to an exact alias-phrase entity match, 0.9.                                                                                                                                          |
| `CONFIDENCE_COLLECT`           | const | `number`                           | Names the confidence assigned when a single entity mapping collects every extracted number, 0.9.                                                                                                                   |
| `CONFIDENCE_POSITIONAL`        | const | `number`                           | Names the confidence assigned to a positional (order-based) entity match fallback, 0.7.                                                                                                                            |
| `CONFIDENCE_CARRIED`           | const | `number`                           | Names the confidence assigned to a same-domain carried-over field, 0.7.                                                                                                                                            |
| `CONFIDENCE_DEFAULT`           | const | `number`                           | Names the confidence assigned to a template default fill, 1.                                                                                                                                                       |
| `CONFIDENCE_COMPUTED`          | const | `number`                           | Names the confidence assigned to a successfully resolved computed field, 0.9.                                                                                                                                      |
| `NUMBER_PATTERN`               | const | `RegExp`                           | Holds the numeric-entity extraction pattern shared by `extractNumbers` and `assignEntities` — an optional leading `$`, thousands-comma-grouped digits, an optional decimal fraction, and an optional trailing `%`. |
| `UNSAFE_FIELD_SEGMENTS`        | const | `readonly string[]`                | Lists the prototype-pollution-unsafe field-path segments, `__proto__`, `prototype`, and `constructor` — `setField` refuses to write any path containing one, and returns its input unchanged.                      |
| `DEFAULT_CONTRACTIONS`         | const | `Readonly<Record<string, string>>` | Holds the neutral built-in contraction expansions for `Normalizer` — small on purpose; callers merge their own map over this one.                                                                                  |
| `DEFAULT_LEXICON`              | const | `Lexicon`                          | Holds the neutral default `Lexicon` a `Narrator` merges caller data over.                                                                                                                                          |

```ts
import {
	CONFIDENCE_ALIAS,
	CONFIDENCE_CARRIED,
	CONFIDENCE_COLLECT,
	CONFIDENCE_COMPUTED,
	CONFIDENCE_DEFAULT,
	CONFIDENCE_EXACT,
	CONFIDENCE_POSITIONAL,
	DEFAULT_CONTRACTIONS,
	DEFAULT_INTERPRET_FLOOR,
	DEFAULT_INTERPRET_HISTORY,
	DEFAULT_INTERPRET_SIMILARITY,
	DEFAULT_LEXICON,
	NUMBER_PATTERN,
	UNSAFE_FIELD_SEGMENTS,
} from '@orkestrel/interpret'

DEFAULT_INTERPRET_SIMILARITY // 0.8
DEFAULT_INTERPRET_FLOOR // 0.3
DEFAULT_INTERPRET_HISTORY // 16
CONFIDENCE_EXACT // 1
CONFIDENCE_ALIAS // 0.9
CONFIDENCE_COLLECT // 0.9
CONFIDENCE_POSITIONAL // 0.7
CONFIDENCE_CARRIED // 0.7
CONFIDENCE_DEFAULT // 1
CONFIDENCE_COMPUTED // 0.9
NUMBER_PATTERN.source // the numeric-entity pattern
UNSAFE_FIELD_SEGMENTS // ['__proto__', 'prototype', 'constructor']
DEFAULT_CONTRACTIONS["can't"] // 'cannot'
DEFAULT_LEXICON.templates?.['subject.empty'] // 'with no fields'
DEFAULT_LEXICON.templates?.['prompt.base'] // '{{verb}} {{name}}'
DEFAULT_LEXICON.templates?.['ambiguity.entity'] // 'What is your {{entity}}?'
```

### Errors

| API                | Kind     | Summary                                                                                                                |
| ------------------ | -------- | ---------------------------------------------------------------------------------------------------------------------- |
| `InterpretError`   | class    | Represents an error thrown by the interprets layer, carrying an `InterpretErrorCode` and an optional `context` record. |
| `isInterpretError` | function | Narrows an unknown caught value to an `InterpretError`.                                                                |

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

In a guard table a `Shape` cell holds the type the guard narrows to.

| API                | Kind     | Shape            | Summary                                                                                                                                            |
| ------------------ | -------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `isEntityMapping`  | function | `EntityMapping`  | Determines whether a value is an exact `EntityMapping` input record — a literal alias-phrase extraction rule pointing at a subject field.          |
| `isFieldDefault`   | function | `FieldDefault`   | Determines whether a value is an exact `FieldDefault` input record — a fallback value a `Template` fills onto an unresolved field.                 |
| `isComputedField`  | function | `ComputedField`  | Determines whether a value is an exact `ComputedField` input record — a declaratively computed field carrying a reasons `SymbolicExpression` tree. |
| `isTemplate`       | function | `Template`       | Determines whether a value is an exact `Template` input record — a named, versionable interpretation template.                                     |
| `isProvenance`     | function | `Provenance`     | Determines whether a value is an open `Provenance` result record.                                                                                  |
| `isIntent`         | function | `Intent`         | Determines whether a value is an open `Intent` result record.                                                                                      |
| `isEntity`         | function | `Entity`         | Determines whether a value is an open `Entity` result record.                                                                                      |
| `isFieldMapping`   | function | `FieldMapping`   | Determines whether a value is an open `FieldMapping` result record.                                                                                |
| `isAmbiguity`      | function | `Ambiguity`      | Determines whether a value is an open `Ambiguity` result record.                                                                                   |
| `isStageRecord`    | function | `StageRecord`    | Determines whether a value is an open `StageRecord` result record.                                                                                 |
| `isStageFailure`   | function | `StageFailure`   | Determines whether a value is an open `StageFailure` result record.                                                                                |
| `isInterpretation` | function | `Interpretation` | Determines whether a value is an open `Interpretation` result record.                                                                              |

```ts
import {
	createInterpret,
	isAmbiguity,
	isComputedField,
	isEntity,
	isEntityMapping,
	isFieldDefault,
	isFieldMapping,
	isIntent,
	isInterpretation,
	isProvenance,
	isStageFailure,
	isStageRecord,
	isTemplate,
} from '@orkestrel/interpret'
import {
	createFactorGroup,
	createFieldFactor,
	createQuantitativeDefinition,
} from '@orkestrel/reason'

isEntityMapping({ entity: 'age', aliases: ['years old'], field: 'age' }) // true
isFieldDefault({ field: 'term', value: 12 }) // true
isComputedField({
	field: 'monthly',
	expression: {
		form: 'operation',
		operator: 'divide',
		left: { form: 'variable', name: 'deductible' },
		right: { form: 'constant', value: 12 },
	},
}) // true
isTemplate({
	id: 't1',
	name: 'Arithmetic',
	domain: 'arithmetic',
	intents: ['calculate'],
	mappings: [],
	defaults: [],
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

| API                  | Kind     | Summary                                                                                                                                 |
| -------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `escapeRegExp`       | function | Escapes every regex metacharacter in `text` so it matches literally when compiled into a `RegExp`.                                      |
| `setField`           | function | Writes a value at a (possibly nested) field path on a subject, copy-on-write.                                                           |
| `applyReplacements`  | function | Replaces every whole-word occurrence of a map's keys with their values.                                                                 |
| `collapseWhitespace` | function | Collapses every run of whitespace to a single space and trims the ends.                                                                 |
| `tokenize`           | function | Splits text into lowercase tokens, stripping punctuation outside a small numeric/currency-safe allowlist.                               |
| `extractNumbers`     | function | Mines every numeric literal from text — optional leading `$`, thousands commas, an optional decimal fraction, an optional trailing `%`. |
| `assignEntities`     | function | Assigns already-extracted numbers to a matched template's entity mappings.                                                              |
| `classifyIntent`     | function | Classifies the action + domain intent of a text against caller-supplied vocabularies.                                                   |
| `scoreSimilarity`    | function | Measures bigram (Dice coefficient) string similarity, case-insensitive.                                                                 |
| `matchAlias`         | function | Returns the best `scoreSimilarity` a token achieves against a list of aliases, gated by a threshold.                                    |
| `canonicalize`       | function | Renders a value into a canonical, key-order-stable string — the pre-image of `digestValue`.                                             |
| `canonicalizeNode`   | function | Renders one node of a value into its canonical, key-order-stable string, against the object ancestors already on the recursion path.    |
| `digestValue`        | function | Computes a canonical structural digest of a pure-JSON value — a key-order-stable FNV-1a hash rendered as an 8-hex-digit string.         |
| `scoreTemplate`      | function | Scores how well a classified intent matches one template's domain + action.                                                             |
| `matchTemplate`      | function | Finds the best-scoring added template for a classified intent, gated by a confidence floor.                                             |
| `variablesOf`        | function | Collects every variable name referenced by a symbolic expression tree, in first-occurrence order.                                       |
| `resolveExpression`  | function | Evaluates a symbolic expression tree against resolved bindings.                                                                         |
| `renderSubject`      | function | Renders a one-line, display-neutral description of a reasons `Subject`, through an injected `Narrator`.                                 |

```ts
import {
	applyReplacements,
	collapseWhitespace,
	escapeRegExp,
	setField,
	tokenize,
} from '@orkestrel/interpret'

escapeRegExp('a.b*c') // 'a\\.b\\*c'
setField({ age: 25 }, 'age', 30) // { age: 30 }
setField({}, ['address', 'city'], 'Reno') // { address: { city: 'Reno' } }
applyReplacements("can't stop", { "can't": 'cannot' }) // 'cannot stop'
collapseWhitespace('  a   b\t c ') // 'a b c'
tokenize('The rate is 85%.') // ['the', 'rate', 'is', '85%.']
```

Extraction, classification, and fuzzy matching — the leaves behind
`Extractor#extract` and template entity assignment:

```ts
import {
	assignEntities,
	classifyIntent,
	extractNumbers,
	matchAlias,
	scoreSimilarity,
} from '@orkestrel/interpret'

extractNumbers('income was $50,000, age 25') // [50000, 25]
const mappings = [
	{ entity: 'age', aliases: ['years old'], field: 'age' },
	{ entity: 'score', aliases: ['credit score'], field: 'score' },
]
assignEntities([25, 720], mappings, '25 year old with score 720', 0.8)
classifyIntent('calculate my rate', { calculate: 'compute' }, { rating: ['rate'] })
scoreSimilarity('rate', 'rate') // 1
matchAlias('valu', ['value', 'amount'], 0.6) // ~0.86 — fuzzy hit on 'value'
```

Digest, template matching, computed-field resolution, and the reverse
direction:

```ts
import type { Template } from '@orkestrel/interpret'
import {
	canonicalize,
	canonicalizeNode,
	createNarrator,
	digestValue,
	matchTemplate,
	renderSubject,
	resolveExpression,
	scoreTemplate,
	variablesOf,
} from '@orkestrel/interpret'

canonicalize({ b: 1, a: 2 }) === canonicalize({ a: 2, b: 1 }) // true
canonicalizeNode({ b: 1, a: 2 }, new Set()) // '{"a":2,"b":1}'
digestValue({ a: 1 }) === digestValue({ a: 1 }) // true — deterministic
matchTemplate({ confidence: 0 }, [], 0.3) // undefined — empty registry
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
const template: Template = {
	id: 't1',
	name: 'T',
	domain: 'rating',
	intents: ['compute'],
	mappings: [],
	defaults: [],
	computations: [],
	definition: { reasoning: 'symbolic', id: 't1', name: 'T', equations: [], variables: {} },
}
scoreTemplate(gate, template) // 1
```

### Parsers

Coercers — each returns its type or `undefined` off-shape, and never throws.
Template intake is total: an off-shape template returns `undefined`, and a
caller who wants a throw raises its own error from that `undefined`.

| API             | Kind     | Summary                                                                                                    |
| --------------- | -------- | ---------------------------------------------------------------------------------------------------------- |
| `parseTemplate` | function | Parses a JSON string into a `Template`, or `undefined` on invalid JSON or a shape that fails `isTemplate`. |

```ts
import { parseTemplate } from '@orkestrel/interpret'

parseTemplate('not json') // undefined
```

### Factories

| API                       | Kind     | Summary                                                                                                                                                |
| ------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `createInterpret`         | function | Creates an interpretation orchestrator, returning an `InterpretInterface` seeded from `InterpretOptions`.                                              |
| `createNormalizer`        | function | Creates a text normalizer, returning a stateless `NormalizerInterface`.                                                                                |
| `createExtractor`         | function | Creates a template-agnostic intent classifier and number extractor, returning a stateless `ExtractorInterface`.                                        |
| `createClarifier`         | function | Creates a clarifier — carry-over, defaults, and computed-field resolution against an assigned entity set — returning a stateless `ClarifierInterface`. |
| `createFormatter`         | function | Creates a prompt formatter, returning a stateless `FormatterInterface`.                                                                                |
| `createGenerator`         | function | Creates a subject and definition generator, returning a stateless `GeneratorInterface`.                                                                |
| `createTemplateManager`   | function | Creates a template registry, returning a working `TemplateManagerInterface`.                                                                           |
| `createSubjectManager`    | function | Creates a subject registry, returning a working `SubjectManagerInterface`.                                                                             |
| `createDefinitionManager` | function | Creates a definition registry, returning a working `DefinitionManagerInterface`.                                                                       |
| `createInterpretContext`  | function | Creates a cross-turn interpretation context, returning a working `InterpretContextInterface`.                                                          |
| `createNarrator`          | function | Creates a lexicon-driven reverse-direction rendering engine, returning a stateless `NarratorInterface`.                                                |

```ts
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
	createTemplateManager,
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

const templates = createTemplateManager({
	templates: [
		{
			id: 't1',
			name: 'Arithmetic',
			domain: 'arithmetic',
			intents: ['calculate'],
			mappings: [{ entity: 'value', aliases: [], field: 'value' }],
			defaults: [],
			computations: [],
			definition: createQuantitativeDefinition('t1', 'Arithmetic', [
				createFactorGroup('total', 'sum', [createFieldFactor('value', 'value')]),
			]),
		},
	],
})
templates.count // 1
templates.destroy()

createSubjectManager({ subjects: [{ value: 1 }] }).count // 1
createDefinitionManager({
	definitions: [
		createQuantitativeDefinition('d1', 'D1', [
			createFactorGroup('total', 'sum', [createFieldFactor('value', 'value')]),
		]),
	],
}).count // 1
```

### Classes

| API                 | Kind  | Summary                                                                                                                                                                                                                                                                                                        |
| ------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Interpret`         | class | Implements the interpretation orchestrator — the sole public entry point of the `interprets` module, mirroring the reasons `Reason` orchestrator shape: it runs the `[normalize, extract, clarify, format, generate]` pipeline, owns the template registry and the context, and exposes the reverse direction. |
| `Narrator`          | class | Implements a stateless, total, lexicon-driven rendering engine for the reverse direction — the reverse-direction mirror of the forward `Formatter`'s `verbs` seam, supplying mechanism rather than wording policy.                                                                                             |
| `Normalizer`        | class | Implements the normalize stage: applies contraction, abbreviation, and correction substitutions in order, then collapses whitespace.                                                                                                                                                                           |
| `Extractor`         | class | Implements the extract stage: template-agnostic intent classification plus raw numeric-entity mining.                                                                                                                                                                                                          |
| `Clarifier`         | class | Implements the clarify stage: resolves same-domain carry-over, template defaults, and declaratively computed fields against an already-assigned entity set, surfacing an `Ambiguity` for every required mapping that stays unresolved.                                                                         |
| `Formatter`         | class | Implements the format stage: renders the refined natural-language prompt for a matched template.                                                                                                                                                                                                               |
| `Generator`         | class | Implements the generate stage: builds the final `Subject` from a fully resolved entity set, plus its complete field audit.                                                                                                                                                                                     |
| `RecordManager`     | class | Implements the shared registry engine behind every record manager in this module — it owns the `Map`, the content-hash and version rule, the batch `remove` overloads, and teardown.                                                                                                                           |
| `TemplateManager`   | class | Implements the template registry — a self-owning, versioned and content-hashed record-holder for the `Template`s an `Interpret` orchestrator matches against.                                                                                                                                                  |
| `SubjectManager`    | class | Implements the subject registry — a self-owning, versioned and content-hashed record-holder that mints its own record identity for every `Subject` (a `Subject` carries no `id` field of its own).                                                                                                             |
| `DefinitionManager` | class | Implements the definition registry — a self-owning, versioned and content-hashed record-holder for the reasons `Definition`s an interpretation produces.                                                                                                                                                       |
| `InterpretContext`  | class | Implements the cross-turn interpretation context — a capped, replayable history of completed `Interpretation`s plus the subject and definition registries carry-over reads from.                                                                                                                               |

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

| Method    | Returns         | Summary                                                              |
| --------- | --------------- | -------------------------------------------------------------------- |
| `extract` | `ExtractResult` | Classifies the intent and mines every numeric literal from the text. |

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

| Method    | Returns         | Summary                                                                                                                                                                              |
| --------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `clarify` | `ClarifyResult` | Resolves carry-over, template defaults, and computed fields, and surfaces an `Ambiguity` for every unresolved required field, worded through the narrator's `ambiguity.entity` line. |

```ts
import { createClarifier } from '@orkestrel/interpret'

const clarifier = createClarifier({ floor: 0.3 })
clarifier.clarify(
	[],
	{
		id: 't1',
		name: 'Arithmetic',
		domain: 'arithmetic',
		intents: ['calculate'],
		mappings: [{ entity: 'value', aliases: [], field: 'value', required: true }],
		defaults: [],
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
`{field}.{index}`, so a template whose collection has a known length declares an
aggregate over it:

```ts
import { createClarifier } from '@orkestrel/interpret'
import { createOperation, createVariable } from '@orkestrel/reason'

// `value.0` and `value.1` name the first two elements of the array-valued
// `value` field. A collection whose length varies per turn has no declarable
// aggregate: `resolveExpression` returns `undefined` for an unbound variable,
// so a template naming `value.2` against a two-element array lands no `total`
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
		defaults: [],
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

| Method   | Returns        | Summary                                                                                                                       |
| -------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `format` | `FormatResult` | Renders the refined natural-language prompt for a matched template, clause by clause through the narrator's `prompt.*` lines. |

```ts
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
		defaults: [],
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

| Method     | Returns          | Summary                                                                                                                     |
| ---------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `generate` | `GenerateResult` | Builds the final subject and definition pair plus its complete field audit, deriving no field the template did not declare. |

```ts
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
		defaults: [],
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

#### `TemplateManagerInterface`

The self-owning, ordered registry over templates. `add` derives each record's `hash` from the
template's content and bumps `version` only when that hash changes. `remove`'s array form is
all-or-nothing. A call after `destroy()` throws `InterpretError('DESTROYED', …)`.

| Method      | Returns                       | Summary                                                                                                                 |
| ----------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `has`       | `boolean`                     | Reports whether a template with the given id has been added.                                                            |
| `template`  | `TemplateRecord \| undefined` | Looks up one added template record by id — the singular accessor.                                                       |
| `templates` | `readonly TemplateRecord[]`   | Lists every added template record — the plural accessor.                                                                |
| `add`       | `TemplateRecord`              | Adds, or re-adds, one template from its data, and emits `add`.                                                          |
| `remove`    | `boolean` (or `void`)         | Removes the listed templates by id, one template by id, or every template, and emits `remove` per removed id.           |
| `destroy`   | `void`                        | Tears the template registry down idempotently — clears the collection, emits `destroy`, then destroys the emitter last. |

```ts
import { createTemplateManager } from '@orkestrel/interpret'
import {
	createFactorGroup,
	createFieldFactor,
	createQuantitativeDefinition,
} from '@orkestrel/reason'

const templates = createTemplateManager()
const record = templates.add({
	id: 't1',
	name: 'Arithmetic',
	domain: 'arithmetic',
	intents: ['calculate'],
	mappings: [],
	defaults: [],
	computations: [],
	definition: createQuantitativeDefinition('t1', 'Arithmetic', [
		createFactorGroup('total', 'sum', [createFieldFactor('value', 'value')]),
	]),
})
record.version // 1
templates.count // 1
templates.has('t1') // true
templates.template('t1') // the TemplateRecord, or undefined
templates.templates() // every added record
templates.remove('t1') // true
templates.destroy()
```

#### `SubjectManagerInterface`

Mirrors `TemplateManagerInterface`, minting its own record ids (a `Subject`
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

Mirrors `TemplateManagerInterface`, defaulting each record id to the
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
`history`. `entities()` flattens every entity across the buffered history,
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

`interpret` is genuinely synchronous. `add`, `remove`, `template`, and `templates` name the
same acts as the internal `TemplateManagerInterface` they delegate to, and `add` returns
`void` where the manager returns the record it minted. `describe` and `narrate` are the
reverse direction. After `destroy()` every method except the `emitter` getter and `destroy`
itself throws `InterpretError('DESTROYED', …)`; `destroy()` is idempotent, leaves a `context`
the caller supplied alive, and tears the emitter down last. You observe only the
supplied-context half of that rule: `InterpretInterface` publishes no context accessor, so
nothing outside reads the state of a context the orchestrator constructed itself or
subscribes to its emitter.

| Method      | Returns                 | Summary                                                                                                                                 |
| ----------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `interpret` | `Interpretation`        | Runs the `[normalize, extract, clarify, format, generate]` pipeline over raw text, returning a complete or a visibly incomplete result. |
| `add`       | `void`                  | Adds one template, and emits `add`.                                                                                                     |
| `remove`    | `boolean` (or `void`)   | Removes the listed templates by id, one template by id, or every template.                                                              |
| `template`  | `Template \| undefined` | Looks up one added template's plain data by id.                                                                                         |
| `templates` | `readonly Template[]`   | Lists every added template's plain data.                                                                                                |
| `describe`  | `string`                | Renders a reasons `Definition` to a one-line, display-neutral description.                                                              |
| `narrate`   | `string`                | Renders a reasons `ReasonResult` to a one-line, display-neutral description.                                                            |
| `destroy`   | `void`                  | Tears the orchestrator down idempotently — the template registry, the context it constructed itself, then the emitter last.             |

```ts
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
	defaults: [],
	computations: [],
	definition: createQuantitativeDefinition('t1', 'Arithmetic', [
		createFactorGroup('total', 'sum', [createFieldFactor('value', 'value')]),
	]),
})
const result = interpret.interpret('calculate arithmetic 42')
result.subject // { value: 42 }
interpret.template('t1') // the plain Template data
interpret.templates() // every added template
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

## Tests

- [`tests/guides.test.ts`](../tests/guides.test.ts) — the `## Surface` ↔ `src/core` bijection (value and type exports), each behavioral interface ↔ its implementing class method bijection, and the equality gate: every `Summary` cell against its declaration's description paragraph, the titled `Interpret text against an added template` fence against the `@example` block of that title (pinned so the titled pair cannot be retired silently), and the README pitch against this guide's tagline. It also runs the flagship fences and asserts the values their comments claim.
- [`tests/src/core/Interpret.test.ts`](../tests/src/core/Interpret.test.ts) — the orchestrator: the fixed pipeline and its per-stage records, the `NO_TEMPLATE` and `LOW_CONFIDENCE` incomplete results, a thrown stage marked on its record and on `failures`, the replay digest, the emitter surface, and teardown.
- [`tests/src/core/InterpretContext.test.ts`](../tests/src/core/InterpretContext.test.ts) — the capped ring buffer, the flattened entity read carry-over consults, `clear` against `destroy`, and the emitted events.
- [`tests/src/core/Narrator.test.ts`](../tests/src/core/Narrator.test.ts) — every lookup total against an adversarial key, the documented fallback of each primitive, and the composed `describe` and `narrate` renderings.
- [`tests/src/core/factories.test.ts`](../tests/src/core/factories.test.ts) — each factory returns a working entity, and honors the options it declares.
- [`tests/src/core/helpers.test.ts`](../tests/src/core/helpers.test.ts) — the pure leaves: escaping, copy-on-write field writes and their prototype-pollution refusal, replacement and whitespace collapse, tokenizing, numeric mining, entity assignment, intent classification, similarity and alias matching, canonicalization and digesting, template scoring and matching, expression variables and resolution, and subject rendering.
- [`tests/src/core/parsers.test.ts`](../tests/src/core/parsers.test.ts) — `parseTemplate` returns a template, or `undefined` on invalid JSON and on a shape that fails `isTemplate`.
- [`tests/src/core/validators.test.ts`](../tests/src/core/validators.test.ts) — every guard stays total against junk, cycles, and hostile prototypes, with the exact posture for an input record and the open posture for a result record.
- [`tests/src/core/stages/Normalizer.test.ts`](../tests/src/core/stages/Normalizer.test.ts) — the substitution order, the recorded changes, and the final whitespace collapse.
- [`tests/src/core/stages/Extractor.test.ts`](../tests/src/core/stages/Extractor.test.ts) — intent classification against caller vocabularies, and numeric mining, with no template in sight.
- [`tests/src/core/stages/Clarifier.test.ts`](../tests/src/core/stages/Clarifier.test.ts) — resolution order across fresh entities, same-domain carry-over, defaults, and dependency-ordered computed fields, plus the ambiguity every unresolved required mapping raises.
- [`tests/src/core/stages/Formatter.test.ts`](../tests/src/core/stages/Formatter.test.ts) — the clause assembly through the narrator's `prompt.*` lines, and the verb fallback.
- [`tests/src/core/stages/Generator.test.ts`](../tests/src/core/stages/Generator.test.ts) — the entity-to-field rule, the single-element unwrap, the mean confidence, and the field audit.
- [`tests/src/core/managers/RecordManager.test.ts`](../tests/src/core/managers/RecordManager.test.ts) — the content hash and version rule, the all-or-nothing batch `remove`, the emitted events, and idempotent teardown.
- [`tests/src/core/managers/TemplateManager.test.ts`](../tests/src/core/managers/TemplateManager.test.ts) — the template accessors, the record id defaulting to `template.id`, and re-add versioning.
- [`tests/src/core/managers/SubjectManager.test.ts`](../tests/src/core/managers/SubjectManager.test.ts) — the minted record identity, the caller override, and the subject accessors.
- [`tests/src/core/managers/DefinitionManager.test.ts`](../tests/src/core/managers/DefinitionManager.test.ts) — the definition accessors and the record id defaulting to the definition's own `id`.
- [`tests/src/core/integration.test.ts`](../tests/src/core/integration.test.ts) — the forward and reverse directions driven together over a real corpus, through the public API.
