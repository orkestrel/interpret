import type { ContractShape } from '@orkestrel/contract'
import type { Entity, EntityMapping, ReadNumber } from './types.js'
import { EntityCompiler } from './EntityCompiler.js'
import { NumberReader } from './NumberReader.js'

/**
 * Assigns already-extracted numbers to a matched recipe's entity mappings.
 *
 * @remarks
 * Strategy, in order: (1) a single mapping whose field's shape is an array collects
 * every number at `CONFIDENCE_COLLECT`. Otherwise, per mapping, the rightmost token in the text that equals the entity name
 * (`CONFIDENCE_EXACT`), an alias exactly (`CONFIDENCE_ALIAS`), or an alias
 * fuzzily (through `matchAlias`, confidence = its returned score) becomes a
 * keyword anchor; anchors sort left-to-right and each claims the number
 * `findAnchoredNumber` names, the nearest in its clause when no other sits as close.
 * A mapping with no such number stays unfilled, because position and distance across a
 * clause are guesses: `findUnclaimedNumbers` gives what is left, and `Clarifier` asks. A number landing on a field whose shape is an array
 * lands as an array of one. Every entity
 * carries provenance `category: 'extracted'` with `detail` naming the
 * strategy that filled it (`'collect' | 'keyword' | 'alias'`).
 * Runs only after a recipe has matched (an orchestrator-owned step, never
 * inside `Extractor`, which stays recipe-agnostic).
 *
 * @param numbers - The numbers already extracted from `text` through `extractNumbers`
 * @param mappings - The matched recipe's entity mappings
 * @param text - The same text `numbers` was extracted from (for keyword proximity)
 * @param similarity - The fuzzy alias-match score threshold (0..1)
 * @param shape - The recipe's shape, which says which field holds many
 * @returns The assigned entities, one per filled mapping
 *
 * @example
 * ```ts
 * import { numberShape, objectShape } from '@orkestrel/contract'
 * import { assignEntities } from '@orkestrel/interpret'
 *
 * const shape = objectShape({ age: numberShape(), score: numberShape() })
 * const mappings = [
 * 	{ entity: 'age', aliases: ['years old'], field: 'age' },
 * 	{ entity: 'score', aliases: ['credit score'], field: 'score' },
 * ]
 * assignEntities([25, 720], mappings, 'age 25 with score 720', 0.8, shape)
 * // [{ name: 'age', value: 25, ... }, { name: 'score', value: 720, ... }]
 * // — each anchor claims its nearest number, in text order
 * ```
 */
export function assignEntities(
	numbers: readonly number[],
	mappings: readonly EntityMapping[],
	text: string,
	similarity: number,
	shape: ContractShape,
): readonly Entity[] {
	return new EntityCompiler().execute(numbers, mappings, text, similarity, shape)
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
 * import { readNumbers } from '@orkestrel/interpret'
 *
 * readNumbers('$75k at 6%').map((number) => number.value) // [75000, 6]
 * readNumbers('twelve fifty')[0]?.unreadable               // 'spoken'
 * readNumbers('call 555-0142')[0]?.foreign                 // 'phone'
 * ```
 */
export function readNumbers(text: string): readonly ReadNumber[] {
	return new NumberReader().read(text)
}
