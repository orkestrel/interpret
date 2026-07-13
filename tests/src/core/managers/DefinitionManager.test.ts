import { symbolicDefinition } from '@src/core'
import { describe, expect, it } from 'vitest'
import { isInterpretError } from '../../../../../src/core/interprets/errors.js'
import { DefinitionManager } from '../../../../../src/core/interprets/managers/DefinitionManager.js'
import { captureError } from '../../../../setup.js'

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
})
