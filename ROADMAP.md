Each item is a chunk that reaches green before the next. An item keeps its number for life: a closed
item leaves this file and its number is never reused, so a commit message citing an item by number
stays true.

- **1.** After the shared standing-proof observation mechanism lands in `@orkestrel/test`, adopt it for `buildInterpretContractCases` in `tests/setup.ts` and `tests/src/core/contracts.test.ts`. Admit projections without a guard for numbers, and preserve reading and refusal semantics locally.
- **2.** At the next package visit, adopt `createHostileValues` from `@orkestrel/test` for overlapping cyclic and proxy construction in `tests/src/core/validators.test.ts`. Keep scalar refusal data, computed-field and recipe cycles, and domain-specific acceptance and identity expectations local.
