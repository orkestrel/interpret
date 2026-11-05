import type { ContractShape } from '@orkestrel/contract'
import type { Entity, EntityCompilation, EntityMapping, ReadNumber } from './types.js'
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
 * An anchor tied between numbers still contests both. A trailing colon permits only forward
 * claims. A backward claim refuses a preceding lone punctuation token, another number, or
 * the reader's hedge flag; `preceding-word` records that neighbor. Trailing sentence punctuation
 * on the previous number forms a boundary. A number's following neighbor must be the text's
 * end, a sentence end, a whole anchor, or a conditional link; otherwise scalar assignment and
 * array collection ask. A comma admits unless followed by a number. The links `is`, `of`, `at`,
 * `to`, `a`, `an`, `the`, `and`, and `with` require a declared whole anchor next, allowing one
 * article (`a`, `an`, or `the`); a numeric target refuses. Sentence punctuation must touch the
 * number and precede whitespace or the text's end. Other words, scripts, punctuation, and
 * adjacent numbers refuse with `following-word` and the immediate neighbor's preview in `word`.
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
 * // [{ name: 'age', value: 25, ... }, { name: 'score', value: 720, ... }]
 * // `with` keeps age because the declared score anchor follows it.
 * ```
 */
export function assignEntities(
	numbers: readonly ReadNumber[],
	mappings: readonly EntityMapping[],
	text: string,
	shape: ContractShape,
): readonly Entity[] {
	return compileEntities(numbers, mappings, text, shape).entities
}

/**
 * Compiles exact reader occurrences into entities and bounded refusal evidence.
 *
 * @remarks
 * Uses the same decisions as `assignEntities`, which returns only this result's entities.
 * Each unclaimed occurrence keeps its first recorded decision; a claimed occurrence keeps none.
 * Records follow input occurrence order. Only `NUMBER_REFUSAL_LIMIT` records are constructed,
 * with the rest counted in `omitted`; `refusals` is absent when there are none.
 * Text and neighboring words use the contract's `preview`. Positions address normalized text:
 * callers composing stages obtain it through `createNormalizer().normalize(text).text`.
 * No diagnosis beyond the decisions made by assignment is inferred.
 *
 * @param numbers - The occurrences read from the normalized text
 * @param mappings - The matched recipe's mappings
 * @param text - The normalized text indexed by the occurrences
 * @param shape - The recipe's subject shape
 * @returns The assigned entities and any bounded refusal records
 *
 * @example
 * ```ts
 * import { numberShape, objectShape } from '@orkestrel/contract'
 * import { compileEntities, createNormalizer, scanNumbers } from '@orkestrel/interpret'
 *
 * const text = createNormalizer().normalize('years 3 months').text
 * const result = compileEntities(scanNumbers(text), [{ entity: 'years', aliases: [], field: 'years' }], text, objectShape({ years: numberShape() }))
 * result.entities // []
 * result.refusals?.items[0]?.reason // 'following-word'
 * result.refusals?.items[0]?.start // 6
 * ```
 */
export function compileEntities(
	numbers: readonly ReadNumber[],
	mappings: readonly EntityMapping[],
	text: string,
	shape: ContractShape,
): EntityCompilation {
	return new EntityCompiler().execute(numbers, mappings, text, shape)
}

/**
 * Reads every number in a text exactly, or says why it cannot.
 *
 * @remarks
 * A digit-holding nonspace token must match a declared numeric form whole, less trailing
 * sentence punctuation; otherwise it carries `unreadable: 'undeclared'` and no value.
 * Declared digits, shorthand, and word forms read to a value, and each number carries its span and what
 * the words around it say. It never assigns a number to a field: read this beside a recipe, and a
 * check that a proposed value appears here is exact where `extractNumbers` reads digits only.
 * Fractions join plain numbers only; a fraction after a scaled number is unreadable.
 *
 * @param text - The text to read
 * @returns Every number, in the order written
 * @throws {@link InterpretError} with `TEXT_LIMIT` above {@link INTERPRET_TEXT_LIMIT} UTF-16 units.
 *
 * @example
 * ```ts
 * import { scanNumbers } from '@orkestrel/interpret'
 *
 * scanNumbers('$75k at 6%').map((number) => number.value) // [75000, 6]
 * scanNumbers('twelve fifty')[0]?.unreadable               // 'spoken'
 * scanNumbers('call 555-0142')[0]?.unreadable              // 'undeclared'
 * ```
 */
export function scanNumbers(text: string): readonly ReadNumber[] {
	return new NumberReader().read(text)
}
