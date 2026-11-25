import { describe, expect, it } from 'vitest'
import { INTERPRET_ERROR_CODES, isInterpretError, InterpretError } from '@src/core'
import { createCallableInterpretContext, InterpretContextFixture } from '../../setup.js'

describe('interpret error context types', () => {
	it('accepts a class-instance context', () => {
		const error = new InterpretError('DESTROYED', 'failure')
		Object.defineProperty(error, 'context', { value: new InterpretContextFixture() })
		expect(isInterpretError(error)).toBe(true)
	})

	it('accepts every declared code', () => {
		for (const code of INTERPRET_ERROR_CODES) {
			expect(isInterpretError(new InterpretError(code, 'failure'))).toBe(true)
		}
		expect(INTERPRET_ERROR_CODES).toEqual(
			expect.arrayContaining(['LEXICON', 'GLOSSARY', 'INTERPRETATION', 'VERSION', 'AMENDMENT']),
		)
	})

	it('accepts a callable context', () => {
		const error = new InterpretError('DESTROYED', 'failure')
		Object.defineProperty(error, 'context', { value: createCallableInterpretContext() })
		expect(isInterpretError(error)).toBe(true)
	})
})
