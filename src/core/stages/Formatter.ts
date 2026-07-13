import type {
	Ambiguity,
	Entity,
	FormatResult,
	FormatterInterface,
	FormatterOptions,
	Intent,
	Template,
} from '../types.js'
import { formatField } from '@orkestrel/reason'
import { DEFAULT_VERBS } from '../constants.js'

/**
 * The `Formatter` stage: renders the refined natural-language prompt for a
 * matched template.
 *
 * @remarks
 * Shape: `{verb} {template.name}` + ` with {label}: {value}, …` for every
 * non-default entity (via the core-root `formatField`) + `
 * (defaults: {label}: {value}, …)` for default-provenance entities + `
 * needed: {question} …` for every ambiguity. `verbs` maps `intent.action` to
 * its display verb; an action absent from the map falls back to the action
 * string itself. Every parameter is read — no ignored `context` argument
 * (AGENTS-flagged scsr defect 5).
 *
 * @example
 * ```ts
 * import { Formatter } from '@src/core'
 *
 * const formatter = new Formatter({ verbs: { calculate: 'Calculate' } })
 * formatter.format(
 * 	{ action: 'calculate', domain: 'arithmetic', confidence: 1 },
 * 	{
 * 		id: 't1',
 * 		name: 'Arithmetic',
 * 		domain: 'arithmetic',
 * 		intents: ['calculate'],
 * 		mappings: [],
 * 		defaults: [],
 * 		computations: [],
 * 		definition: { reasoning: 'symbolic', id: 't1', name: 'Arithmetic', equations: [], variables: {} },
 * 	},
 * 	[],
 * 	[],
 * ) // { prompt: 'Calculate Arithmetic' }
 * ```
 */
export class Formatter implements FormatterInterface {
	readonly #verbs: Readonly<Record<string, string>>

	constructor(options?: FormatterOptions) {
		this.#verbs = { ...DEFAULT_VERBS, ...options?.verbs }
	}

	format(
		intent: Intent,
		template: Template,
		entities: readonly Entity[],
		ambiguities: readonly Ambiguity[],
	): FormatResult {
		const verb = this.#verbs[intent.action] ?? intent.action
		const render = (list: readonly Entity[]): string =>
			list.map((entity) => `${formatField(entity.name)}: ${String(entity.value)}`).join(', ')

		let prompt = `${verb} ${template.name}`

		const resolved = entities.filter((entity) => entity.provenance.category !== 'default')
		if (resolved.length > 0) prompt += ` with ${render(resolved)}`

		const defaults = entities.filter((entity) => entity.provenance.category === 'default')
		if (defaults.length > 0) prompt += ` (defaults: ${render(defaults)})`

		if (ambiguities.length > 0) {
			prompt += ` needed: ${ambiguities.map((ambiguity) => ambiguity.question).join(' ')}`
		}

		return { prompt }
	}
}
