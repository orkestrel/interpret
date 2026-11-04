import type { AuditFault, FieldPath } from '@orkestrel/contract'
import type { SubjectDoorInterface } from '@orkestrel/reason'
import type {
	Ambiguity,
	ClarifierInterface,
	ClarifierOptions,
	ClarifyResult,
	ComputedField,
	Entity,
	Intent,
	InterpretContextInterface,
	NarratorInterface,
	Recipe,
} from '../types.js'
import { isArray, isFiniteNumber } from '@orkestrel/contract'
import { createSubjectDoor, formatField } from '@orkestrel/reason'
import {
	CONFIDENCE_CARRIED,
	CONFIDENCE_COMPUTED,
	CONFIDENCE_DEFAULT,
	DEFAULT_INTERPRET_FLOOR,
} from '../constants.js'
import { InterpretError } from '../errors.js'
import {
	buildSubject,
	collectShapeDefaults,
	findEntityField,
	findFieldDescription,
	resolveExpression,
	settleEntities,
	variablesOf,
} from '../helpers.js'
import { Narrator } from '../Narrator.js'

/**
 * Implements the clarify stage: resolves same-domain carry-over and declaratively
 * computed fields against an already-assigned entity set, admits the subject they
 * build through the recipe's shape, and surfaces an {@link Ambiguity} for everything
 * the door refused.
 *
 * @remarks
 * Resolution order: fresh (already-assigned) entities always win; carry-over
 * fills a mapping only from the same domain's and recipe's most recent prior turn (a
 * domain change drops carry-over entirely), only with what was stated, because a
 * computed or defaulted value is worked out again, and never overwrites a fresh
 * value; computed fields resolve in dependency (topological) order through
 * `resolveExpression` — an unresolved input, a non-finite result, or a
 * dependency cycle leaves the field a gap, never landing an entity; the door then
 * reads the whole subject, so `parse` fills each default still absent and a computed
 * value stands over a default. A computation reads every resolved numeric field and
 * every default in the shape by name, is trusted no more than the least of what it
 * read, and can address one
 * numeric element of an array-valued field as `{field}.{index}`, so an
 * aggregate over a collection of known length is declarable while a collection
 * whose length varies per turn has none — an unbound element abandons the
 * whole expression. `floor` comes from {@link ClarifierOptions} rather than a
 * hardcoded constant, and gates whether a resolved entity's confidence counts
 * as "resolved enough" when raising ambiguities — a field with a value below
 * `floor` raises its ambiguity whether or not the shape requires the field, because it
 * is evidence a value was stated, so neither it nor a default stands. A mapped field left
 * to a default or a prior turn raises one too while a number nobody claimed could be its
 * value. Every ambiguity here blocks the subject. A question reads the
 * shape's `description` for the field, and otherwise renders through the injected
 * {@link NarratorInterface}'s `ambiguity.entity` line rather than minted from a literal
 * here, so wording stays caller data.
 *
 * @example
 * ```ts
 * import { numberShape, objectShape } from '@orkestrel/contract'
 * import { Clarifier } from '@orkestrel/interpret'
 *
 * const clarifier = new Clarifier({ floor: 0.3 })
 * clarifier.clarify(
 * 	[],
 * 	{
 * 		id: 't1',
 * 		name: 'Arithmetic',
 * 		domain: 'arithmetic',
 * 		intents: ['calculate'],
 * 		mappings: [{ entity: 'value', aliases: [], field: 'value' }],
 * 		computations: [],
 * 		definition: { reasoning: 'symbolic', id: 't1', name: 'Arithmetic', equations: [], variables: {} },
 * 		shape: objectShape({ value: numberShape() }),
 * 	},
 * 	undefined,
 * 	{ action: 'calculate', domain: 'arithmetic', confidence: 1 },
 * ) // { entities: [], ambiguities: [{ field: 'value', ... }] }
 * ```
 */
export class Clarifier implements ClarifierInterface {
	readonly #floor: number
	readonly #narrator: NarratorInterface
	readonly #door: SubjectDoorInterface = createSubjectDoor()

	constructor(options?: ClarifierOptions) {
		this.#floor = options?.floor ?? DEFAULT_INTERPRET_FLOOR
		this.#narrator = options?.narrator ?? new Narrator()
	}

	clarify(
		entities: readonly Entity[],
		recipe: Recipe,
		context: InterpretContextInterface | undefined,
		intent: Intent,
		unclaimed: ReadonlyArray<number | string> = [],
	): ClarifyResult {
		const resolved: Entity[] = [...entities]
		const filledEntityNames = new Set(resolved.map((entity) => entity.name))
		const filledFields = new Set(
			resolved.map((entity) => formatField(findEntityField(entity, recipe.mappings))),
		)

		this.#carryOver(recipe, context, intent, filledEntityNames, filledFields, resolved)
		this.#resolveComputations(recipe, filledFields, resolved)

		const subject = buildSubject(resolved, recipe.mappings)
		const admission = this.#door.admit(subject, recipe.shape)
		// A refusal with no fault names nothing to ask, so it is the recipe's error, not a question.
		if (admission.subject === undefined && admission.faults.length === 0) {
			throw new InterpretError('DEFINITION', admission.errors.join(', '))
		}
		const settled = settleEntities(resolved, recipe.mappings, admission)

		return {
			entities: settled,
			ambiguities: this.#collectAmbiguities(recipe, settled, admission.faults, unclaimed),
			repairs: admission.repairs,
			defaulted: admission.defaulted,
		}
	}

	// Same-domain-only carry-over — a chaining pass over `context.previous()`
	// mutating the shared `resolved` accumulator — an algorithm step, not a
	// leaf.
	#carryOver(
		recipe: Recipe,
		context: InterpretContextInterface | undefined,
		intent: Intent,
		filledEntityNames: Set<string>,
		filledFields: Set<string>,
		resolved: Entity[],
	): void {
		if (context === undefined) return
		const sameDomain = context
			.previous()
			.filter(
				(prior) =>
					prior.intent.domain === intent.domain &&
					(prior.recipe === undefined || prior.recipe === recipe.id),
			)
		for (const mapping of recipe.mappings) {
			if (filledEntityNames.has(mapping.entity)) continue
			for (const offset of sameDomain.keys()) {
				const index = sameDomain.length - 1 - offset
				const prior = sameDomain[index]
				const found = prior?.entities.find(
					(entity) =>
						entity.name === mapping.entity &&
						(entity.provenance.category === 'extracted' ||
							entity.provenance.category === 'carried'),
				)
				if (found === undefined) continue
				resolved.push({
					name: mapping.entity,
					value: found.value,
					provenance: { category: 'carried' },
					confidence: CONFIDENCE_CARRIED,
				})
				filledEntityNames.add(mapping.entity)
				filledFields.add(formatField(mapping.field))
				break
			}
		}
	}

	// Resolves computed fields in dependency order, seeding bindings from each default the shape
	// holds, then from every already-resolved numeric field (extracted/carried) and each numeric
	// element of an array-valued field under `{field}.{index}`, then growing bindings as each
	// computed field lands. A computed field is trusted no more than the least of what it read. A
	// scalar field whose path formats to an array element's key — `['value', '0']` and the first
	// element of `value` both format to `value.0` — collides here, and the entity later in
	// `resolved` overwrites the earlier binding.
	#resolveComputations(recipe: Recipe, filledFields: Set<string>, resolved: Entity[]): void {
		const bindings: Record<string, number> = {}
		const trust = new Map<string, number>()
		const subject = buildSubject(resolved, recipe.mappings)
		for (const { field, value } of collectShapeDefaults(recipe.shape, subject)) {
			this.#bind(bindings, trust, formatField(field), value, CONFIDENCE_DEFAULT)
		}
		for (const entity of resolved) {
			const field = formatField(findEntityField(entity, recipe.mappings))
			this.#bind(bindings, trust, field, entity.value, entity.confidence)
		}

		for (const computation of this.#orderComputations(recipe.computations)) {
			const key = formatField(computation.field)
			if (filledFields.has(key)) continue
			const value = resolveExpression(computation.expression, bindings)
			if (value === undefined) continue
			const inputs = variablesOf(computation.expression).map((name) => trust.get(name) ?? 0)
			const confidence = Math.min(CONFIDENCE_COMPUTED, ...inputs)
			const mapping = recipe.mappings.find((candidate) => formatField(candidate.field) === key)
			resolved.push({
				name: mapping?.entity ?? key,
				...(mapping === undefined ? { field: computation.field } : {}),
				value,
				provenance: { category: 'computed' },
				confidence,
			})
			filledFields.add(key)
			bindings[key] = value
			trust.set(key, confidence)
		}
	}

	// Binds a finite number under its key, and each finite element of an array under `{key}.{index}`.
	#bind(
		bindings: Record<string, number>,
		trust: Map<string, number>,
		key: string,
		value: unknown,
		confidence: number,
	): void {
		if (isFiniteNumber(value)) {
			bindings[key] = value
			trust.set(key, confidence)
			return
		}
		if (!isArray(value)) return
		for (const [index, item] of Array.prototype.entries.call(value)) {
			if (!isFiniteNumber(item)) continue
			bindings[`${key}.${index}`] = item
			trust.set(`${key}.${index}`, confidence)
		}
	}

	// Kahn's-algorithm topological order over the computed fields' field-to-
	// field dependency graph (through `variablesOf`) — a dependency cycle
	// excludes every field it involves from the returned order, so a cyclic
	// field (and anything depending on it) resolves to a gap rather than an
	// arbitrary evaluation order. A compositional graph traversal, so it stays
	// a private orchestration step rather than a leaf.
	#orderComputations(computations: readonly ComputedField[]): readonly ComputedField[] {
		const byField = new Map<string, ComputedField>()
		for (const computation of computations) byField.set(formatField(computation.field), computation)

		const dependents = new Map<string, string[]>()
		const inDegree = new Map<string, number>()
		for (const key of byField.keys()) inDegree.set(key, 0)

		for (const [key, computation] of byField) {
			const dependencies = variablesOf(computation.expression).filter((name) => byField.has(name))
			inDegree.set(key, dependencies.length)
			for (const dependency of dependencies) {
				const list = dependents.get(dependency) ?? []
				list.push(key)
				dependents.set(dependency, list)
			}
		}

		const queue: string[] = []
		for (const [key, degree] of inDegree) if (degree === 0) queue.push(key)

		const ordered: ComputedField[] = []
		for (const key of queue) {
			if (key === undefined) continue
			const computation = byField.get(key)
			if (computation !== undefined) ordered.push(computation)
			for (const dependent of dependents.get(key) ?? []) {
				const next = (inDegree.get(dependent) ?? 0) - 1
				inDegree.set(dependent, next)
				if (next === 0) queue.push(dependent)
			}
		}

		return ordered
	}

	// One ambiguity per fault the door refused, one per mapped value read below the floor, and one
	// per mapped field this text left to a default or a prior turn while a number nobody claimed
	// could be its value. A value this text stated or a computation derived has no such doubt.
	#collectAmbiguities(
		recipe: Recipe,
		resolved: readonly Entity[],
		faults: readonly AuditFault[],
		unclaimed: ReadonlyArray<number | string>,
	): readonly Ambiguity[] {
		const candidates = unclaimed.map(String)
		const refused = new Set(faults.map((fault) => formatField(fault.path)))
		const doubted = recipe.mappings.flatMap((mapping) => {
			if (refused.has(formatField(mapping.field))) return []
			const entity = resolved.find((candidate) => candidate.name === mapping.entity)
			if (entity !== undefined && entity.confidence < this.#floor) {
				return [this.#ask(recipe, mapping.field, [])]
			}
			const stated =
				entity?.provenance.category === 'extracted' || entity?.provenance.category === 'computed'
			return stated || unclaimed.length === 0 ? [] : [this.#ask(recipe, mapping.field, candidates)]
		})
		return [
			...faults.map((fault) =>
				this.#ask(recipe, fault.path, fault.reason === 'missing' ? candidates : [], fault),
			),
			...doubted,
		]
	}

	// Words a question from the shape's description, or the narrator's line when it has none.
	#ask(
		recipe: Recipe,
		field: FieldPath,
		candidates: readonly string[],
		fault?: AuditFault,
	): Ambiguity {
		const key = formatField(field)
		const mapping = recipe.mappings.find((candidate) => formatField(candidate.field) === key)
		const question =
			findFieldDescription(recipe.shape, field) ??
			this.#narrator.line('ambiguity.entity', { entity: mapping?.entity ?? key })
		return {
			field: mapping?.field ?? field,
			question,
			candidates,
			required: true,
			...(fault === undefined ? {} : { fault }),
		}
	}
}
