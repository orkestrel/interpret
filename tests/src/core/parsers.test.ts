import { parseRecipe } from '@src/core'
import { describe, expect, it } from 'vitest'
import { buildInterpretRecipe } from '../../setup.js'

// The interprets coercers — `parse*` returns `T | undefined` off-shape and
// never throws, so JSON intake stays total at the boundary.

describe('parseRecipe', () => {
	it('parses a valid JSON recipe and rejects invalid JSON / off-shape data', () => {
		const recipe = buildInterpretRecipe()
		expect(parseRecipe(JSON.stringify(recipe))).toEqual(recipe)
		expect(parseRecipe('not json')).toBeUndefined()
		expect(parseRecipe('{"id":"t1"}')).toBeUndefined()
	})
})
