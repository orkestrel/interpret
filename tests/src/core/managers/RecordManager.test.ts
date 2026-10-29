import type { RecordEventMap } from '@src/core'
import { isInterpretError } from '@src/core'
import { addInterpretNote, createInterpretNotes } from '../../../setup.js'
import { describe, expect, it } from 'vitest'
import { captureError, createRecorders } from '@orkestrel/test'

// The shared registry engine every record manager composes — content-hashed
// records, content-derived version bumps, all-or-nothing batch remove, and a
// DESTROYED throw naming the configured entity.

describe('RecordManager', () => {
	it('mints a versioned, content-hashed record and holds it under its id', () => {
		const notes = createInterpretNotes()
		const record = addInterpretNote(notes, 'n1', 'first')
		expect(record).toEqual({ id: 'n1', note: 'first', version: 1, hash: record.hash })
		expect(record.hash.length).toBeGreaterThan(0)
		expect(notes.count).toBe(1)
		expect(notes.has('n1')).toBe(true)
		expect(notes.record('n1')).toBe(record)
		expect(notes.records()).toEqual([record])
	})

	it('keeps the version on an identical re-add and bumps it on a content change', () => {
		const notes = createInterpretNotes()
		addInterpretNote(notes, 'n1', 'first')
		expect(addInterpretNote(notes, 'n1', 'first').version).toBe(1)
		expect(addInterpretNote(notes, 'n1', 'second').version).toBe(2)
		expect(addInterpretNote(notes, 'n1', 'second').version).toBe(2)
		expect(notes.count).toBe(1)
	})

	it('derives the hash from the value alone — the same value hashes identically across ids', () => {
		const notes = createInterpretNotes()
		expect(addInterpretNote(notes, 'a', 'same').hash).toBe(
			addInterpretNote(notes, 'b', 'same').hash,
		)
	})

	it('removes one, all-or-nothing batch, and all', () => {
		const notes = createInterpretNotes()
		addInterpretNote(notes, 'a', '1')
		addInterpretNote(notes, 'b', '2')
		addInterpretNote(notes, 'c', '3')
		expect(notes.remove('a')).toBe(true)
		expect(notes.remove('missing')).toBe(false)
		expect(notes.remove(['b', 'absent'])).toBe(false)
		expect(notes.count).toBe(2)
		expect(notes.remove(['b', 'c'])).toBe(true)
		expect(notes.count).toBe(0)
	})

	it('remove() with no argument clears the collection', () => {
		const notes = createInterpretNotes()
		addInterpretNote(notes, 'a', '1')
		notes.remove()
		expect(notes.count).toBe(0)
	})

	it('names the configured entity in its DESTROYED throw, idempotently', () => {
		const notes = createInterpretNotes()
		notes.destroy()
		notes.destroy()
		const error = captureError(() => notes.count)
		expect(isInterpretError(error) && error.code === 'DESTROYED').toBe(true)
		expect(isInterpretError(error) && error.message).toBe('Note manager has been destroyed')
	})

	it('fires add per add, remove per removed id, and destroy once — never on a failed batch', () => {
		const notes = createInterpretNotes()
		const events = createRecorders<RecordEventMap, 'add' | 'remove' | 'destroy'>(notes.emitter, [
			'add',
			'remove',
			'destroy',
		])
		addInterpretNote(notes, 'a', '1')
		addInterpretNote(notes, 'b', '2')
		expect(events.add.calls).toEqual([['a'], ['b']])
		expect(notes.remove(['a', 'missing'])).toBe(false)
		expect(events.remove.count).toBe(0)
		notes.remove()
		expect(events.remove.calls).toEqual([['a'], ['b']])
		notes.destroy()
		notes.destroy()
		expect(events.destroy.calls).toEqual([[]])
	})
})
