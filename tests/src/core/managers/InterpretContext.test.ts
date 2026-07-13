import { describe, expect, it } from 'vitest'
import { isInterpretError } from '../../../../../src/core/interprets/errors.js'
import { InterpretContext } from '../../../../../src/core/interprets/managers/InterpretContext.js'
import { buildInterpretation, captureError } from '../../../../setup.js'

// The `InterpretContext` — capped ring-buffer history (newest-last), flattened
// entity carry-over source, own subject/definition registries, clear vs.
// destroy, DESTROYED after teardown (design §0/§6/§8).

describe('InterpretContext', () => {
	it('exposes the session and its own subject/definition registries', () => {
		const context = new InterpretContext({ session: 's1' })
		expect(context.session).toBe('s1')
		expect(context.subjects.size).toBe(0)
		expect(context.definitions.size).toBe(0)
		expect(context.previous()).toEqual([])
		expect(context.entities()).toEqual([])
	})

	it('accumulates history newest-last and flattens entities across turns', () => {
		const context = new InterpretContext()
		context.add(buildInterpretation({ text: 'first' }))
		context.add(
			buildInterpretation({
				text: 'second',
				entities: [
					{ name: 'score', value: 720, provenance: { category: 'extracted' }, confidence: 1 },
				],
			}),
		)
		expect(context.previous().map((result) => result.text)).toEqual(['first', 'second'])
		expect(context.entities().map((entity) => entity.name)).toEqual(['age', 'score'])
	})

	it('caps the ring buffer at the configured history, dropping the oldest', () => {
		const context = new InterpretContext({ history: 3 })
		for (const index of [0, 1, 2, 3, 4]) context.add(buildInterpretation({ text: `turn-${index}` }))
		expect(context.previous().map((result) => result.text)).toEqual(['turn-2', 'turn-3', 'turn-4'])
	})

	it('cap>=3 preserves carry-over reads within the window and drops what falls outside it', () => {
		const context = new InterpretContext({ history: 3 })
		context.add(
			buildInterpretation({
				text: 'turn-0',
				entities: [
					{ name: 'age', value: 25, provenance: { category: 'extracted' }, confidence: 1 },
				],
			}),
		)
		context.add(
			buildInterpretation({
				text: 'turn-1',
				entities: [
					{ name: 'income', value: 50000, provenance: { category: 'extracted' }, confidence: 1 },
				],
			}),
		)
		// Still within the cap=3 window (turn-0, turn-1, turn-2 all buffered) — a
		// carry-over read two turns back still finds the original `age` entity.
		expect(context.entities().map((entity) => entity.name)).toEqual(['age', 'income'])
		context.add(
			buildInterpretation({
				text: 'turn-2',
				entities: [
					{ name: 'score', value: 720, provenance: { category: 'extracted' }, confidence: 1 },
				],
			}),
		)
		expect(context.entities().map((entity) => entity.name)).toEqual(['age', 'income', 'score'])
		// A fourth turn evicts turn-0 — its `age` entity is no longer carry-over-readable.
		context.add(
			buildInterpretation({
				text: 'turn-3',
				entities: [
					{
						name: 'coverage',
						value: 'standard',
						provenance: { category: 'extracted' },
						confidence: 1,
					},
				],
			}),
		)
		expect(context.entities().map((entity) => entity.name)).toEqual(['income', 'score', 'coverage'])
	})

	it('clear resets history and registries without tearing the context down', () => {
		const context = new InterpretContext({ session: 's1' })
		context.add(buildInterpretation())
		context.subjects.add({ age: 25 })
		context.clear()
		expect(context.previous()).toEqual([])
		expect(context.subjects.size).toBe(0)
		expect(context.session).toBe('s1')
		context.add(buildInterpretation({ text: 'again' }))
		expect(context.previous()).toHaveLength(1)
	})

	it('throws DESTROYED after destroy, idempotently', () => {
		const context = new InterpretContext()
		context.add(buildInterpretation())
		context.destroy()
		context.destroy()
		const error = captureError(() => context.previous())
		expect(isInterpretError(error) && error.code === 'DESTROYED').toBe(true)
	})
})
