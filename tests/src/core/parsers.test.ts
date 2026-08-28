import { parseTemplate } from '@src/core'
import { describe, expect, it } from 'vitest'
import { buildInterpretTemplate } from '../../setup.js'

// The interprets coercers — `parse*` returns `T | undefined` off-shape and
// never throws, so JSON intake stays total at the boundary.

describe('parseTemplate', () => {
	it('parses a valid JSON template and rejects invalid JSON / off-shape data', () => {
		const template = buildInterpretTemplate()
		expect(parseTemplate(JSON.stringify(template))).toEqual(template)
		expect(parseTemplate('not json')).toBeUndefined()
		expect(parseTemplate('{"id":"t1"}')).toBeUndefined()
	})
})
