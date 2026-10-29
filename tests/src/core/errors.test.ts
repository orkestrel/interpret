import { describe, expect, it } from 'vitest'
import { isInterpretError, InterpretError } from '@src/core'
import { createCallableInterpretContext, InterpretContextFixture } from '../../setup.js'

describe('interpret error context types', () => {
	it('accepts a class-instance context', () => {
		const error = new InterpretError('DESTROYED', 'failure')
		Object.defineProperty(error, 'context', { value: new InterpretContextFixture() })
		expect(isInterpretError(error)).toBe(true)
	})

	it('accepts a callable context', () => {
		const error = new InterpretError('DESTROYED', 'failure')
		Object.defineProperty(error, 'context', { value: createCallableInterpretContext() })
		expect(isInterpretError(error)).toBe(true)
	})
})
