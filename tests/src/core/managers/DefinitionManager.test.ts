import type { DefinitionManagerEventMap } from '@src/core'
import { symbolicDefinition } from '@orkestrel/reason'
import { DefinitionManager, isInterpretError } from '@src/core'
import { describe, expect, it } from 'vitest'
import { captureError, recordEmitterEvents } from '../../../setup.js'

// The `DefinitionManager` registry — versioned/hashed records keyed by the
// definition id, content-derived version bumps, all-or-nothing batch remove,
// DESTROYED after teardown (design §0/§8).

describe('DefinitionManager', () => {
	it('adds a definition keyed by its own id as a versioned, hashed record', () => {
		const manager = new DefinitionManager()
		const record = manager.add(symbolicDefinition('rate', 'Rate', []))
		expect(record.id).toBe('rate')
		expect(record.version).toBe(1)
		expect(manager.definition('rate')).toBe(record)
	})

	it('keeps the version on an identical re-add — bumps only on a content change', () => {
		const manager = new DefinitionManager()
		manager.add(symbolicDefinition('rate', 'Rate', []))
		expect(manager.add(symbolicDefinition('rate', 'Rate', [])).version).toBe(1)
		expect(manager.add(symbolicDefinition('rate', 'Renamed', [])).version).toBe(2)
	})

	it('seeds from options and lists in insertion order', () => {
		const manager = new DefinitionManager({
			definitions: [symbolicDefinition('a', 'A', []), symbolicDefinition('b', 'B', [])],
		})
		expect(manager.definitions().map((record) => record.id)).toEqual(['a', 'b'])
	})

	it('removes one, all-or-nothing batch, and all', () => {
		const manager = new DefinitionManager({
			definitions: [
				symbolicDefinition('a', 'A', []),
				symbolicDefinition('b', 'B', []),
				symbolicDefinition('c', 'C', []),
			],
		})
		expect(manager.remove('a')).toBe(true)
		expect(manager.remove(['b', 'absent'])).toBe(false)
		expect(manager.size).toBe(2)
		manager.remove()
		expect(manager.size).toBe(0)
	})

	it('throws DESTROYED after destroy, idempotently', () => {
		const manager = new DefinitionManager()
		manager.destroy()
		manager.destroy()
		const error = captureError(() => manager.has('rate'))
		expect(isInterpretError(error) && error.code === 'DESTROYED').toBe(true)
	})

	describe('emitter events', () => {
		it('fires add with the record id, once per add call', () => {
			const manager = new DefinitionManager()
			const events = recordEmitterEvents<DefinitionManagerEventMap, 'add'>(manager.emitter, ['add'])
			manager.add(symbolicDefinition('a', 'A', []))
			manager.add(symbolicDefinition('b', 'B', []))
			expect(events.add.calls).toEqual([['a'], ['b']])
		})

		it('fires remove with the record id for a single remove, and per id for a batch remove', () => {
			const manager = new DefinitionManager({
				definitions: [symbolicDefinition('a', 'A', []), symbolicDefinition('b', 'B', [])],
			})
			const events = recordEmitterEvents<DefinitionManagerEventMap, 'remove'>(manager.emitter, [
				'remove',
			])
			manager.remove('a')
			expect(events.remove.calls).toEqual([['a']])
			manager.remove(['b'])
			expect(events.remove.calls).toEqual([['a'], ['b']])
		})

		it('fires destroy exactly once, and every method after destroy throws DESTROYED', () => {
			const manager = new DefinitionManager()
			const events = recordEmitterEvents<DefinitionManagerEventMap, 'destroy'>(manager.emitter, [
				'destroy',
			])
			manager.destroy()
			manager.destroy()
			expect(events.destroy.calls).toEqual([[]])
			const error = captureError(() => manager.add(symbolicDefinition('c', 'C', [])))
			expect(isInterpretError(error) && error.code === 'DESTROYED').toBe(true)
		})
	})
})
