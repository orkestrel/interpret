import type {
	Ambiguity,
	ComputedField,
	Entity,
	EntityMapping,
	FamilyDerivation,
	FamilyFinding,
	FamilyLine,
	FamilyLineResult,
	FamilyNotice,
	FamilyPremise,
	FamilyProgram,
	FamilyProgramResult,
	FamilyQualification,
	FamilyQualificationResult,
	FamilyRating,
	FamilyRatingResult,
	FamilyRuling,
	FamilyWorksheet,
	FamilyWorksheetFactor,
	FamilyWorksheetGroup,
	FieldMapping,
	FrameName,
	Glossary,
	Intent,
	Interpretation,
	LexiconInput,
	NumberRefusal,
	NumberRefusals,
	Provenance,
	StageFailure,
	StageRecord,
	Recipe,
} from './types.js'
import {
	arrayOf,
	holds,
	isAuditFault,
	isBoolean,
	isNumber,
	isNonNegativeInteger,
	whereOf,
	isString,
	literalOf,
	objectOf,
	recordOf,
	unionOf,
} from '@orkestrel/contract'
import {
	isCheckState,
	isContractShape,
	isDefinition,
	isFieldPath,
	isLogicalDefinition,
	isQuantitativeDefinition,
	isSymbolicExpression,
} from '@orkestrel/reason'
import {
	FRAME_SLOTS,
	INTERPRET_ERROR_CODES,
	INTERPRET_STAGES,
	PROVENANCE_CATEGORIES,
	NUMBER_REFUSAL_LIMIT,
	NUMBER_REFUSAL_REASONS,
	NUMBER_UNREADABLE_REASONS,
} from './constants.js'
import { scanGlossary, scanLexicon } from './helpers.js'

// Every guard here is a total function — adversarial input (junk, hostile
// prototypes, cyclic/deep nesting) returns `false`, never throws.
// Input-record guards are exact (`recordOf`): an extra key fails. Foreign
// result guards are open (`objectOf`): unknown members, class instances, and
// prototype accessors pass when the published members conform. `isRecipe`
// composes reasons' exported `isSymbolicExpression` (already recursive
// through `lazyOf`) and `isDefinition` rather than minting local duplicates —
// a second `isSymbolicExpression` would collide under the shared `@src/core`
// barrel's `export *` (TypeScript silently drops both conflicting star
// re-exports), breaking reasons' own guard and failing the guides-parity
// gate. `interprets` therefore owns no recursive expression guard of its own.

/**
 * Determines whether a value is an exact {@link EntityMapping} input
 * record — a literal alias-phrase extraction rule pointing at a subject
 * field.
 *
 * @param value - The value to test
 * @returns True if `value` is a well-formed entity mapping; false otherwise
 *
 * @example
 * ```ts
 * import { isEntityMapping } from '@orkestrel/interpret'
 *
 * isEntityMapping({ entity: 'age', aliases: ['years old'], field: 'age' }) // true
 * isEntityMapping({ entity: 'age', aliases: [/\d+/], field: 'age' })      // false — RegExp alias
 * ```
 */
export function isEntityMapping(value: unknown): value is EntityMapping {
	return recordOf({
		entity: isString,
		aliases: arrayOf(isString),
		field: isFieldPath,
	})(value)
}

/**
 * Determines whether a value is an exact {@link ComputedField} input record —
 * a declaratively computed field carrying a reasons
 * {@link SymbolicExpression} tree.
 *
 * @param value - The value to test
 * @returns True if `value` is a well-formed computed field; false otherwise
 *
 * @example
 * ```ts
 * import { createConstant, createOperation, createVariable } from '@orkestrel/reason'
 * import { isComputedField } from '@orkestrel/interpret'
 *
 * isComputedField({
 * 	field: 'monthly',
 * 	expression: createOperation('divide', createVariable('deductible'), createConstant(12)),
 * }) // true
 * isComputedField({ field: 'monthly', expression: { form: 'variable' } }) // false — name missing
 * ```
 */
export function isComputedField(value: unknown): value is ComputedField {
	return recordOf({ field: isFieldPath, expression: isSymbolicExpression })(value)
}

/**
 * Determines whether a value is an exact {@link Recipe} input record — a
 * named, versionable interpretation recipe.
 *
 * @remarks
 * `definition` is validated with reasons' `isDefinition` — a `Recipe`'s
 * definition is already expressed in terrain reasons vocabulary, so no
 * parallel interprets-owned definition guard exists. Each computation's
 * `expression` is validated with reasons' `isSymbolicExpression`, already
 * recursive through `lazyOf`, so this module mints no expression guard of its
 * own.
 *
 * @param value - The value to test
 * @returns True if `value` is a well-formed recipe; false otherwise
 *
 * @example
 * ```ts
 * import { objectShape } from '@orkestrel/contract'
 * import { createFactorGroup, createFieldFactor, createQuantitativeDefinition } from '@orkestrel/reason'
 * import { isRecipe } from '@orkestrel/interpret'
 *
 * isRecipe({
 * 	id: 't1',
 * 	name: 'Arithmetic',
 * 	domain: 'arithmetic',
 * 	intents: ['calculate'],
 * 	mappings: [],
 * 	shape: objectShape({}),
 * 	computations: [],
 * 	definition: createQuantitativeDefinition('t1', 'Arithmetic', [
 * 		createFactorGroup('total', 'sum', [createFieldFactor('value', 'value')]),
 * 	]),
 * }) // true
 * isRecipe({ id: 't1' }) // false — most fields missing
 * ```
 */
export function isRecipe(value: unknown): value is Recipe {
	return recordOf({
		id: isString,
		name: isString,
		domain: isString,
		intents: arrayOf(isString),
		mappings: arrayOf(isEntityMapping),
		computations: arrayOf(isComputedField),
		definition: isDefinition,
		shape: isContractShape,
	})(value)
}

/**
 * Determines whether a value is an open {@link Provenance} result record.
 *
 * @remarks
 * `category` is checked against `PROVENANCE_CATEGORIES` and the optional
 * `detail` against `isString`; an unknown member passes, because a foreign
 * engine's return is not this package's to narrow.
 *
 * @param value - The value to test
 * @returns True if the published provenance members conform; false otherwise
 *
 * @example
 * ```ts
 * import { isProvenance } from '@orkestrel/interpret'
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
 * Determines whether a value is an open {@link Intent} result record.
 *
 * @param value - The value to test
 * @returns True if the published intent members conform; false otherwise
 *
 * @remarks
 * `action` and `domain` are optional, because `classifyIntent` leaves an
 * unmatched axis absent — an intent carrying neither still conforms.
 *
 * @example
 * ```ts
 * import { isIntent } from '@orkestrel/interpret'
 *
 * isIntent({ action: 'calculate', domain: 'arithmetic', confidence: 1, metadata: true }) // true
 * isIntent({ confidence: 0 })                                                            // true
 * isIntent({ action: 'calculate', domain: 'arithmetic', confidence: 'high' })             // false
 * ```
 */
export function isIntent(value: unknown): value is Intent {
	return objectOf({ action: isString, domain: isString, confidence: isNumber }, [
		'action',
		'domain',
	])(value)
}

/**
 * Determines whether a value is an open {@link Entity} result record.
 *
 * @remarks
 * `value` is not checked because its published type is `unknown`, and because
 * `objectOf` reads members rather than own keys, an absent `value` also passes.
 *
 * @param value - The value to test
 * @returns True if every checked entity member conforms; false otherwise
 *
 * @example
 * ```ts
 * import { isEntity } from '@orkestrel/interpret'
 *
 * isEntity({ name: 'age', value: 25, provenance: { category: 'extracted' }, confidence: 1 }) // true
 * isEntity({ name: 'age', provenance: { category: 'external' }, confidence: 1 })             // false
 * ```
 */
export function isEntity(value: unknown): value is Entity {
	return objectOf(
		{ name: isString, field: isFieldPath, provenance: isProvenance, confidence: isNumber },
		['field'],
	)(value)
}

/**
 * Determines whether a value is an open {@link FieldMapping} result record.
 *
 * @remarks
 * `value` is not checked because its published type is `unknown`, and because
 * `objectOf` reads members rather than own keys, an absent `value` also passes.
 *
 * @param value - The value to test
 * @returns True if every checked field-mapping member conforms; false otherwise
 *
 * @example
 * ```ts
 * import { isFieldMapping } from '@orkestrel/interpret'
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
 * Determines whether a value is an open {@link Ambiguity} result record.
 *
 * @remarks
 * `field`, `question`, the string `candidates` list, `required`, and an optional
 * `fault` are each checked; an unknown member passes.
 *
 * @param value - The value to test
 * @returns True if the published ambiguity members conform; false otherwise
 *
 * @example
 * ```ts
 * import { isAmbiguity } from '@orkestrel/interpret'
 *
 * isAmbiguity({ field: 'age', question: 'Which age?', candidates: ['25'], required: true }) // true
 * isAmbiguity({ field: 'age', question: 'Which age?', candidates: [25], required: true })   // false
 * ```
 */
export function isAmbiguity(value: unknown): value is Ambiguity {
	return objectOf(
		{
			field: isFieldPath,
			question: isString,
			candidates: arrayOf(isString),
			required: isBoolean,
			fault: isAuditFault,
		},
		['fault'],
	)(value)
}

/**
 * Determines whether a value is an open {@link StageRecord} result record.
 *
 * @remarks
 * `input` and `output` are not checked because their published type is
 * `unknown`, and because `objectOf` reads members rather than own keys, an
 * absent `input` or `output` also passes.
 *
 * @param value - The value to test
 * @returns True if every checked stage-record member conforms; false otherwise
 *
 * @example
 * ```ts
 * import { isStageRecord } from '@orkestrel/interpret'
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
 * Determines whether a value is an open {@link StageFailure} result record.
 *
 * @remarks
 * `stage` is checked against `INTERPRET_STAGES`, `code` against
 * `INTERPRET_ERROR_CODES`, and `message` against `isString`; an unknown member
 * passes.
 *
 * @param value - The value to test
 * @returns True if the published stage-failure members conform; false otherwise
 *
 * @example
 * ```ts
 * import { isStageFailure } from '@orkestrel/interpret'
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
 * Determines whether a value is an open {@link Interpretation} result record.
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
 * @returns True if every checked interpretation member conforms; false otherwise
 *
 * @example
 * ```ts
 * import { createInterpret, isInterpretation } from '@orkestrel/interpret'
 *
 * isInterpretation(createInterpret().interpret('unmatched text')) // true
 * isInterpretation({ text: 'incomplete' })                         // false
 * ```
 */
export function isInterpretation(value: unknown): value is Interpretation {
	return objectOf(
		{
			text: isString,
			refusals: isNumberRefusals,
			normalized: isString,
			intent: isIntent,
			recipe: isString,
			version: isNumber,
			entities: arrayOf(isEntity),
			subject: objectOf({}),
			definition: objectOf({}),
			mappings: arrayOf(isFieldMapping),
			ambiguities: arrayOf(isAmbiguity),
			repairs: arrayOf(isAuditFault),
			defaulted: arrayOf(isFieldPath),
			prompt: isString,
			stages: arrayOf(isStageRecord),
			failures: arrayOf(isStageFailure),
			confidence: isNumber,
			digest: isString,
		},
		['recipe', 'version', 'subject', 'definition', 'refusals'],
	)(value)
}

/**
 * Determines whether a value is a structurally valid refusal record.
 *
 * @remarks
 * Positions are nonnegative integers; this guard does not compare their order.
 * @param value - The value to test
 * @returns Whether the record conforms to `numberRefusalShape`
 * @example
 * ```ts
 * import { isNumberRefusal } from '@orkestrel/interpret'
 * isNumberRefusal({ text: '"3"', start: 6, end: 7, reason: 'unanchored' }) // true
 * ```
 */
export function isNumberRefusal(value: unknown): value is NumberRefusal {
	return recordOf(
		{
			text: isString,
			start: isNonNegativeInteger,
			end: isNonNegativeInteger,
			reason: literalOf(NUMBER_REFUSAL_REASONS),
			unreadable: literalOf(NUMBER_UNREADABLE_REASONS),
			word: isString,
			field: isFieldPath,
		},
		['unreadable', 'word', 'field'],
	)(value)
}

/**
 * Determines whether a value holds bounded refusal items and a valid omitted count.
 *
 * @param value - The value to test
 * @returns Whether the record conforms to `numberRefusalsShape`
 * @example
 * ```ts
 * import { isNumberRefusals } from '@orkestrel/interpret'
 * isNumberRefusals({ items: [], omitted: -1 }) // false
 * ```
 */
export function isNumberRefusals(value: unknown): value is NumberRefusals {
	return recordOf({
		items: whereOf(arrayOf(isNumberRefusal), (items) => items.length <= NUMBER_REFUSAL_LIMIT),
		omitted: isNonNegativeInteger,
	})(value)
}

/**
 * Determines whether a value names a frame of a {@link Lexicon}.
 *
 * @param value - The value to test
 * @returns True if `value` is a {@link FrameName}; false otherwise
 *
 * @example
 * ```ts
 * import { isFrameName } from '@orkestrel/interpret'
 *
 * isFrameName('rule.settled') // true
 * isFrameName('toString') // false
 * ```
 */
export function isFrameName(value: unknown): value is FrameName {
	return isString(value) && Object.hasOwn(FRAME_SLOTS, value)
}

/**
 * Determines whether a value is an override of the general words that {@link scanLexicon} finds
 * nothing in.
 *
 * @param value - The value to test
 * @returns True if `value` is a well-formed {@link LexiconInput}; false otherwise
 *
 * @example
 * ```ts
 * import { isLexiconInput } from '@orkestrel/interpret'
 *
 * isLexiconInput({ rules: { met: 'applies' } }) // true
 * isLexiconInput({ rules: { meet: 'applies' } }) // false
 * ```
 */
export function isLexiconInput(value: unknown): value is LexiconInput {
	return holds(() => scanLexicon(value).length === 0)
}

/**
 * Determines whether a value is a glossary that {@link scanGlossary} finds nothing in.
 *
 * @param value - The value to test
 * @returns True if `value` is a well-formed {@link Glossary}; false otherwise
 *
 * @example
 * ```ts
 * import { isGlossary } from '@orkestrel/interpret'
 *
 * isGlossary({ labels: { cost: 'Cost' } }) // true
 * isGlossary({ labels: { cost: '' } }) // false
 * ```
 */
export function isGlossary(value: unknown): value is Glossary {
	return holds(() => scanGlossary(value).length === 0)
}

// The family guards check the members an account reads and admit every other member. A pass, a
// rate, and an authority are definitions of `@orkestrel/reason`, so its guards admit them.

/**
 * Determines whether a value is a {@link FamilyPremise}, whatever other members it holds.
 *
 * @param value - The value to test
 * @returns True if every member an account reads conforms; false otherwise
 *
 * @example
 * ```ts
 * import { isFamilyPremise } from '@orkestrel/interpret'
 *
 * isFamilyPremise({ field: 'guests', actual: 8, state: 'met', comparison: 'to' }) // true
 * isFamilyPremise({ field: 'guests', state: 'open' }) // false
 * ```
 */
export function isFamilyPremise(value: unknown): value is FamilyPremise {
	return objectOf({ field: isFieldPath, state: isCheckState }, ['field', 'state'])(value)
}

/**
 * Determines whether a value is a {@link FamilyFinding}, whatever other members it holds.
 *
 * @param value - The value to test
 * @returns True if every member an account reads conforms; false otherwise
 *
 * @example
 * ```ts
 * import { isFamilyFinding } from '@orkestrel/interpret'
 *
 * isFamilyFinding({ id: 'noisy', effect: 'condition', state: 'met', premises: [] }) // true
 * isFamilyFinding({ id: 'noisy', effect: 'condition', state: 'met' }) // false
 * ```
 */
export function isFamilyFinding(value: unknown): value is FamilyFinding {
	return objectOf(
		{
			id: isString,
			effect: isString,
			state: isCheckState,
			pass: isString,
			rule: isString,
			scope: isString,
			message: isString,
			premises: arrayOf(isFamilyPremise),
		},
		['pass', 'rule', 'scope', 'message'],
	)(value)
}

/**
 * Determines whether a value is a {@link FamilyRuling}, whatever other members it holds.
 *
 * @param value - The value to test
 * @returns True if every member an account reads conforms; false otherwise
 *
 * @example
 * ```ts
 * import { isFamilyRuling } from '@orkestrel/interpret'
 *
 * isFamilyRuling({ id: 'noisy', pass: 'gates', rule: 'noisy', effect: 'condition' }) // true
 * isFamilyRuling({ id: 'noisy', pass: 'gates', rule: 'noisy' }) // false
 * ```
 */
export function isFamilyRuling(value: unknown): value is FamilyRuling {
	return objectOf(
		{
			id: isString,
			pass: isString,
			rule: isString,
			effect: isString,
			scope: isString,
			message: isString,
		},
		['scope', 'message'],
	)(value)
}

/**
 * Determines whether a value is a {@link FamilyQualification}, whatever other members it holds.
 *
 * @remarks
 * Each pass is checked with `isQuantitativeDefinition` or `isLogicalDefinition`, which admit no
 * undeclared member.
 *
 * @param value - The value to test
 * @returns True if every member an account reads conforms; false otherwise
 *
 * @example
 * ```ts
 * import { isFamilyQualification } from '@orkestrel/interpret'
 *
 * isFamilyQualification({ id: 'q', name: 'Booking', passes: [], metadata: {} }) // true
 * isFamilyQualification({ id: 'q', name: 'Booking' }) // false
 * ```
 */
export function isFamilyQualification(value: unknown): value is FamilyQualification {
	return objectOf(
		{
			id: isString,
			name: isString,
			description: isString,
			passes: arrayOf(unionOf(isQuantitativeDefinition, isLogicalDefinition)),
			rulings: arrayOf(isFamilyRuling),
		},
		['description', 'rulings'],
	)(value)
}

/**
 * Determines whether a value is a {@link FamilyDerivation}, whatever other members it holds.
 *
 * @param value - The value to test
 * @returns True if every member an account reads conforms; false otherwise
 *
 * @example
 * ```ts
 * import { isFamilyDerivation } from '@orkestrel/interpret'
 *
 * isFamilyDerivation({ id: 'load', value: 4, success: true }) // true
 * isFamilyDerivation({ id: 'load', success: true }) // false
 * ```
 */
export function isFamilyDerivation(value: unknown): value is FamilyDerivation {
	return objectOf({ id: isString, value: isNumber, success: isBoolean })(value)
}

/**
 * Determines whether a value is a {@link FamilyQualificationResult}, whatever other members it
 * holds.
 *
 * @param value - The value to test
 * @returns True if every member an account reads conforms; false otherwise
 *
 * @example
 * ```ts
 * import { isFamilyQualificationResult } from '@orkestrel/interpret'
 *
 * isFamilyQualificationResult({
 * 	id: 'q',
 * 	name: 'Booking',
 * 	eligibility: 'eligible',
 * 	scopes: {},
 * 	findings: [],
 * 	derivations: [],
 * 	success: true,
 * 	errors: [],
 * 	faults: [],
 * }) // true
 * isFamilyQualificationResult({ id: 'q' }) // false
 * ```
 */
export function isFamilyQualificationResult(value: unknown): value is FamilyQualificationResult {
	return objectOf({
		id: isString,
		name: isString,
		eligibility: isString,
		scopes: whereOf(objectOf({}), (scopes): scopes is Readonly<Record<string, string>> =>
			Object.getOwnPropertyNames(scopes).every((scope) => isString(Reflect.get(scopes, scope))),
		),
		findings: arrayOf(isFamilyFinding),
		derivations: arrayOf(isFamilyDerivation),
		success: isBoolean,
		errors: arrayOf(isString),
		faults: arrayOf(isAuditFault),
	})(value)
}

/**
 * Determines whether a value is a {@link FamilyLine}, whatever other members it holds.
 *
 * @remarks
 * The rate is checked with `isQuantitativeDefinition`, which admits no undeclared member.
 *
 * @param value - The value to test
 * @returns True if every member an account reads conforms; false otherwise
 *
 * @example
 * ```ts
 * import { createQuantitativeDefinition } from '@orkestrel/reason'
 * import { isFamilyLine } from '@orkestrel/interpret'
 *
 * isFamilyLine({ id: 'rent', name: 'Rent', rate: createQuantitativeDefinition('r', 'R', []) }) // true
 * isFamilyLine({ id: 'rent', name: 'Rent' }) // false
 * ```
 */
export function isFamilyLine(value: unknown): value is FamilyLine {
	return objectOf(
		{ id: isString, name: isString, description: isString, rate: isQuantitativeDefinition },
		['description'],
	)(value)
}

/**
 * Determines whether a value is a {@link FamilyRating}, whatever other members it holds.
 *
 * @param value - The value to test
 * @returns True if every member an account reads conforms; false otherwise
 *
 * @example
 * ```ts
 * import { isFamilyRating } from '@orkestrel/interpret'
 *
 * isFamilyRating({ id: 'r', name: 'Prices', lines: [], metadata: null }) // true
 * isFamilyRating({ id: 'r', name: 'Prices' }) // false
 * ```
 */
export function isFamilyRating(value: unknown): value is FamilyRating {
	return objectOf(
		{ id: isString, name: isString, description: isString, lines: arrayOf(isFamilyLine) },
		['description'],
	)(value)
}

/**
 * Determines whether a value is a {@link FamilyWorksheetFactor}, whatever other members it holds.
 *
 * @param value - The value to test
 * @returns True if every member an account reads conforms; false otherwise
 *
 * @example
 * ```ts
 * import { isFamilyWorksheetFactor } from '@orkestrel/interpret'
 *
 * isFamilyWorksheetFactor({ id: 'room', applied: true, value: 80, evidence: [] }) // true
 * isFamilyWorksheetFactor({ id: 'room', applied: true }) // false
 * ```
 */
export function isFamilyWorksheetFactor(value: unknown): value is FamilyWorksheetFactor {
	return objectOf(
		{ id: isString, applied: isBoolean, value: isNumber, evidence: arrayOf(isFamilyPremise) },
		['value'],
	)(value)
}

/**
 * Determines whether a value is a {@link FamilyWorksheetGroup}, whatever other members it holds.
 *
 * @param value - The value to test
 * @returns True if every member an account reads conforms; false otherwise
 *
 * @example
 * ```ts
 * import { isFamilyWorksheetGroup } from '@orkestrel/interpret'
 *
 * isFamilyWorksheetGroup({ id: 'hire', applied: true, value: 80, factors: [] }) // true
 * isFamilyWorksheetGroup({ id: 'hire', applied: true, value: 80 }) // false
 * ```
 */
export function isFamilyWorksheetGroup(value: unknown): value is FamilyWorksheetGroup {
	return objectOf({
		id: isString,
		applied: isBoolean,
		value: isNumber,
		factors: arrayOf(isFamilyWorksheetFactor),
	})(value)
}

/**
 * Determines whether a value is a {@link FamilyWorksheet}, whatever other members it holds.
 *
 * @param value - The value to test
 * @returns True if every member an account reads conforms; false otherwise
 *
 * @example
 * ```ts
 * import { isFamilyWorksheet } from '@orkestrel/interpret'
 *
 * isFamilyWorksheet({ value: 80, groups: [], success: true, errors: [], faults: [] }) // true
 * isFamilyWorksheet({ value: 80, groups: [], success: true }) // false
 * ```
 */
export function isFamilyWorksheet(value: unknown): value is FamilyWorksheet {
	return objectOf({
		value: isNumber,
		groups: arrayOf(isFamilyWorksheetGroup),
		success: isBoolean,
		errors: arrayOf(isString),
		faults: arrayOf(isAuditFault),
	})(value)
}

/**
 * Determines whether a value is a {@link FamilyLineResult}, whatever other members it holds.
 *
 * @param value - The value to test
 * @returns True if every member an account reads conforms; false otherwise
 *
 * @example
 * ```ts
 * import { isFamilyLineResult } from '@orkestrel/interpret'
 *
 * const worksheet = { value: 80, groups: [], success: true, errors: [], faults: [] }
 * isFamilyLineResult({ id: 'rent', name: 'Rent', amount: 80, worksheet }) // true
 * isFamilyLineResult({ id: 'rent', name: 'Rent', amount: '80', worksheet }) // false
 * ```
 */
export function isFamilyLineResult(value: unknown): value is FamilyLineResult {
	return objectOf(
		{ id: isString, name: isString, amount: isNumber, worksheet: isFamilyWorksheet },
		['amount'],
	)(value)
}

/**
 * Determines whether a value is a {@link FamilyRatingResult}, whatever other members it holds.
 *
 * @param value - The value to test
 * @returns True if every member an account reads conforms; false otherwise
 *
 * @example
 * ```ts
 * import { isFamilyRatingResult } from '@orkestrel/interpret'
 *
 * isFamilyRatingResult({ lines: [], success: true, faults: [], errors: [] }) // true
 * isFamilyRatingResult({ lines: [], success: true }) // false
 * ```
 */
export function isFamilyRatingResult(value: unknown): value is FamilyRatingResult {
	return objectOf(
		{
			lines: arrayOf(isFamilyLineResult),
			total: isNumber,
			success: isBoolean,
			faults: arrayOf(isAuditFault),
		},
		['total'],
	)(value)
}

/**
 * Determines whether a value is a {@link FamilyNotice}, whatever other members it holds.
 *
 * @param value - The value to test
 * @returns True if every member an account reads conforms; false otherwise
 *
 * @example
 * ```ts
 * import { isFamilyNotice } from '@orkestrel/interpret'
 *
 * isFamilyNotice({ id: 'close', message: 'The workshop closes at 18:00.' }) // true
 * isFamilyNotice({ id: 'close' }) // false
 * ```
 */
export function isFamilyNotice(value: unknown): value is FamilyNotice {
	return objectOf({ id: isString, message: isString, scope: isString }, ['scope'])(value)
}

/**
 * Determines whether a value is a {@link FamilyProgram}, whatever other members it holds.
 *
 * @remarks
 * The authority is checked with `isLogicalDefinition`, which admits no undeclared member.
 *
 * @param value - The value to test
 * @returns True if every member an account reads conforms; false otherwise
 *
 * @example
 * ```ts
 * import { isFamilyProgram } from '@orkestrel/interpret'
 *
 * const qualification = { id: 'q', name: 'Booking', passes: [] }
 * isFamilyProgram({ id: 'p', name: 'Program', qualification }) // true
 * isFamilyProgram({ id: 'p', name: 'Program' }) // false
 * ```
 */
export function isFamilyProgram(value: unknown): value is FamilyProgram {
	return objectOf(
		{
			id: isString,
			name: isString,
			description: isString,
			qualification: isFamilyQualification,
			rating: isFamilyRating,
			notices: arrayOf(isFamilyNotice),
			authority: isLogicalDefinition,
		},
		['description', 'rating', 'notices', 'authority'],
	)(value)
}

/**
 * Determines whether a value is a {@link FamilyProgramResult}, whatever other members it holds.
 *
 * @param value - The value to test
 * @returns True if every member an account reads conforms; false otherwise
 *
 * @example
 * ```ts
 * import { isFamilyProgramResult } from '@orkestrel/interpret'
 *
 * isFamilyProgramResult({
 * 	id: 'p',
 * 	name: 'Program',
 * 	eligibility: 'eligible',
 * 	status: 'eligible',
 * 	qualification: {
 * 		id: 'q',
 * 		name: 'Booking',
 * 		eligibility: 'eligible',
 * 		scopes: {},
 * 		findings: [],
 * 		derivations: [],
 * 		success: true,
 * 		errors: [],
 * 		faults: [],
 * 	},
 * 	determinations: [],
 * 	success: true,
 * 	errors: [],
 * 	faults: [],
 * }) // true
 * isFamilyProgramResult({ id: 'p' }) // false
 * ```
 */
export function isFamilyProgramResult(value: unknown): value is FamilyProgramResult {
	return objectOf(
		{
			id: isString,
			name: isString,
			eligibility: isString,
			status: isString,
			decision: isString,
			qualification: isFamilyQualificationResult,
			rating: isFamilyRatingResult,
			determinations: arrayOf(isFamilyFinding),
			success: isBoolean,
			errors: arrayOf(isString),
			faults: arrayOf(isAuditFault),
		},
		['decision', 'rating'],
	)(value)
}
