import type { EmitterInterface } from '@orkestrel/emitter'
import type { Subject } from '@orkestrel/reason'
import type {
	ManagerAddOptions,
	SubjectManagerEventMap,
	SubjectManagerInterface,
	SubjectManagerOptions,
	SubjectRecord,
} from '../types.js'
import { Emitter } from '@orkestrel/emitter'
import { InterpretError } from '../errors.js'
import { digestValue } from '../helpers.js'

/**
 * The subject registry — a self-owning, versioned and content-hashed
 * record-holder that mints its OWN record identity for every {@link Subject}
 * (a `Subject` carries no `id` field of its own).
 *
 * @remarks
 * The defect-7 fix: scsr keyed stored subjects by their definition's id, so
 * successive same-domain turns silently overwrote one shared subject. Here each
 * `add` mints a fresh `subject-{n}` id (deterministic per instance, no host
 * randomness — AGENTS §17.7) unless the caller overrides it via
 * `ManagerAddOptions.id`. `hash` is content-derived (id-independent) and
 * `version` bumps ONLY when the hash changes at a reused id. The batch
 * `remove(ids)` form is all-or-nothing; `destroy()` is idempotent and every
 * method afterwards throws `InterpretError('DESTROYED', …)`.
 *
 * @example
 * ```ts
 * import { SubjectManager } from '@src/core'
 *
 * const manager = new SubjectManager()
 * const first = manager.add({ age: 25 })
 * const second = manager.add({ age: 30 })
 * first.id !== second.id // true — each subject gets its own identity
 * ```
 */
export class SubjectManager implements SubjectManagerInterface {
	readonly #records = new Map<string, SubjectRecord>()
	readonly #emitter: Emitter<SubjectManagerEventMap>
	#counter = 0
	#destroyed = false

	constructor(options?: SubjectManagerOptions) {
		this.#emitter = new Emitter<SubjectManagerEventMap>({ on: options?.on, error: options?.error })
		for (const subject of options?.subjects ?? []) this.add(subject)
	}

	get emitter(): EmitterInterface<SubjectManagerEventMap> {
		return this.#emitter
	}

	get size(): number {
		this.#ensureAlive()
		return this.#records.size
	}

	has(id: string): boolean {
		this.#ensureAlive()
		return this.#records.has(id)
	}

	subject(id: string): SubjectRecord | undefined {
		this.#ensureAlive()
		return this.#records.get(id)
	}

	subjects(): readonly SubjectRecord[] {
		this.#ensureAlive()
		return [...this.#records.values()]
	}

	add(subject: Subject, options?: ManagerAddOptions): SubjectRecord {
		this.#ensureAlive()
		let id = options?.id
		if (id === undefined) {
			id = `subject-${this.#counter}`
			this.#counter += 1
		}
		const hash = digestValue(subject)
		const existing = this.#records.get(id)
		const version =
			existing === undefined ? 1 : existing.hash === hash ? existing.version : existing.version + 1
		const record: SubjectRecord = { id, subject, version, hash }
		this.#records.set(id, record)
		this.#emitter.emit('add', id)
		return record
	}

	// Array overload first (AGENTS §9.2); the batch form is all-or-nothing.
	remove(ids: readonly string[]): boolean
	remove(id: string): boolean
	remove(): void
	remove(target?: string | readonly string[]): boolean | void {
		this.#ensureAlive()
		if (target === undefined) {
			for (const id of this.#records.keys()) this.#emitter.emit('remove', id)
			this.#records.clear()
			return
		}
		if (typeof target === 'string') {
			const removed = this.#records.delete(target)
			if (removed) this.#emitter.emit('remove', target)
			return removed
		}
		for (const id of target) if (!this.#records.has(id)) return false
		for (const id of target) {
			this.#records.delete(id)
			this.#emitter.emit('remove', id)
		}
		return true
	}

	destroy(): void {
		if (this.#destroyed) return
		this.#records.clear()
		this.#destroyed = true
		this.#emitter.emit('destroy')
		this.#emitter.destroy()
	}

	#ensureAlive(): void {
		if (this.#destroyed) throw new InterpretError('DESTROYED', 'Subject manager has been destroyed')
	}
}
