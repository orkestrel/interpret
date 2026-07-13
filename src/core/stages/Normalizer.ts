import type {
	NormalizeResult,
	NormalizerInterface,
	NormalizerOptions,
	TextChange,
} from '../types.js'
import { DEFAULT_ABBREVIATIONS, DEFAULT_CONTRACTIONS, DEFAULT_CORRECTIONS } from '../constants.js'
import { applyReplacements, collapseWhitespace, escapeRegExp } from '../helpers.js'

/**
 * The `Normalizer` stage: applies contraction, abbreviation, and correction
 * substitutions in order, then collapses whitespace.
 *
 * @remarks
 * Each caller map is merged OVER the neutral built-in default for its slot —
 * `text` is never mutated (AGENTS §11). Every substitution actually applied
 * (one entry per matching map KEY, not per occurrence) is recorded on the
 * result's `changes`, in `contractions → abbreviations → corrections` order,
 * so the audit trail explains every character difference between `text` and
 * `NormalizeResult.text` (the final whitespace collapse carries no entry of
 * its own — it is structural cleanup, not a substitution).
 *
 * @example
 * ```ts
 * import { Normalizer } from '@src/core'
 *
 * const normalizer = new Normalizer({ contractions: { "can't": 'cannot' } })
 * normalizer.normalize("can't   stop")
 * // { text: 'cannot stop', changes: [{ from: "can't", to: 'cannot' }] }
 * ```
 */
export class Normalizer implements NormalizerInterface {
	readonly #contractions: Readonly<Record<string, string>>
	readonly #abbreviations: Readonly<Record<string, string>>
	readonly #corrections: Readonly<Record<string, string>>

	constructor(options?: NormalizerOptions) {
		this.#contractions = { ...DEFAULT_CONTRACTIONS, ...options?.contractions }
		this.#abbreviations = { ...DEFAULT_ABBREVIATIONS, ...options?.abbreviations }
		this.#corrections = { ...DEFAULT_CORRECTIONS, ...options?.corrections }
	}

	normalize(text: string): NormalizeResult {
		const changes: TextChange[] = []
		let working = text
		for (const map of [this.#contractions, this.#abbreviations, this.#corrections]) {
			const applied = this.#applyStage(working, map)
			working = applied.text
			changes.push(...applied.changes)
		}
		return { text: collapseWhitespace(working), changes }
	}

	// One substitution pass over `map`, recording only the keys that actually
	// matched. A chaining pass over the leaf `applyReplacements`, so it stays a
	// private orchestration step rather than a leaf of its own (AGENTS §7).
	#applyStage(
		text: string,
		map: Readonly<Record<string, string>>,
	): { text: string; changes: readonly TextChange[] } {
		let working = text
		const changes: TextChange[] = []
		for (const [from, to] of Object.entries(map)) {
			const pattern = new RegExp(`\\b${escapeRegExp(from)}\\b`, 'i')
			if (pattern.test(working)) {
				working = applyReplacements(working, { [from]: to })
				changes.push({ from, to })
			}
		}
		return { text: working, changes }
	}
}
