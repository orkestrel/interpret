import type { Subject } from '@orkestrel/reason'
import type {
	Entity,
	FieldMapping,
	GenerateResult,
	GeneratorInterface,
	Template,
} from '../types.js'
import { setField } from '../helpers.js'

/**
 * The `Generator` stage: builds the final `Subject` from a fully resolved
 * entity set, plus its complete field audit.
 *
 * @remarks
 * `entity → field` via `template.mappings` (an `EntityMapping.entity` name
 * lookup); an entity whose name matches no mapping lands on the field named
 * by its OWN `name` — the shape `Clarifier` uses for its synthesized
 * default/computed entities, so one lookup rule serves both extraction-
 * mapped and template-data-derived fields. A single-element array value
 * unwraps to its scalar; every other value lands as it stands, so a
 * multi-element array stays an array. The stage derives no field of its own:
 * an aggregate over an array-valued entity is a `ComputedField` the template
 * author declares, resolved by `Clarifier` before this stage runs.
 * `confidence` is the mean of the input entities' own confidences (`0` for
 * an empty entity set). A `FieldMapping` is emitted for EVERY field that
 * lands on the subject, including defaults and computed fields. The stage
 * takes no options, so construction takes no arguments.
 *
 * @example
 * ```ts
 * import { Generator } from '@src/core'
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
 * 		defaults: [],
 * 		computations: [],
 * 		definition: { reasoning: 'symbolic', id: 't1', name: 'Arithmetic', equations: [], variables: {} },
 * 	},
 * ) // { subject: { value: 42 }, mappings: [...], confidence: 0.9, ... }
 * ```
 */
export class Generator implements GeneratorInterface {
	generate(entities: readonly Entity[], template: Template): GenerateResult {
		let subject: Subject = {}
		const mappings: FieldMapping[] = []

		for (const entity of entities) {
			const mapping = template.mappings.find((candidate) => candidate.entity === entity.name)
			const field = mapping === undefined ? entity.name : mapping.field
			const value = entity.value

			if (Array.isArray(value) && value.length === 1) {
				const scalar = value[0]
				subject = setField(subject, field, scalar)
				mappings.push({
					field,
					entity: entity.name,
					value: scalar,
					provenance: entity.provenance,
					confidence: entity.confidence,
				})
				continue
			}

			subject = setField(subject, field, value)
			mappings.push({
				field,
				entity: entity.name,
				value,
				provenance: entity.provenance,
				confidence: entity.confidence,
			})
		}

		const confidence =
			entities.length === 0
				? 0
				: entities.reduce((total, entity) => total + entity.confidence, 0) / entities.length

		return { subject, definition: template.definition, mappings, confidence }
	}
}
