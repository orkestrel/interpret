import type { Recipe } from './types.js'
import { parseJSONAs } from '@orkestrel/contract'
import { isRecipe } from './validators.js'

// The interprets coercer inventory — a `parse*` leaf returns `T | undefined`
// off-shape, never throwing, so JSON intake stays total at the boundary.

/**
 * Parses a JSON string into a `Recipe`, or `undefined` on invalid JSON or a
 * shape that fails `isRecipe`.
 *
 * @remarks
 * The module's sole JSON boundary — an `Interpretation` and the versioned
 * records are produced internally, never deserialized from untrusted JSON;
 * replay re-runs `interpret`, it does not deserialize a stored result. Intake
 * is total: an off-shape recipe returns `undefined` here, and a caller who
 * wants a throw raises its own error from that `undefined`.
 *
 * @param value - The JSON text to parse
 * @returns The parsed recipe, or `undefined`
 *
 * @example
 * ```ts
 * import { parseRecipe } from '@orkestrel/interpret'
 *
 * parseRecipe('not json') // undefined
 * ```
 */
export function parseRecipe(value: string): Recipe | undefined {
	return parseJSONAs(value, isRecipe)
}
