import type {
	Ambiguity,
	ClarifierInterface,
	ClarifierOptions,
	ClarifyResult,
	ComputedField,
	Entity,
	Intent,
	InterpretContextInterface,
	Template,
} from '../types.js'
import { isFiniteNumber } from '../../contracts/index.js'
import { formatField } from '../../helpers.js'
import {
	CONFIDENCE_CARRIED,
	CONFIDENCE_COMPUTED,
	CONFIDENCE_DEFAULT,
	DEFAULT_INTERPRET_FLOOR,
} from '../constants.js'
import { resolveExpression, variablesOf } from '../helpers.js'

/**
 * The `Clarifier` stage: resolves same-domain carry-over, template defaults,
 * and declaratively computed fields against an already-assigned entity set,
 * surfacing an {@link Ambiguity} for every required mapping that stays
 * unresolved.
 *
 * @remarks
 * Resolution order: fresh (already-assigned) entities always win; carry-over
 * fills a mapping only from the SAME domain's most recent prior turn (a
 * domain change drops carry-over entirely) and never overwrites a fresh
 * value; template defaults fill any field still unresolved after carry-over;
 * computed fields resolve in dependency (topological) order via
 * `resolveExpression` — an unresolved input, a non-finite result, or a
 * dependency cycle leaves the field a gap, never landing an entity. `floor`
 * (from {@link ClarifierOptions}, never hardcoded — AGENTS-flagged scsr
 * defect 4) gates whether a resolved entity's confidence counts as
 * "resolved enough" when raising ambiguities — a field with a value below
 * `floor` still raises its ambiguity.
 *
 * @example
 * ```ts
 * import { Clarifier } from '@src/core'
 *
 * const clarifier = new Clarifier({ floor: 0.3 })
 * clarifier.clarify(
 * 	[],
 * 	{
 * 		id: 't1',
 * 		name: 'Arithmetic',
 * 		domain: 'arithmetic',
 * 		intents: ['calculate'],
 * 		mappings: [{ entity: 'value', aliases: [], field: 'value', required: true }],
 * 		defaults: [],
 * 		computations: [],
 * 		definition: { reasoning: 'symbolic', id: 't1', name: 'Arithmetic', equations: [], variables: {} },
 * 	},
 * 	undefined,
 * 	{ action: 'calculate', domain: 'arithmetic', confidence: 1 },
 * ) // { entities: [], ambiguities: [{ field: 'value', ... }], complete: false }
 * ```
 */
export class Clarifier implements ClarifierInterface {
	readonly #floor: number

	constructor(options?: ClarifierOptions) {
		this.#floor = options?.floor ?? DEFAULT_INTERPRET_FLOOR
	}

	clarify(
		entities: readonly Entity[],
		template: Template,
		context: InterpretContextInterface | undefined,
		intent: Intent,
	): ClarifyResult {
		const resolved: Entity[] = [...entities]
		const filledEntityNames = new Set(resolved.map((entity) => entity.name))
		const filledFields = new Set(
			resolved.map((entity) => {
				const mapping = template.mappings.find((candidate) => candidate.entity === entity.name)
				return mapping === undefined ? entity.name : formatField(mapping.field)
			}),
		)

		this.#carryOver(template, context, intent, filledEntityNames, filledFields, resolved)
		this.#fillDefaults(template, filledFields, resolved)
		this.#resolveComputations(template, filledFields, resolved)

		const ambiguities = this.#collectAmbiguities(template, resolved)

		return { entities: resolved, ambiguities, complete: ambiguities.length === 0 }
	}

	// Same-domain-only carry-over — a chaining pass over `context.previous()`
	// mutating the shared `resolved` accumulator (AGENTS §7: an algorithm step,
	// not a leaf).
	#carryOver(
		template: Template,
		context: InterpretContextInterface | undefined,
		intent: Intent,
		filledEntityNames: Set<string>,
		filledFields: Set<string>,
		resolved: Entity[],
	): void {
		if (context === undefined) return
		const sameDomain = context.previous().filter((prior) => prior.intent.domain === intent.domain)
		for (const mapping of template.mappings) {
			if (filledEntityNames.has(mapping.entity)) continue
			for (let index = sameDomain.length - 1; index >= 0; index -= 1) {
				const prior = sameDomain[index]
				const found = prior?.entities.find((entity) => entity.name === mapping.entity)
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

	// Fills every still-unresolved default field — never overwrites.
	#fillDefaults(template: Template, filledFields: Set<string>, resolved: Entity[]): void {
		for (const fieldDefault of template.defaults) {
			const key = formatField(fieldDefault.field)
			if (filledFields.has(key)) continue
			const mapping = template.mappings.find((candidate) => formatField(candidate.field) === key)
			resolved.push({
				name: mapping?.entity ?? key,
				value: fieldDefault.value,
				provenance: { category: 'default' },
				confidence: CONFIDENCE_DEFAULT,
			})
			filledFields.add(key)
		}
	}

	// Resolves computed fields in dependency order, seeding bindings from
	// every already-resolved numeric field (extracted/carried/default), then
	// growing bindings as each computed field lands.
	#resolveComputations(template: Template, filledFields: Set<string>, resolved: Entity[]): void {
		const bindings: Record<string, number> = {}
		for (const entity of resolved) {
			const mapping = template.mappings.find((candidate) => candidate.entity === entity.name)
			const field = mapping === undefined ? entity.name : formatField(mapping.field)
			if (isFiniteNumber(entity.value)) bindings[field] = entity.value
		}

		for (const computation of this.#orderComputations(template.computations)) {
			const key = formatField(computation.field)
			if (filledFields.has(key)) continue
			const value = resolveExpression(computation.expression, bindings)
			if (value === undefined) continue
			const mapping = template.mappings.find((candidate) => formatField(candidate.field) === key)
			resolved.push({
				name: mapping?.entity ?? key,
				value,
				provenance: { category: 'computed' },
				confidence: CONFIDENCE_COMPUTED,
			})
			filledFields.add(key)
			bindings[key] = value
		}
	}

	// Kahn's-algorithm topological order over the computed fields' field-to-
	// field dependency graph (via `variablesOf`) — a dependency cycle simply
	// excludes every field it involves from the returned order, so a cyclic
	// field (and anything depending on it) resolves to a gap rather than an
	// arbitrary evaluation order. A compositional graph traversal, so it stays
	// a private orchestration step rather than a leaf (AGENTS §7 — mirrors the
	// `SymbolicReasoner#solve`/`#isolate` precedent).
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
		let cursor = 0
		while (cursor < queue.length) {
			const key = queue[cursor]
			cursor += 1
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

	// One ambiguity per required mapping without a resolved-enough entity.
	#collectAmbiguities(template: Template, resolved: readonly Entity[]): Ambiguity[] {
		const ambiguities: Ambiguity[] = []
		for (const mapping of template.mappings) {
			if (mapping.required !== true) continue
			const entity = resolved.find((candidate) => candidate.name === mapping.entity)
			const resolvedEnough = entity !== undefined && entity.confidence >= this.#floor
			if (resolvedEnough) continue
			ambiguities.push({
				field: mapping.field,
				question: `What is your ${mapping.entity}?`,
				candidates: [],
				required: true,
			})
		}
		return ambiguities
	}
}
