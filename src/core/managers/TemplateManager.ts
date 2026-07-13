import type {
	ManagerAddOptions,
	Template,
	TemplateManagerInterface,
	TemplateManagerOptions,
	TemplateRecord,
} from '../types.js'
import { InterpretError } from '../errors.js'
import { digestValue } from '../helpers.js'

/**
 * The template registry — a self-owning, versioned and content-hashed
 * record-holder for the {@link Template}s an `Interpret` orchestrator matches
 * against.
 *
 * @remarks
 * `size` (never `count` — the sole tally in scope) plus the AGENTS §9.1
 * singular/plural accessors (`template` / `templates`) and the §9.2 batch
 * `remove` overloads. `add` derives each record's `hash` from the template's
 * CONTENT (id-independent — the same template data hashes identically under
 * any record id) and bumps `version` ONLY when that hash changes: an identical
 * re-add keeps its version (unlike scsr, which bumped on every add). The
 * batch `remove(ids)` form is ALL-OR-NOTHING — any id absent from the registry
 * leaves the collection untouched and returns `false`. `destroy()` is
 * idempotent; every method afterwards throws `InterpretError('DESTROYED', …)`.
 *
 * @example
 * ```ts
 * import { TemplateManager, factorGroup, fieldFactor, quantitativeDefinition } from '@src/core'
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
	readonly #records = new Map<string, TemplateRecord>()
	#destroyed = false

	constructor(options?: TemplateManagerOptions) {
		for (const template of options?.templates ?? []) this.add(template)
	}

	get size(): number {
		this.#ensureAlive()
		return this.#records.size
	}

	has(id: string): boolean {
		this.#ensureAlive()
		return this.#records.has(id)
	}

	template(id: string): TemplateRecord | undefined {
		this.#ensureAlive()
		return this.#records.get(id)
	}

	templates(): readonly TemplateRecord[] {
		this.#ensureAlive()
		return [...this.#records.values()]
	}

	add(template: Template, options?: ManagerAddOptions): TemplateRecord {
		this.#ensureAlive()
		const id = options?.id ?? template.id
		const hash = digestValue(template)
		const existing = this.#records.get(id)
		const version =
			existing === undefined ? 1 : existing.hash === hash ? existing.version : existing.version + 1
		const record: TemplateRecord = { id, template, version, hash }
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
		if (this.#destroyed)
			throw new InterpretError('DESTROYED', 'Template manager has been destroyed')
	}
}
