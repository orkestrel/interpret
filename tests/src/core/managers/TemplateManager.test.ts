import type { TemplateManagerEventMap } from '@src/core'
import { isInterpretError, TemplateManager } from '@src/core'
import { describe, expect, it } from 'vitest'
import { buildInterpretTemplate, captureError, recordEmitterEvents } from '../../../setup.js'

// The `TemplateManager` registry — versioned/hashed records, content-derived
// version bumps (identical re-add keeps its version), all-or-nothing batch
// remove, and DESTROYED after teardown (design §0/§8).

describe('TemplateManager', () => {
	it('adds a template as a versioned, content-hashed record keyed by its id', () => {
		const manager = new TemplateManager()
		const record = manager.add(buildInterpretTemplate())
		expect(record.id).toBe('template-1')
		expect(record.version).toBe(1)
		expect(record.hash.length).toBeGreaterThan(0)
		expect(manager.size).toBe(1)
		expect(manager.has('template-1')).toBe(true)
		expect(manager.template('template-1')).toBe(record)
	})

	it('seeds from options and lists records in insertion order', () => {
		const manager = new TemplateManager({
			templates: [buildInterpretTemplate({ id: 'a' }), buildInterpretTemplate({ id: 'b' })],
		})
		expect(manager.size).toBe(2)
		expect(manager.templates().map((record) => record.id)).toEqual(['a', 'b'])
	})

	it('keeps the version on an identical re-add — bumps only on a content change', () => {
		const manager = new TemplateManager()
		manager.add(buildInterpretTemplate())
		expect(manager.add(buildInterpretTemplate()).version).toBe(1)
		const changed = manager.add(buildInterpretTemplate({ name: 'Renamed' }))
		expect(changed.version).toBe(2)
		expect(manager.add(buildInterpretTemplate({ name: 'Renamed' })).version).toBe(2)
	})

	it('derives the hash from content alone — the same data hashes identically across ids', () => {
		const manager = new TemplateManager()
		const first = manager.add(buildInterpretTemplate({ id: 'x' }), { id: 'slot-a' })
		const second = manager.add(buildInterpretTemplate({ id: 'x' }), { id: 'slot-b' })
		expect(first.id).toBe('slot-a')
		expect(second.id).toBe('slot-b')
		expect(first.hash).toBe(second.hash)
	})

	it('removes one, all-or-nothing batch, and all', () => {
		const manager = new TemplateManager({
			templates: [
				buildInterpretTemplate({ id: 'a' }),
				buildInterpretTemplate({ id: 'b' }),
				buildInterpretTemplate({ id: 'c' }),
			],
		})
		expect(manager.remove('a')).toBe(true)
		expect(manager.remove('missing')).toBe(false)
		expect(manager.remove(['b', 'absent'])).toBe(false)
		expect(manager.size).toBe(2)
		expect(manager.remove(['b', 'c'])).toBe(true)
		expect(manager.size).toBe(0)
	})

	it('remove() with no argument clears the registry', () => {
		const manager = new TemplateManager({ templates: [buildInterpretTemplate()] })
		manager.remove()
		expect(manager.size).toBe(0)
	})

	it('throws DESTROYED after destroy, idempotently', () => {
		const manager = new TemplateManager({ templates: [buildInterpretTemplate()] })
		manager.destroy()
		manager.destroy()
		const error = captureError(() => manager.size)
		expect(isInterpretError(error) && error.code === 'DESTROYED').toBe(true)
	})

	describe('emitter events', () => {
		it('fires add with the record id, once per add call', () => {
			const manager = new TemplateManager()
			const events = recordEmitterEvents<TemplateManagerEventMap, 'add'>(manager.emitter, ['add'])
			manager.add(buildInterpretTemplate({ id: 'a' }))
			manager.add(buildInterpretTemplate({ id: 'b' }))
			expect(events.add.calls).toEqual([['a'], ['b']])
		})

		it('fires remove with the record id for a single remove, and per id for a batch remove', () => {
			const manager = new TemplateManager({
				templates: [buildInterpretTemplate({ id: 'a' }), buildInterpretTemplate({ id: 'b' })],
			})
			const events = recordEmitterEvents<TemplateManagerEventMap, 'remove'>(manager.emitter, [
				'remove',
			])
			manager.remove('a')
			expect(events.remove.calls).toEqual([['a']])
			manager.remove(['b'])
			expect(events.remove.calls).toEqual([['a'], ['b']])
		})

		it('fires remove for every record when remove() clears the whole registry, never on a failed batch', () => {
			const manager = new TemplateManager({
				templates: [buildInterpretTemplate({ id: 'a' }), buildInterpretTemplate({ id: 'b' })],
			})
			const events = recordEmitterEvents<TemplateManagerEventMap, 'remove'>(manager.emitter, [
				'remove',
			])
			expect(manager.remove(['a', 'missing'])).toBe(false)
			expect(events.remove.count).toBe(0)
			manager.remove()
			expect(events.remove.calls).toEqual([['a'], ['b']])
		})

		it('fires destroy exactly once, and every method after destroy throws DESTROYED', () => {
			const manager = new TemplateManager({ templates: [buildInterpretTemplate()] })
			const events = recordEmitterEvents<TemplateManagerEventMap, 'destroy'>(manager.emitter, [
				'destroy',
			])
			manager.destroy()
			manager.destroy()
			expect(events.destroy.calls).toEqual([[]])
			const error = captureError(() => manager.add(buildInterpretTemplate()))
			expect(isInterpretError(error) && error.code === 'DESTROYED').toBe(true)
		})
	})
})
