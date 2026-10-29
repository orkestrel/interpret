/** Counts and consumes UTF-16 bigrams for one similarity measurement. */
export class BigramCounter {
	readonly #counts = new Map<string, number>()

	constructor(text: string) {
		for (const index of Array.prototype.keys.call(text)) {
			if (index >= text.length - 1) break
			const pair = text.slice(index, index + 2)
			this.#counts.set(pair, (this.#counts.get(pair) ?? 0) + 1)
		}
	}

	match(text: string): number {
		return Array.prototype.keys
			.call(text)
			.take(text.length - 1)
			.reduce((matches, index) => {
				const pair = text.slice(index, index + 2)
				const count = this.#counts.get(pair)
				if (count === undefined || count <= 0) return matches
				this.#counts.set(pair, count - 1)
				return matches + 1
			}, 0)
	}
}
