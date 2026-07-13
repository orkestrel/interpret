import type { EmitterInterface } from '@orkestrel/emitter'
import type {
	DefinitionManagerInterface,
	Entity,
	InterpretContextEventMap,
	InterpretContextInterface,
	InterpretContextOptions,
	Interpretation,
	SubjectManagerInterface,
} from '../types.js'
import { Emitter } from '@orkestrel/emitter'
import { DEFAULT_INTERPRET_HISTORY } from '../constants.js'
import { InterpretError } from '../errors.js'
import { DefinitionManager } from './DefinitionManager.js'
import { SubjectManager } from './SubjectManager.js'

/**
 * Cross-turn interpretation context — a capped, replayable history of
 * completed {@link Interpretation}s plus the subject and definition registries
 * carry-over reads from.
 *
 * @remarks
 * `previous()` is a capped ring buffer (newest-last, oldest dropped once the
 * `history` cap is reached — `DEFAULT_INTERPRET_HISTORY` by default, ≥ 3
 * preserves the carry-over pin) rather than scsr's unbounded `previous` array.
 * `entities()` flattens every entity across the buffered history, most recent
 * last — the read a `Clarifier`'s same-domain carry-over consults. `add` pushes
 * one result and trims to the cap; `clear` resets the history and both
 * registries WITHOUT tearing the context down; `destroy()` is idempotent and
 * every method afterwards throws `InterpretError('DESTROYED', …)`.
 *
 * @example
 * ```ts
 * import { InterpretContext } from '@src/core'
 *
 * const context = new InterpretContext({ session: 's1', history: 8 })
 * context.session // 's1'
 * context.previous() // []
 * ```
 */
export class InterpretContext implements InterpretContextInterface {
	readonly #session?: string
	readonly #subjects: SubjectManagerInterface
	readonly #definitions: DefinitionManagerInterface
	readonly #history: number
	readonly #previous: Interpretation[] = []
	readonly #emitter: Emitter<InterpretContextEventMap>
	#destroyed = false

	constructor(options?: InterpretContextOptions) {
		this.#session = options?.session
		this.#history = Math.max(0, options?.history ?? DEFAULT_INTERPRET_HISTORY)
		this.#subjects = new SubjectManager()
		this.#definitions = new DefinitionManager()
		this.#emitter = new Emitter<InterpretContextEventMap>({
			on: options?.on,
			error: options?.error,
		})
	}

	get emitter(): EmitterInterface<InterpretContextEventMap> {
		return this.#emitter
	}

	get session(): string | undefined {
		this.#ensureAlive()
		return this.#session
	}

	get subjects(): SubjectManagerInterface {
		this.#ensureAlive()
		return this.#subjects
	}

	get definitions(): DefinitionManagerInterface {
		this.#ensureAlive()
		return this.#definitions
	}

	previous(): readonly Interpretation[] {
		this.#ensureAlive()
		return [...this.#previous]
	}

	entities(): readonly Entity[] {
		this.#ensureAlive()
		return this.#previous.flatMap((result) => [...result.entities])
	}

	add(result: Interpretation): void {
		this.#ensureAlive()
		this.#previous.push(result)
		while (this.#previous.length > this.#history) this.#previous.shift()
		this.#emitter.emit('add', result.digest)
	}

	clear(): void {
		this.#ensureAlive()
		this.#previous.length = 0
		this.#subjects.remove()
		this.#definitions.remove()
		this.#emitter.emit('clear')
	}

	destroy(): void {
		if (this.#destroyed) return
		this.#previous.length = 0
		this.#subjects.destroy()
		this.#definitions.destroy()
		this.#destroyed = true
		this.#emitter.emit('destroy')
		this.#emitter.destroy()
	}

	#ensureAlive(): void {
		if (this.#destroyed)
			throw new InterpretError('DESTROYED', 'Interpret context has been destroyed')
	}
}
