import type { EmitterInterface } from '@orkestrel/emitter'
import type { Definition } from '@orkestrel/reason'
import type {
	DefinitionManagerEventMap,
	DefinitionManagerInterface,
	DefinitionManagerOptions,
	DefinitionRecord,
	RecordOptions,
} from '../types.js'
import { RecordManager } from './RecordManager.js'

/**
 * The definition registry — a self-owning, versioned and content-hashed
 * record-holder for the reasons {@link Definition}s an interpretation produces.
 *
 * @remarks
 * Mirrors {@link TemplateManager}: a composed {@link RecordManager} owns the
 * collection, the content-derived `hash` (id-independent), and the version
 * rule, so an identical re-add keeps its version and the batch `remove(ids)`
 * form stays all-or-nothing. This class adds what is definition-specific: the
 * accessor nouns, the record id defaulting to the definition's own `id`, and
 * the `definition` field on each record. `destroy()` is idempotent and every
 * method afterwards throws `InterpretError('DESTROYED', …)`.
 *
 * @example
 * ```ts
 * import { createSymbolicDefinition } from '@orkestrel/reason'
 * import { DefinitionManager } from '@src/core'
 *
 * const manager = new DefinitionManager()
 * const record = manager.add(createSymbolicDefinition('rate', 'Rate', []))
 * record.id // 'rate'
 * manager.add(createSymbolicDefinition('rate', 'Rate', [])).version // 1 — identical re-add, no bump
 * ```
 */
export class DefinitionManager implements DefinitionManagerInterface {
	readonly #records: RecordManager<Definition, DefinitionRecord>

	constructor(options?: DefinitionManagerOptions) {
		this.#records = new RecordManager<Definition, DefinitionRecord>({
			entity: 'Definition',
			...(options?.on === undefined ? {} : { on: options.on }),
			...(options?.error === undefined ? {} : { error: options.error }),
		})
		for (const definition of options?.definitions ?? []) this.add(definition)
	}

	get emitter(): EmitterInterface<DefinitionManagerEventMap> {
		return this.#records.emitter
	}

	get count(): number {
		return this.#records.count
	}

	has(id: string): boolean {
		return this.#records.has(id)
	}

	definition(id: string): DefinitionRecord | undefined {
		return this.#records.record(id)
	}

	definitions(): readonly DefinitionRecord[] {
		return this.#records.records()
	}

	add(definition: Definition, options?: RecordOptions): DefinitionRecord {
		return this.#records.add(options?.id ?? definition.id, definition, (stamp, value) => ({
			id: stamp.id,
			definition: value,
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
