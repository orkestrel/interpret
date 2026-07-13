import type { Subject } from '@orkestrel/reason'
import type {
	Entity,
	FieldMapping,
	GenerateResult,
	GeneratorInterface,
	GeneratorOptions,
	Template,
} from '../types.js'
import { isFiniteNumber } from '@orkestrel/contract'
import { formatField } from '@orkestrel/reason'
import { CONFIDENCE_COMPUTED } from '../constants.js'
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
 * unwraps to its scalar; a multi-element, ALL-numeric array value stays an
 * array AND additionally emits five aggregate fields (`{field}Sum` /
 * `Count` / `Average` / `Minimum` / `Maximum`, provenance `computed`).
 * `confidence` is the mean of the input entities' own confidences (`0` for
 * an empty entity set). A `FieldMapping` is emitted for EVERY field that
 * lands on the subject, including defaults, computed fields, and aggregates
 * — scsr silently omitted defaults/computed from its audit trail; this
 * closes that gap.
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
	// `GeneratorOptions` is an empty extension seam today (AGENTS §4.6.1 `_`
	// marker) — kept so a future knob never has to change the constructor
	// signature.
	constructor(_options?: GeneratorOptions) {}

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

			if (Array.isArray(value) && value.length > 1) {
				const numeric: number[] = []
				for (const item of value) {
					if (!isFiniteNumber(item)) break
					numeric.push(item)
				}
				if (numeric.length === value.length) {
					subject = setField(subject, field, value)
					mappings.push({
						field,
						entity: entity.name,
						value,
						provenance: entity.provenance,
						confidence: entity.confidence,
					})
					const label = formatField(field)
					const sum = numeric.reduce((total, item) => total + item, 0)
					const aggregates: readonly (readonly [string, number])[] = [
						[`${label}Sum`, sum],
						[`${label}Count`, numeric.length],
						[`${label}Average`, sum / numeric.length],
						[`${label}Minimum`, Math.min(...numeric)],
						[`${label}Maximum`, Math.max(...numeric)],
					]
					for (const [aggregateField, aggregateValue] of aggregates) {
						subject = setField(subject, aggregateField, aggregateValue)
						mappings.push({
							field: aggregateField,
							value: aggregateValue,
							provenance: { category: 'computed' },
							confidence: CONFIDENCE_COMPUTED,
						})
					}
					continue
				}
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
