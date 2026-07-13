import { describe, expect, it } from 'vitest'
import { isInterpretError } from '../../../../../src/core/interprets/errors.js'
import { TemplateManager } from '../../../../../src/core/interprets/managers/TemplateManager.js'
import { buildInterpretTemplate, captureError } from '../../../../setup.js'

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
})
