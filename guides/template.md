# Template

> A named, versionable template layer: `{{name}}` tokens in a `content`
> string, resolved against a values record by a single-pass fill engine, and
> registered/looked-up by id through a self-owning `TemplateManager`.
> `validate` predicts `fill`'s `'error'`-policy outcome exactly
> — a token it reports `missing` is precisely a token that would throw. Every
> fill lookup is prototype-pollution-safe: any field-path segment in
> `UNSAFE_FIELD_SEGMENTS` (`__proto__` / `constructor` / `prototype`) is
> refused before `resolveField` is ever called. Source: [`src/core`](../src/core).
> Surfaced through the `@src/core` barrel.

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

| Type                       | Kind      | Shape                                                                                                                                                                       |
| -------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MissingPolicy`            | type      | `'error' \| 'empty' \| 'literal'` — how `fill` handles an unresolved required placeholder.                                                                                  |
| `TemplateFillValues`       | type      | `Readonly<Record<string, unknown>>` — the values `fill` / `validate` resolve against.                                                                                       |
| `TemplateManagerEventMap`  | type      | `TemplateManager`'s push observation surface — `register(template)` · `remove(template)` · `clear()`.                                                                       |
| `TemplateErrorCode`        | type      | `'MISSING' \| 'NOTFOUND' \| 'INVALID' \| 'CONFLICT'` — coded `TemplateError` reasons.                                                                                       |
| `TemplatePlaceholder`      | interface | `{ name, path?, required?, fallback?, description? }` — one declared `{{name}}` token's lookup rule.                                                                        |
| `TemplateDefinition`       | interface | `{ id, name, content, placeholders, summary?, description?, category?, tags? }` — a template's plain data.                                                                  |
| `TemplateFillOptions`      | interface | `{ missing?, locale? }` — per-call overrides for `fill`.                                                                                                                    |
| `TemplateFillContext`      | interface | `{ missing?, locale?, placeholders? }` — `fillTemplate`'s full option bag: `TemplateFillOptions` plus the declared placeholders.                                            |
| `TemplateTokenResolution`  | interface | `{ value, declared, required }` — one `{{name}}` token's resolution, the rule `fillTemplate` and `validate` share.                                                          |
| `TemplateRegisterOptions`  | interface | `{ replace? }` — `TemplateManagerInterface#register` options; `replace` overwrites instead of throwing `CONFLICT`.                                                          |
| `TemplateValidationResult` | interface | `{ valid, missing, extra }` — which required placeholders are unresolved, and which supplied values unused.                                                                 |
| `TemplateOptions`          | interface | `{ id?, name, content, placeholders?, summary?, description?, category?, tags?, missing?, locale? }` — input to `createTemplate`.                                           |
| `TemplateQuery`            | interface | `{ name?, category?, tag? }` — a `TemplateManagerInterface#find` filter; every supplied field must match.                                                                   |
| `TemplateInterface`        | interface | The template contract — `id` / `name` / `content` / `placeholders` / catalog metadata + `definition` / `fill` / `validate` / `parameters`.                                  |
| `TemplateManagerOptions`   | interface | `{ templates?, missing?, locale?, on?, error? }` — input to `createTemplateManager`.                                                                                        |
| `TemplateManagerInterface` | interface | The registry contract — `emitter` / `count` + `register` / `template` / `templates` / `find` / `has` / `remove` / `clear` / `destroy` / `fill` / `validate` / `parameters`. |

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
} from '@orkestrel/template'

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

| API                | Kind     | Summary                                                                                                      |
| ------------------ | -------- | ------------------------------------------------------------------------------------------------------------ |
| `formatValue`      | function | Format a resolved fill value — finite numbers get locale thousands grouping, everything else String-coerces. |
| `resolveSafeField` | function | Resolve a field path against a values record, refusing any path touching an unsafe segment.                  |
| `resolveToken`     | function | Resolve one `{{name}}` token — the single rule `fillTemplate` and `validate` both apply.                     |
| `fillTemplate`     | function | Substitute every `{{name}}` token in `content` against `values`, in a single pass.                           |

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

| API                | Kind     | Summary                                                                                     |
| ------------------ | -------- | ------------------------------------------------------------------------------------------- |
| `placeholderShape` | function | Build the `@orkestrel/contract` object shape describing a template's declared placeholders. |

```ts
import { placeholderShape } from '@orkestrel/template'

placeholderShape([{ name: 'city' }]) // an object ContractShape with a `city` string field
```

### Factories

| API                     | Kind     | Builds…                                                                 |
| ----------------------- | -------- | ----------------------------------------------------------------------- |
| `createTemplate`        | function | A working `TemplateInterface` from `TemplateOptions`.                   |
| `createTemplateManager` | function | A working `TemplateManagerInterface`, optionally seeded with templates. |

```ts
import { createTemplate, createTemplateManager } from '@orkestrel/template'

const greeting = createTemplate({ name: 'greeting', content: 'Hi {{name}}' })
greeting.fill({ name: 'Ada' }) // 'Hi Ada'

const templates = createTemplateManager({
	templates: [{ id: 'greeting', name: 'greeting', content: 'Hi {{name}}' }],
})
templates.fill('greeting', { name: 'Ada' }) // 'Hi Ada'
```

### Entities

| API               | Kind  | Summary                                                                             |
| ----------------- | ----- | ----------------------------------------------------------------------------------- |
| `Template`        | class | Implements `TemplateInterface` exactly — a named, versionable `{{name}}` template.  |
| `TemplateManager` | class | Implements `TemplateManagerInterface` exactly — the self-owning, id-keyed registry. |

## Methods

The public methods of each behavioral interface — one table per type, keyed
by its backticked name, every call-signature member listed (the `readonly`
data members — `id` / `name` / `content` / `placeholders` / catalog metadata
on `Template`; `emitter` / `count` on `TemplateManager` — stay off the method
tables). Each implementing class exposes exactly its interface's methods, so
this doubles as the per-instance method surface.

#### `TemplateInterface`

| Method       | Returns                                | Behavior                                                                                     |
| ------------ | -------------------------------------- | -------------------------------------------------------------------------------------------- |
| `definition` | `TemplateDefinition`                   | Return the plain, JSON-serializable template data.                                           |
| `fill`       | `string`                               | Substitute every `{{name}}` token in `content` against `values`.                             |
| `validate`   | `TemplateValidationResult`             | Report which required placeholders would stay unresolved, and which `values` keys go unused. |
| `parameters` | `Record<string, unknown> \| undefined` | Project the declared placeholders to the open tool-parameters record shape.                  |

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

The self-owning, id-keyed registry over templates. `register`
accepts a constructed `TemplateInterface` or a plain `TemplateOptions` bag,
throwing a `TemplateError` coded `CONFLICT` on a duplicate id unless
`options.replace` is `true`. `remove`'s array form applies to every entry it
can and reports `true` only when all of them succeeded, so one absent id
turns the batch's answer `false` while the present ids still remove. The
`template` accessor returns `undefined` for an unknown id; `fill` /
`validate` / `parameters` throw `TemplateError` coded `NOTFOUND` for one,
because each needs a template to proceed.

| Method       | Returns                                | Behavior                                                                                            |
| ------------ | -------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `register`   | `TemplateInterface`                    | Register (or, with `options.replace`, overwrite) one template; emits `register`.                    |
| `template`   | `TemplateInterface \| undefined`       | Look up ONE registered template by id, or `undefined` when it is unregistered.                      |
| `templates`  | `readonly TemplateInterface[]`         | List ALL registered templates.                                                                      |
| `find`       | `readonly TemplateInterface[]`         | Filter registered templates by `name` / `category` / `tag` — every supplied field must match.       |
| `has`        | `boolean`                              | Whether a template with the given id is registered.                                                 |
| `remove`     | `boolean` (or `void`)                  | Remove LISTED templates by id, ONE template by id, or ALL templates; emits `remove` per removed id. |
| `clear`      | `void`                                 | Remove every registered template, emitting `clear`.                                                 |
| `destroy`    | `void`                                 | Tear the registry down: drop every registered template and destroy the owned emitter. Idempotent.   |
| `fill`       | `string`                               | Fill a registered template by id.                                                                   |
| `validate`   | `TemplateValidationResult`             | Validate values against a registered template by id.                                                |
| `parameters` | `Record<string, unknown> \| undefined` | Project a registered template's parameters by id.                                                   |

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
