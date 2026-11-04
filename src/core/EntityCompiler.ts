import type { ContractShape } from '@orkestrel/contract'
import type { Entity, EntityMapping } from './types.js'
import { escapeRegExp } from '@orkestrel/contract'
import {
	CONFIDENCE_ALIAS,
	CONFIDENCE_COLLECT,
	CONFIDENCE_EXACT,
	NUMBER_PATTERN,
} from './constants.js'
import { findAnchoredNumber, isArrayField, matchAlias, tokenize } from './helpers.js'

/** Compiles one text's numeric occurrences into recipe entity assignments. */
export class EntityCompiler {
	readonly #used = new Set<number>()
	readonly #entities: Entity[] = []

	execute(
		numbers: readonly number[],
		mappings: readonly EntityMapping[],
		text: string,
		similarity: number,
		shape: ContractShape,
	): readonly Entity[] {
		if (mappings.length === 0 || numbers.length === 0) return []
		const lone = mappings.length === 1 ? mappings[0] : undefined
		if (lone !== undefined && isArrayField(shape, lone.field)) {
			return [
				{
					name: lone.entity,
					value: numbers,
					provenance: { category: 'extracted', detail: 'collect' },
					confidence: CONFIDENCE_COLLECT,
				},
			]
		}
		const tokens = tokenize(text)
		const lowerText = text.toLowerCase()
		const spans = [...text.matchAll(new RegExp(NUMBER_PATTERN.source, NUMBER_PATTERN.flags))].map(
			// The pattern takes the spaces after a number, which are no part of it.
			(match) => ({ start: match.index, end: match.index + match[0].trimEnd().length }),
		)
		const matches = Iterator.from(mappings)
			.map((mapping) => {
				const entityToken = mapping.entity.toLowerCase()
				return tokens.reduce<{
					readonly mapping: EntityMapping
					readonly position: number
					readonly end: number
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
								? {
										mapping,
										position,
										end: position + token.length,
										confidence: CONFIDENCE_EXACT,
										detail: 'keyword',
									}
								: matched
						}
						if (mapping.aliases.some((alias) => alias.toLowerCase() === token)) {
							return position > matched.position
								? {
										mapping,
										position,
										end: position + token.length,
										confidence: CONFIDENCE_ALIAS,
										detail: 'alias',
									}
								: matched
						}
						const confidence = matchAlias(token, mapping.aliases, similarity)
						return confidence > 0 && position > matched.position
							? { mapping, position, end: position + token.length, confidence, detail: 'alias' }
							: matched
					},
					{ mapping, position: -1, end: -1, confidence: 0, detail: 'keyword' },
				)
			})
			.filter((match) => match.position >= 0)
			.toArray()
			.sort((left, right) => left.position - right.position)
		for (const match of matches) {
			const best = findAnchoredNumber(text, { start: match.position, end: match.end }, spans)
			if (best === undefined || this.#used.has(best)) continue
			const value = numbers[best]
			if (value === undefined) continue
			this.#used.add(best)
			this.#entities.push({
				name: match.mapping.entity,
				value: isArrayField(shape, match.mapping.field) ? [value] : value,
				provenance: { category: 'extracted', detail: match.detail },
				confidence: match.confidence,
			})
		}
		return this.#entities
	}
}
