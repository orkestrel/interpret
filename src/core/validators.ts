import type {
	Ambiguity,
	ComputedField,
	Entity,
	EntityMapping,
	FieldDefault,
	FieldMapping,
	Intent,
	Interpretation,
	Provenance,
	StageFailure,
	StageRecord,
	Template,
} from './types.js'
import {
	arrayOf,
	isBoolean,
	isNumber,
	isString,
	literalOf,
	notOf,
	objectOf,
	recordOf,
	unionOf,
} from '@orkestrel/contract'
import { isDefinition, isFieldPath, isSymbolicExpression } from '@orkestrel/reason'
import { INTERPRET_ERROR_CODES, INTERPRET_STAGES, PROVENANCE_CATEGORIES } from './constants.js'

// AGENTS §14: every guard here is a TOTAL function — adversarial input (junk,
// hostile prototypes, cyclic/deep nesting) returns `false`, never throws.
// Input-record guards are EXACT (`recordOf`): an extra key fails. Foreign
// result guards are OPEN (`objectOf`): unknown members, class instances, and
// prototype accessors pass when the published members conform. `isTemplate`
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

/**
 * Determine whether a value is an open {@link Provenance} result record.
 *
 * @param value - The value to test
 * @returns `true` when the published provenance members conform
 *
 * @example
 * ```ts
 * import { isProvenance } from '@src/core'
 *
 * isProvenance({ category: 'extracted', detail: 'alias', metadata: true }) // true
 * isProvenance({ category: 'external' })                                  // false
 * ```
 */
export function isProvenance(value: unknown): value is Provenance {
	return objectOf(
		{
			category: literalOf(PROVENANCE_CATEGORIES),
			detail: isString,
		},
		['detail'],
	)(value)
}

/**
 * Determine whether a value is an open {@link Intent} result record.
 *
 * @param value - The value to test
 * @returns `true` when the published intent members conform
 *
 * @example
 * ```ts
 * import { isIntent } from '@src/core'
 *
 * isIntent({ action: 'calculate', domain: 'arithmetic', confidence: 1, metadata: true }) // true
 * isIntent({ action: 'calculate', domain: 'arithmetic', confidence: 'high' })             // false
 * ```
 */
export function isIntent(value: unknown): value is Intent {
	return objectOf({ action: isString, domain: isString, confidence: isNumber })(value)
}

/**
 * Determine whether a value is an open {@link Entity} result record.
 *
 * @remarks
 * `value` is not checked because its published type is `unknown`, and because
 * `objectOf` reads members rather than own keys, an absent `value` also passes.
 *
 * @param value - The value to test
 * @returns `true` when every checked entity member conforms
 *
 * @example
 * ```ts
 * import { isEntity } from '@src/core'
 *
 * isEntity({ name: 'age', value: 25, provenance: { category: 'extracted' }, confidence: 1 }) // true
 * isEntity({ name: 'age', provenance: { category: 'external' }, confidence: 1 })             // false
 * ```
 */
export function isEntity(value: unknown): value is Entity {
	return objectOf({ name: isString, provenance: isProvenance, confidence: isNumber })(value)
}

/**
 * Determine whether a value is an open {@link FieldMapping} result record.
 *
 * @remarks
 * `value` is not checked because its published type is `unknown`, and because
 * `objectOf` reads members rather than own keys, an absent `value` also passes.
 *
 * @param value - The value to test
 * @returns `true` when every checked field-mapping member conforms
 *
 * @example
 * ```ts
 * import { isFieldMapping } from '@src/core'
 *
 * isFieldMapping({ field: 'age', provenance: { category: 'extracted' }, confidence: 1 }) // true
 * isFieldMapping({ field: [1], provenance: { category: 'extracted' }, confidence: 1 })   // false
 * ```
 */
export function isFieldMapping(value: unknown): value is FieldMapping {
	return objectOf(
		{
			field: isFieldPath,
			entity: isString,
			provenance: isProvenance,
			confidence: isNumber,
		},
		['entity'],
	)(value)
}

/**
 * Determine whether a value is an open {@link Ambiguity} result record.
 *
 * @param value - The value to test
 * @returns `true` when the published ambiguity members conform
 *
 * @example
 * ```ts
 * import { isAmbiguity } from '@src/core'
 *
 * isAmbiguity({ field: 'age', question: 'Which age?', candidates: ['25'], required: true }) // true
 * isAmbiguity({ field: 'age', question: 'Which age?', candidates: [25], required: true })   // false
 * ```
 */
export function isAmbiguity(value: unknown): value is Ambiguity {
	return objectOf({
		field: isFieldPath,
		question: isString,
		candidates: arrayOf(isString),
		required: isBoolean,
	})(value)
}

/**
 * Determine whether a value is an open {@link StageRecord} result record.
 *
 * @remarks
 * `input` and `output` are not checked because their published type is
 * `unknown`, and because `objectOf` reads members rather than own keys, an
 * absent `input` or `output` also passes.
 *
 * @param value - The value to test
 * @returns `true` when every checked stage-record member conforms
 *
 * @example
 * ```ts
 * import { isStageRecord } from '@src/core'
 *
 * isStageRecord({ stage: 'normalize', input: 'raw', output: 'clean', failed: false }) // true
 * isStageRecord({ stage: 'publish', failed: false })                                  // false
 * ```
 */
export function isStageRecord(value: unknown): value is StageRecord {
	return objectOf(
		{
			stage: literalOf(INTERPRET_STAGES),
			failed: isBoolean,
			error: isString,
		},
		['error'],
	)(value)
}

/**
 * Determine whether a value is an open {@link StageFailure} result record.
 *
 * @param value - The value to test
 * @returns `true` when the published stage-failure members conform
 *
 * @example
 * ```ts
 * import { isStageFailure } from '@src/core'
 *
 * isStageFailure({ stage: 'format', code: 'FORMAT_FAILED', message: 'failed' }) // true
 * isStageFailure({ stage: 'format', code: 'UNKNOWN', message: 'failed' })       // false
 * ```
 */
export function isStageFailure(value: unknown): value is StageFailure {
	return objectOf({
		stage: literalOf(INTERPRET_STAGES),
		code: literalOf(INTERPRET_ERROR_CODES),
		message: isString,
	})(value)
}

/**
 * Determine whether a value is an open {@link Interpretation} result record.
 *
 * @remarks
 * `subject` and `definition` receive shallow open-object checks. `Subject` is
 * an unconstrained foreign record, while `Definition` is a large foreign
 * discriminated union whose available `isDefinition` guard is exact. A deep
 * check would narrow the published result contract or repeat that dependency's
 * full union. Both members therefore admit any non-array object, including a
 * class instance, and reject primitives and arrays.
 *
 * @param value - The value to test
 * @returns `true` when every checked interpretation member conforms
 *
 * @example
 * ```ts
 * import { createInterpret, isInterpretation } from '@src/core'
 *
 * isInterpretation(createInterpret().interpret('unmatched text')) // true
 * isInterpretation({ text: 'incomplete' })                         // false
 * ```
 */
export function isInterpretation(value: unknown): value is Interpretation {
	return objectOf(
		{
			text: isString,
			normalized: isString,
			intent: isIntent,
			entities: arrayOf(isEntity),
			subject: objectOf({}),
			definition: objectOf({}),
			mappings: arrayOf(isFieldMapping),
			ambiguities: arrayOf(isAmbiguity),
			prompt: isString,
			stages: arrayOf(isStageRecord),
			failures: arrayOf(isStageFailure),
			complete: isBoolean,
			confidence: isNumber,
			digest: isString,
		},
		['subject', 'definition'],
	)(value)
}
