import type { InterpretErrorCode } from './types.js'

// AGENTS §12: misuse of the interprets layer `throw`s an `InterpretError`
// carrying a machine-readable `code`, so a `catch` branches on `error.code`.

/**
 * An error thrown by the interprets layer.
 *
 * @remarks
 * Thrown for: an injected stage implementation throwing during its phase
 * (`NORMALIZE_FAILED` / `EXTRACT_FAILED` / `CLARIFY_FAILED` /
 * `FORMAT_FAILED` / `GENERATE_FAILED`), `createTemplate` handed data that
 * fails `isTemplate` (`INVALID_TEMPLATE`), and any use of a destroyed
 * `Interpret` / manager / context (`DESTROYED`). `NO_TEMPLATE` and
 * `LOW_CONFIDENCE` never throw — they surface as a visible incomplete
 * {@link Interpretation} instead (never an arbitrary fallback template).
 * `context`, when present, carries the offending stage / template id.
 */
export class InterpretError extends Error {
	readonly code: InterpretErrorCode
	readonly context?: Readonly<Record<string, unknown>>

	constructor(
		code: InterpretErrorCode,
		message: string,
		context?: Readonly<Record<string, unknown>>,
	) {
		super(message)
		this.name = 'InterpretError'
		this.code = code
		this.context = context
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
