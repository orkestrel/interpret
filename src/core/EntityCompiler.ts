import type { ContractShape } from '@orkestrel/contract'
import type { Entity, EntityMapping, ReadNumber } from './types.js'
import { escapeRegExp } from '@orkestrel/contract'
import { CONFIDENCE_ALIAS, CONFIDENCE_COLLECT, CONFIDENCE_EXACT } from './constants.js'
import { findAnchoredNumber, matchesArrayField, tokenize } from './helpers.js'

/** Compiles one text's numeric occurrences into recipe entity assignments. */
export class EntityCompiler {
	readonly #entities: Entity[] = []

	execute(
		numbers: readonly ReadNumber[],
		mappings: readonly EntityMapping[],
		text: string,
		shape: ContractShape,
	): readonly Entity[] {
		if (mappings.length === 0 || numbers.length === 0) return []
		const tokens = tokenize(text)
		const spans = numbers
		const correction =
			/\b(?:sorry(?!\s+(?:to|for)\b)|hang\s+on|used\s+to\s+be|(?:was|were)\s+going\s+to\s+be)\b/i.test(
				text,
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
						return matched
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
		const lone = mappings.length === 1 ? mappings[0] : undefined
		if (lone !== undefined && matchesArrayField(shape, lone.field) && claims.length > 0) {
			if (
				numbers.some(
					(number) =>
						number.unreadable !== undefined ||
						(correction && (number.suspect === true || number.changed === true)),
				)
			)
				return []
			return [
				{
					name: lone.entity,
					value: numbers.flatMap((number) =>
						number.unreadable === undefined && number.value !== undefined ? [number.value] : [],
					),
					provenance: { category: 'extracted', detail: 'collect' },
					confidence: CONFIDENCE_COLLECT,
				},
			]
		}
		for (const claim of claims) {
			// A number goes to the anchor nearest it, so a farther one cannot take it by coming first.
			const rivals = claims.filter((other) => other.index === claim.index)
			const nearest = Math.min(...rivals.map((other) => other.gap))
			const held = rivals.filter((other) => other.gap === nearest)
			if (held.length !== 1 || held[0] !== claim) continue
			const number = spans[claim.index]
			if (
				number?.value === undefined ||
				number.unreadable !== undefined ||
				(correction && (number.suspect === true || number.changed === true))
			)
				continue
			const value = number.value
			this.#entities.push({
				name: claim.match.mapping.entity,
				value: matchesArrayField(shape, claim.match.mapping.field) ? [value] : value,
				provenance: { category: 'extracted', detail: claim.match.detail },
				confidence: claim.match.confidence,
			})
		}
		return this.#entities
	}
}
