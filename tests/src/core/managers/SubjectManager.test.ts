import { describe, expect, it } from 'vitest'
import { isInterpretError } from '../../../../../src/core/interprets/errors.js'
import { SubjectManager } from '../../../../../src/core/interprets/managers/SubjectManager.js'
import { captureError } from '../../../../setup.js'

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
})
