import type { Entity, EntityMapping } from './types.js'
import { EntityCompiler } from './EntityCompiler.js'

/**
 * Assigns already-extracted numbers to a matched template's entity mappings.
 *
 * @remarks
 * Strategy, in order: (1) a single mapping collects every number (an array
 * when more than one, a scalar otherwise) at `CONFIDENCE_COLLECT`. Otherwise,
 * per mapping, the rightmost token in the text that equals the entity name
 * (`CONFIDENCE_EXACT`), an alias exactly (`CONFIDENCE_ALIAS`), or an alias
 * fuzzily (through `matchAlias`, confidence = its returned score) becomes a
 * keyword anchor; anchors sort left-to-right and each claims its nearest
 * unused number by text position. (3) Any mapping still unfilled claims the
 * next unused number positionally, at `CONFIDENCE_POSITIONAL`. Every entity
 * carries provenance `category: 'extracted'` with `detail` naming the
 * strategy that filled it (`'collect' | 'keyword' | 'alias' | 'positional'`).
 * Runs only after a template has matched (an orchestrator-owned step, never
 * inside `Extractor`, which stays template-agnostic).
 *
 * @param numbers - The numbers already extracted from `text` through `extractNumbers`
 * @param mappings - The matched template's entity mappings
 * @param text - The same text `numbers` was extracted from (for keyword proximity)
 * @param similarity - The fuzzy alias-match score threshold (0..1)
 * @returns The assigned entities, one per filled mapping
 *
 * @example
 * ```ts
 * import { assignEntities } from '@orkestrel/interpret'
 *
 * const mappings = [
 * 	{ entity: 'age', aliases: ['years old'], field: 'age' },
 * 	{ entity: 'score', aliases: ['credit score'], field: 'score' },
 * ]
 * assignEntities([25, 720], mappings, '25 year old with score 720', 0.8)
 * // [{ name: 'score', value: 720, ... }, { name: 'age', value: 25, ... }]
 * // — keyword anchors land first, then the positional fallback
 * ```
 */
export function assignEntities(
	numbers: readonly number[],
	mappings: readonly EntityMapping[],
	text: string,
	similarity: number,
): readonly Entity[] {
	return new EntityCompiler().execute(numbers, mappings, text, similarity)
}
