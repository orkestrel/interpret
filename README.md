# @orkestrel/interpret

A synchronous, deterministic bidirectional bridge between
natural language and the [`@orkestrel/reason`](https://github.com/orkestrel/reason)
engine. FORWARD: raw text is normalized, classified into an intent, matched
against an added `Template`, mined for numeric entities, clarified
(carry-over / defaults / computed fields), formatted into a refined prompt,
then generated into a `Subject` + `Definition` pair ready for
`Reason.reason`. REVERSE: a `Definition` / `Subject` / `ReasonResult`
renders to display-neutral prose through a lexicon-driven `Narrator`.
Nothing here is an LLM, provider, or agent. Environment-agnostic — no I/O,
no browser or server assumptions. Part of the `@orkestrel` line.

## Install

```sh
npm install @orkestrel/interpret
```

## Requirements

- Node.js >= 22.12.0
- ESM and CommonJS builds, published through the `exports` map
- Runtime dependencies: [`@orkestrel/reason`](https://github.com/orkestrel/reason),
  [`@orkestrel/contract`](https://github.com/orkestrel/contract),
  [`@orkestrel/emitter`](https://github.com/orkestrel/emitter),
  [`@orkestrel/template`](https://github.com/orkestrel/template)

## Usage

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

interpret.destroy()
```

`interpret()` is genuinely synchronous and runs the fixed five-stage
pipeline `[normalize, extract, clarify, format, generate]`. A `NO_TEMPLATE`
/ `LOW_CONFIDENCE` non-match, or a thrown stage, both yield a visible
INCOMPLETE result rather than an arbitrary fallback.

## Guide

For the full surface — the `Interpret` orchestrator, the five pipeline
stages, the template/subject/definition managers, the cross-turn context,
the lexicon-driven `Narrator`, helpers, validators, factories, errors, and
the observation surface — see
[`guides/interpret.md`](guides/interpret.md).

## Package

Published as a single typed entry point per the `exports` field in
`package.json`.

## License

MIT © [Orkestrel](https://github.com/orkestrel) — see [LICENSE](./LICENSE).
