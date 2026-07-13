import type { ExtractorInterface, ExtractorOptions, ExtractResult } from '../types.js'
import { DEFAULT_ACTIONS, DEFAULT_DOMAINS } from '../constants.js'
import { classifyIntent, extractNumbers } from '../helpers.js'

/**
 * The `Extractor` stage: template-agnostic intent classification plus raw
 * numeric-entity mining.
 *
 * @remarks
 * Deliberately never named `Parser` — the `contracts` module already owns
 * `Parser<T>`, so a class of that name would collide in type space (AGENTS
 * §21, design ledger 3). `extract` never sees a `Template`: numbers →
 * entity ASSIGNMENT is a separate orchestrator-owned step that runs only
 * after a template has matched (`assignEntities` in `helpers.ts`), not
 * inside this stage (the defect-3 fix — scsr's parser mined template-shaped
 * entities directly and only worked via an `instanceof` hack).
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
		this.#actions = { ...DEFAULT_ACTIONS, ...options?.actions }
		this.#domains = { ...DEFAULT_DOMAINS, ...options?.domains }
	}

	extract(text: string): ExtractResult {
		const numbers = extractNumbers(text)
		const intent = classifyIntent(text, this.#actions, this.#domains)
		return { intent, numbers, complete: numbers.length > 0 && intent.confidence > 0 }
	}
}
