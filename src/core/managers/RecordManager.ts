import type { EmitterInterface } from '@orkestrel/emitter'
import type {
	RecordEventMap,
	RecordFunction,
	RecordManagerInterface,
	RecordManagerOptions,
	RecordStamp,
} from '../types.js'
import { Emitter } from '@orkestrel/emitter'
import { InterpretError } from '../errors.js'
import { digestValue } from '../helpers.js'

/**
 * Implements the shared registry engine behind every record manager in this module — it
 * owns the `Map`, the content-hash and version rule, the batch `remove`
 * overloads, and teardown.
 *
 * @remarks
 * Generic over the value it holds and the record it mints, so
 * {@link TemplateManager}, {@link SubjectManager}, and
 * {@link DefinitionManager} each compose one instance rather than repeating
 * the same registry. A concrete manager keeps only what actually differs: its
 * accessor noun pair, its id source, and the {@link RecordFunction} that names
 * its record's value field. `add` derives `hash` from the value's CONTENT
 * (id-independent) and bumps `version` ONLY when that hash changes at a reused
 * id, so an identical re-add keeps its version. The batch `remove(ids)` form
 * is ALL-OR-NOTHING — any id absent from the registry leaves the collection
 * untouched and returns `false`. `destroy()` is idempotent, and every method
 * afterwards throws `InterpretError('DESTROYED', …)` naming the configured
 * `entity`.
 *
 * @example
 * ```ts
 * import { RecordManager } from '@src/core'
 *
 * interface NoteRecord {
 * 	readonly id: string
 * 	readonly note: string
 * 	readonly version: number
 * 	readonly hash: string
 * }
 *
 * const notes = new RecordManager<string, NoteRecord>({ entity: 'Note' })
 * const record = notes.add('n1', 'first', (stamp, value) => ({
 * 	id: stamp.id,
 * 	note: value,
 * 	version: stamp.version,
 * 	hash: stamp.hash,
 * }))
 * record.version // 1
 * notes.count // 1
 * ```
 */
export class RecordManager<TValue, TRecord extends RecordStamp> implements RecordManagerInterface<
	TValue,
	TRecord
> {
	readonly #records = new Map<string, TRecord>()
	readonly #emitter: Emitter<RecordEventMap>
	readonly #entity: string
	#destroyed = false

	constructor(options: RecordManagerOptions) {
		this.#entity = options.entity
		this.#emitter = new Emitter<RecordEventMap>({
			...(options.on === undefined ? {} : { on: options.on }),
			...(options.error === undefined ? {} : { error: options.error }),
		})
	}

	get emitter(): EmitterInterface<RecordEventMap> {
		return this.#emitter
	}

	get count(): number {
		this.#ensureAlive()
		return this.#records.size
	}

	has(id: string): boolean {
		this.#ensureAlive()
		return this.#records.has(id)
	}

	record(id: string): TRecord | undefined {
		this.#ensureAlive()
		return this.#records.get(id)
	}

	records(): readonly TRecord[] {
		this.#ensureAlive()
		return [...this.#records.values()]
	}

	add(id: string, value: TValue, build: RecordFunction<TValue, TRecord>): TRecord {
		this.#ensureAlive()
		const hash = digestValue(value)
		const existing = this.#records.get(id)
		const version =
			existing === undefined ? 1 : existing.hash === hash ? existing.version : existing.version + 1
		const record = build({ id, version, hash }, value)
		this.#records.set(id, record)
		this.#emitter.emit('add', id)
		return record
	}

	// Array overload first; the batch form is all-or-nothing.
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
		if (this.#destroyed) {
			throw new InterpretError('DESTROYED', `${this.#entity} manager has been destroyed`)
		}
	}
}
