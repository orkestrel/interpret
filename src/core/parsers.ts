import type { Template } from './types.js'
import { parseJSONAs } from '@orkestrel/contract'
import { isTemplate } from './validators.js'

// The interprets coercer inventory — a `parse*` leaf returns `T | undefined`
// off-shape, never throwing, so JSON intake stays total at the boundary.

/**
 * Parses a JSON string into a `Template`, or `undefined` on invalid JSON or a
 * shape that fails `isTemplate`.
 *
 * @remarks
 * The module's sole JSON boundary — an `Interpretation` and the versioned
 * records are produced internally, never deserialized from untrusted JSON;
 * replay re-runs `interpret`, it does not deserialize a stored result. Intake
 * is total: an off-shape template returns `undefined` here, and a caller who
 * wants a throw raises its own error from that `undefined`.
 *
 * @param value - The JSON text to parse
 * @returns The parsed template, or `undefined`
 *
 * @example
 * ```ts
 * import { parseTemplate } from '@src/core'
 *
 * parseTemplate('not json') // undefined
 * ```
 */
export function parseTemplate(value: string): Template | undefined {
	return parseJSONAs(value, isTemplate)
}
