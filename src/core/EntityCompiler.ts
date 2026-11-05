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
 * Tied anchors still contest their adjacent numbers; a trailing colon claims only forward.
 * A backward claim refuses preceding lone punctuation, another number, or the reader's hedge
 * flag, with `preceding-word` evidence. A previous number's trailing sentence punctuation is
 * a boundary. The following neighbor must be the text's end, a sentence end, a whole anchor,
 * or a conditional link. The links `is`, `of`, `at`, `to`,
 * `a`, `an`, `the`, `and`, and `with` require a whole anchor next, allowing one intervening
 * article. A numeric target refuses. Sentence punctuation must touch the number and be
 * followed by whitespace or the text's end; detached punctuation refuses.
 * A comma admits unless a number follows it.
 * Every other neighbor refuses scalar claims and array collection, with its text in `word`.
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
		const precedingWords = new Map<ReadNumber, string>()
		const neighbors = [...text.matchAll(/\S+/g)]
		const cursor = { index: 0 }
		const numberEnds = new Set(numbers.map((number) => number.end))
		for (const number of numbers) {
			while (cursor.index < neighbors.length) {
				const word = neighbors[cursor.index]
				if (word === undefined || word.index + word[0].length > number.start) break
				cursor.index += 1
			}
			const prior = neighbors[cursor.index - 1]
			if (prior === undefined) continue
			const end = prior.index + prior[0].length
			const boundary = /[.,!?;]+$/.exec(prior[0])
			if (boundary !== null && numberEnds.has(end - boundary[0].length)) continue
			if (/^[\p{P}\p{S}]+$/u.test(prior[0]) || numberEnds.has(end) || number.hedged === true)
				precedingWords.set(number, prior[0])
		}
		const heads = new RegExp(
			`^\\s*(?:${mappings
				.flatMap((mapping) =>
					[mapping.entity, ...mapping.aliases]
						.map((anchor) => tokenize(anchor))
						.filter((anchor) => anchor.length > 0)
						.map((anchor) => anchor.map((word) => escapeRegExp(word)).join("[^a-z0-9./%$'-]+")),
				)
				.join('|')})[.,!?;:]*(?=\\s|$)`,
			'i',
		)
		const unbound = new Set(
			numbers.filter((number) => {
				const tail = text.slice(number.end)
				const adjacent = numberStarts.has(number.end + (/^\s*/.exec(tail)?.[0].length ?? 0))
				const following = (adjacent ? /^\s*(\S+)/ : /^\s*([.,!?;]|\S+)/).exec(tail)
				const word = following?.[1]
				if (word === undefined || (!adjacent && /^[.!?;]+(?=\s|$)/.test(tail))) return false
				const comma = /^\s*,\s*/.exec(tail)
				if (!adjacent && comma !== null && !numberStarts.has(number.end + comma[0].length))
					return false
				if (heads.test(tail)) return false
				const link = /^\s*(?:is|of|at|to|a|an|the|and|with)\s+(?:(?:a|an|the)\s+)?/i.exec(tail)
				const start = number.end + (link?.[0].length ?? 0)
				if (link !== null && heads.test(text.slice(start))) return false
				followingWords.set(number, word)
				return true
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
					const before = precedingWords.get(number)
					if (before !== undefined && claims.some((claim) => number.end <= claim.match.position)) {
						this.#refuse(number, 'preceding-word', lone.field, before)
						return true
					}
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
			const before = precedingWords.get(number)
			if (before !== undefined && number.end <= claim.match.position) {
				this.#refuse(number, 'preceding-word', claim.match.mapping.field, before)
				continue
			}
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
