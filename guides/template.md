# Template

> A named, versionable template layer: `{{name}}` tokens in a `content`
> string, resolved against a values record by a single-pass fill engine, and
> registered and looked up by id through a self-owning `TemplateManager`.

`validate` predicts `fill`'s `'error'`-policy outcome exactly — a token it
reports `missing` is precisely a token that would throw. Every fill lookup is
prototype-pollution-safe: any field-path segment in `UNSAFE_FIELD_SEGMENTS`
(`__proto__`, `constructor`, `prototype`) is refused before `resolveField` is
ever called. Source: [`src/core`](../src/core). Surfaced through the
`@src/core` barrel.

## Surface

Create a template, fill it against a values record, then register it in a
manager for id-keyed lookup:

```ts
import { createTemplate, createTemplateManager } from '@orkestrel/template'

const greeting = createTemplate({ name: 'greeting', content: 'Hi {{name}}' })
greeting.fill({ name: 'Ada' }) // 'Hi Ada'

const templates = createTemplateManager({ templates: [greeting] })
templates.fill(greeting.id, { name: 'Grace' }) // 'Hi Grace'
```

An unresolved required placeholder is governed by `TemplateFillOptions.missing`
(default `'error'`, throwing a `TemplateError` coded `MISSING`); `'empty'`
substitutes `''`, `'literal'` re-emits the original `{{name}}` token. An
escaped `\{{` always emits a literal `{{`, regardless of policy.

### Types

A `Shape` cell holds an interface's data members as bare names in braces, `?` marking an optional member and `plus` introducing its call-signature members, and a type alias's own type literal with a union's arms escaped as `\|`. An extended interface's name comes before `plus`, with the members it adds after.

| Type                       | Kind      | Shape                                                                                                                       | Summary                                                                                                                                                                                  |
| -------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MissingPolicy`            | type      | `'error' \| 'empty' \| 'literal'`                                                                                           | Names how `TemplateInterface#fill` handles an unresolved required placeholder.                                                                                                           |
| `TemplateFillValues`       | type      | `Readonly<Record<string, unknown>>`                                                                                         | Represents the values a `TemplateInterface#fill` / `#validate` call resolves placeholders against.                                                                                       |
| `TemplateManagerEventMap`  | type      | `{ register, remove, clear }`                                                                                               | Declares the push observation surface of a `TemplateManagerInterface` — an id-keyed registry, so `register` / `remove` are the events (never ordered-list `append`/`prepend`).           |
| `TemplateErrorCode`        | type      | `'MISSING' \| 'NOTFOUND' \| 'INVALID' \| 'CONFLICT'`                                                                        | Names the coded misuse / failure conditions thrown as a `TemplateError`.                                                                                                                 |
| `TemplatePlaceholder`      | interface | `{ name, path?, required?, fallback?, description? }`                                                                       | Represents one placeholder a `TemplateDefinition`'s `content` declares — its lookup name, an optional field path into the values record, whether it is required, and a literal fallback. |
| `TemplateDefinition`       | interface | `{ id, name, content, placeholders, summary?, description?, category?, tags? }`                                             | Represents a named, versionable template record — pure data, no behavior.                                                                                                                |
| `TemplateFillOptions`      | interface | `{ missing?, locale? }`                                                                                                     | Carries the per-call options for `TemplateInterface#fill` / `TemplateManagerInterface#fill`.                                                                                             |
| `TemplateFillContext`      | interface | `TemplateFillOptions plus { placeholders? }`                                                                                | Carries the full option bag `fillTemplate` takes — the per-call `TemplateFillOptions` plus the declared placeholders tokens resolve against.                                             |
| `TemplateTokenResolution`  | interface | `{ value, declared, required }`                                                                                             | Represents one `{{name}}` token's resolution — the single token rule `fillTemplate` and `TemplateInterface#validate` share.                                                              |
| `TemplateRegisterOptions`  | interface | `{ replace? }`                                                                                                              | Carries the options for `TemplateManagerInterface#register`.                                                                                                                             |
| `TemplateValidationResult` | interface | `{ valid, missing, extra }`                                                                                                 | Reports the outcome of `TemplateInterface#validate` — which required placeholders are unresolved, and which supplied values are unused.                                                  |
| `TemplateOptions`          | interface | `{ id?, name, content, placeholders?, summary?, description?, category?, tags?, missing?, locale? }`                        | Carries the options for `createTemplate` / the `Template` constructor.                                                                                                                   |
| `TemplateQuery`            | interface | `{ name?, category?, tag? }`                                                                                                | Represents a query for `TemplateManagerInterface#find` — every supplied field must match.                                                                                                |
| `TemplateInterface`        | interface | `{ id, name, content, placeholders, summary?, description?, category?, tags? } plus definition, fill, validate, parameters` | Declares the template contract a consumer holds — the readonly template record and the `definition`, `fill`, `validate`, and `parameters` calls over it.                                 |
| `TemplateManagerOptions`   | interface | `{ templates?, missing?, locale?, on?, error? }`                                                                            | Carries the options for `createTemplateManager` / the `TemplateManager` constructor.                                                                                                     |
| `TemplateManagerInterface` | interface | `{ emitter, count } plus register, template, templates, find, has, remove, clear, destroy, fill, validate, parameters`      | Declares the registry contract a consumer holds — a self-owning, id-keyed record-holder with singular and plural accessors over the templates it registers.                              |

### Constants

A `Shape` cell holds the constant's declared type.

| API                      | Kind  | Shape               | Summary                                                                                                                                                                                                              |
| ------------------------ | ----- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FILL_PATTERN`           | const | `RegExp`            | Holds the single-pass `{{name}}` substitution pattern shared by `Template#fill` and `Template#validate`.                                                                                                             |
| `DEFAULT_MISSING_POLICY` | const | `MissingPolicy`     | Holds `'error'`, the default `missing` policy for `Template#fill` / `TemplateManager#fill` when unspecified.                                                                                                         |
| `DEFAULT_LOCALE`         | const | `'en-US'`           | Holds `'en-US'`, the default `locale` for `Template#fill` / `TemplateManager#fill` when unspecified.                                                                                                                 |
| `UNSAFE_FIELD_SEGMENTS`  | const | `readonly string[]` | Lists the prototype-pollution-unsafe field-path segments `'__proto__'`, `'constructor'`, and `'prototype'` — a fill lookup refuses to resolve a path containing one of them, treating the placeholder as unresolved. |

```ts
import {
	DEFAULT_LOCALE,
	DEFAULT_MISSING_POLICY,
	FILL_PATTERN,
	UNSAFE_FIELD_SEGMENTS,
} from '@orkestrel/template'

DEFAULT_MISSING_POLICY // 'error'
DEFAULT_LOCALE // 'en-US'
UNSAFE_FIELD_SEGMENTS // ['__proto__', 'constructor', 'prototype']
FILL_PATTERN.source // the `{{name}}` / `\{{` substitution pattern
```

### Errors

| API               | Kind     | Summary                                                                                                                                                                 |
| ----------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TemplateError`   | class    | Represents an error thrown by the template layer — a machine-readable `TemplateErrorCode` and an optional `context` record naming the offending id or placeholder name. |
| `isTemplateError` | function | Narrows an unknown caught value to a `TemplateError`.                                                                                                                   |

```ts
import { isTemplateError, TemplateError } from '@orkestrel/template'

try {
	throw new TemplateError('NOTFOUND', 'Unknown template id: missing', { id: 'missing' })
} catch (error) {
	if (isTemplateError(error)) error.code // 'NOTFOUND'
}
```

### Helpers

Pure, exported utility functions — the referentially-transparent leaves behind
`Template#fill` / `#validate`.

| API                | Kind     | Summary                                                                                                                  |
| ------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------ |
| `formatValue`      | function | Formats a resolved fill value for substitution into a template's `content`.                                              |
| `resolveSafeField` | function | Resolves a field path against a fill-values record, refusing any path that touches a prototype-pollution-unsafe segment. |
| `resolveToken`     | function | Resolves one `{{name}}` token against the declared placeholders and the fill-values record.                              |
| `fillTemplate`     | function | Substitutes every `{{name}}` token in `content` in a single pass.                                                        |

```ts
import { fillTemplate, formatValue, resolveSafeField, resolveToken } from '@orkestrel/template'

formatValue(5010, 'en-US') // '5,010'
formatValue(null, 'en-US') // 'null'
resolveSafeField({ a: { b: 1 } }, ['a', 'b']) // 1
resolveSafeField({}, ['__proto__', 'polluted']) // undefined
resolveToken({ name: 'Ada' }, [], 'name').value // 'Ada'
resolveToken({}, [{ name: 'nickname', required: false }], 'nickname').required // false
fillTemplate('Hi {{name}}', { name: 'Ada' }) // 'Hi Ada'
fillTemplate('Limit {{limit}}', { limit: 5010 }, { missing: 'empty' }) // 'Limit 5,010'
```

### Shapers

The `@orkestrel/contract` shape values built from declared template data —
above the helper leaves, consuming them and never consumed by them.

| API                | Kind     | Summary                                                                                      |
| ------------------ | -------- | -------------------------------------------------------------------------------------------- |
| `placeholderShape` | function | Builds the `@orkestrel/contract` object shape describing a template's declared placeholders. |

```ts
import { placeholderShape } from '@orkestrel/template'

placeholderShape([{ name: 'city' }]) // an object ContractShape with a `city` string field
```

### Factories

| API                     | Kind     | Summary                                                                                                                                      |
| ----------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `createTemplate`        | function | Creates a working `TemplateInterface` from a `TemplateOptions` bag, backed by the `Template` class.                                          |
| `createTemplateManager` | function | Creates a working `TemplateManagerInterface`, optionally seeded with the templates the options carry, backed by the `TemplateManager` class. |

#### Create a template and a registry

Builds a template and fills it directly, then seeds a registry with several templates and queries them by category and id.

```ts
import { createTemplate, createTemplateManager } from '@orkestrel/template'

const greeting = createTemplate({ name: 'greeting', content: 'Hi {{name}}' })
greeting.fill({ name: 'Ada' }) // 'Hi Ada'

const templates = createTemplateManager({
	templates: [
		{ id: 'greeting', name: 'greeting', content: 'Hi {{name}}', category: 'mail' },
		{ id: 'farewell', name: 'farewell', content: 'Bye {{name}}', category: 'mail' },
		{ id: 'alert', name: 'alert', content: 'Alert: {{reason}}', category: 'ops' },
	],
})
templates.fill('greeting', { name: 'Ada' }) // 'Hi Ada'
templates.find({ category: 'mail' }).map((one) => one.id) // ['greeting', 'farewell']
templates.has('alert') // true
templates.has('missing') // false
```

### Classes

| API               | Kind  | Summary                                                                                                                                                                                                                      |
| ----------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Template`        | class | Represents a named, versionable template — `{{name}}` tokens in `content`, filled against a values record — implementing `TemplateInterface` exactly.                                                                        |
| `TemplateManager` | class | Represents the template registry — a self-owning, id-keyed record-holder for the `TemplateInterface` instances a consumer registers, looks up, fills, and validates by id — implementing `TemplateManagerInterface` exactly. |

## Methods

The public methods of each behavioral interface — one table per type, keyed
by its backticked name, every call-signature member listed (the `readonly`
data members — `id` / `name` / `content` / `placeholders` / catalog metadata
on `Template`; `emitter` / `count` on `TemplateManager` — stay off the method
tables). Each implementing class exposes exactly its interface's methods, so
this doubles as the per-instance method surface.

#### `TemplateInterface`

| Method       | Returns                                | Summary                                                                                       |
| ------------ | -------------------------------------- | --------------------------------------------------------------------------------------------- |
| `definition` | `TemplateDefinition`                   | Returns the plain, JSON-serializable template data.                                           |
| `fill`       | `string`                               | Substitutes every `{{name}}` token in `content` against `values`.                             |
| `validate`   | `TemplateValidationResult`             | Reports which required placeholders would stay unresolved, and which `values` keys go unused. |
| `parameters` | `Record<string, unknown> \| undefined` | Projects the declared placeholders to the open tool-parameters record shape.                  |

```ts
import { createTemplate } from '@orkestrel/template'

const greeting = createTemplate({
	name: 'greeting',
	content: 'Hi {{name}}',
	placeholders: [{ name: 'name' }],
})
greeting.definition().name // 'greeting'
greeting.fill({ name: 'Ada' }) // 'Hi Ada'
greeting.validate({}).missing // ['name']
greeting.parameters() // the compiled parameters record, or undefined
```

#### `TemplateManagerInterface`

The by-id calls split on what an unknown id means to each: the `template`
accessor returns `undefined`, while `fill`, `validate`, and `parameters` throw
a `TemplateError` coded `NOTFOUND`, because each needs a template to proceed.
A duplicate id throws a `TemplateError` coded `CONFLICT` unless
`options.replace` is `true`, and one absent id turns a batch `remove`'s answer
`false` while the present ids still remove.

| Method       | Returns                                | Summary                                                                                                                            |
| ------------ | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `register`   | `TemplateInterface`                    | Registers one template, or overwrites the entry sharing its id when `options.replace` is `true`, and emits `register`.             |
| `template`   | `TemplateInterface \| undefined`       | Returns one registered template by id, or `undefined` when the id is unregistered.                                                 |
| `templates`  | `readonly TemplateInterface[]`         | Lists every registered template.                                                                                                   |
| `find`       | `readonly TemplateInterface[]`         | Filters registered templates by `name`, `category`, and `tag` — every supplied field must match.                                   |
| `has`        | `boolean`                              | Reports whether a template with the given id is registered.                                                                        |
| `remove`     | `boolean` (or `void`)                  | Removes the listed templates by id, one template by id, or every registered template, emitting `remove` once per removed template. |
| `clear`      | `void`                                 | Removes every registered template, emitting `clear`.                                                                               |
| `destroy`    | `void`                                 | Tears the registry down: drops every registered template and destroys the owned emitter. Idempotent.                               |
| `fill`       | `string`                               | Fills a registered template by id.                                                                                                 |
| `validate`   | `TemplateValidationResult`             | Validates values against a registered template by id.                                                                              |
| `parameters` | `Record<string, unknown> \| undefined` | Projects a registered template's parameters by id.                                                                                 |

```ts
import { createTemplateManager } from '@orkestrel/template'

const templates = createTemplateManager()
const greeting = templates.register({ id: 'greeting', name: 'greeting', content: 'Hi {{name}}' })
templates.has('greeting') // true
templates.template('greeting') // the registered TemplateInterface, or undefined
templates.templates() // every registered template
templates.find({ name: 'greeting' }) // [greeting]
templates.fill('greeting', { name: 'Ada' }) // 'Hi Ada'
templates.validate('greeting', {}).missing // ['name']
templates.parameters('greeting') // the compiled parameters record, or undefined
templates.remove('greeting') // true
templates.clear()
templates.destroy()
```

## Tests

- [`tests/guides.test.ts`](../tests/guides.test.ts) — the `## Surface` ↔ `src/core`
  bijection (value and type exports), the `TemplateInterface` ↔ `Template` and
  `TemplateManagerInterface` ↔ `TemplateManager` method bijections, and the equality
  gate: every `Summary` cell against its declaration's description paragraph, the titled
  `Create a template and a registry` fence against the `@example` block of that title
  (pinned so the titled pair cannot be retired silently), and the README pitch against
  this guide's tagline. It also runs the flagship fences and asserts the values their
  comments claim.
- [`tests/src/core/templates/Template.test.ts`](../tests/src/core/templates/Template.test.ts) —
  construction validation, `definition` / `fill` / `validate` / `parameters`.
- [`tests/src/core/templates/TemplateManager.test.ts`](../tests/src/core/templates/TemplateManager.test.ts) —
  `register` / `template` / `templates` / `find` / `has` / `remove` / `clear` /
  `destroy` / `fill` / `validate` / `parameters`, including the `CONFLICT` / `NOTFOUND`
  error paths and the apply-each-and-report batch `remove`.
- [`tests/src/core/factories.test.ts`](../tests/src/core/factories.test.ts) —
  `createTemplate` / `createTemplateManager` return working instances backed
  by real `Template` / `TemplateManager`.
- [`tests/src/core/helpers.test.ts`](../tests/src/core/helpers.test.ts) —
  `formatValue` / `resolveSafeField` / `resolveToken` / `fillTemplate`,
  including bare interpolation with no declared placeholders, the `{`-in-token
  pattern limit, missing policies, fallback precedence, and
  prototype-pollution-unsafe paths.
- [`tests/src/core/shapers.test.ts`](../tests/src/core/shapers.test.ts) —
  `placeholderShape` over required, optional, and described placeholders.

## See also

- [`AGENTS.md`](../AGENTS.md) — the rules.
- [`guide.md`](guide.md) — the mirrored guide for `@orkestrel/guide`, the
  devDependency powering this repo's guides-parity test suite.
- [`README.md`](README.md) — the guides index.
