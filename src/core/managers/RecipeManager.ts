import type { EmitterInterface } from '@orkestrel/emitter'
import type {
	RecordOptions,
	Recipe,
	RecipeManagerEventMap,
	RecipeManagerInterface,
	RecipeManagerOptions,
	RecipeRecord,
} from '../types.js'
import { isString } from '@orkestrel/contract'
import { RecordManager } from './RecordManager.js'

/**
 * Implements the recipe registry — a self-owning, versioned and content-hashed
 * record-holder for the {@link Recipe}s an `Interpret` orchestrator matches
 * against.
 *
 * @remarks
 * `count` — the registry's lone tally — plus the singular/plural accessor
 * pair (`recipe` / `recipes`) and the batch `remove` overloads.
 * A composed {@link RecordManager} owns the collection, the content-derived
 * `hash`, and the version rule, so an identical re-add keeps its version and
 * the batch `remove(ids)` form stays all-or-nothing. This class adds what is
 * recipe-specific: the accessor nouns, the record id defaulting to
 * `recipe.id`, and the `recipe` field on each record. `destroy()` is
 * idempotent; every method afterwards throws `InterpretError('DESTROYED', …)`.
 *
 * @example
 * ```ts
 * import { objectShape } from '@orkestrel/contract'
 * import { createFactorGroup, createFieldFactor, createQuantitativeDefinition } from '@orkestrel/reason'
 * import { RecipeManager } from '@orkestrel/interpret'
 *
 * const manager = new RecipeManager()
 * const record = manager.add({
 * 	id: 't1',
 * 	name: 'Arithmetic',
 * 	domain: 'arithmetic',
 * 	intents: ['calculate'],
 * 	mappings: [],
 * 	shape: objectShape({}),
 * 	computations: [],
 * 	definition: createQuantitativeDefinition('t1', 'Arithmetic', [
 * 		createFactorGroup('total', 'sum', [createFieldFactor('value', 'value')]),
 * 	]),
 * })
 * record.version // 1
 * manager.count // 1
 * ```
 */
export class RecipeManager implements RecipeManagerInterface {
	readonly #records: RecordManager<Recipe, RecipeRecord>

	constructor(options?: RecipeManagerOptions) {
		this.#records = new RecordManager<Recipe, RecipeRecord>({
			entity: 'Recipe',
			...(options?.on === undefined ? {} : { on: options.on }),
			...(options?.error === undefined ? {} : { error: options.error }),
		})
		for (const recipe of options?.recipes ?? []) this.add(recipe)
	}

	get emitter(): EmitterInterface<RecipeManagerEventMap> {
		return this.#records.emitter
	}

	get count(): number {
		return this.#records.count
	}

	has(id: string): boolean {
		return this.#records.has(id)
	}

	recipe(id: string): RecipeRecord | undefined {
		return this.#records.record(id)
	}

	recipes(): readonly RecipeRecord[] {
		return this.#records.records()
	}

	add(recipe: Recipe, options?: RecordOptions): RecipeRecord {
		return this.#records.add(options?.id ?? recipe.id, recipe, (stamp, value) => ({
			id: stamp.id,
			recipe: value,
			version: stamp.version,
			hash: stamp.hash,
		}))
	}

	remove(ids: readonly string[]): boolean
	remove(id: string): boolean
	remove(): void
	remove(target?: string | readonly string[]): boolean | void {
		if (target === undefined) return this.#records.remove()
		if (isString(target)) return this.#records.remove(target)
		return this.#records.remove(target)
	}

	destroy(): void {
		this.#records.destroy()
	}
}
