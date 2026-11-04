import type { ContractShape } from '@orkestrel/contract'
import type { Entity, EntityMapping } from './types.js'
import { EntityCompiler } from './EntityCompiler.js'

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
