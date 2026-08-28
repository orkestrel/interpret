import type { EmitterInterface } from '@orkestrel/emitter'
import type {
	ManagerAddOptions,
	Template,
	TemplateManagerEventMap,
	TemplateManagerInterface,
	TemplateManagerOptions,
	TemplateRecord,
} from '../types.js'
import { RecordManager } from './RecordManager.js'

/**
 * The template registry — a self-owning, versioned and content-hashed
 * record-holder for the {@link Template}s an `Interpret` orchestrator matches
 * against.
 *
 * @remarks
 * `size` (never `count` — the sole tally in scope) plus the singular/plural
 * accessor pair (`template` / `templates`) and the batch `remove` overloads.
 * A composed {@link RecordManager} owns the collection, the content-derived
 * `hash`, and the version rule, so an identical re-add keeps its version and
 * the batch `remove(ids)` form stays ALL-OR-NOTHING. This class adds what is
 * template-specific: the accessor nouns, the record id defaulting to
 * `template.id`, and the `template` field on each record. `destroy()` is
 * idempotent; every method afterwards throws `InterpretError('DESTROYED', …)`.
 *
 * @example
 * ```ts
 * import { factorGroup, fieldFactor, quantitativeDefinition } from '@orkestrel/reason'
 * import { TemplateManager } from '@src/core'
 *
 * const manager = new TemplateManager()
 * const record = manager.add({
 * 	id: 't1',
 * 	name: 'Arithmetic',
 * 	domain: 'arithmetic',
 * 	intents: ['calculate'],
 * 	mappings: [],
 * 	defaults: [],
 * 	computations: [],
 * 	definition: quantitativeDefinition('t1', 'Arithmetic', [
 * 		factorGroup('total', 'sum', [fieldFactor('value', 'value')]),
 * 	]),
 * })
 * record.version // 1
 * manager.size // 1
 * ```
 */
export class TemplateManager implements TemplateManagerInterface {
	readonly #records: RecordManager<Template, TemplateRecord>

	constructor(options?: TemplateManagerOptions) {
		this.#records = new RecordManager<Template, TemplateRecord>({
			entity: 'Template',
			...(options?.on === undefined ? {} : { on: options.on }),
			...(options?.error === undefined ? {} : { error: options.error }),
		})
		for (const template of options?.templates ?? []) this.add(template)
	}

	get emitter(): EmitterInterface<TemplateManagerEventMap> {
		return this.#records.emitter
	}

	get size(): number {
		return this.#records.size
	}

	has(id: string): boolean {
		return this.#records.has(id)
	}

	template(id: string): TemplateRecord | undefined {
		return this.#records.record(id)
	}

	templates(): readonly TemplateRecord[] {
		return this.#records.records()
	}

	add(template: Template, options?: ManagerAddOptions): TemplateRecord {
		return this.#records.add(options?.id ?? template.id, template, (stamp, value) => ({
			id: stamp.id,
			template: value,
			version: stamp.version,
			hash: stamp.hash,
		}))
	}

	remove(ids: readonly string[]): boolean
	remove(id: string): boolean
	remove(): void
	remove(target?: string | readonly string[]): boolean | void {
		if (target === undefined) return this.#records.remove()
		if (typeof target === 'string') return this.#records.remove(target)
		return this.#records.remove(target)
	}

	destroy(): void {
		this.#records.destroy()
	}
}
