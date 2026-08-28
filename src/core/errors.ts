import type { InterpretErrorCode } from './types.js'

// Misuse of the interprets layer `throw`s an `InterpretError` carrying a
// machine-readable `code`, so a `catch` branches on `error.code`.

/**
 * An error thrown by the interprets layer.
 *
 * @remarks
 * Two codes throw: `INVALID_TEMPLATE`, when `createTemplate` is handed data
 * that fails `isTemplate`, and `DESTROYED`, on any use of a destroyed
 * `Interpret` / manager / context. Every other {@link InterpretErrorCode}
 * reaches a caller as data rather than as a throw — `NO_TEMPLATE` and
 * `LOW_CONFIDENCE` on a visible incomplete {@link Interpretation}, and the
 * five per-stage `*_FAILED` codes on that result's `failures`, beside the
 * raw thrown value re-emitted as `error`. `context` carries structured
 * detail when a throw site supplies one; the throw sites in this package
 * supply none.
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
		this.name = 'InterpretError'
		this.code = code
		if (context !== undefined) this.context = context
	}
}

/**
 * Narrow an unknown caught value to an {@link InterpretError}.
 *
 * @param value - The value to test (typically a `catch` binding)
 * @returns `true` when `value` is an {@link InterpretError}
 *
 * @example
 * ```ts
 * import { isInterpretError } from '@src/core'
 *
 * try {
 * 	interpret.template('missing')
 * } catch (error) {
 * 	if (isInterpretError(error) && error.code === 'DESTROYED') return
 * }
 * ```
 */
export function isInterpretError(value: unknown): value is InterpretError {
	return value instanceof InterpretError
}
