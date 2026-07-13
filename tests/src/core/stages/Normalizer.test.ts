import { Normalizer } from '@src/core'
import { describe, expect, it } from 'vitest'

// The `Normalizer` stage — AGENTS §16: same inputs → same outputs, so every
// scenario double-invokes to pin run-twice determinism directly.

describe('Normalizer', () => {
	it('merges caller maps OVER the neutral built-in defaults', () => {
		const normalizer = new Normalizer({ corrections: { teh: 'the' } })
		const result = normalizer.normalize("can't teh stop")
		expect(result.text).toBe('cannot the stop')
		expect(result.changes).toEqual([
			{ from: "can't", to: 'cannot' },
			{ from: 'teh', to: 'the' },
		])
	})

	it('applies contractions → abbreviations → corrections, in that pinned order', () => {
		const normalizer = new Normalizer({
			abbreviations: { yr: 'year' },
			corrections: { cannot: 'CANNOT' },
		})
		// "can't" expands to "cannot" via the built-in contraction FIRST, so the
		// later correction stage (targeting "cannot") sees the already-expanded
		// text and fires too — proving sequencing, not just independent maps.
		const result = normalizer.normalize("can't wait 1 yr")
		expect(result.text).toBe('CANNOT wait 1 year')
		expect(result.changes.map((change) => change.from)).toEqual(["can't", 'yr', 'cannot'])
	})

	it('is word-boundary safe — "in" never matches inside "information"', () => {
		const normalizer = new Normalizer({ corrections: { in: 'IN' } })
		expect(normalizer.normalize('information about in').text).toBe('information about IN')
	})

	it('collapses whitespace after every substitution, with no change entry for it', () => {
		const normalizer = new Normalizer()
		const result = normalizer.normalize('  a    b  ')
		expect(result.text).toBe('a b')
		expect(result.changes).toEqual([])
	})

	it('records no changes when no map key matches', () => {
		const normalizer = new Normalizer()
		const result = normalizer.normalize('hello world')
		expect(result.text).toBe('hello world')
		expect(result.changes).toEqual([])
	})

	it('is deterministic across repeated calls', () => {
		const normalizer = new Normalizer({ corrections: { teh: 'the' } })
		const text = "can't teh stop"
		expect(normalizer.normalize(text)).toEqual(normalizer.normalize(text))
	})
})
