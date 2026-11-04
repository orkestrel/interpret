import type { ContractShape, FieldPath } from '@orkestrel/contract'
import type {
	Entity,
	EntityCompilation,
	EntityMapping,
	ReadNumber,
	NumberRefusal,
	NumberRefusalDecision,
	NumberRefusalReason,
} from './types.js'
import { escapeRegExp, preview } from '@orkestrel/contract'
import {
	CONFIDENCE_ALIAS,
	CONFIDENCE_COLLECT,
	CONFIDENCE_EXACT,
	NUMBER_REFUSAL_LIMIT,
} from './constants.js'
import { findAnchoredNumber, matchesArrayField, tokenize } from './helpers.js'

/**
 * Compiles one text's numeric occurrences into recipe assignments and bounded refusal evidence.
 *
 * @remarks
 * Aliases match exact token sequences; overlapping anchors keep the later start.
 * Tied anchors still contest their adjacent numbers. A directly following word that
 * starts no declared anchor and is no link refuses scalar claims and array collection.
 * Following-word links `and` and `with` require an anchor head or numeric occurrence next,
 * allowing one intervening article (`a`, `an`, or `the`). `or`, `but`, `plus`, `then`, and `now` stay out.
 * Explicit corrections, including `wait` except `wait to`, refuse occurrences
 * marked suspect or changed without substituting a rival value.
 * Decisions are captured where they occur, retained once per occurrence, and discarded for
 * claimed occurrences. Only the bounded public records render text through `preview`.
 */
export class EntityCompiler {
	readonly #entities: Entity[] = []
	readonly #claimed = new Set<ReadNumber>()
	readonly #decisions = new Map<ReadNumber, NumberRefusalDecision>()

	execute(
		numbers: readonly ReadNumber[],
		mappings: readonly EntityMapping[],
		text: string,
		shape: ContractShape,
	): EntityCompilation {
		if (mappings.length === 0 || numbers.length === 0) return this.#finish(numbers)
		const tokens = tokenize(text)
		const spans = numbers
		const numberStarts = new Set(numbers.map((number) => number.start))
		const followingWords = new Map<ReadNumber, string>()
		const unbound = new Set(
			numbers.filter((number) => {
				const following = /^\s+([a-z]+)\b/i.exec(text.slice(number.end))
				const word = following?.[1]?.toLowerCase()
				if (word === undefined || ['is', 'of', 'at', 'to', 'a', 'an', 'the'].includes(word))
					return false
				const link = word === 'and' || word === 'with'
				const gap = link
					? /^\s+(?:and|with)\s+(?:(?:a|an|the)\s+)?/i.exec(text.slice(number.end))
					: null
				if (link && gap === null) {
					followingWords.set(number, word)
					return true
				}
				const start = number.end + (gap?.[0].length ?? 0)
				if (link && numberStarts.has(start)) return false
				const head = link ? /^([a-z]+)\b/i.exec(text.slice(start))?.[1]?.toLowerCase() : word
				const refused =
					head === undefined ||
					!mappings.some((mapping) =>
						[mapping.entity, ...mapping.aliases].some((anchor) => tokenize(anchor)[0] === head),
					)
				if (refused) followingWords.set(number, head ?? word)
				return refused
			}),
		)
		const correction =
			/\b(?:wait(?!\s+to\b)|sorry(?!\s+(?:to|for)\b)|hang\s+on|used\s+to\s+be|(?:was|were)\s+going\s+to\s+be)\b/i.test(
				text,
			)
		const matches = Iterator.from(mappings)
			.map((mapping) => {
				const entityToken = mapping.entity.toLowerCase()
				return [mapping.entity, ...mapping.aliases].reduce<{
					readonly mapping: EntityMapping
					readonly position: number
					readonly end: number
					readonly confidence: number
					readonly detail: 'keyword' | 'alias'
				}>(
					(matched, token) => {
						const words = tokenize(token)
						if (words.length === 0) return matched
						if (
							!tokens.some((_token, index) =>
								words.every((word, offset) => tokens[index + offset] === word),
							)
						)
							return matched
						const pattern = new RegExp(
							`(?<![a-z0-9])${words.map((word) => escapeRegExp(word)).join("[^a-z0-9./%$'-]+")}(?![a-z0-9])`,
							'gi',
						)
						const found = Array.from(text.matchAll(pattern)).at(-1)
						if (found !== undefined && found.index > matched.position) {
							return {
								mapping,
								position: found.index,
								end: found.index + found[0].length,
								confidence:
									token.toLowerCase() === entityToken ? CONFIDENCE_EXACT : CONFIDENCE_ALIAS,
								detail: token.toLowerCase() === entityToken ? 'keyword' : 'alias',
							}
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
			const anchored = findAnchoredNumber(
				text,
				{ start: match.position, end: match.end },
				spans,
				(index, reason) => {
					const number = spans[index]
					if (number !== undefined) this.#refuse(number, reason, match.mapping.field)
				},
			)
			return anchored === undefined ? [] : [{ match, ...anchored }]
		})
		const lone = mappings.length === 1 ? mappings[0] : undefined
		if (lone !== undefined && matchesArrayField(shape, lone.field) && claims.length > 0) {
			if (
				numbers.some((number) => {
					if (unbound.has(number)) {
						this.#refuse(number, 'following-word', lone.field, followingWords.get(number))
						return true
					}
					if (number.unreadable !== undefined) {
						this.#refuse(number, 'unreadable', lone.field)
						return true
					}
					if (correction && (number.suspect === true || number.changed === true)) {
						this.#refuse(number, 'correction', lone.field)
						return true
					}
					return false
				})
			) {
				for (const number of numbers) this.#refuse(number, 'collection', lone.field)
				return this.#finish(numbers)
			}
			for (const number of numbers) {
				if (number.unreadable === undefined && number.value !== undefined) this.#claimed.add(number)
			}
			this.#entities.push({
				name: lone.entity,
				value: numbers.flatMap((number) =>
					number.unreadable === undefined && number.value !== undefined ? [number.value] : [],
				),
				provenance: { category: 'extracted', detail: 'collect' },
				confidence: CONFIDENCE_COLLECT,
			})
			return this.#finish(numbers)
		}
		for (const claim of claims) {
			const number = spans[claim.index]
			if (number === undefined) continue
			// A number goes to the anchor nearest it, so a farther one cannot take it by coming first.
			const rivals = matches.flatMap((other) => {
				const assigned = claims.find((candidate) => candidate.match === other)
				if (assigned !== undefined) return assigned.index === claim.index ? [assigned] : []
				const contested = findAnchoredNumber(text, { start: other.position, end: other.end }, [
					number,
				])
				return contested === undefined
					? []
					: [{ match: other, index: claim.index, gap: contested.gap }]
			})
			const nearest = Math.min(...rivals.map((other) => other.gap))
			const held = rivals.filter((other) => other.gap === nearest)
			if (held.length !== 1) {
				this.#refuse(number, 'anchor-tie')
				continue
			}
			if (held[0] !== claim) continue
			if (number.value === undefined) {
				this.#refuse(number, 'unreadable', claim.match.mapping.field)
				continue
			}
			if (unbound.has(number)) {
				this.#refuse(
					number,
					'following-word',
					claim.match.mapping.field,
					followingWords.get(number),
				)
				continue
			}
			if (number.unreadable !== undefined) {
				this.#refuse(number, 'unreadable', claim.match.mapping.field)
				continue
			}
			if (correction && (number.suspect === true || number.changed === true)) {
				this.#refuse(number, 'correction', claim.match.mapping.field)
				continue
			}
			const value = number.value
			this.#claimed.add(number)
			this.#entities.push({
				name: claim.match.mapping.entity,
				value: matchesArrayField(shape, claim.match.mapping.field) ? [value] : value,
				provenance: { category: 'extracted', detail: claim.match.detail },
				confidence: claim.match.confidence,
			})
		}
		return this.#finish(numbers)
	}

	#refuse(number: ReadNumber, reason: NumberRefusalReason, field?: FieldPath, word?: string): void {
		if (!this.#decisions.has(number))
			this.#decisions.set(number, {
				reason,
				...(field === undefined ? {} : { field }),
				...(word === undefined ? {} : { word }),
			})
	}

	#finish(numbers: readonly ReadNumber[]): EntityCompilation {
		const items: NumberRefusal[] = []
		const omitted = { count: 0 }
		for (const number of numbers) {
			if (this.#claimed.has(number)) continue
			if (items.length >= NUMBER_REFUSAL_LIMIT) {
				omitted.count += 1
				continue
			}
			this.#refuse(number, 'unanchored')
			const decision = this.#decisions.get(number)
			if (decision === undefined) continue
			items.push({
				text: preview(number.raw),
				start: number.start,
				end: number.end,
				reason: decision.reason,
				...(decision.reason === 'unreadable' && number.unreadable !== undefined
					? { unreadable: number.unreadable }
					: {}),
				...(decision.word === undefined ? {} : { word: preview(decision.word) }),
				...(decision.field === undefined ? {} : { field: decision.field }),
			})
		}
		return {
			entities: this.#entities,
			...(items.length === 0 ? {} : { refusals: { items, omitted: omitted.count } }),
		}
	}
}
