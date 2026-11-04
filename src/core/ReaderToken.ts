import type { ReaderMarks, ReaderTokenForm, ReaderTokenInterface } from './types.js'

/** Holds one scanned token, whose marks land on it as the reader's passes walk the sentence. */
export class ReaderToken implements ReaderTokenInterface {
	readonly form: ReaderTokenForm
	readonly raw: string
	readonly lower: string
	readonly canon: string
	readonly start: number
	#marks: ReaderMarks

	constructor(
		form: ReaderTokenForm,
		raw: string,
		lower: string,
		canon: string,
		start: number,
		end: number,
	) {
		this.form = form
		this.raw = raw
		this.lower = lower
		this.canon = canon
		this.start = start
		this.#marks = { end, index: 0, sentence: 0, segment: 0 }
	}

	get marks(): ReaderMarks {
		return this.#marks
	}

	mark(marks: Partial<ReaderMarks>): void {
		this.#marks = { ...this.#marks, ...marks }
	}
}
