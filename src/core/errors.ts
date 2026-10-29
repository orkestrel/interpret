import type { InterpretErrorCode } from './types.js'
import { holds, INTRINSICS, isError, isFunction, isObject } from '@orkestrel/contract'

// Misuse of the interprets layer `throw`s an `InterpretError` carrying a
// machine-readable `code`, so a `catch` branches on `error.code`.

/**
 * Represents an error thrown by the interprets layer, carrying an
 * {@link InterpretErrorCode} and an optional `context` record.
 *
 * @remarks
 * `DESTROYED` is the code that throws, on any use of a destroyed `Interpret`
 * / manager / context. Every other {@link InterpretErrorCode} reaches a caller
 * as data rather than as a throw — `NO_TEMPLATE` and `LOW_CONFIDENCE` on a
 * visible incomplete {@link Interpretation}, and the per-stage `*_FAILED`
 * codes on that result's `failures`, beside the raw thrown value re-emitted
 * as `error`. `context` carries structured detail when a throw site supplies
 * one; the throw sites in this package supply none.
 */
export class InterpretError extends Error {
	readonly code: InterpretErrorCode
	declare readonly context?: Readonly<Record<string, unknown>>

	constructor(
		code: InterpretErrorCode,
		message: string,
		context?: Readonly<Record<string, unknown>>,
	) {
		super(message)
		INTRINSICS.define(this, Symbol.for('@orkestrel/interpret.InterpretError'), { value: this })
		this.name = 'InterpretError'
		this.code = code
		if (context !== undefined) this.context = context
	}
}

/**
 * Narrows an unknown caught value to an {@link InterpretError}.
 *
 * @remarks
 * Recognizes branded errors across package copies, including subclasses, and refuses transparent proxies.
 *
 * @param value - The value to test (typically a `catch` binding)
 * @returns True if `value` is an {@link InterpretError}; false otherwise
 *
 * @example
 * ```ts
 * import { isInterpretError } from '@orkestrel/interpret'
 *
 * try {
 * 	interpret.template('missing')
 * } catch (error) {
 * 	if (isInterpretError(error) && error.code === 'DESTROYED') return
 * }
 * ```
 */
export function isInterpretError(value: unknown): value is InterpretError {
	return holds(() => {
		if (!isError(value) || INTRINSICS.prototype(value) === Error.prototype) return false
		const brand = INTRINSICS.describe(value, Symbol.for('@orkestrel/interpret.InterpretError'))
		if (brand === undefined || brand.value !== value) return false
		const code: unknown = INTRINSICS.reflect.read(value, 'code')
		if (
			code !== 'NORMALIZE_FAILED' &&
			code !== 'EXTRACT_FAILED' &&
			code !== 'CLARIFY_FAILED' &&
			code !== 'FORMAT_FAILED' &&
			code !== 'GENERATE_FAILED' &&
			code !== 'NO_TEMPLATE' &&
			code !== 'LOW_CONFIDENCE' &&
			code !== 'DESTROYED'
		)
			return false
		const context: unknown = INTRINSICS.reflect.read(value, 'context')
		return context === undefined || isObject(context) || isFunction(context)
	})
}
