import type { EmitterInterface } from '@orkestrel/emitter'
import type { Subject } from '@orkestrel/reason'
import type {
	ManagerAddOptions,
	SubjectManagerEventMap,
	SubjectManagerInterface,
	SubjectManagerOptions,
	SubjectRecord,
} from '../types.js'
import { RecordManager } from './RecordManager.js'

/**
 * The subject registry — a self-owning, versioned and content-hashed
 * record-holder that mints its OWN record identity for every {@link Subject}
 * (a `Subject` carries no `id` field of its own).
 *
 * @remarks
 * Each `add` mints a fresh `subject-{n}` id (deterministic per instance, no
 * host randomness) unless the caller overrides it through
 * `ManagerAddOptions.id`, so successive same-domain turns never overwrite one
 * shared subject. A composed {@link RecordManager} owns the collection, the
 * content-derived `hash` (id-independent), and the version rule, so `version`
 * bumps ONLY when the hash changes at a reused id and the batch `remove(ids)`
 * form stays all-or-nothing. `destroy()` is idempotent and every method
 * afterwards throws `InterpretError('DESTROYED', …)`.
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
	readonly #records: RecordManager<Subject, SubjectRecord>
	#counter = 0

	constructor(options?: SubjectManagerOptions) {
		this.#records = new RecordManager<Subject, SubjectRecord>({
			entity: 'Subject',
			...(options?.on === undefined ? {} : { on: options.on }),
			...(options?.error === undefined ? {} : { error: options.error }),
		})
		for (const subject of options?.subjects ?? []) this.add(subject)
	}

	get emitter(): EmitterInterface<SubjectManagerEventMap> {
		return this.#records.emitter
	}

	get size(): number {
		return this.#records.size
	}

	has(id: string): boolean {
		return this.#records.has(id)
	}

	subject(id: string): SubjectRecord | undefined {
		return this.#records.record(id)
	}

	subjects(): readonly SubjectRecord[] {
		return this.#records.records()
	}

	add(subject: Subject, options?: ManagerAddOptions): SubjectRecord {
		return this.#records.add(options?.id ?? this.#mint(), subject, (stamp, value) => ({
			id: stamp.id,
			subject: value,
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

	// The own-minted record identity — deterministic per instance, never host
	// randomness, so a replayed sequence of adds reproduces the same ids.
	#mint(): string {
		const id = `subject-${this.#counter}`
		this.#counter += 1
		return id
	}
}
