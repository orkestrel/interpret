import type { SubjectManagerEventMap } from '@src/core'
import { isInterpretError, SubjectManager } from '@src/core'
import { describe, expect, it } from 'vitest'
import { captureError, recordEmitterEvents } from '../../../setup.js'

// The `SubjectManager` registry — mints its OWN identity per subject (defect 7),
// content-hashed with content-derived version bumps, all-or-nothing batch
// remove, DESTROYED after teardown (design §0/§8).

describe('SubjectManager', () => {
	it('mints a fresh id for every added subject — successive turns never overwrite', () => {
		const manager = new SubjectManager()
		const first = manager.add({ age: 25 })
		const second = manager.add({ age: 30 })
		expect(first.id).not.toBe(second.id)
		expect(manager.size).toBe(2)
		expect(manager.subject(first.id)?.subject).toEqual({ age: 25 })
		expect(manager.subject(second.id)?.subject).toEqual({ age: 30 })
	})

	it('honors an explicit id override and applies version semantics at that id', () => {
		const manager = new SubjectManager()
		expect(manager.add({ age: 25 }, { id: 'fixed' }).version).toBe(1)
		expect(manager.add({ age: 25 }, { id: 'fixed' }).version).toBe(1)
		expect(manager.add({ age: 40 }, { id: 'fixed' }).version).toBe(2)
		expect(manager.size).toBe(1)
	})

	it('seeds from options, minting an id per seed subject', () => {
		const manager = new SubjectManager({ subjects: [{ a: 1 }, { b: 2 }] })
		expect(manager.size).toBe(2)
		expect(manager.subjects().map((record) => record.subject)).toEqual([{ a: 1 }, { b: 2 }])
	})

	it('removes one, all-or-nothing batch, and all', () => {
		const manager = new SubjectManager()
		const a = manager.add({ v: 1 }, { id: 'a' })
		manager.add({ v: 2 }, { id: 'b' })
		manager.add({ v: 3 }, { id: 'c' })
		expect(manager.remove(a.id)).toBe(true)
		expect(manager.remove(['b', 'absent'])).toBe(false)
		expect(manager.size).toBe(2)
		expect(manager.remove(['b', 'c'])).toBe(true)
		expect(manager.size).toBe(0)
	})

	it('throws DESTROYED after destroy, idempotently', () => {
		const manager = new SubjectManager()
		manager.add({ v: 1 })
		manager.destroy()
		manager.destroy()
		const error = captureError(() => manager.subjects())
		expect(isInterpretError(error) && error.code === 'DESTROYED').toBe(true)
	})

	describe('emitter events', () => {
		it('fires add with the minted record id, once per add call', () => {
			const manager = new SubjectManager()
			const events = recordEmitterEvents<SubjectManagerEventMap, 'add'>(manager.emitter, ['add'])
			const first = manager.add({ age: 25 })
			const second = manager.add({ age: 30 })
			expect(events.add.calls).toEqual([[first.id], [second.id]])
		})

		it('fires remove with the record id for a single remove, and per id for a batch remove', () => {
			const manager = new SubjectManager()
			manager.add({ v: 1 }, { id: 'a' })
			manager.add({ v: 2 }, { id: 'b' })
			const events = recordEmitterEvents<SubjectManagerEventMap, 'remove'>(manager.emitter, [
				'remove',
			])
			manager.remove('a')
			expect(events.remove.calls).toEqual([['a']])
			manager.remove(['b'])
			expect(events.remove.calls).toEqual([['a'], ['b']])
		})

		it('fires destroy exactly once, and every method after destroy throws DESTROYED', () => {
			const manager = new SubjectManager()
			manager.add({ v: 1 })
			const events = recordEmitterEvents<SubjectManagerEventMap, 'destroy'>(manager.emitter, [
				'destroy',
			])
			manager.destroy()
			manager.destroy()
			expect(events.destroy.calls).toEqual([[]])
			const error = captureError(() => manager.add({ v: 2 }))
			expect(isInterpretError(error) && error.code === 'DESTROYED').toBe(true)
		})
	})
})
