import type { ExtractorInterface, ExtractorOptions, ExtractResult } from '../types.js'
import { classifyIntent, extractNumbers } from '../helpers.js'

/**
 * The `Extractor` stage: template-agnostic intent classification plus raw
 * numeric-entity mining.
 *
 * @remarks
 * Deliberately never named `Parser` — the `contracts` module already owns
 * `Parser<T>`, so a class of that name would collide in type space.
 * `extract` never sees a `Template`: numbers → entity ASSIGNMENT is a
 * separate orchestrator-owned step that runs only after a template has
 * matched (`assignEntities` in `helpers.ts`), never inside this stage, so
 * extraction stays template-agnostic.
 *
 * @example
 * ```ts
 * import { Extractor } from '@src/core'
 *
 * const extractor = new Extractor({
 * 	actions: { calculate: 'compute' },
 * 	domains: { rating: ['rate'] },
 * })
 * extractor.extract('calculate my rate at 85')
 * // { intent: { action: 'compute', domain: 'rating', confidence: 1 }, numbers: [85], complete: true }
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
		const numbers = extractNumbers(text)
		const intent = classifyIntent(text, this.#actions, this.#domains)
		return { intent, numbers, complete: numbers.length > 0 && intent.confidence > 0 }
	}
}
