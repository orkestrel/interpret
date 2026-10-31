import type { RecipeManagerEventMap } from '@src/core'
import { isInterpretError, RecipeManager } from '@src/core'
import { describe, expect, it } from 'vitest'
import { captureError, createRecorders } from '@orkestrel/test'
import { buildInterpretRecipe } from '../../../setup.js'

// The `RecipeManager` registry — versioned/hashed records, content-derived
// version bumps (identical re-add keeps its version), all-or-nothing batch
// remove, and DESTROYED after teardown.

describe('RecipeManager', () => {
	it('adds a recipe as a versioned, content-hashed record keyed by its id', () => {
		const manager = new RecipeManager()
		const record = manager.add(buildInterpretRecipe())
		expect(record.id).toBe('recipe-1')
		expect(record.recipe).toEqual(buildInterpretRecipe())
		expect(record.version).toBe(1)
		expect(record.hash.length).toBeGreaterThan(0)
		expect(manager.count).toBe(1)
		expect(manager.has('recipe-1')).toBe(true)
		expect(manager.recipe('recipe-1')).toBe(record)
	})

	it('seeds from options and lists records in insertion order', () => {
		const manager = new RecipeManager({
			recipes: [buildInterpretRecipe({ id: 'a' }), buildInterpretRecipe({ id: 'b' })],
		})
		expect(manager.count).toBe(2)
		expect(manager.recipes().map((record) => record.id)).toEqual(['a', 'b'])
	})

	it('keeps the version on an identical re-add — bumps only on a content change', () => {
		const manager = new RecipeManager()
		manager.add(buildInterpretRecipe())
		expect(manager.add(buildInterpretRecipe()).version).toBe(1)
		const changed = manager.add(buildInterpretRecipe({ name: 'Renamed' }))
		expect(changed.version).toBe(2)
		expect(manager.add(buildInterpretRecipe({ name: 'Renamed' })).version).toBe(2)
	})

	it('derives the hash from content alone — the same data hashes identically across ids', () => {
		const manager = new RecipeManager()
		const first = manager.add(buildInterpretRecipe({ id: 'x' }), { id: 'slot-a' })
		const second = manager.add(buildInterpretRecipe({ id: 'x' }), { id: 'slot-b' })
		expect(first.id).toBe('slot-a')
		expect(second.id).toBe('slot-b')
		expect(first.hash).toBe(second.hash)
	})

	it('removes one, all-or-nothing batch, and all', () => {
		const manager = new RecipeManager({
			recipes: [
				buildInterpretRecipe({ id: 'a' }),
				buildInterpretRecipe({ id: 'b' }),
				buildInterpretRecipe({ id: 'c' }),
			],
		})
		expect(manager.remove('a')).toBe(true)
		expect(manager.remove('missing')).toBe(false)
		expect(manager.remove(['b', 'absent'])).toBe(false)
		expect(manager.count).toBe(2)
		expect(manager.remove(['b', 'c'])).toBe(true)
		expect(manager.count).toBe(0)
	})

	it('remove() with no argument clears the registry', () => {
		const manager = new RecipeManager({ recipes: [buildInterpretRecipe()] })
		manager.remove()
		expect(manager.count).toBe(0)
	})

	it('throws DESTROYED after destroy, idempotently', () => {
		const manager = new RecipeManager({ recipes: [buildInterpretRecipe()] })
		manager.destroy()
		manager.destroy()
		const error = captureError(() => manager.count)
		expect(isInterpretError(error) && error.code === 'DESTROYED').toBe(true)
	})

	describe('emitter events', () => {
		it('fires add with the record id, once per add call', () => {
			const manager = new RecipeManager()
			const events = createRecorders<RecipeManagerEventMap, 'add'>(manager.emitter, ['add'])
			manager.add(buildInterpretRecipe({ id: 'a' }))
			manager.add(buildInterpretRecipe({ id: 'b' }))
			expect(events.add.calls).toEqual([['a'], ['b']])
		})

		it('fires remove with the record id for a single remove, and per id for a batch remove', () => {
			const manager = new RecipeManager({
				recipes: [buildInterpretRecipe({ id: 'a' }), buildInterpretRecipe({ id: 'b' })],
			})
			const events = createRecorders<RecipeManagerEventMap, 'remove'>(manager.emitter, ['remove'])
			manager.remove('a')
			expect(events.remove.calls).toEqual([['a']])
			manager.remove(['b'])
			expect(events.remove.calls).toEqual([['a'], ['b']])
		})

		it('fires remove for every record when remove() clears the whole registry, never on a failed batch', () => {
			const manager = new RecipeManager({
				recipes: [buildInterpretRecipe({ id: 'a' }), buildInterpretRecipe({ id: 'b' })],
			})
			const events = createRecorders<RecipeManagerEventMap, 'remove'>(manager.emitter, ['remove'])
			expect(manager.remove(['a', 'missing'])).toBe(false)
			expect(events.remove.count).toBe(0)
			manager.remove()
			expect(events.remove.calls).toEqual([['a'], ['b']])
		})

		it('fires destroy exactly once, and every method after destroy throws DESTROYED', () => {
			const manager = new RecipeManager({ recipes: [buildInterpretRecipe()] })
			const events = createRecorders<RecipeManagerEventMap, 'destroy'>(manager.emitter, ['destroy'])
			manager.destroy()
			manager.destroy()
			expect(events.destroy.calls).toEqual([[]])
			const error = captureError(() => manager.add(buildInterpretRecipe()))
			expect(isInterpretError(error) && error.code === 'DESTROYED').toBe(true)
			expect(isInterpretError(error) && error.message).toBe('Recipe manager has been destroyed')
		})
	})
})
