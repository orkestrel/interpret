import type {
	CardinalResult,
	ReaderMarks,
	ReaderTokenInterface,
	ReadNumber,
	WordNumberResult,
} from './types.js'
import { INTERPRET_TEXT_LIMIT, READER_SCALES, READER_SHAPES, READER_WORDS } from './constants.js'
import { InterpretError } from './errors.js'
import { ReaderToken } from './ReaderToken.js'

/**
 * Reads every number in one text, exactly or not at all.
 *
 * @remarks
 * Every digit-holding nonspace run, less trailing sentence punctuation, must match a declared
 * numeric form whole: digits, comma groups, decimals, dollars, percent, or a declared suffix.
 * Other forms read as `unreadable: 'undeclared'`, with no value. Word numbers retain their exact
 * grammar; ranges, ambiguous grouping, and inexact arithmetic also read as unreadable.
 * Context can mark an admitted number `foreign`, such as a year or a phone number.
 * Unsupported words after a number are left for the compiler's neighbor admission check.
 * The words around a number add `hedged`, `suspect`, `changed`, and
 * `composite`. It never assigns a number to a field, because that is a recipe's question.
 * Spans index the text as given: every normalization replaces one character with one.
 * A fraction joins only a plain number; a scaled cardinal or literal with a fraction refuses.
 * Input beyond `INTERPRET_TEXT_LIMIT` UTF-16 units throws `InterpretError('TEXT_LIMIT')`.
 */
export class NumberReader {
	// A scanner's cursors: pass, checked nonspace boundary, unit absorption, and cardinal.
	#at = 0
	#boundary = 0
	#cursor = 0
	#cardinal: CardinalResult = { value: 0, part: 0, next: 0, last: '', money: false }

	read(text: string): readonly ReadNumber[] {
		if (text.length > INTERPRET_TEXT_LIMIT)
			throw new InterpretError('TEXT_LIMIT', `Text exceeds ${INTERPRET_TEXT_LIMIT} UTF-16 units`)
		const tokens = this.#annotate(this.#markPairs(this.#mergeNumbers(this.#scan(text))))
		return tokens
			.filter((token) => token.form === 'number')
			.map((token) => this.#project(token, tokens, text))
	}

	// === Scanner: text to raw tokens

	#scan(text: string): readonly ReaderTokenInterface[] {
		const source = text
			.replace(/[‘’]/g, "'")
			.replace(/[‐-―−]/g, '-')
			.replace(/ /g, ' ')
		const tokens: ReaderTokenInterface[] = []
		this.#at = 0
		this.#boundary = 0
		while (this.#at < source.length) this.#at = this.#scanAt(source, this.#at, tokens)
		return tokens
	}

	// Scans the token at one place, and answers where the next one starts.
	#scanAt(source: string, index: number, tokens: ReaderTokenInterface[]): number {
		const char = source.charAt(index)
		if (index >= this.#boundary) {
			const currency = this.#shapeAt(READER_SHAPES.currency, source, index)
			const start = index + (currency?.length ?? 0)
			const run = /^\S+/.exec(source.slice(start))?.[0] ?? ''
			this.#boundary = Math.max(index + 1, start + run.length)
			const whole = source.slice(index, start + run.replace(/[.,!?;]+$/, '').length)
			if (/\d/.test(whole) && !READER_SHAPES.admitted.test(whole)) {
				const token = this.#numberToken(whole, index, index + whole.length)
				token.mark({ unreadable: 'undeclared' })
				tokens.push(token)
				return token.marks.end
			}
		}
		if (char === '\n') {
			tokens.push(new ReaderToken('mark', char, '\n', '\n', index, index + 1))
			return index + 1
		}
		if (/\s/.test(char) || char === "'" || char === '"') return index + 1
		const literal = this.#readLiteral(source, index)
		if (literal !== undefined) {
			this.#readSuffix(source, literal)
			tokens.push(literal)
			return literal.marks.end
		}
		const word = this.#shapeAt(READER_SHAPES.word, source, index)
		if (word !== undefined) return this.#scanWord(source, index, word, tokens)
		if (char === '-') return this.#scanHyphen(source, index, tokens)
		const reading = char === '@' ? 'at' : char
		tokens.push(new ReaderToken('mark', char, reading, reading, index, index + 1))
		return index + 1
	}

	#scanWord(source: string, index: number, word: string, tokens: ReaderTokenInterface[]): number {
		const end = index + word.length
		if (word.toLowerCase() === 'out' && READER_WORDS.workOut.has(tokens.at(-1)?.lower ?? '')) {
			tokens.pop()
			return end
		}
		tokens.push(this.#wordToken(word, index, end))
		// An abbreviation's dot ends the sentence only when a capital or the end of the text follows.
		const dotted =
			source[end] === '.' &&
			READER_WORDS.abbreviations.has(word.toLowerCase()) &&
			/^\.\s*[^A-Z\s]/.test(source.slice(end))
		return dotted ? end + 1 : end
	}

	// A hyphen joins words; digit-holding runs have already passed whole-token admission.
	#scanHyphen(source: string, at: number, tokens: ReaderTokenInterface[]): number {
		const glued = !/\s/.test(source[at - 1] ?? ' ') && !/\s/.test(source[at + 1] ?? ' ')
		if (glued && this.#isLetter(source[at + 1])) {
			const next = this.#shapeAt(READER_SHAPES.word, source, at + 1)
			if (next === undefined) return at + 1
			const word = this.#wordToken(next, at + 1, at + 1 + next.length)
			word.mark({ glued: true })
			tokens.push(word)
			return at + 1 + next.length
		}
		const lower = glued ? 'range' : '-'
		tokens.push(new ReaderToken('mark', '-', lower, lower, at, at + 1))
		return at + 1
	}

	// One digit literal with its currency prefix, percent sign, and attached letters.
	#readLiteral(source: string, index: number): ReaderTokenInterface | undefined {
		const currency = this.#shapeAt(READER_SHAPES.currency, source, index)
		const start = index + (currency?.length ?? 0)
		const digits = this.#shapeAt(READER_SHAPES.digit, source, start)
		if (digits === undefined) return undefined
		const token = this.#numberToken(digits, index, start + digits.length)
		token.mark({ value: Number(digits.replace(/,/g, '')) })
		const grouped = /^(?:[ \u202f]+\d{3})+(?=\s|[.,!?;]*(?:\s|$))/.exec(
			source.slice(token.marks.end),
		)
		if (grouped !== null)
			token.mark({ unreadable: 'grouping', end: token.marks.end + grouped[0].length })
		if (currency !== undefined) token.mark({ money: true })
		if (
			currency !== undefined &&
			!READER_SHAPES.admitted.test(source.slice(index, start + digits.length))
		)
			token.mark({ unreadable: 'undeclared' })
		if (/^\d{1,3}\.\d{3}$/.test(digits)) token.mark({ unreadable: 'grouping' })
		const percent = /^\s?%(?=\s|[.,!?;]*(?:\s|$))/.exec(source.slice(token.marks.end))
		if (percent !== null) token.mark({ percent: true, end: token.marks.end + percent[0].length })
		return token
	}

	// Declared suffixes on a literal that has passed whole-token admission.
	#readSuffix(source: string, token: ReaderTokenInterface): void {
		const letters = /^[a-z]+/i.exec(source.slice(token.marks.end))?.[0]
		if (letters === undefined) return
		const suffix = letters.toLowerCase()
		const start = token.marks.end
		token.mark({ end: start + letters.length })
		if (suffix === 'ish') token.mark({ hedged: true })
		else if (READER_WORDS.gluedScales.has(suffix)) {
			this.#scale(token, this.#own(READER_SCALES.digit, suffix) ?? 1)
		} else if (suffix === 'm' || suffix === 'mm' || suffix === 'b' || suffix === 'bn') {
			if (token.marks.money === true) {
				this.#scale(token, suffix === 'b' || suffix === 'bn' ? 1e9 : 1e6)
			} else token.mark({ unreadable: 'shorthand' })
		}
	}

	#scale(token: ReaderTokenInterface, scale: number): void {
		const { value } = token.marks
		const product = value === undefined ? undefined : value * scale
		token.mark({
			...(product === undefined ? {} : { value: product }),
			...(token.marks.scaled === true
				? { unreadable: 'joined' as const }
				: product !== undefined && Number(product.toFixed(6)) !== product
					? { unreadable: 'precision' as const }
					: {}),
			scaled: true,
		})
	}

	// === Reader: raw tokens to numbers read exactly

	#spanToken(
		raw: readonly ReaderTokenInterface[],
		first: number,
		next: number,
		marks: Partial<ReaderMarks>,
	): ReaderTokenInterface {
		const text = raw
			.slice(first, next)
			.map((token) => token.raw)
			.join(' ')
		const token = this.#numberToken(text, raw[first]?.start ?? 0, raw[next - 1]?.marks.end ?? 0)
		token.mark({ word: true, ...marks })
		return token
	}

	#isNumberWord(token: ReaderTokenInterface | undefined): boolean {
		return (
			token?.form === 'word' &&
			(this.#own(READER_SCALES.units, token.lower) !== undefined ||
				this.#own(READER_SCALES.tens, token.lower) !== undefined)
		)
	}

	// A strict cardinal grammar. A spoken pairing such as "twelve fifty" reads as unreadable, never a guess.
	#readCardinal(raw: readonly ReaderTokenInterface[], first: number): CardinalResult {
		const article = raw[first]?.lower === 'a' || raw[first]?.lower === 'an'
		this.#cardinal = {
			value: 0,
			part: article ? 1 : 0,
			next: article ? first + 1 : first,
			last: article ? 'unit' : '',
			money: false,
		}
		while (this.#readCardinalWord(raw)) continue
		return { ...this.#cardinal, value: this.#cardinal.value + this.#cardinal.part }
	}

	// Reads the word at the cardinal's place into it, and answers whether the cardinal goes on.
	#readCardinalWord(raw: readonly ReaderTokenInterface[]): boolean {
		const { next, last, part, value } = this.#cardinal
		const token = raw[next]
		if (token?.form !== 'word') return false
		const word = token.lower
		const spoken = last === 'unit' || last === 'teen' || last === 'tens'
		const heard = spoken ? { unreadable: 'spoken' as const } : {}
		const unit = this.#own(READER_SCALES.units, word)
		if (unit !== undefined) {
			if (last === 'tens' && unit > 0 && unit < 10) {
				return this.#growCardinal({ part: part + unit, last: 'unit' })
			}
			return this.#growCardinal({ ...heard, part: part + unit, last: unit < 10 ? 'unit' : 'teen' })
		}
		const tens = this.#own(READER_SCALES.tens, word)
		if (tens !== undefined) return this.#growCardinal({ ...heard, part: part + tens, last: 'tens' })
		const whole = last === '' ? 1 : part
		if (word === 'hundred') return this.#growCardinal({ part: whole * 100, last: 'hundred' })
		if (word === 'dozen') return this.#growCardinal({ part: whole * 12, last: 'scale' })
		const scale = this.#own(READER_SCALES.word, word)
		if (scale !== undefined) {
			return this.#growCardinal({
				...(last === 'scale' || (value > 0 && scale >= value)
					? { unreadable: 'joined' as const }
					: {}),
				value: value + whole * scale,
				part: 0,
				last: 'scale',
				...(word === 'grand' ? { money: true } : {}),
			})
		}
		if (word !== 'and' || !this.#isNumberWord(raw[next + 1])) return false
		if (last === 'hundred') return this.#growCardinal({})
		if (last === 'scale') this.#cardinal = { ...this.#cardinal, unreadable: 'joined' }
		return false
	}

	#growCardinal(reading: Partial<CardinalResult>): true {
		this.#cardinal = { ...this.#cardinal, ...reading, next: this.#cardinal.next + 1 }
		return true
	}

	// "and a half", "and a quarter", and "point five" after a cardinal.
	#readWordFraction(
		raw: readonly ReaderTokenInterface[],
		index: number,
	): { readonly amount: number; readonly next: number } | undefined {
		if (raw[index]?.lower === 'and' && raw[index + 1]?.lower === 'a') {
			if (raw[index + 2]?.lower === 'half') return { amount: 0.5, next: index + 3 }
			if (raw[index + 2]?.lower === 'quarter') return { amount: 0.25, next: index + 3 }
		}
		if (raw[index]?.lower !== 'point') return undefined
		const digits: number[] = []
		while (this.#isDigitWord(raw[index + 1 + digits.length])) {
			digits.push(this.#own(READER_SCALES.units, raw[index + 1 + digits.length]?.lower ?? '') ?? 0)
		}
		if (digits.length === 0) return undefined
		return { amount: Number(`0.${digits.join('')}`), next: index + 1 + digits.length }
	}

	#isDigitWord(token: ReaderTokenInterface | undefined): boolean {
		const unit = token?.form === 'word' ? this.#own(READER_SCALES.units, token.lower) : undefined
		return unit !== undefined && unit < 10
	}

	// A number written in words at this position, or undefined. Loose words read as unreadable.
	#readWordNumber(
		raw: readonly ReaderTokenInterface[],
		index: number,
	): WordNumberResult | undefined {
		const token = raw[index]
		if (token === undefined) return undefined
		const next = raw[index + 1]
		const lower = token.lower
		// "twice a week" states a count in a word no field phrase carries, so it reads as unreadable.
		if (
			(lower === 'once' || lower === 'twice' || lower === 'thrice') &&
			READER_WORDS.per.has(next?.lower ?? '') &&
			READER_WORDS.timeUnits.has(raw[index + 2]?.canon ?? '')
		) {
			return {
				token: this.#spanToken(raw, index, index + 1, { unreadable: 'frequency' }),
				next: index + 1,
			}
		}
		if (lower === 'half') return this.#readHalf(raw, index)
		if (lower === 'quarter') {
			if (next?.lower === 'million') {
				return { token: this.#spanToken(raw, index, index + 2, { value: 250000 }), next: index + 2 }
			}
			if (
				next?.lower === 'of' &&
				raw[index + 2]?.lower === 'a' &&
				raw[index + 3]?.lower === 'million'
			) {
				return { token: this.#spanToken(raw, index, index + 4, { value: 250000 }), next: index + 4 }
			}
			return undefined
		}
		if (READER_WORDS.loose.has(lower)) return this.#readLoose(raw, index)
		const article =
			(lower === 'a' || lower === 'an') &&
			(next?.lower === 'hundred' ||
				next?.lower === 'dozen' ||
				this.#own(READER_SCALES.word, next?.lower ?? '') !== undefined)
		if (!article && !this.#isNumberWord(token) && lower !== 'hundred') return undefined
		if (
			lower === 'one' &&
			(READER_WORDS.notOneBefore.has(raw[index - 1]?.lower ?? '') ||
				READER_WORDS.notOneAfter.has(next?.lower ?? '') ||
				(next?.lower === 'time' && next.marks.glued === true))
		) {
			return undefined
		}
		const cardinal = this.#readCardinal(raw, index)
		const fraction = this.#readWordFraction(raw, cardinal.next)
		const end = fraction?.next ?? cardinal.next
		const scaled = raw
			.slice(index, cardinal.next)
			.some(
				(part) =>
					this.#own(READER_SCALES.word, part.lower) !== undefined || part.lower === 'hundred',
			)
		return {
			token: this.#spanToken(raw, index, end, {
				value: cardinal.value + (fraction?.amount ?? 0),
				...(cardinal.unreadable === undefined ? {} : { unreadable: cardinal.unreadable }),
				...(fraction !== undefined && scaled ? { unreadable: 'joined' as const } : {}),
				...(cardinal.money ? { money: true, scaled: true } : {}),
				...(end - index === 1 && lower === 'one' ? { weak: true } : {}),
			}),
			next: end,
		}
	}

	#readHalf(raw: readonly ReaderTokenInterface[], index: number): WordNumberResult | undefined {
		const next = raw[index + 1]
		if (raw[index - 1]?.lower === 'a' && raw[index - 2]?.lower === 'and') {
			return {
				token: this.#spanToken(raw, index, index + 1, { unreadable: 'fraction', tail: true }),
				next: index + 1,
			}
		}
		if (next?.lower !== 'a' && next?.lower !== 'an') return undefined
		const scale = raw[index + 2]?.lower ?? ''
		if (scale === 'dozen') {
			return { token: this.#spanToken(raw, index, index + 3, { value: 6 }), next: index + 3 }
		}
		const whole = this.#own(READER_SCALES.word, scale)
		if (whole !== undefined) {
			return {
				token: this.#spanToken(raw, index, index + 3, { value: whole / 2 }),
				next: index + 3,
			}
		}
		return {
			token: this.#spanToken(raw, index, index + 1, { unreadable: 'fraction' }),
			next: index + 1,
		}
	}

	#readLoose(raw: readonly ReaderTokenInterface[], index: number): WordNumberResult {
		const hop = raw[index + 1]?.lower === 'of' ? 2 : 1
		const follow = raw[index + hop]?.lower ?? ''
		if (READER_WORDS.magnitudes.has(follow) || follow === 'dollars' || follow === 'bucks') {
			const money = follow === 'grand' || follow === 'dollars' || follow === 'bucks'
			return {
				token: this.#spanToken(raw, index, index + hop + 1, {
					unreadable: 'loose',
					magnitude: true,
					...(money ? { money: true } : {}),
				}),
				next: index + hop + 1,
			}
		}
		return {
			token: this.#spanToken(raw, index, index + 1, { unreadable: 'loose', loose: true }),
			next: index + 1,
		}
	}

	// Scale words, currency, percent, and "and a half" written after a number, absorbed into it.
	#absorbUnits(
		raw: readonly ReaderTokenInterface[],
		index: number,
		token: ReaderTokenInterface,
	): number {
		this.#cursor = index + 1
		while (this.#absorbWord(raw, token)) this.#cursor += 1
		// A word number's own words are behind it, and its span already holds them.
		if (this.#cursor - 1 > index) {
			token.mark({ end: raw[this.#cursor - 1]?.marks.end ?? token.marks.end })
		}
		return this.#cursor
	}

	// Absorbs the word at the cursor into the number, and answers whether to go on.
	#absorbWord(raw: readonly ReaderTokenInterface[], token: ReaderTokenInterface): boolean {
		const next = raw[this.#cursor]
		if (next?.form !== 'word') return false
		const word = next.lower
		const written = token.marks.word === true
		const scale = this.#own(READER_SCALES.digit, word)
		const follow = raw[this.#cursor + 2]?.lower
		if (!written && scale !== undefined) {
			this.#scale(token, scale)
			if (word === 'grand') token.mark({ money: true })
		} else if (written && (word === 'k' || word === 'grand')) {
			this.#scale(token, 1000)
			if (word === 'grand') token.mark({ money: true })
		} else if (word === 'm' || word === 'mm' || word === 'b') {
			if (token.marks.money === true) this.#scale(token, word === 'b' ? 1e9 : 1e6)
			else if (token.marks.unreadable === undefined) token.mark({ unreadable: 'shorthand' })
		} else if (READER_WORDS.dollars.has(word)) token.mark({ money: true })
		else if (word === 'percent' || word === 'pct' || word === 'percentage') {
			token.mark({ percent: true })
		} else if (word === 'per' && raw[this.#cursor + 1]?.lower === 'cent') {
			token.mark({ percent: true })
			this.#cursor += 1
		} else if (READER_WORDS.foreignCurrency.has(next.canon)) {
			token.mark({ unreadable: 'foreign currency' })
		} else if (next.canon === 'figure') token.mark({ unreadable: 'shorthand' })
		else if (
			word === 'and' &&
			raw[this.#cursor + 1]?.lower === 'a' &&
			(follow === 'half' || follow === 'quarter')
		) {
			const { value } = token.marks
			if (token.marks.scaled === true) token.mark({ unreadable: 'joined' })
			if (value !== undefined) token.mark({ value: value + (follow === 'half' ? 0.5 : 0.25) })
			this.#cursor += 2
		} else if (
			word === 'and' &&
			token.marks.scaled === true &&
			raw[this.#cursor + 1]?.form === 'number'
		) {
			token.mark({ unreadable: 'joined' })
			return false
		} else return false
		return true
	}

	#mergeNumbers(raw: readonly ReaderTokenInterface[]): readonly ReaderTokenInterface[] {
		const merged: ReaderTokenInterface[] = []
		this.#at = 0
		while (this.#at < raw.length) this.#at = this.#mergeAt(raw, this.#at, merged)
		return merged
	}

	// Merges the token at one place, and answers where the next one starts.
	#mergeAt(
		raw: readonly ReaderTokenInterface[],
		index: number,
		merged: ReaderTokenInterface[],
	): number {
		const token = raw[index]
		if (token === undefined) return raw.length
		if (token.form === 'word') {
			const parsed = this.#readWordNumber(raw, index)
			if (parsed !== undefined) {
				merged.push(parsed.token)
				return this.#absorbUnits(raw, parsed.next - 1, parsed.token)
			}
		}
		if (token.form === 'number' && token.marks.foreign === undefined) {
			merged.push(token)
			return this.#absorbUnits(raw, index, token)
		}
		merged.push(token)
		return index + 1
	}

	// Pairs of numbers that together state no single value: ranges, alternatives, and dimensions.
	#markPairs(tokens: readonly ReaderTokenInterface[]): readonly ReaderTokenInterface[] {
		for (const [index, first] of tokens.entries()) {
			if (first.form !== 'number') continue
			const joiner = tokens[index + 1]?.lower ?? ''
			const second = tokens[index + 2]
			if (
				second?.form !== 'number' ||
				first.marks.foreign !== undefined ||
				second.marks.foreign !== undefined
			) {
				continue
			}
			const between = joiner === 'and' && tokens[index - 1]?.lower === 'between'
			const reason = READER_WORDS.dimensions.has(joiner)
				? ('dimensions' as const)
				: READER_WORDS.alternatives.has(joiner) || between
					? ('range' as const)
					: undefined
			if (reason === undefined) continue
			first.mark({ unreadable: reason })
			second.mark({ unreadable: reason })
		}
		return tokens
	}

	// === Flags: what the words around a number say about it

	#annotate(tokens: readonly ReaderTokenInterface[]): readonly ReaderTokenInterface[] {
		for (const [index, token] of tokens.entries()) {
			const before = tokens[index - 1]
			const ended = before !== undefined && this.#endsSentence(before)
			const marked = before !== undefined && READER_WORDS.segmentMarks.has(before.lower)
			token.mark({
				index,
				sentence: (before?.marks.sentence ?? 0) + (ended ? 1 : 0),
				segment: (before?.marks.segment ?? 0) + (ended || marked ? 1 : 0),
			})
		}
		const corrected = new Set<number>()
		const changed = new Set<number>()
		const compound = new Set<number>()
		for (const [index, token] of tokens.entries()) {
			const { sentence } = token.marks
			const previous = tokens[index - 1]
			if (
				READER_WORDS.corrections.has(token.lower) &&
				!(token.lower === 'old' && this.#isTimeWord(previous))
			) {
				corrected.add(sentence)
			}
			if (READER_WORDS.correctionPairs.has(this.#pair(previous?.lower, token.lower))) {
				corrected.add(sentence)
			}
			const after = tokens[index + 1]?.lower
			if (token.lower === 'sorry' && after !== 'to' && after !== 'for') corrected.add(sentence)
			if (READER_WORDS.changes.has(token.lower)) changed.add(sentence)
			if (READER_WORDS.compositeCues.has(token.lower)) compound.add(sentence)
		}
		const numbers = tokens.filter((token) => token.form === 'number')
		const counted = this.#findCountedPeriods(tokens, numbers)
		for (const token of numbers) {
			const { index, sentence } = token.marks
			this.#flagForeign(tokens, index, token)
			this.#flagHedge(tokens, index, token)
			this.#flagSuspect(tokens, index, token)
			this.#flagPeriod(tokens, index, token, counted)
			if (corrected.has(sentence)) token.mark({ suspect: true })
			if (changed.has(sentence)) token.mark({ changed: true })
			if (compound.has(sentence)) token.mark({ composite: true })
		}
		return tokens
	}

	// Which numbers count each period in each sentence: "for 2 weeks", "over 3 months".
	#findCountedPeriods(
		tokens: readonly ReaderTokenInterface[],
		numbers: readonly ReaderTokenInterface[],
	): ReadonlyMap<string, readonly ReaderTokenInterface[]> {
		const counted = new Map<string, ReaderTokenInterface[]>()
		for (const number of numbers) {
			const { index, sentence } = number.marks
			const unit = tokens[index + 1]
			if (unit === undefined || !READER_WORDS.countedOver.has(tokens[index - 1]?.lower ?? '')) {
				continue
			}
			const key = `${String(sentence)} ${unit.canon}`
			counted.set(key, [...(counted.get(key) ?? []).slice(0, 1), number])
		}
		return counted
	}

	// Marks each number that is a date, time, age, year, address, or identifier rather than a quantity.
	#flagForeign(
		tokens: readonly ReaderTokenInterface[],
		index: number,
		token: ReaderTokenInterface,
	): void {
		const { money, percent, scaled, unreadable } = token.marks
		const plain = money !== true && percent !== true
		const before = tokens[index - 1]?.lower
		const after = tokens[index + 1]?.lower
		const beyond = tokens[index + 2]?.lower
		const opensLine = index === 0 || before === '\n'
		if (opensLine && plain && (after === '.' || after === ')')) token.mark({ foreign: 'list' })
		if (this.#isMonth(tokens[index - 1]) || this.#isMonth(tokens[index + 1])) {
			token.mark({ foreign: 'date' })
		}
		if (
			after === 'am' ||
			after === 'pm' ||
			after === "o'clock" ||
			after === 'oclock' ||
			((after === 'a' || after === 'p') && beyond === '.' && tokens[index + 3]?.lower === 'm')
		) {
			token.mark({ foreign: 'time' })
		}
		if (after === 'old' || (this.#isTimeWord(tokens[index + 1]) && beyond === 'old')) {
			token.mark({ foreign: 'age' })
		}
		if (after === 'ago' || (this.#isTimeWord(tokens[index + 1]) && beyond === 'ago')) {
			token.mark({ foreign: 'past' })
		}
		if (before === 'every' && this.#isTimeWord(tokens[index + 1])) token.mark({ foreign: 'period' })
		if (before === '#') token.mark({ foreign: 'reference' })
		if (!plain) return
		const earlier = tokens[index - 2]?.lower
		if (READER_WORDS.ageBefore.has(before ?? '') || (earlier === 'i' && before === 'am')) {
			token.mark({ foreign: 'age' })
		}
		if (before === 'at' && (earlier === 'me' || earlier === 'us')) token.mark({ foreign: 'phone' })
		if (/^\d{5}$/.test(token.raw) && /^[A-Z]{2}$/.test(tokens[index - 1]?.raw ?? '')) {
			token.mark({ foreign: 'zip' })
		}
		const nextWord = tokens[index + 1]
		if (
			nextWord?.form === 'word' &&
			/^[A-Z]/.test(nextWord.raw) &&
			[tokens[index + 2], tokens[index + 3]].some(
				(street) => street?.form === 'word' && READER_WORDS.streets.has(street.lower),
			)
		) {
			token.mark({ foreign: 'address' })
		}
		if (/^\d{7,}$/.test(token.raw) && scaled !== true) token.mark({ phone: true })
		if (/^(?:19|20)\d{2}$/.test(token.raw) && scaled !== true) {
			const nextIsHead = nextWord?.form === 'word' && !READER_WORDS.functions.has(nextWord.lower)
			if (unreadable === 'range' || (READER_WORDS.yearCues.has(before ?? '') && !nextIsHead)) {
				token.mark({ foreign: 'year' })
			} else token.mark({ yearish: true })
		}
		for (const walked of this.#behind(tokens, index, 3)) {
			if (walked.form === 'word' && READER_WORDS.references.has(walked.lower)) {
				token.mark({ reference: walked.lower })
				break
			}
			if (!READER_WORDS.referenceLinks.has(walked.lower)) break
		}
	}

	// Marks each number its writer states as inexact.
	#flagHedge(
		tokens: readonly ReaderTokenInterface[],
		index: number,
		token: ReaderTokenInterface,
	): void {
		const before = tokens[index - 1]?.lower ?? ''
		const earlier = tokens[index - 2]?.lower
		const article = before === 'a' || before === 'an' || before === 'the'
		if (
			before === '~' ||
			READER_WORDS.hedgesBefore.has(before) ||
			(article && READER_WORDS.hedgesBefore.has(earlier ?? ''))
		) {
			token.mark({ hedged: true })
		}
		if (
			READER_WORDS.hedgePairs.has(this.#pair(earlier, before)) ||
			READER_WORDS.hedgePairs.has(this.#pair(tokens[index - 3]?.lower, earlier))
		) {
			token.mark({ hedged: true })
		}
		for (const [steps, walked] of this.#behind(tokens, index, 6).entries()) {
			if (walked.marks.sentence !== token.marks.sentence) break
			const prior = tokens[index - steps - 2]?.lower
			if (READER_WORDS.doubtPairs.has(this.#pair(prior, walked.lower))) token.mark({ hedged: true })
			if (steps < 3 && READER_WORDS.hedgesNear.has(walked.lower)) token.mark({ hedged: true })
		}
		for (const offset of [1, 2]) {
			if (offset === 2 && tokens[index + 1]?.form !== 'word') break
			const after = tokens[index + offset]?.lower
			if (
				READER_WORDS.hedgesAfter.has(after ?? '') ||
				READER_WORDS.hedgeAfterPairs.has(this.#pair(after, tokens[index + offset + 1]?.lower))
			) {
				token.mark({ hedged: true })
			}
		}
	}

	// Marks each number a sentence dates, corrects, or negates.
	#flagSuspect(
		tokens: readonly ReaderTokenInterface[],
		index: number,
		token: ReaderTokenInterface,
	): void {
		const before = tokens[index - 1]?.lower ?? ''
		const earlier = tokens[index - 2]?.lower ?? ''
		// "It'll last 5 hours" and "put in 60 hours" use the same words as a dated value and state a current one.
		const verbLast = before === 'last' && READER_WORDS.verbLastBefore.has(earlier)
		if (READER_WORDS.suspectBefore.has(before) && !verbLast) token.mark({ suspect: true })
		if (
			READER_WORDS.offsetBefore.has(before) &&
			this.#isTimeWord(tokens[index + 1]) &&
			!READER_WORDS.putInBefore.has(earlier)
		) {
			token.mark({ suspect: true })
		}
		if (
			[1, 2].some(
				(offset) =>
					tokens[index + offset]?.lower === 'last' && this.#isTimeWord(tokens[index + offset + 1]),
			)
		) {
			token.mark({ suspect: true })
		}
		if (this.#behind(tokens, index, 3).some((walked) => walked.lower === 'been')) {
			token.mark({ suspect: true })
		}
	}

	// Marks a rate stated over a period the message also counts: "40 hours a week for 2 weeks".
	#flagPeriod(
		tokens: readonly ReaderTokenInterface[],
		index: number,
		token: ReaderTokenInterface,
		counted: ReadonlyMap<string, readonly ReaderTokenInterface[]>,
	): void {
		if (
			token.marks.money === true ||
			!READER_WORDS.generalUnits.has(tokens[index + 1]?.canon ?? '') ||
			!READER_WORDS.per.has(tokens[index + 2]?.lower ?? '')
		) {
			return
		}
		const period = tokens[index + 3]
		if (period === undefined || !READER_WORDS.calendarPeriods.has(period.canon)) return
		const others = counted.get(`${String(token.marks.sentence)} ${period.canon}`) ?? []
		if (others.some((other) => other !== token)) token.mark({ composite: true })
	}

	// === Leaves

	#project(
		token: ReaderTokenInterface,
		tokens: readonly ReaderTokenInterface[],
		text: string,
	): ReadNumber {
		const { marks } = token
		const unit = tokens[marks.index + 1]
		// A value past what a number holds exactly is not read, whatever its digits say.
		const exact = marks.value !== undefined && Number.isSafeInteger(Math.trunc(marks.value))
		return {
			raw: text.slice(token.start, marks.end),
			start: token.start,
			end: marks.end,
			...(exact && marks.value !== undefined && marks.unreadable === undefined
				? { value: marks.value }
				: {}),
			...(marks.unreadable !== undefined
				? { unreadable: marks.unreadable }
				: marks.value !== undefined && !exact
					? { unreadable: 'overflow' as const }
					: {}),
			...(marks.foreign === undefined ? {} : { foreign: marks.foreign }),
			...(marks.money === true ? { money: true } : {}),
			...(marks.percent === true ? { percent: true } : {}),
			...(marks.scaled === true ? { scaled: true } : {}),
			...(marks.word === true ? { word: true } : {}),
			...(marks.hedged === true ? { hedged: true } : {}),
			...(marks.suspect === true ? { suspect: true } : {}),
			...(marks.changed === true ? { changed: true } : {}),
			...(marks.composite === true ? { composite: true } : {}),
			...(marks.loose === true ? { loose: true } : {}),
			...(marks.magnitude === true ? { magnitude: true } : {}),
			...(marks.weak === true ? { weak: true } : {}),
			...(marks.tail === true ? { tail: true } : {}),
			...(marks.yearish === true ? { yearish: true } : {}),
			...(marks.phone === true ? { phone: true } : {}),
			...(marks.reference === undefined ? {} : { reference: marks.reference }),
			...(unit !== undefined && READER_WORDS.generalUnits.has(unit.canon)
				? { unit: unit.canon }
				: {}),
			sentence: marks.sentence,
			segment: marks.segment,
		}
	}

	#numberToken(raw: string, start: number, end: number): ReaderTokenInterface {
		const lower = raw.toLowerCase()
		return new ReaderToken('number', raw, lower, lower, start, end)
	}

	#wordToken(raw: string, start: number, end: number): ReaderTokenInterface {
		return new ReaderToken('word', raw, raw.toLowerCase(), this.#canon(raw), start, end)
	}

	// Lowercases, maps a spelling variant to its canonical unit, and folds a regular plural.
	#canon(word: string): string {
		const lower = word.toLowerCase().replace(/'s$/, '')
		const synonym = this.#own(READER_WORDS.synonyms, lower)
		if (synonym !== undefined) return synonym
		if (lower.length <= 3 || /(?:ss|us|is)$/.test(lower)) return lower
		if (/ies$/.test(lower)) return `${lower.slice(0, -3)}y`
		if (/(?:xes|ches|shes|sses)$/.test(lower)) return lower.slice(0, -2)
		if (lower.endsWith('s')) return lower.slice(0, -1)
		return lower
	}

	#own<T>(table: Readonly<Record<string, T>>, key: string): T | undefined {
		return Object.hasOwn(table, key) ? table[key] : undefined
	}

	#shapeAt(shape: RegExp, source: string, index: number): string | undefined {
		const sticky = new RegExp(shape.source, shape.flags)
		sticky.lastIndex = index
		return sticky.exec(source)?.[0]
	}

	#pair(first: string | undefined, second: string | undefined): string {
		return `${first ?? ''}_${second ?? ''}`
	}

	#endsSentence(token: ReaderTokenInterface): boolean {
		return token.lower === '\n' || READER_WORDS.sentenceEnds.has(token.lower)
	}

	// The tokens before one, nearest first, at most `count` of them.
	#behind(
		tokens: readonly ReaderTokenInterface[],
		index: number,
		count: number,
	): readonly ReaderTokenInterface[] {
		return tokens.slice(Math.max(0, index - count), index).reverse()
	}

	#isLetter(char: string | undefined): boolean {
		return char !== undefined && /[a-z]/i.test(char)
	}

	#isTimeWord(token: ReaderTokenInterface | undefined): boolean {
		return token?.form === 'word' && READER_WORDS.timeUnits.has(token.canon)
	}

	#isMonth(token: ReaderTokenInterface | undefined): boolean {
		return (
			token?.form === 'word' &&
			READER_WORDS.months.has(token.lower) &&
			/^[A-Z][a-z]/.test(token.raw)
		)
	}
}
