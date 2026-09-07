# @orkestrel/interpret

> A synchronous, deterministic bidirectional bridge between natural language and the
> `@orkestrel/reason` engine: a forward pipeline that normalizes raw text, classifies its
> intent, matches an added `Template`, clarifies the fields extraction left open, and
> generates a `Subject` and `Definition` pair ready for `Reason.reason`, plus a reverse
> direction that renders a `Definition`, a `Subject`, or a `ReasonResult` to
> display-neutral prose through a lexicon-driven `Narrator`.

Install the package, wire an orchestrator with the action and domain vocabularies your
domain speaks, add the templates it answers, and call `interpret()` on each turn of raw
text. Environment-agnostic — no I/O, and no browser or server assumptions. Part of the
`@orkestrel` line.

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

`interpret()` is genuinely synchronous and runs the fixed pipeline
`[normalize, extract, clarify, format, generate]`. A `NO_TEMPLATE` or `LOW_CONFIDENCE`
non-match, and a thrown stage, each yield a visible incomplete result rather than an arbitrary
fallback.

## Guide

For the full surface — the `Interpret` orchestrator, the pipeline
stages, the template/subject/definition managers, the cross-turn context,
the lexicon-driven `Narrator`, helpers, validators, factories, errors, and
the observation surface — see
[`guides/interpret.md`](guides/interpret.md).

## Package

Published as a single typed entry point per the `exports` field in
`package.json`.

## License

MIT © [Orkestrel](https://github.com/orkestrel) — see [LICENSE](./LICENSE).
