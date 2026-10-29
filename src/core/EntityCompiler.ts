import type { Entity, EntityMapping } from './types.js'
import {
	CONFIDENCE_ALIAS,
	CONFIDENCE_COLLECT,
	CONFIDENCE_EXACT,
	CONFIDENCE_POSITIONAL,
	NUMBER_PATTERN,
} from './constants.js'
import { escapeRegExp, matchAlias, tokenize } from './helpers.js'

/** Compiles one text's numeric occurrences into template entity assignments. */
export class EntityCompiler {
	readonly #used = new Set<number>()
	readonly #filled = new Set<string>()
	readonly #entities: Entity[] = []
	#index = 0

	execute(
		numbers: readonly number[],
		mappings: readonly EntityMapping[],
		text: string,
		similarity: number,
	): readonly Entity[] {
		if (mappings.length === 0 || numbers.length === 0) return []
		if (mappings.length === 1) {
			const mapping = mappings[0]
			if (mapping === undefined) return []
			return [
				{
					name: mapping.entity,
					value: numbers.length === 1 ? numbers[0] : numbers,
					provenance: { category: 'extracted', detail: 'collect' },
					confidence: CONFIDENCE_COLLECT,
				},
			]
		}
		const tokens = tokenize(text)
		const lowerText = text.toLowerCase()
		const positions = [
			...text.matchAll(new RegExp(NUMBER_PATTERN.source, NUMBER_PATTERN.flags)),
		].map((match) => match.index)
		const matches = Iterator.from(mappings)
			.map((mapping) => {
				const entityToken = mapping.entity.toLowerCase()
				return tokens.reduce<{
					readonly mapping: EntityMapping
					readonly position: number
					readonly confidence: number
					readonly detail: 'keyword' | 'alias'
				}>(
					(matched, token) => {
						const pattern = new RegExp(`(?<![a-z0-9])${escapeRegExp(token)}(?![a-z0-9])`, 'g')
						const position = Iterator.from(lowerText.matchAll(pattern)).reduce(
							(_position, found) => found.index,
							-1,
						)
						if (token === entityToken) {
							return position > matched.position
								? { mapping, position, confidence: CONFIDENCE_EXACT, detail: 'keyword' }
								: matched
						}
						if (mapping.aliases.some((alias) => alias.toLowerCase() === token)) {
							return position > matched.position
								? { mapping, position, confidence: CONFIDENCE_ALIAS, detail: 'alias' }
								: matched
						}
						const confidence = matchAlias(token, mapping.aliases, similarity)
						return confidence > 0 && position > matched.position
							? { mapping, position, confidence, detail: 'alias' }
							: matched
					},
					{ mapping, position: -1, confidence: 0, detail: 'keyword' },
				)
			})
			.filter((match) => match.position >= 0)
			.toArray()
			.sort((left, right) => left.position - right.position)
		for (const match of matches) {
			const best = Array.prototype.keys.call(numbers).reduce<{
				readonly index: number
				readonly distance: number
			}>(
				(nearest, index) => {
					if (this.#used.has(index)) return nearest
					const position = positions[index]
					if (position === undefined) return nearest
					const distance = Math.abs(position - match.position)
					return distance < nearest.distance ? { index, distance } : nearest
				},
				{ index: -1, distance: Number.POSITIVE_INFINITY },
			)
			if (best.index < 0) continue
			const value = numbers[best.index]
			if (value === undefined) continue
			this.#used.add(best.index)
			this.#filled.add(match.mapping.entity)
			this.#entities.push({
				name: match.mapping.entity,
				value,
				provenance: { category: 'extracted', detail: match.detail },
				confidence: match.confidence,
			})
		}
		for (const mapping of mappings) {
			if (this.#filled.has(mapping.entity)) continue
			while (this.#index < numbers.length && this.#used.has(this.#index)) this.#index += 1
			if (this.#index >= numbers.length) break
			const value = numbers[this.#index]
			if (value !== undefined) {
				this.#used.add(this.#index)
				this.#filled.add(mapping.entity)
				this.#entities.push({
					name: mapping.entity,
					value,
					provenance: { category: 'extracted', detail: 'positional' },
					confidence: CONFIDENCE_POSITIONAL,
				})
			}
			this.#index += 1
		}
		return this.#entities
	}
}
