import type { ExtractorInterface, ExtractorOptions, ExtractResult } from '../types.js'
import { classifyIntent } from '../helpers.js'
import { scanNumbers } from '../compilers.js'

/**
 * Implements the extract stage: recipe-agnostic intent classification plus exact reader values.
 *
 * @remarks
 * Deliberately never named `Parser` — the `contracts` module already owns
 * `Parser<T>`, so a class of that name would collide in type space.
 * `extract` never sees a `Recipe`: numbers → entity assignment is a
 * separate orchestrator-owned step that runs only after a recipe has
 * matched (`assignEntities` in `compilers.ts`), never inside this stage, so
 * extraction stays recipe-agnostic.
 * Unreadable occurrences contribute no numeric fragments. Word forms contribute their
 * exact values. Direct stage callers receive the same numbers recorded by `Interpret`.
 *
 * @example
 * ```ts
 * import { Extractor } from '@orkestrel/interpret'
 *
 * const extractor = new Extractor({
 * 	actions: { calculate: 'compute' },
 * 	domains: { rating: ['rate'] },
 * })
 * extractor.extract('calculate my rate at 85')
 * // { intent: { action: 'compute', domain: 'rating', confidence: 1 }, numbers: [85] }
 * extractor.extract('amount 3 000 000').numbers // []
 * extractor.extract('six and a half').numbers // [6.5]
 * ```
 */
export class Extractor implements ExtractorInterface {
	readonly #actions: Readonly<Record<string, string>>
	readonly #domains: Readonly<Record<string, readonly string[]>>

	constructor(options?: ExtractorOptions) {
		this.#actions = { ...options?.actions }
		this.#domains = { ...options?.domains }
	}

	extract(text: string): ExtractResult {
		const numbers = scanNumbers(text).flatMap((number) =>
			number.value === undefined ? [] : [number.value],
		)
		const intent = classifyIntent(text, this.#actions, this.#domains)
		return { intent, numbers }
	}
}
