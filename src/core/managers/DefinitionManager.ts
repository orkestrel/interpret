import type { Definition } from '../../reasons/index.js'
import type {
	DefinitionManagerInterface,
	DefinitionManagerOptions,
	DefinitionRecord,
	ManagerAddOptions,
} from '../types.js'
import { InterpretError } from '../errors.js'
import { digestValue } from '../helpers.js'

/**
 * The definition registry — a self-owning, versioned and content-hashed
 * record-holder for the reasons {@link Definition}s an interpretation produces.
 *
 * @remarks
 * Mirrors {@link TemplateManager}: `add` defaults each record id to the
 * definition's own `id`, derives `hash` from the definition CONTENT
 * (id-independent), and bumps `version` ONLY when that hash changes at a reused
 * id — an identical re-add keeps its version. The batch `remove(ids)` form is
 * all-or-nothing; `destroy()` is idempotent and every method afterwards throws
 * `InterpretError('DESTROYED', …)`.
 *
 * @example
 * ```ts
 * import { DefinitionManager, symbolicDefinition } from '@src/core'
 *
 * const manager = new DefinitionManager()
 * const record = manager.add(symbolicDefinition('rate', 'Rate', []))
 * record.id // 'rate'
 * manager.add(symbolicDefinition('rate', 'Rate', [])).version // 1 — identical re-add, no bump
 * ```
 */
export class DefinitionManager implements DefinitionManagerInterface {
	readonly #records = new Map<string, DefinitionRecord>()
	#destroyed = false

	constructor(options?: DefinitionManagerOptions) {
		for (const definition of options?.definitions ?? []) this.add(definition)
	}

	get size(): number {
		this.#ensureAlive()
		return this.#records.size
	}

	has(id: string): boolean {
		this.#ensureAlive()
		return this.#records.has(id)
	}

	definition(id: string): DefinitionRecord | undefined {
		this.#ensureAlive()
		return this.#records.get(id)
	}

	definitions(): readonly DefinitionRecord[] {
		this.#ensureAlive()
		return [...this.#records.values()]
	}

	add(definition: Definition, options?: ManagerAddOptions): DefinitionRecord {
		this.#ensureAlive()
		const id = options?.id ?? definition.id
		const hash = digestValue(definition)
		const existing = this.#records.get(id)
		const version =
			existing === undefined ? 1 : existing.hash === hash ? existing.version : existing.version + 1
		const record: DefinitionRecord = { id, definition, version, hash }
		this.#records.set(id, record)
		return record
	}

	// Array overload first (AGENTS §9.2); the batch form is all-or-nothing.
	remove(ids: readonly string[]): boolean
	remove(id: string): boolean
	remove(): void
	remove(target?: string | readonly string[]): boolean | void {
		this.#ensureAlive()
		if (target === undefined) {
			this.#records.clear()
			return
		}
		if (typeof target === 'string') return this.#records.delete(target)
		for (const id of target) if (!this.#records.has(id)) return false
		for (const id of target) this.#records.delete(id)
		return true
	}

	destroy(): void {
		if (this.#destroyed) return
		this.#records.clear()
		this.#destroyed = true
	}

	#ensureAlive(): void {
		if (this.#destroyed) {
			throw new InterpretError('DESTROYED', 'Definition manager has been destroyed')
		}
	}
}
