import { Normalizer, isInterpretError, INTERPRET_TEXT_LIMIT } from '@src/core'
import { captureError } from '@orkestrel/test'
import { describe, expect, it } from 'vitest'

// The `Normalizer` stage — `.claude/rules/tests.md` § Test contract: same
// inputs → same outputs, so every
// scenario double-invokes to pin run-twice determinism directly.

describe('Normalizer', () => {
	it('accepts the UTF-16 boundary and refuses one unit beyond before whitespace cleanup', () => {
		const normalizer = new Normalizer()
		expect(INTERPRET_TEXT_LIMIT).toBe(65_536)
		const boundary = '😀'.repeat(32_768)
		expect(normalizer.normalize(boundary).text).toBe(boundary)
		const error = captureError(() => normalizer.normalize(`${boundary} `))
		expect(isInterpretError(error)).toBe(true)
		expect(error).toMatchObject({ code: 'TEXT_LIMIT' })
	})
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
		// "can't" expands to "cannot" through the built-in contraction FIRST, so the
		// later correction stage (targeting "cannot") sees the already-expanded
		// text and fires too — proving sequencing, not independent maps.
		const result = normalizer.normalize("can't wait 1 yr")
		expect(result.text).toBe('CANNOT wait 1 year')
		expect(result.changes.map((change) => change.from)).toEqual(["can't", 'yr', 'cannot'])
	})

	it('is word-boundary safe — "in" never matches inside "information"', () => {
		const normalizer = new Normalizer({ corrections: { in: 'IN' } })
		expect(normalizer.normalize('information about in').text).toBe('information about IN')
	})

	it('matches a map key holding regex metacharacters literally', () => {
		const normalizer = new Normalizer({ abbreviations: { 'e.g': 'for example' } })
		expect(normalizer.normalize('egg')).toEqual({ text: 'egg', changes: [] })
		expect(normalizer.normalize('see e.g this')).toEqual({
			text: 'see for example this',
			changes: [{ from: 'e.g', to: 'for example' }],
		})
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
