import type { Entity, FieldMapping, GenerateResult, GeneratorInterface, Recipe } from '../types.js'
import { buildSubject, findEntityField } from '../helpers.js'

/**
 * Implements the generate stage: builds the final `Subject` from a fully resolved
 * entity set, plus its complete field audit.
 *
 * @remarks
 * `entity → field` through the entity's own `field`, then `recipe.mappings` (an
 * `EntityMapping.entity` name lookup), then the entity's own `name` — `Clarifier`
 * sets `field` on the defaults and computed fields no mapping names. Every value
 * lands as it stands, because the door has already read it against the recipe's
 * shape. The stage derives no field of its own:
 * an aggregate over an array-valued entity is a `ComputedField` the recipe
 * author declares, resolved by `Clarifier` before this stage runs.
 * `confidence` is the mean of the input entities' own confidences (`0` for
 * an empty entity set). A `FieldMapping` is emitted for every field that
 * lands on the subject, including defaults and computed fields. The stage
 * takes no options, so construction takes no arguments.
 *
 * @example
 * ```ts
 * import { numberShape, objectShape } from '@orkestrel/contract'
 * import { Generator } from '@orkestrel/interpret'
 *
 * const generator = new Generator()
 * generator.generate(
 * 	[
 * 		{
 * 			name: 'value',
 * 			value: 42,
 * 			provenance: { category: 'extracted', detail: 'collect' },
 * 			confidence: 0.9,
 * 		},
 * 	],
 * 	{
 * 		id: 't1',
 * 		name: 'Arithmetic',
 * 		domain: 'arithmetic',
 * 		intents: ['calculate'],
 * 		mappings: [{ entity: 'value', aliases: [], field: 'value' }],
 * 		shape: objectShape({ value: numberShape() }),
 * 		computations: [],
 * 		definition: { reasoning: 'symbolic', id: 't1', name: 'Arithmetic', equations: [], variables: {} },
 * 	},
 * ) // { subject: { value: 42 }, mappings: [...], confidence: 0.9, ... }
 * ```
 */
export class Generator implements GeneratorInterface {
	generate(entities: readonly Entity[], recipe: Recipe): GenerateResult {
		const mappings = entities.map<FieldMapping>((entity) => ({
			field: findEntityField(entity, recipe.mappings),
			entity: entity.name,
			value: entity.value,
			provenance: entity.provenance,
			confidence: entity.confidence,
		}))

		const confidence =
			entities.length === 0
				? 0
				: entities.reduce((total, entity) => total + entity.confidence, 0) / entities.length

		return {
			subject: buildSubject(entities, recipe.mappings),
			definition: recipe.definition,
			mappings,
			confidence,
		}
	}
}
