import type { ComputedField, EntityMapping, FieldDefault, Template } from './types.js'
import { arrayOf, isBoolean, isString, notOf, recordOf, unionOf } from '@orkestrel/contract'
import { isDefinition, isFieldPath, isSymbolicExpression } from '@orkestrel/reason'

// AGENTS §14: every guard here is a TOTAL function — adversarial input (junk,
// hostile prototypes, cyclic/deep nesting) returns `false`, never throws.
// Every record guard is EXACT (`recordOf`): an extra key fails. `isTemplate`
// composes reasons' exported `isSymbolicExpression` (already recursive
// through `lazyOf`) and `isDefinition` rather than minting local duplicates —
// a second `isSymbolicExpression` would collide under the shared `@src/core`
// barrel's `export *` (TypeScript silently drops BOTH conflicting star
// re-exports), breaking reasons' own guard and failing the AGENTS §22 parity
// gate. `interprets` therefore owns no recursive expression guard of its own.

/**
 * Determine whether a value is an {@link EntityMapping} — a literal
 * alias-phrase extraction rule pointing at a subject field.
 *
 * @param value - The value to test
 * @returns `true` when `value` is a well-formed entity mapping
 *
 * @example
 * ```ts
 * import { isEntityMapping } from '@src/core'
 *
 * isEntityMapping({ entity: 'age', aliases: ['years old'], field: 'age' }) // true
 * isEntityMapping({ entity: 'age', aliases: [/\d+/], field: 'age' })      // false — RegExp alias
 * ```
 */
export function isEntityMapping(value: unknown): value is EntityMapping {
	return recordOf(
		{
			entity: isString,
			aliases: arrayOf(isString),
			field: isFieldPath,
			required: isBoolean,
		},
		['required'],
	)(value)
}

/**
 * Determine whether a value is a {@link FieldDefault} — a fallback value a
 * {@link Template} fills onto an unresolved field.
 *
 * @remarks
 * `value` is unconstrained (any value, including `null` or `undefined`) as
 * long as the key is present — the trivially-true guard `notOf(unionOf())`
 * mirrors the reasons `Check.value` precedent.
 *
 * @param value - The value to test
 * @returns `true` when `value` is a well-formed field default
 *
 * @example
 * ```ts
 * import { isFieldDefault } from '@src/core'
 *
 * isFieldDefault({ field: 'term', value: 12 })   // true
 * isFieldDefault({ field: 'term' })               // false — value missing
 * ```
 */
export function isFieldDefault(value: unknown): value is FieldDefault {
	return recordOf({ field: isFieldPath, value: notOf(unionOf()) })(value)
}

/**
 * Determine whether a value is a {@link ComputedField} — a declaratively
 * computed field carrying a reasons {@link SymbolicExpression} tree.
 *
 * @param value - The value to test
 * @returns `true` when `value` is a well-formed computed field
 *
 * @example
 * ```ts
 * import { constant, operation, variable } from '@orkestrel/reason'
 * import { isComputedField } from '@src/core'
 *
 * isComputedField({
 * 	field: 'monthly',
 * 	expression: operation('divide', variable('deductible'), constant(12)),
 * }) // true
 * isComputedField({ field: 'monthly', expression: { form: 'variable' } }) // false — name missing
 * ```
 */
export function isComputedField(value: unknown): value is ComputedField {
	return recordOf({ field: isFieldPath, expression: isSymbolicExpression })(value)
}

/**
 * Determine whether a value is a {@link Template} — a named, versionable
 * interpretation template.
 *
 * @remarks
 * `definition` is validated with reasons' `isDefinition` — a `Template`'s
 * definition is already expressed in terrain reasons vocabulary, so no
 * parallel interprets-owned definition guard exists.
 *
 * @param value - The value to test
 * @returns `true` when `value` is a well-formed template
 *
 * @example
 * ```ts
 * import { factorGroup, fieldFactor, quantitativeDefinition } from '@orkestrel/reason'
 * import { isTemplate } from '@src/core'
 *
 * isTemplate({
 * 	id: 't1',
 * 	name: 'Arithmetic',
 * 	domain: 'arithmetic',
 * 	intents: ['calculate'],
 * 	mappings: [],
 * 	defaults: [],
 * 	computations: [],
 * 	definition: quantitativeDefinition('t1', 'Arithmetic', [
 * 		factorGroup('total', 'sum', [fieldFactor('value', 'value')]),
 * 	]),
 * }) // true
 * isTemplate({ id: 't1' }) // false — most fields missing
 * ```
 */
export function isTemplate(value: unknown): value is Template {
	return recordOf({
		id: isString,
		name: isString,
		domain: isString,
		intents: arrayOf(isString),
		mappings: arrayOf(isEntityMapping),
		defaults: arrayOf(isFieldDefault),
		computations: arrayOf(isComputedField),
		definition: isDefinition,
	})(value)
}
