import type { ContractShape } from '@orkestrel/contract'
import type { Entity, EntityMapping } from './types.js'
import { escapeRegExp, isFiniteNumber } from '@orkestrel/contract'
import {
	CONFIDENCE_ALIAS,
	CONFIDENCE_COLLECT,
	CONFIDENCE_EXACT,
	NUMBER_PATTERN,
} from './constants.js'
import { findAnchoredNumber, isArrayField, matchAlias, tokenize } from './helpers.js'

/** Compiles one text's numeric occurrences into recipe entity assignments. */
export class EntityCompiler {
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
		// Each span holds its own value, so a number the extractor did not read cannot shift the rest.
		const spans = [
			...text.matchAll(new RegExp(NUMBER_PATTERN.source, NUMBER_PATTERN.flags)),
		].flatMap((match) => {
			const value = Number(match[1]?.replace(/,/g, ''))
			// The pattern takes the spaces after a number, which are no part of it.
			const end = match.index + match[0].trimEnd().length
			return isFiniteNumber(value) ? [{ start: match.index, end, value }] : []
		})
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
						const pattern = new RegExp(`(?<![a-z0-9])${escapeRegExp(token)}(?![a-z0-9])`, 'gi')
						const position = Iterator.from(text.matchAll(pattern)).reduce(
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
		const claims = matches.flatMap((match) => {
			const anchored = findAnchoredNumber(text, { start: match.position, end: match.end }, spans)
			return anchored === undefined ? [] : [{ match, ...anchored }]
		})
		for (const claim of claims) {
			// A number goes to the anchor nearest it, so a farther one cannot take it by coming first.
			const rivals = claims.filter((other) => other.index === claim.index)
			const nearest = Math.min(...rivals.map((other) => other.gap))
			const held = rivals.filter((other) => other.gap === nearest)
			if (held.length !== 1 || held[0] !== claim) continue
			const value = spans[claim.index]?.value
			if (value === undefined || !numbers.includes(value)) continue
			this.#entities.push({
				name: claim.match.mapping.entity,
				value: isArrayField(shape, claim.match.mapping.field) ? [value] : value,
				provenance: { category: 'extracted', detail: claim.match.detail },
				confidence: claim.match.confidence,
			})
		}
		return this.#entities
	}
}
