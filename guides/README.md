# Guides

A dual-axis index into this repository's guides — by concept, and by directory (AGENTS §22).

## By concept

| Concept   | Spec                           | Source                    | Tests                                 |
| --------- | ------------------------------ | ------------------------- | ------------------------------------- |
| Interpret | [`interpret.md`](interpret.md) | [`src/core`](../src/core) | [`tests/src/core`](../tests/src/core) |

## By directory

| Directory  | Guide                          |
| ---------- | ------------------------------ |
| `src/core` | [`interpret.md`](interpret.md) |

## Dependency reference

[`reason.md`](reason.md) is a byte-identical mirror of the guide for
`@orkestrel/reason` — a runtime dependency. It documents **that package's**
surface (the typed reasoning engine: definitions, subjects, reasoners, and
the builder family), not anything sourced in this repo; it is kept here so a
reader of this package can see the engine every interpretation ultimately
targets without leaving this guide set.

[`contract.md`](contract.md) is a byte-identical mirror of the guide
for `@orkestrel/contract` — a runtime dependency. It documents **that
package's** surface (guards, combinators, parsers, and the shape DSL), not
anything sourced in this repo; it is kept here for the same reason.

[`emitter.md`](emitter.md) is a byte-identical mirror of the guide
for `@orkestrel/emitter` — a runtime dependency. It documents **that
package's** surface (the typed push-observation `Emitter`), not anything
sourced in this repo; it is kept here for the same reason.

[`guide.md`](guide.md) is a byte-identical mirror of the guide for
`@orkestrel/guide` — the devDependency powering this repo's guides-parity
test suite (`tests/guides.test.ts`). It documents **that
package's** surface (`Guide` / `Source`, the manifest and comparison
helpers), not anything sourced in this repo; it is kept here so a reader of
the parity suite can see the primitives it is built from without leaving
this guide set.

[`template.md`](template.md) is a byte-identical mirror of the guide
for `@orkestrel/template` — a runtime dependency. It documents **that
package's** surface (the string-fill `Template` / `TemplateManager`), not
anything sourced in this repo; it is kept here for the same reason. Note the
name collision: this documents `@orkestrel/template`'s own string-fill
`Template` / `TemplateManager` classes, not this repo's distinct
`Template` / `TemplateManager` intent-registry classes, which remain
documented in [`interpret.md`](interpret.md).

## See also

- [`AGENTS.md`](../AGENTS.md) — the rules; §22 documentation-as-contracts.
