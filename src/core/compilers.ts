import type { ContractShape } from '@orkestrel/contract'
import type { Entity, EntityMapping, ReadNumber } from './types.js'
import { EntityCompiler } from './EntityCompiler.js'
import { NumberReader } from './NumberReader.js'

/**
 * Assigns exact reader occurrences to a matched recipe's entity mappings.
 *
 * @remarks
 * The rightmost exactly matching entity or alias token anchors each mapping; fuzzy aliases
 * claim nothing. A number must sit beside its anchor with only `is`, `of`, `at`, `to`, `=`,
 * or `:` between them. An article also links when the number follows the anchor.
 * Negation in the clause refuses every claim there. Equal-distance numbers or competing
 * anchors tied for a number leave it unclaimed. An unreadable occurrence never fills a field.
 * An anchor tied between numbers still contests both. A number directly followed by a word
 * that starts no declared anchor and is not `is`, `of`, `at`, `to`, `a`, `an`, or `the` asks,
 * both in scalar assignment and array collection; punctuation or the text's end does not refuse it.
 * When the text contains `sorry` (except `sorry to/for`), `hang on`, `used to be`, or
 * `was/were going to be`, suspect or changed occurrences ask without substituting a rival.
 * A sole array mapping collects values only after an anchor claims a number, and refuses
 * collection when any occurrence is unreadable or refused by that correction rule. Other array mappings receive
 * one anchored value. Unclaimed occurrences reach the clarifier as question candidates.
 * Runs after recipe selection; extraction remains recipe-agnostic.
 *
 * @param numbers - The occurrences from `scanNumbers(text)`, including their spans and flags
 * @param mappings - The matched recipe's entity mappings
 * @param text - The same text the occurrences index
 * @param shape - The recipe's shape, which says which field holds many
 * @returns The assigned entities, one per filled mapping
 *
 * @example
 * ```ts
 * import { numberShape, objectShape } from '@orkestrel/contract'
 * import { assignEntities, scanNumbers } from '@orkestrel/interpret'
 *
 * const shape = objectShape({ age: numberShape(), score: numberShape() })
 * const mappings = [
 * 	{ entity: 'age', aliases: ['years old'], field: 'age' },
 * 	{ entity: 'score', aliases: ['credit score'], field: 'score' },
 * ]
 * assignEntities(scanNumbers('age 25 with score 720'), mappings, 'age 25 with score 720', shape)
 * // [{ name: 'score', value: 720, ... }]
 * // The unbound word `with` leaves age to ask.
 * ```
 */
export function assignEntities(
	numbers: readonly ReadNumber[],
	mappings: readonly EntityMapping[],
	text: string,
	shape: ContractShape,
): readonly Entity[] {
	return new EntityCompiler().execute(numbers, mappings, text, shape)
}

/**
 * Reads every number in a text exactly, or says why it cannot.
 *
 * @remarks
 * Digits, shorthand, and word forms read to a value, and each number carries its span and what
 * the words around it say. It never assigns a number to a field: read this beside a recipe, and a
 * check that a proposed value appears here is exact where `extractNumbers` reads digits only.
 *
 * @param text - The text to read
 * @returns Every number, in the order written
 *
 * @example
 * ```ts
 * import { scanNumbers } from '@orkestrel/interpret'
 *
 * scanNumbers('$75k at 6%').map((number) => number.value) // [75000, 6]
 * scanNumbers('twelve fifty')[0]?.unreadable               // 'spoken'
 * scanNumbers('call 555-0142')[0]?.foreign                 // 'phone'
 * ```
 */
export function scanNumbers(text: string): readonly ReadNumber[] {
	return new NumberReader().read(text)
}
