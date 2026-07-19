# Template

> A named, versionable template layer: `{{name}}` tokens in a `content`
> string, resolved against a values record by a single-pass fill engine, and
> registered/looked-up by id through a self-owning `TemplateManager`
> (AGENTS §9). `validate` predicts `fill`'s `'error'`-policy outcome exactly
> — a token it reports `missing` is precisely a token that would throw. Every
> fill lookup is prototype-pollution-safe: any field-path segment in
> `UNSAFE_FIELD_SEGMENTS` (`__proto__` / `constructor` / `prototype`) is
> refused before `resolveField` is ever called. Source: [`src/core`](../../src/core).
> Surfaced through the `@src/core` barrel.

## Surface

Create a template, fill it against a values record, then register it in a
manager for id-keyed lookup:

```ts
import { createTemplate, createTemplateManager } from '@src/core'

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

| Type                       | Kind      | Shape                                                                                                                                                                      |
| -------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MissingPolicy`            | type      | `'error' \| 'empty' \| 'literal'` — how `fill` handles an unresolved required placeholder.                                                                                 |
| `TemplateFillValues`       | type      | `Readonly<Record<string, unknown>>` — the values `fill` / `validate` resolve against.                                                                                      |
| `TemplateManagerEventMap`  | type      | `TemplateManager`'s push observation surface (AGENTS §13) — `register(template)` · `remove(template)` · `clear()`.                                                         |
| `TemplateErrorCode`        | type      | `'MISSING' \| 'NOTFOUND' \| 'INVALID' \| 'CONFLICT'` — coded `TemplateError` reasons.                                                                                      |
| `TemplatePlaceholder`      | interface | `{ name, path?, required?, fallback?, description? }` — one declared `{{name}}` token's lookup rule.                                                                       |
| `TemplateDefinition`       | interface | `{ id, name, content, placeholders, summary?, description?, category?, tags? }` — a template's plain data.                                                                 |
| `TemplateFillOptions`      | interface | `{ missing?, locale? }` — per-call overrides for `fill` / `validate`.                                                                                                      |
| `TemplateValidationResult` | interface | `{ valid, missing, extra }` — which required placeholders are unresolved, and which supplied values unused.                                                                |
| `TemplateOptions`          | interface | `{ id?, name, content, placeholders?, summary?, description?, category?, tags?, missing?, locale? }` — input to `createTemplate`.                                          |
| `TemplateQuery`            | interface | `{ name?, category?, tag? }` — a `TemplateManagerInterface#find` filter; every supplied field must match.                                                                  |
| `TemplateInterface`        | interface | The template contract — `id` / `name` / `content` / `placeholders` / catalog metadata + `definition` / `fill` / `validate` / `parameters`.                                 |
| `TemplateManagerOptions`   | interface | `{ templates?, missing?, locale?, on?, error? }` — input to `createTemplateManager`.                                                                                       |
| `TemplateManagerInterface` | interface | The registry contract (AGENTS §9) — `emitter` / `size` + `register` / `template` / `templates` / `find` / `has` / `remove` / `clear` / `fill` / `validate` / `parameters`. |

### Constants

| API                      | Kind  | Summary                                                                                       |
| ------------------------ | ----- | --------------------------------------------------------------------------------------------- |
| `FILL_PATTERN`           | const | The shared `{{name}}` / escaped-`\{{` substitution `RegExp` behind `fill` and `validate`.     |
| `DEFAULT_MISSING_POLICY` | const | `'error'` — default `missing` policy when unspecified.                                        |
| `DEFAULT_LOCALE`         | const | `'en-US'` — default `locale` for finite-number formatting when unspecified.                   |
| `UNSAFE_FIELD_SEGMENTS`  | const | `['__proto__', 'constructor', 'prototype']` — prototype-pollution-unsafe field-path segments. |

```ts
import {
	DEFAULT_LOCALE,
	DEFAULT_MISSING_POLICY,
	FILL_PATTERN,
	UNSAFE_FIELD_SEGMENTS,
} from '@src/core'

DEFAULT_MISSING_POLICY // 'error'
DEFAULT_LOCALE // 'en-US'
UNSAFE_FIELD_SEGMENTS // ['__proto__', 'constructor', 'prototype']
FILL_PATTERN.source // the `{{name}}` / `\{{` substitution pattern
```

### Errors

| API               | Kind     | Summary                                             |
| ----------------- | -------- | --------------------------------------------------- |
| `TemplateError`   | class    | Carries a `TemplateErrorCode` + optional `context`. |
| `isTemplateError` | function | Narrow a caught value to a `TemplateError`.         |

```ts
import { isTemplateError, TemplateError } from '@src/core'

try {
	throw new TemplateError('NOTFOUND', 'Unknown template id: missing', { id: 'missing' })
} catch (error) {
	if (isTemplateError(error)) error.code // 'NOTFOUND'
}
```

### Helpers

Pure, exported utility functions (AGENTS §4.3) — the referentially-
transparent leaves behind `Template#fill` / `#validate`.

| API                | Kind     | Summary                                                                                                      |
| ------------------ | -------- | ------------------------------------------------------------------------------------------------------------ |
| `formatValue`      | function | Format a resolved fill value — finite numbers get locale thousands grouping, everything else String-coerces. |
| `resolveSafeField` | function | Resolve a field path against a values record, refusing any path touching an unsafe segment.                  |
| `fillTemplate`     | function | Substitute every `{{name}}` token in `content` against `values`, in a single pass.                           |
| `placeholderShape` | function | Build the `@orkestrel/contract` object shape describing a template's declared placeholders.                  |

```ts
import { fillTemplate, formatValue, placeholderShape, resolveSafeField } from '@src/core'

formatValue(5010, 'en-US') // '5,010'
formatValue(null, 'en-US') // 'null'
resolveSafeField({ a: { b: 1 } }, ['a', 'b']) // 1
resolveSafeField({}, ['__proto__', 'polluted']) // undefined
fillTemplate('Hi {{name}}', { name: 'Ada' }) // 'Hi Ada'
fillTemplate('Limit {{limit}}', { limit: 5010 }, { missing: 'empty' }) // 'Limit 5,010'
placeholderShape([{ name: 'city' }]) // an object ContractShape with a `city` string field
```

### Factories

| API                     | Kind     | Builds…                                                                 |
| ----------------------- | -------- | ----------------------------------------------------------------------- |
| `createTemplate`        | function | A working `TemplateInterface` from `TemplateOptions`.                   |
| `createTemplateManager` | function | A working `TemplateManagerInterface`, optionally seeded with templates. |

```ts
import { createTemplate, createTemplateManager } from '@src/core'

const greeting = createTemplate({ name: 'greeting', content: 'Hi {{name}}' })
greeting.fill({ name: 'Ada' }) // 'Hi Ada'

const templates = createTemplateManager({
	templates: [{ id: 'greeting', name: 'greeting', content: 'Hi {{name}}' }],
})
templates.fill('greeting', { name: 'Ada' }) // 'Hi Ada'
```

### Entities

| API               | Kind  | Summary                                                                                         |
| ----------------- | ----- | ----------------------------------------------------------------------------------------------- |
| `Template`        | class | Implements `TemplateInterface` exactly — a named, versionable `{{name}}` template.              |
| `TemplateManager` | class | Implements `TemplateManagerInterface` exactly — the self-owning, id-keyed registry (AGENTS §9). |

## Methods

The public methods of each behavioral interface — one table per type, keyed
by its backticked name, every call-signature member listed (the `readonly`
data members — `id` / `name` / `content` / `placeholders` / catalog metadata
on `Template`; `emitter` / `size` on `TemplateManager` — stay off the method
tables). Each implementing class exposes exactly its interface's methods, so
this doubles as the per-instance method surface (AGENTS §22).

#### `TemplateInterface`

| Method       | Returns                                | Behavior                                                                                     |
| ------------ | -------------------------------------- | -------------------------------------------------------------------------------------------- |
| `definition` | `TemplateDefinition`                   | Return the plain, JSON-serializable template data.                                           |
| `fill`       | `string`                               | Substitute every `{{name}}` token in `content` against `values`.                             |
| `validate`   | `TemplateValidationResult`             | Report which required placeholders would stay unresolved, and which `values` keys go unused. |
| `parameters` | `Record<string, unknown> \| undefined` | Project the declared placeholders to the open tool-parameters record shape.                  |

```ts
import { createTemplate } from '@src/core'

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

The self-owning, id-keyed registry over templates (AGENTS §9). `register`
accepts a constructed `TemplateInterface` or a plain `TemplateOptions` bag,
throwing a `TemplateError` coded `CONFLICT` on a duplicate id unless
`options.replace` is `true`. `remove`'s array form is all-or-nothing. A
lookup by unknown id (`template` / `fill` / `validate` / `parameters`)
throws `TemplateError` coded `NOTFOUND`.

| Method       | Returns                                | Behavior                                                                                                          |
| ------------ | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `register`   | `TemplateInterface`                    | Register (or, with `options.replace`, overwrite) one template; emits `register`.                                  |
| `template`   | `TemplateInterface`                    | Look up ONE registered template by id (AGENTS §9.1 singular accessor).                                            |
| `templates`  | `readonly TemplateInterface[]`         | List ALL registered templates (AGENTS §9.1 plural accessor).                                                      |
| `find`       | `readonly TemplateInterface[]`         | Filter registered templates by `name` / `category` / `tag` — every supplied field must match.                     |
| `has`        | `boolean`                              | Whether a template with the given id is registered.                                                               |
| `remove`     | `boolean` (or `void`)                  | Remove LISTED templates by id, ONE template by id, or ALL templates (AGENTS §9.2); emits `remove` per removed id. |
| `clear`      | `void`                                 | Remove every registered template, emitting `clear`.                                                               |
| `fill`       | `string`                               | Fill a registered template by id.                                                                                 |
| `validate`   | `TemplateValidationResult`             | Validate values against a registered template by id.                                                              |
| `parameters` | `Record<string, unknown> \| undefined` | Project a registered template's parameters by id.                                                                 |

```ts
import { createTemplateManager } from '@src/core'

const templates = createTemplateManager()
const greeting = templates.register({ id: 'greeting', name: 'greeting', content: 'Hi {{name}}' })
templates.has('greeting') // true
templates.template('greeting') // the registered TemplateInterface
templates.templates() // every registered template
templates.find({ name: 'greeting' }) // [greeting]
templates.fill('greeting', { name: 'Ada' }) // 'Hi Ada'
templates.validate('greeting', {}).missing // []
templates.parameters('greeting') // the compiled parameters record, or undefined
templates.remove('greeting') // true
templates.clear()
```

## Tests

- [`tests/src/core/Template.test.ts`](../../tests/src/core/Template.test.ts) —
  construction validation, `definition` / `fill` / `validate` / `parameters`.
- [`tests/src/core/TemplateManager.test.ts`](../../tests/src/core/TemplateManager.test.ts) —
  `register` / `template` / `templates` / `find` / `has` / `remove` / `clear` /
  `fill` / `validate` / `parameters`, including the `CONFLICT` / `NOTFOUND`
  error paths and the all-or-nothing batch `remove`.
- [`tests/src/core/factories.test.ts`](../../tests/src/core/factories.test.ts) —
  `createTemplate` / `createTemplateManager` return working instances backed
  by real `Template` / `TemplateManager`.
- [`tests/src/core/helpers.test.ts`](../../tests/src/core/helpers.test.ts) —
  `formatValue` / `resolveSafeField` / `fillTemplate` / `placeholderShape`,
  including the `interpolateMessage` parity and known divergence, missing
  policies, fallback precedence, and prototype-pollution-unsafe paths.

## See also

- [`AGENTS.md`](../../AGENTS.md) — the rules.
- [`guide.md`](guide.md) — the mirrored guide for `@orkestrel/guide`, the
  devDependency powering this repo's guides-parity test suite.
- [`README.md`](../README.md) — the guides index.
