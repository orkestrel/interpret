# Interpret

> A synchronous, deterministic bidirectional bridge between natural language
> and the `@orkestrel/reason` engine. FORWARD: raw text is
> **normalized** (contraction/abbreviation/correction substitutions),
> **extracted** (template-agnostic intent classification + numeric mining),
> matched against a registered **`Template`**, its numbers **assigned** to
> the template's entity mappings, **clarified** (same-domain carry-over,
> defaults, dependency-ordered computed fields), **formatted** into a
> refined natural-language prompt, then **generated** into a `Subject` +
> `Definition` pair ready for `Reason.reason`. REVERSE: a `Definition` /
> `Subject` / `ReasonResult` renders to display-neutral prose through a
> lexicon-driven `Narrator`, complementing (never duplicating) rater's
> `describe*` family. Nothing here is an LLM, provider, or agent — the
> `prompt` a result carries is FOR an external model, never consumed
> internally. Every discriminant names its axis, never `kind` / `type`
> (AGENTS §4.4): `stage` splits the five pipeline phases, `category` splits
> provenance, `code` splits coded errors. Source: [`src/core`](../../src/core).
> Surfaced through the `@src/core` barrel.

## Surface

Register a template, interpret text through the five-stage pipeline, then
render the result back to prose:

```ts
import { createInterpret } from '@orkestrel/interpret'
import { factorGroup, fieldFactor, quantitativeDefinition } from '@orkestrel/reason'

const interpret = createInterpret({
	extractor: {
		extract: () => ({
			intent: { action: 'calculate', domain: 'arithmetic', confidence: 1 },
			numbers: [42],
			complete: true,
		}),
	},
	templates: [
		{
			id: 't1',
			name: 'Arithmetic',
			domain: 'arithmetic',
			intents: ['calculate'],
			mappings: [{ entity: 'value', aliases: [], field: 'value' }],
			defaults: [],
			computations: [],
			definition: quantitativeDefinition('t1', 'Arithmetic', [
				factorGroup('total', 'sum', [fieldFactor('value', 'value')]),
			]),
		},
	],
})

const result = interpret.interpret('calculate arithmetic 42')
result.subject // { value: 42 }
result.complete // true

interpret.emitter.on('interpret', (interpretation) => interpretation.digest)
interpret.describe(result.definition ?? quantitativeDefinition('t1', 'Arithmetic', []))
interpret.destroy()
```

`interpret()` is genuinely SYNCHRONOUS and runs the fixed five-stage pipeline
`[normalize, extract, clarify, format, generate]`; a `NO_TEMPLATE` /
`LOW_CONFIDENCE` non-match, or a thrown stage, both yield a visible
INCOMPLETE `Interpretation` (never an arbitrary fallback template) rather
than throwing.

### Types

| Type                         | Kind      | Shape                                                                                                                                                                                                            |
| ---------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ProvenanceCategory`         | type      | `'extracted' \| 'carried' \| 'default' \| 'computed' \| 'subject'` — how one value was obtained.                                                                                                                 |
| `InterpretStage`             | type      | `'normalize' \| 'extract' \| 'clarify' \| 'format' \| 'generate'` — the five fixed pipeline phases, in order.                                                                                                    |
| `InterpretErrorCode`         | type      | `'NORMALIZE_FAILED' \| 'EXTRACT_FAILED' \| 'CLARIFY_FAILED' \| 'FORMAT_FAILED' \| 'GENERATE_FAILED' \| 'NO_TEMPLATE' \| 'LOW_CONFIDENCE' \| 'INVALID_TEMPLATE' \| 'DESTROYED'` — coded `InterpretError` reasons. |
| `EntityMapping`              | interface | `{ entity, aliases, field, required? }` — one entity-extraction rule pointing at a subject field.                                                                                                                |
| `FieldDefault`               | interface | `{ field, value }` — a fallback value filled onto an unresolved field.                                                                                                                                           |
| `ComputedField`              | interface | `{ field, expression }` — a declaratively computed field over a reasons `SymbolicExpression` tree.                                                                                                               |
| `Template`                   | interface | `{ id, name, domain, intents, mappings, defaults, computations, definition }` — a named, versionable interpretation template.                                                                                    |
| `Provenance`                 | interface | `{ category, detail? }` — how one value landed, with an optional strategy detail.                                                                                                                                |
| `Intent`                     | interface | `{ action, domain, confidence }` — the classified action + domain for one interpretation.                                                                                                                        |
| `Entity`                     | interface | `{ name, value, provenance, confidence }` — one value assigned to a template's entity mapping.                                                                                                                   |
| `Ambiguity`                  | interface | `{ field, question, candidates, required }` — an unresolved field surfaced as a human-readable question.                                                                                                         |
| `FieldMapping`               | interface | `{ field, entity?, value, provenance, confidence }` — one audited field of the built subject.                                                                                                                    |
| `TextChange`                 | interface | `{ from, to }` — one normalization substitution applied to the raw text.                                                                                                                                         |
| `StageRecord`                | interface | `{ stage, input, output, failed, error? }` — a structured input/output snapshot of one pipeline phase.                                                                                                           |
| `StageFailure`               | interface | `{ stage, code, message }` — a visible marker for a stage that threw.                                                                                                                                            |
| `NormalizeResult`            | interface | `{ text, changes }` — the `Normalizer` stage's output.                                                                                                                                                           |
| `ExtractResult`              | interface | `{ intent, numbers, complete }` — the `Extractor` stage's output.                                                                                                                                                |
| `ClarifyResult`              | interface | `{ entities, ambiguities, complete }` — the `Clarifier` stage's output.                                                                                                                                          |
| `FormatResult`               | interface | `{ prompt }` — the `Formatter` stage's output.                                                                                                                                                                   |
| `GenerateResult`             | interface | `{ subject, definition, mappings, confidence }` — the `Generator` stage's output.                                                                                                                                |
| `Interpretation`             | interface | `{ text, normalized, intent, entities, subject?, definition?, mappings, ambiguities, prompt, stages, failures, complete, confidence, digest }` — the full, replayable outcome of one `interpret()` call.         |
| `TemplateRecord`             | interface | `{ id, template, version, hash }` — a versioned, content-hashed `Template`.                                                                                                                                      |
| `SubjectRecord`              | interface | `{ id, subject, version, hash }` — a versioned, content-hashed `Subject`.                                                                                                                                        |
| `DefinitionRecord`           | interface | `{ id, definition, version, hash }` — a versioned, content-hashed `Definition`.                                                                                                                                  |
| `InterpretEventMap`          | type      | `Interpret`'s push observation surface (AGENTS §13) — `interpret(result)` · `register(templateId)` · `error(error)` · `destroy()`.                                                                               |
| `TemplateManagerEventMap`    | type      | `TemplateManager`'s push observation surface — `add(id)` · `remove(id)` · `destroy()`.                                                                                                                           |
| `SubjectManagerEventMap`     | type      | `SubjectManager`'s push observation surface — `add(id)` · `remove(id)` · `destroy()`.                                                                                                                            |
| `DefinitionManagerEventMap`  | type      | `DefinitionManager`'s push observation surface — `add(id)` · `remove(id)` · `destroy()`.                                                                                                                         |
| `InterpretContextEventMap`   | type      | `InterpretContext`'s push observation surface — `add(digest)` · `clear()` · `destroy()`.                                                                                                                         |
| `NarratorFormatter`          | type      | `(value: unknown) => string` — a pure formatting function for one lexicon `value()` unit.                                                                                                                        |
| `Lexicon`                    | interface | `{ phrases?, labels?, templates? }` — caller-injected wording data for the reverse direction.                                                                                                                    |
| `NarratorOptions`            | interface | `{ lexicon?, formatters? }` — input to `createNarrator`.                                                                                                                                                         |
| `NormalizerOptions`          | interface | `{ contractions?, abbreviations?, corrections? }` — input to `createNormalizer`.                                                                                                                                 |
| `ExtractorOptions`           | interface | `{ actions?, domains? }` — input to `createExtractor`.                                                                                                                                                           |
| `ClarifierOptions`           | interface | `{ floor? }` — input to `createClarifier`.                                                                                                                                                                       |
| `FormatterOptions`           | interface | `{ verbs? }` — input to `createFormatter`.                                                                                                                                                                       |
| `GeneratorOptions`           | interface | `{}` — input to `createGenerator`; an empty extension seam today.                                                                                                                                                |
| `TemplateManagerOptions`     | interface | `{ templates?, on?, error? }` — input to `createTemplateManager`.                                                                                                                                                |
| `SubjectManagerOptions`      | interface | `{ subjects?, on?, error? }` — input to `createSubjectManager`.                                                                                                                                                  |
| `DefinitionManagerOptions`   | interface | `{ definitions?, on?, error? }` — input to `createDefinitionManager`.                                                                                                                                            |
| `ManagerAddOptions`          | interface | `{ id? }` — per-call options shared by every manager's `add` method.                                                                                                                                             |
| `InterpretContextOptions`    | interface | `{ session?, history?, on?, error? }` — input to `createInterpretContext`.                                                                                                                                       |
| `InterpretOptions`           | interface | `{ templates?, context?, normalizer?, extractor?, clarifier?, formatter?, generator?, similarity?, floor?, history?, lexicon?, formatters?, on?, error? }` — input to `createInterpret`.                         |
| `NormalizerInterface`        | interface | The `Normalizer` stage contract — `normalize`.                                                                                                                                                                   |
| `ExtractorInterface`         | interface | The `Extractor` stage contract — `extract`.                                                                                                                                                                      |
| `ClarifierInterface`         | interface | The `Clarifier` stage contract — `clarify`.                                                                                                                                                                      |
| `FormatterInterface`         | interface | The `Formatter` stage contract — `format`.                                                                                                                                                                       |
| `GeneratorInterface`         | interface | The `Generator` stage contract — `generate`.                                                                                                                                                                     |
| `NarratorInterface`          | interface | The lexicon-driven reverse-rendering contract — `phrase` / `label` / `line` / `value` / `describe` / `narrate`.                                                                                                  |
| `TemplateManagerInterface`   | interface | The template registry contract (AGENTS §9) — `emitter` / `size` + `has` / `template` / `templates` / `add` / `remove` / `destroy`.                                                                               |
| `SubjectManagerInterface`    | interface | The subject registry contract — `emitter` / `size` + `has` / `subject` / `subjects` / `add` / `remove` / `destroy`.                                                                                              |
| `DefinitionManagerInterface` | interface | The definition registry contract — `emitter` / `size` + `has` / `definition` / `definitions` / `add` / `remove` / `destroy`.                                                                                     |
| `InterpretContextInterface`  | interface | The cross-turn context contract — `emitter` / `session?` / `subjects` / `definitions` + `previous` / `entities` / `add` / `clear` / `destroy`.                                                                   |
| `InterpretInterface`         | interface | The interpretation orchestrator contract — `emitter` + `interpret` / `register` / `unregister` / `template` / `templates` / `describe` / `narrate` / `destroy`.                                                  |

### Constants

| API                            | Kind  | Summary                                                                                       |
| ------------------------------ | ----- | --------------------------------------------------------------------------------------------- |
| `DEFAULT_INTERPRET_SIMILARITY` | const | `0.8` — default fuzzy alias-match score threshold for `createInterpret` / `matchAlias`.       |
| `DEFAULT_INTERPRET_FLOOR`      | const | `0.3` — default minimum intent confidence a template match must clear.                        |
| `DEFAULT_INTERPRET_HISTORY`    | const | `16` — default `history` cap for an `InterpretContext`'s `previous()` ring buffer.            |
| `INTERPRET_ID`                 | const | `'interpret'` — default id for an `Interpret` orchestrator.                                   |
| `CONFIDENCE_EXACT`             | const | `1` — confidence for an exact keyword-proximity entity match.                                 |
| `CONFIDENCE_ALIAS`             | const | `0.9` — confidence for an exact alias-phrase entity match.                                    |
| `CONFIDENCE_COLLECT`           | const | `0.9` — confidence when a single entity mapping collects every extracted number.              |
| `CONFIDENCE_POSITIONAL`        | const | `0.7` — confidence for a positional (order-based) entity match fallback.                      |
| `CONFIDENCE_CARRIED`           | const | `0.7` — confidence for a same-domain carried-over field.                                      |
| `CONFIDENCE_DEFAULT`           | const | `1` — confidence for a template default fill.                                                 |
| `CONFIDENCE_COMPUTED`          | const | `0.9` — confidence for a successfully resolved computed field.                                |
| `NUMBER_PATTERN`               | const | The shared numeric-entity extraction `RegExp` — leading `$`, thousands commas, decimal, `%`.  |
| `UNSAFE_FIELD_SEGMENTS`        | const | `['__proto__', 'prototype', 'constructor']` — prototype-pollution-unsafe field-path segments. |
| `DEFAULT_CONTRACTIONS`         | const | Neutral built-in contraction expansions for `Normalizer`.                                     |
| `DEFAULT_ABBREVIATIONS`        | const | Neutral built-in abbreviation expansions for `Normalizer` — empty by default.                 |
| `DEFAULT_CORRECTIONS`          | const | Neutral built-in misspelling corrections for `Normalizer` — empty by default.                 |
| `DEFAULT_ACTIONS`              | const | Neutral built-in action-verb vocabulary for `Extractor#extract` — empty by default.           |
| `DEFAULT_DOMAINS`              | const | Neutral built-in domain-keyword vocabulary for `Extractor#extract` — empty by default.        |
| `DEFAULT_VERBS`                | const | Neutral built-in intent-verb phrasing for `Formatter#format` — empty by default.              |
| `DEFAULT_LEXICON`              | const | The neutral default `Lexicon` a `Narrator` merges caller data over.                           |

```ts
import {
	CONFIDENCE_ALIAS,
	CONFIDENCE_CARRIED,
	CONFIDENCE_COLLECT,
	CONFIDENCE_COMPUTED,
	CONFIDENCE_DEFAULT,
	CONFIDENCE_EXACT,
	CONFIDENCE_POSITIONAL,
	DEFAULT_ABBREVIATIONS,
	DEFAULT_ACTIONS,
	DEFAULT_CONTRACTIONS,
	DEFAULT_CORRECTIONS,
	DEFAULT_DOMAINS,
	DEFAULT_INTERPRET_FLOOR,
	DEFAULT_INTERPRET_HISTORY,
	DEFAULT_INTERPRET_SIMILARITY,
	DEFAULT_LEXICON,
	DEFAULT_VERBS,
	INTERPRET_ID,
	NUMBER_PATTERN,
	UNSAFE_FIELD_SEGMENTS,
} from '@orkestrel/interpret'

DEFAULT_INTERPRET_SIMILARITY // 0.8
DEFAULT_INTERPRET_FLOOR // 0.3
DEFAULT_INTERPRET_HISTORY // 16
INTERPRET_ID // 'interpret'
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
DEFAULT_ABBREVIATIONS // {}
DEFAULT_CORRECTIONS // {}
DEFAULT_ACTIONS // {}
DEFAULT_DOMAINS // {}
DEFAULT_VERBS // {}
DEFAULT_LEXICON.templates?.['subject.empty'] // 'with no fields'
```

### Errors

| API                | Kind     | Summary                                               |
| ------------------ | -------- | ----------------------------------------------------- |
| `InterpretError`   | class    | Carries an `InterpretErrorCode` + optional `context`. |
| `isInterpretError` | function | Narrow a caught value to an `InterpretError`.         |

```ts
import { InterpretError, isInterpretError } from '@orkestrel/interpret'

try {
	throw new InterpretError('DESTROYED', 'Interpret has been destroyed')
} catch (error) {
	if (isInterpretError(error)) error.code // 'DESTROYED'
}
```

### Validators

Total guards (AGENTS §14) composed from `@orkestrel/contract` combinators and
`@orkestrel/reason` guards — adversarial input (junk, cycles, hostile
prototypes) returns `false`, never throws.

| API               | Kind     | Narrows to                                                                |
| ----------------- | -------- | ------------------------------------------------------------------------- |
| `isEntityMapping` | function | `EntityMapping`.                                                          |
| `isFieldDefault`  | function | `FieldDefault`.                                                           |
| `isComputedField` | function | `ComputedField`.                                                          |
| `isTemplate`      | function | `Template` — composes reasons' `isDefinition` and `isSymbolicExpression`. |

```ts
import { isComputedField, isEntityMapping, isFieldDefault, isTemplate } from '@orkestrel/interpret'
import { factorGroup, fieldFactor, quantitativeDefinition } from '@orkestrel/reason'

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
	definition: quantitativeDefinition('t1', 'Arithmetic', [
		factorGroup('total', 'sum', [fieldFactor('value', 'value')]),
	]),
}) // true
```

### Helpers

Pure, exported utility functions (AGENTS §4.3) — the referentially-
transparent leaves behind the `Interpret` orchestrator and its stages.

| API                    | Kind     | Summary                                                                                                                                     |
| ---------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `escapeRegExp`         | function | Escape every regex metacharacter so text matches literally when compiled into a `RegExp`.                                                   |
| `setField`             | function | Copy-on-write write a value at a (possibly nested) field path — prototype-pollution-safe.                                                   |
| `deriveAggregateField` | function | Derive the sibling field path for a computed aggregate of a field — nests beside an array `FieldPath`, stays flat for a plain string field. |
| `interpolateMessage`   | function | Interpolate `{{dotted.path}}` tokens in a message template against a record.                                                                |
| `applyReplacements`    | function | Replace every whole-word occurrence of a map's keys with their values.                                                                      |
| `collapseWhitespace`   | function | Collapse every run of whitespace to a single space and trim the ends.                                                                       |
| `tokenize`             | function | Split text into lowercase tokens, stripping punctuation outside a numeric/currency-safe allowlist.                                          |
| `extractNumbers`       | function | Mine every numeric literal from text.                                                                                                       |
| `assignEntities`       | function | Assign already-extracted numbers to a matched template's entity mappings.                                                                   |
| `classifyIntent`       | function | Classify the action + domain intent of text against caller-supplied vocabularies.                                                           |
| `scoreSimilarity`      | function | Bigram (Dice coefficient) string similarity, case-insensitive.                                                                              |
| `matchAlias`           | function | The best `scoreSimilarity` a token achieves against a list of aliases, gated by a threshold.                                                |
| `canonicalize`         | function | Render a value into a canonical, key-order-stable string.                                                                                   |
| `digestValue`          | function | Compute a canonical structural digest (FNV-1a, 8-hex-digit) of a pure-JSON value.                                                           |
| `scoreTemplate`        | function | Score how well a classified intent matches one template's domain + action.                                                                  |
| `matchTemplate`        | function | Find the best-scoring registered template for a classified intent, gated by a confidence floor.                                             |
| `variablesOf`          | function | Collect every variable name referenced by a symbolic expression tree.                                                                       |
| `resolveExpression`    | function | Evaluate a symbolic expression tree against resolved bindings.                                                                              |
| `describeSubject`      | function | Render a one-line, display-neutral description of a reasons `Subject`, through an injected `Narrator`.                                      |
| `parseTemplate`        | function | Parse a JSON string into a `Template`, or `undefined` on invalid JSON or a shape that fails `isTemplate`.                                   |

```ts
import {
	applyReplacements,
	collapseWhitespace,
	deriveAggregateField,
	escapeRegExp,
	setField,
	tokenize,
} from '@orkestrel/interpret'

escapeRegExp('a.b*c') // 'a\\.b\\*c'
setField({ age: 25 }, 'age', 30) // { age: 30 }
setField({}, ['address', 'city'], 'Reno') // { address: { city: 'Reno' } }
deriveAggregateField(['address', 'amounts'], 'Sum') // ['address', 'amountsSum']
deriveAggregateField('amounts', 'Sum') // 'amountsSum'
applyReplacements("can't stop", { "can't": 'cannot' }) // 'cannot stop'
collapseWhitespace('  a   b\t c ') // 'a b c'
tokenize('The rate is 85%.') // ['the', 'rate', 'is', '85%']
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
import {
	canonicalize,
	createNarrator,
	describeSubject,
	digestValue,
	interpolateMessage,
	matchTemplate,
	parseTemplate,
	resolveExpression,
	scoreTemplate,
	variablesOf,
} from '@orkestrel/interpret'

interpolateMessage('Limit is {{limit}}', { limit: 5010 }) // 'Limit is 5,010'
canonicalize({ b: 1, a: 2 }) === canonicalize({ a: 2, b: 1 }) // true
digestValue({ a: 1 }) === digestValue({ a: 1 }) // true — deterministic
matchTemplate({ action: '', domain: '', confidence: 0 }, [], 0.3) // undefined — empty registry
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
describeSubject({ age: 25, income: 50000 }, createNarrator()) // 'with age: 25, income: 50000'
parseTemplate('not json') // undefined

const gate = { action: 'compute', domain: 'rating', confidence: 1 }
const template = {
	id: 't1',
	name: 'T',
	domain: 'rating',
	intents: ['compute'],
	mappings: [],
	defaults: [],
	computations: [],
	definition: { reasoning: 'symbolic' as const, id: 't1', name: 'T', equations: [], variables: {} },
}
scoreTemplate(gate, template) // 1
```

### Factories

| API                       | Kind     | Builds…                                                                                                       |
| ------------------------- | -------- | ------------------------------------------------------------------------------------------------------------- |
| `createInterpret`         | function | An `InterpretInterface` — the interpretation orchestrator, seeded from `InterpretOptions`.                    |
| `createNormalizer`        | function | A stateless `NormalizerInterface`.                                                                            |
| `createExtractor`         | function | A stateless `ExtractorInterface`.                                                                             |
| `createClarifier`         | function | A stateless `ClarifierInterface`.                                                                             |
| `createFormatter`         | function | A stateless `FormatterInterface`.                                                                             |
| `createGenerator`         | function | A stateless `GeneratorInterface`.                                                                             |
| `createTemplateManager`   | function | A working `TemplateManagerInterface`.                                                                         |
| `createSubjectManager`    | function | A working `SubjectManagerInterface`.                                                                          |
| `createDefinitionManager` | function | A working `DefinitionManagerInterface`.                                                                       |
| `createInterpretContext`  | function | A working `InterpretContextInterface`.                                                                        |
| `createTemplate`          | function | Validate and return a `Template` from plain data — throws `InterpretError('INVALID_TEMPLATE', …)` on failure. |
| `createNarrator`          | function | A stateless `NarratorInterface`.                                                                              |

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
	createTemplate,
	createTemplateManager,
} from '@orkestrel/interpret'
import { factorGroup, fieldFactor, quantitativeDefinition } from '@orkestrel/reason'

const interpret = createInterpret()
interpret.destroy()

createNormalizer().normalize("it's  cold") // { text: 'it is cold', changes: [...] }
createExtractor({ actions: { calculate: 'calculate' }, domains: { arithmetic: ['arithmetic'] } })
createClarifier({ floor: 0.5 })
createFormatter({ verbs: { calculate: 'Calculate' } })
createGenerator()
createInterpretContext({ session: 'turn-1', history: 4 })
createNarrator({ lexicon: { templates: { 'subject.empty': 'nothing here' } } })

const template = createTemplate({
	id: 't1',
	name: 'Arithmetic',
	domain: 'arithmetic',
	intents: ['calculate'],
	mappings: [{ entity: 'value', aliases: [], field: 'value' }],
	defaults: [],
	computations: [],
	definition: quantitativeDefinition('t1', 'Arithmetic', [
		factorGroup('total', 'sum', [fieldFactor('value', 'value')]),
	]),
})
const templates = createTemplateManager({ templates: [template] })
templates.size // 1
templates.destroy()

createSubjectManager({ subjects: [{ value: 1 }] }).size // 1
createDefinitionManager({
	definitions: [
		quantitativeDefinition('d1', 'D1', [
			factorGroup('total', 'sum', [fieldFactor('value', 'value')]),
		]),
	],
}).size // 1
```

### Entities

| API                 | Kind  | Summary                                                                                                                                |
| ------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `Interpret`         | class | The interpretation orchestrator — runs the five-stage pipeline, owns the template registry and context, exposes the reverse direction. |
| `Narrator`          | class | A stateless, total, lexicon-driven rendering engine for the reverse direction.                                                         |
| `Normalizer`        | class | The `Normalizer` stage — contraction/abbreviation/correction substitutions plus whitespace collapse.                                   |
| `Extractor`         | class | The `Extractor` stage — template-agnostic intent classification plus numeric mining.                                                   |
| `Clarifier`         | class | The `Clarifier` stage — same-domain carry-over, defaults, and dependency-ordered computed fields.                                      |
| `Formatter`         | class | The `Formatter` stage — renders the refined natural-language prompt.                                                                   |
| `Generator`         | class | The `Generator` stage — builds the final subject/definition pair plus its field audit.                                                 |
| `TemplateManager`   | class | The self-owning, versioned/hashed template registry (AGENTS §9).                                                                       |
| `SubjectManager`    | class | The self-owning, versioned/hashed subject registry that mints its own record ids.                                                      |
| `DefinitionManager` | class | The self-owning, versioned/hashed definition registry.                                                                                 |
| `InterpretContext`  | class | Cross-turn interpretation context — a capped, replayable history plus the subject/definition registries.                               |

## Methods

The public methods of each behavioral interface — one table per type, keyed
by its backticked name, every call-signature member listed (the `readonly`
data members — `emitter` on every stage-adjacent manager and `Interpret`;
`size` on the three managers; `session` / `subjects` / `definitions` on
`InterpretContext` — stay off the method tables). Each implementing class
exposes exactly its interface's methods, so this doubles as the per-instance
method surface (AGENTS §22).

#### `NormalizerInterface`

| Method      | Returns           | Behavior                                                                           |
| ----------- | ----------------- | ---------------------------------------------------------------------------------- |
| `normalize` | `NormalizeResult` | Apply contraction/abbreviation/correction substitutions, then collapse whitespace. |

```ts
import { createNormalizer } from '@orkestrel/interpret'

const normalizer = createNormalizer({ contractions: { "can't": 'cannot' } })
normalizer.normalize("can't   stop") // { text: 'cannot stop', changes: [{ from: "can't", to: 'cannot' }] }
```

#### `ExtractorInterface`

| Method    | Returns         | Behavior                                                      |
| --------- | --------------- | ------------------------------------------------------------- |
| `extract` | `ExtractResult` | Classify the intent and mine every numeric literal from text. |

```ts
import { createExtractor } from '@orkestrel/interpret'

const extractor = createExtractor({
	actions: { calculate: 'compute' },
	domains: { rating: ['rate'] },
})
extractor.extract('calculate my rate at 85')
// { intent: { action: 'compute', domain: 'rating', confidence: 1 }, numbers: [85], complete: true }
```

#### `ClarifierInterface`

| Method    | Returns         | Behavior                                                                                               |
| --------- | --------------- | ------------------------------------------------------------------------------------------------------ |
| `clarify` | `ClarifyResult` | Resolve carry-over, defaults, and computed fields; surface an ambiguity per unresolved required field. |

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
) // { entities: [], ambiguities: [{ field: 'value', ... }], complete: false }
```

#### `FormatterInterface`

| Method   | Returns        | Behavior                                                           |
| -------- | -------------- | ------------------------------------------------------------------ |
| `format` | `FormatResult` | Render the refined natural-language prompt for a matched template. |

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

| Method     | Returns          | Behavior                                                               |
| ---------- | ---------------- | ---------------------------------------------------------------------- |
| `generate` | `GenerateResult` | Build the final subject/definition pair plus its complete field audit. |

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

Every method is TOTAL — never throws; a lookup miss degrades to its
documented fallback (AGENTS §21 mechanism-never-policy).

| Method     | Returns  | Behavior                                                                                                |
| ---------- | -------- | ------------------------------------------------------------------------------------------------------- |
| `phrase`   | `string` | Look up a two-level `table`/`key` pair in the lexicon's `phrases`, falling back to `fallback` or `key`. |
| `label`    | `string` | Render a field's display label from `labels`, falling back to `formatField`.                            |
| `line`     | `string` | Interpolate a named `templates` entry against `values`, falling back to `''` when the id is absent.     |
| `value`    | `string` | Run a named formatter over a raw value, catching a throw and falling back to `String(raw)`.             |
| `describe` | `string` | Render a reasons `Definition` to a one-line, display-neutral description.                               |
| `narrate`  | `string` | Render a reasons `ReasonResult` to a one-line, display-neutral description.                             |

```ts
import { createNarrator } from '@orkestrel/interpret'
import { quantitativeDefinition } from '@orkestrel/reason'

const narrator = createNarrator({
	lexicon: { phrases: { comparison: { equals: 'is' } } },
	formatters: { money: (value) => `$${String(value)}` },
})
narrator.phrase('comparison', 'equals', 'equals') // 'is'
narrator.label('age') // 'age'
narrator.line('subject.empty', {}) // 'with no fields'
narrator.value('money', 5) // '$5'
narrator.describe(quantitativeDefinition('risk', 'Risk', []))
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

#### `TemplateManagerInterface`

The self-owning, ordered registry over templates (AGENTS §9). `add` derives
each record's `hash` from the template's CONTENT and bumps `version` only
when that hash changes. `remove`'s array form is all-or-nothing. A call
after `destroy()` throws `InterpretError('DESTROYED', …)`.

| Method      | Returns                       | Behavior                                                                                                          |
| ----------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `has`       | `boolean`                     | Whether a template with the given id is registered.                                                               |
| `template`  | `TemplateRecord \| undefined` | Look up ONE registered template record by id (AGENTS §9.1 singular accessor).                                     |
| `templates` | `readonly TemplateRecord[]`   | List ALL registered template records (AGENTS §9.1 plural accessor).                                               |
| `add`       | `TemplateRecord`              | Register (or re-register) one template from its data; emits `add`.                                                |
| `remove`    | `boolean` (or `void`)         | Remove LISTED templates by id, ONE template by id, or ALL templates (AGENTS §9.2); emits `remove` per removed id. |
| `destroy`   | `void`                        | Idempotent teardown — clears the collection, emits `destroy`, then destroys the emitter LAST.                     |

```ts
import { createTemplateManager } from '@orkestrel/interpret'
import { factorGroup, fieldFactor, quantitativeDefinition } from '@orkestrel/reason'

const templates = createTemplateManager()
const record = templates.add({
	id: 't1',
	name: 'Arithmetic',
	domain: 'arithmetic',
	intents: ['calculate'],
	mappings: [],
	defaults: [],
	computations: [],
	definition: quantitativeDefinition('t1', 'Arithmetic', [
		factorGroup('total', 'sum', [fieldFactor('value', 'value')]),
	]),
})
record.version // 1
templates.has('t1') // true
templates.template('t1') // the TemplateRecord, or undefined
templates.templates() // every registered record
templates.remove('t1') // true
templates.destroy()
```

#### `SubjectManagerInterface`

Mirrors `TemplateManagerInterface`, minting its own record ids (a `Subject`
carries no `id` field of its own) unless the caller overrides via
`ManagerAddOptions.id`.

| Method     | Returns                      | Behavior                                                                                         |
| ---------- | ---------------------------- | ------------------------------------------------------------------------------------------------ |
| `has`      | `boolean`                    | Whether a subject with the given id is registered.                                               |
| `subject`  | `SubjectRecord \| undefined` | Look up ONE registered subject record by id.                                                     |
| `subjects` | `readonly SubjectRecord[]`   | List ALL registered subject records.                                                             |
| `add`      | `SubjectRecord`              | Register one subject, minting a fresh id when none supplied; emits `add`.                        |
| `remove`   | `boolean` (or `void`)        | Remove LISTED subjects by id, ONE subject by id, or ALL subjects; emits `remove` per removed id. |
| `destroy`  | `void`                       | Idempotent teardown — clears the collection, emits `destroy`, then destroys the emitter LAST.    |

```ts
import { createSubjectManager } from '@orkestrel/interpret'

const subjects = createSubjectManager()
const first = subjects.add({ age: 25 })
subjects.has(first.id) // true
subjects.subject(first.id) // the SubjectRecord
subjects.subjects() // every registered record
subjects.remove(first.id) // true
subjects.destroy()
```

#### `DefinitionManagerInterface`

Mirrors `TemplateManagerInterface`, defaulting each record id to the
definition's own `id`.

| Method        | Returns                         | Behavior                                                                                                  |
| ------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `has`         | `boolean`                       | Whether a definition with the given id is registered.                                                     |
| `definition`  | `DefinitionRecord \| undefined` | Look up ONE registered definition record by id.                                                           |
| `definitions` | `readonly DefinitionRecord[]`   | List ALL registered definition records.                                                                   |
| `add`         | `DefinitionRecord`              | Register (or re-register) one definition; emits `add`.                                                    |
| `remove`      | `boolean` (or `void`)           | Remove LISTED definitions by id, ONE definition by id, or ALL definitions; emits `remove` per removed id. |
| `destroy`     | `void`                          | Idempotent teardown — clears the collection, emits `destroy`, then destroys the emitter LAST.             |

```ts
import { createDefinitionManager } from '@orkestrel/interpret'
import { factorGroup, fieldFactor, quantitativeDefinition } from '@orkestrel/reason'

const definitions = createDefinitionManager()
const record = definitions.add(
	quantitativeDefinition('d1', 'D1', [
		factorGroup('total', 'sum', [fieldFactor('value', 'value')]),
	]),
)
definitions.has(record.id) // true
definitions.definition(record.id) // the DefinitionRecord
definitions.definitions() // every registered record
definitions.remove(record.id) // true
definitions.destroy()
```

#### `InterpretContextInterface`

`previous()` returns the ring buffer newest-last, capped at the configured
`history`. `entities()` flattens every entity across the buffered history,
most recent last. `clear()` resets the history and both registries WITHOUT
tearing the context down.

| Method     | Returns                     | Behavior                                                                                         |
| ---------- | --------------------------- | ------------------------------------------------------------------------------------------------ |
| `previous` | `readonly Interpretation[]` | List the buffered history, newest-last, capped at `history`.                                     |
| `entities` | `readonly Entity[]`         | Flatten every entity recorded across the buffered history, most recent last.                     |
| `add`      | `void`                      | Push one completed `Interpretation`, dropping the oldest entry past the cap.                     |
| `clear`    | `void`                      | Reset the history and both registries without destroying the context.                            |
| `destroy`  | `void`                      | Idempotent teardown — the subject registry, then the definition registry, then the emitter LAST. |

```ts
import { createInterpretContext } from '@orkestrel/interpret'

const context = createInterpretContext({ session: 'turn-1', history: 4 })
context.previous() // []
context.entities() // []
context.add({
	text: '42',
	normalized: '42',
	intent: { action: '', domain: '', confidence: 0 },
	entities: [],
	mappings: [],
	ambiguities: [],
	prompt: '',
	stages: [],
	failures: [],
	complete: false,
	confidence: 0,
	digest: 'abc',
})
context.clear()
context.destroy()
```

#### `InterpretInterface`

`interpret` is genuinely SYNCHRONOUS. `register` / `unregister` / `template`
/ `templates` delegate to an internal `TemplateManagerInterface`. `describe`
/ `narrate` are the reverse direction. After `destroy()` every method except
the `emitter` getter and `destroy` itself throws `InterpretError('DESTROYED', …)`;
`destroy()` is idempotent and tears the emitter down LAST.

| Method       | Returns                 | Behavior                                                                                      |
| ------------ | ----------------------- | --------------------------------------------------------------------------------------------- |
| `interpret`  | `Interpretation`        | Run the five-stage pipeline over raw text, returning a complete or visible-incomplete result. |
| `register`   | `void`                  | Register one template; emits `register`.                                                      |
| `unregister` | `boolean`               | Remove one registered template by id.                                                         |
| `template`   | `Template \| undefined` | Look up ONE registered template's plain data by id.                                           |
| `templates`  | `readonly Template[]`   | List ALL registered templates' plain data.                                                    |
| `describe`   | `string`                | Render a reasons `Definition` to a one-line, display-neutral description.                     |
| `narrate`    | `string`                | Render a reasons `ReasonResult` to a one-line, display-neutral description.                   |
| `destroy`    | `void`                  | Idempotent teardown — the template registry, then the context, then the emitter LAST.         |

```ts
import { createInterpret } from '@orkestrel/interpret'
import { factorGroup, fieldFactor, quantitativeDefinition } from '@orkestrel/reason'

const interpret = createInterpret({
	extractor: {
		extract: () => ({
			intent: { action: 'calculate', domain: 'arithmetic', confidence: 1 },
			numbers: [42],
			complete: true,
		}),
	},
})
interpret.register({
	id: 't1',
	name: 'Arithmetic',
	domain: 'arithmetic',
	intents: ['calculate'],
	mappings: [{ entity: 'value', aliases: [], field: 'value' }],
	defaults: [],
	computations: [],
	definition: quantitativeDefinition('t1', 'Arithmetic', [
		factorGroup('total', 'sum', [fieldFactor('value', 'value')]),
	]),
})
const result = interpret.interpret('calculate arithmetic 42')
result.subject // { value: 42 }
interpret.template('t1') // the plain Template data
interpret.templates() // every registered template
interpret.describe(quantitativeDefinition('t1', 'Arithmetic', []))
interpret.narrate({
	reasoning: 'symbolic',
	solutions: {},
	solved: [],
	trace: [],
	errors: [],
	success: true,
})
interpret.unregister('t1') // true
interpret.destroy()
```
