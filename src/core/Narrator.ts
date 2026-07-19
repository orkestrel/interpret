import type { FieldPath } from '@orkestrel/contract'
import type { Definition, ReasonResult } from '@orkestrel/reason'
import type { Lexicon, NarratorFormatter, NarratorInterface, NarratorOptions } from './types.js'
import { formatField } from '@orkestrel/reason'
import { fillTemplate } from '@orkestrel/template'
import { DEFAULT_LEXICON } from './constants.js'

/**
 * A stateless, TOTAL, lexicon-driven rendering engine for the reverse
 * direction — the reverse-direction mirror of the forward `Formatter`'s
 * `verbs` seam (AGENTS §21 mechanism-never-policy).
 *
 * @remarks
 * Every wording decision is DATA — a caller-supplied `Lexicon` merged, per
 * sub-record (`phrases` / `labels` / `templates`), OVER `DEFAULT_LEXICON`.
 * Stateless and holds no resources: no emitter, no `destroy()` (deliberate —
 * there is nothing to release). Every method is total (never throws); a
 * lexicon or formatter miss degrades to its documented fallback rather than
 * a thrown error, and every lookup guards with `Object.hasOwn` so an
 * adversarial key (`toString`, `constructor`, `__proto__`) misses cleanly
 * instead of reading an inherited prototype member.
 *
 * @example
 * ```ts
 * import { Narrator } from '@src/core'
 *
 * const narrator = new Narrator({
 * 	lexicon: { phrases: { comparison: { equals: 'is' } } },
 * 	formatters: { money: (value) => `$${String(value)}` },
 * })
 * narrator.phrase('comparison', 'equals', 'equals') // 'is'
 * narrator.phrase('comparison', 'missing', 'equals') // 'equals' — fallback
 * narrator.value('money', 5) // '$5'
 * ```
 */
export class Narrator implements NarratorInterface {
	readonly #lexicon: Required<Lexicon>
	readonly #formatters: Readonly<Record<string, NarratorFormatter>>

	constructor(options?: NarratorOptions) {
		this.#lexicon = {
			phrases: { ...DEFAULT_LEXICON.phrases, ...options?.lexicon?.phrases },
			labels: { ...DEFAULT_LEXICON.labels, ...options?.lexicon?.labels },
			templates: { ...DEFAULT_LEXICON.templates, ...options?.lexicon?.templates },
		}
		this.#formatters = { ...options?.formatters }
	}

	phrase(table: string, key: string, fallback?: string): string {
		if (Object.hasOwn(this.#lexicon.phrases, table)) {
			const row = this.#lexicon.phrases[table]
			if (row !== null && row !== undefined && Object.hasOwn(row, key)) {
				const value = row[key]
				if (typeof value === 'string') return value
			}
		}
		return fallback ?? key
	}

	label(field: FieldPath): string {
		const key = formatField(field)
		if (Object.hasOwn(this.#lexicon.labels, key)) {
			const value = this.#lexicon.labels[key]
			if (typeof value === 'string') return value
		}
		return key
	}

	line(id: string, values: Readonly<Record<string, unknown>>): string {
		if (!Object.hasOwn(this.#lexicon.templates, id)) return ''
		const template = this.#lexicon.templates[id]
		return typeof template === 'string' ? fillTemplate(template, values, { missing: 'empty' }) : ''
	}

	value(unit: string, raw: unknown): string {
		if (Object.hasOwn(this.#formatters, unit)) {
			const formatter = this.#formatters[unit]
			if (typeof formatter === 'function') {
				try {
					return formatter(raw)
				} catch {
					return String(raw)
				}
			}
		}
		return String(raw)
	}

	describe(definition: Definition): string {
		switch (definition.reasoning) {
			case 'quantitative':
				return this.line('definition.quantitative', {
					name: definition.name,
					count: definition.groups.length,
				})
			case 'logical':
				return this.line('definition.logical', {
					name: definition.name,
					count: definition.rules.length,
					strategy: definition.strategy,
				})
			case 'symbolic':
				return this.line('definition.symbolic', {
					name: definition.name,
					count: definition.equations.length,
				})
			case 'inferential':
				return this.line('definition.inferential', {
					name: definition.name,
					facts: definition.facts.length,
					inferences: definition.inferences.length,
					strategy: definition.strategy,
				})
		}
	}

	narrate(result: ReasonResult): string {
		switch (result.reasoning) {
			case 'quantitative': {
				const base = this.line('result.quantitative', { value: result.value, count: result.count })
				if (result.errors.length === 0) return base
				const suffix = this.line('result.quantitative.failed', { errors: result.errors.join(', ') })
				return `${base}${suffix}`
			}
			case 'logical':
				return this.line('result.logical', {
					status: result.conclusion ? 'met' : 'unmet',
					count: result.count,
				})
			case 'symbolic': {
				const solved = Object.entries(result.solutions)
					.map(([key, value]) => `${key}=${value}`)
					.join(', ')
				return this.line('result.symbolic', { solved })
			}
			case 'inferential':
				return this.line('result.inferential', { count: result.derived.length })
		}
	}
}
