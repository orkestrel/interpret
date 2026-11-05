# @orkestrel/interpret

> A synchronous, deterministic bidirectional bridge between natural language and the
> `@orkestrel/reason` engine: a forward pipeline that normalizes raw text, classifies its
> intent, matches an added `Recipe`, clarifies the fields extraction left open, and
> generates a `Subject` and `Definition` pair ready for `Reason.reason`, plus a reverse
> direction that renders a `Definition`, a `Subject`, or a `ReasonResult` to
> display-neutral prose through a lexicon-driven `Narrator`.

Install the package, wire an orchestrator with the action and domain vocabularies your
domain speaks, add the recipes it answers, and call `interpret()` on each turn of raw
text. Environment-agnostic — no I/O, and no browser or server assumptions. Part of the
`@orkestrel` line.

When assignment refuses a number, `result.refusals` carries bounded evidence of its
text, position in `result.normalized`, and the decision that refused it. Compositions
of the public stages obtain the same evidence through `compileEntities`. The record
holds at most 32 items and counts the rest in `omitted`; it does not change the decision
or digest. See the guide's [refusal evidence](guides/interpret.md#refusal-evidence).

A digit-holding token must match a declared numeric form whole. For example,
`amount 3_000_000` asks with `unreadable: 'undeclared'` and holds no partial amount.
After a number, only a text or sentence end, an anchor, or a link with its required
continuation admits assignment. An alias must match its whole token sequence.
Before a number claimed backward, lone punctuation, another number, or the reader's
hedge flag asks; a previous number's sentence punctuation forms a boundary.
Colon anchors claim only forward. Other neighbors ask, in any script. The guide
states the declared forms and the retained comma exception.

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
	recipes: [
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
`[normalize, extract, clarify, format, generate]`. A `NO_RECIPE` or `LOW_CONFIDENCE`
non-match, and a thrown stage, each yield a visible incomplete result rather than an arbitrary
fallback.

## Guide

For the full surface — the `Interpret` orchestrator, the pipeline
stages, the recipe/subject/definition managers, the cross-turn context,
the lexicon-driven `Narrator`, helpers, validators, factories, errors, and
the observation surface — see
[`guides/interpret.md`](guides/interpret.md).

## Package

Published as a single typed entry point per the `exports` field in
`package.json`.

## License

MIT © [Orkestrel](https://github.com/orkestrel) — see [LICENSE](./LICENSE).
