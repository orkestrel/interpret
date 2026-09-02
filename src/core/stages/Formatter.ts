import type {
	Ambiguity,
	Entity,
	FormatResult,
	FormatterInterface,
	FormatterOptions,
	Intent,
	NarratorInterface,
	Template,
} from '../types.js'
import { formatField } from '@orkestrel/reason'
import { Narrator } from '../Narrator.js'

/**
 * The `Formatter` stage: renders the refined natural-language prompt for a
 * matched template.
 *
 * @remarks
 * Shape: the `prompt.base` line (`{verb} {template.name}`), then the
 * `prompt.entities` clause for every non-default entity (each rendered
 * `{label}: {value}` through the core-root `formatField`), then the
 * `prompt.defaults` clause for default-provenance entities, then the
 * `prompt.ambiguities` clause listing every ambiguity's question. Each clause
 * is rendered through the injected {@link NarratorInterface}'s matching
 * `prompt.*` line rather than minted from a literal here, so a caller rewords
 * the assembly by overriding those keys in a `Lexicon`. `verbs` maps
 * `intent.action` to its display verb; an action absent from the map falls
 * back to the action string itself, and an intent carrying no action at all
 * renders an empty verb. Every parameter is read — the signature carries no
 * argument the body ignores.
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
	readonly #narrator: NarratorInterface

	constructor(options?: FormatterOptions) {
		this.#verbs = { ...options?.verbs }
		this.#narrator = options?.narrator ?? new Narrator()
	}

	format(
		intent: Intent,
		template: Template,
		entities: readonly Entity[],
		ambiguities: readonly Ambiguity[],
	): FormatResult {
		const action = intent.action
		const verb = action === undefined ? '' : (this.#verbs[action] ?? action)
		const resolved: string[] = []
		const defaults: string[] = []
		for (const entity of entities) {
			const rendered = `${formatField(entity.name)}: ${String(entity.value)}`
			if (entity.provenance.category === 'default') defaults.push(rendered)
			else resolved.push(rendered)
		}

		let prompt = this.#narrator.line('prompt.base', { verb, name: template.name })

		if (resolved.length > 0) {
			prompt += this.#narrator.line('prompt.entities', { fields: resolved.join(', ') })
		}

		if (defaults.length > 0) {
			prompt += this.#narrator.line('prompt.defaults', { fields: defaults.join(', ') })
		}

		if (ambiguities.length > 0) {
			prompt += this.#narrator.line('prompt.ambiguities', {
				questions: ambiguities.map((ambiguity) => ambiguity.question).join(' '),
			})
		}

		return { prompt }
	}
}
