import { scanNumbers, readNumbersContract, INTERPRET_TEXT_LIMIT, InterpretError } from '@src/core'
import { describe, expect, it } from 'vitest'
import { ADMITTED_NUMBERS, UNDECLARED_TOKENS, WHOLE_NUMBER_FORMS } from '../../setup.js'

describe('scanNumbers — declared digit tokens', () => {
	it('enforces the published UTF-16 text limit at the reader', () => {
		expect(scanNumbers(' '.repeat(INTERPRET_TEXT_LIMIT - 1) + '3')[0]?.value).toBe(3)
		expect(() => scanNumbers(' '.repeat(INTERPRET_TEXT_LIMIT) + '3')).toThrow(
			new InterpretError('TEXT_LIMIT', `Text exceeds ${INTERPRET_TEXT_LIMIT} UTF-16 units`),
		)
	})
	it('checks a long run whole, including a digit after another script', () => {
		const word = 'ж'.repeat(65535)
		expect(scanNumbers(word)).toEqual([])
		expect(scanNumbers(`${word}3`)).toMatchObject([
			{ raw: `${word}3`, start: 0, end: 65536, unreadable: 'undeclared' },
		])
	})
	it('keeps undeclared tokens whole after a separate digit token', () => {
		const text = '555 123-4567'
		expect(scanNumbers(text)).toMatchObject([
			{ raw: '555', value: 555, start: 0, end: 3 },
			{ raw: '123-4567', unreadable: 'undeclared', start: 4, end: 12 },
		])
	})
	it.each(['.', '!', '?', ';', ','])('admits trailing sentence punctuation %s', (mark) => {
		expect(scanNumbers(`3${mark}`)[0]).toMatchObject({ raw: '3', value: 3, start: 0, end: 1 })
	})
	it.each(UNDECLARED_TOKENS)('refuses the whole undeclared token %s', (text) => {
		const numbers = scanNumbers(text)
		expect(numbers).toHaveLength(1)
		expect(numbers[0]).toMatchObject({
			raw: text,
			start: 0,
			end: text.length,
			unreadable: 'undeclared',
		})
		expect(numbers[0]?.value).toBeUndefined()
	})
	it.each(ADMITTED_NUMBERS)('retains the declared control %s', (text, value) => {
		expect(scanNumbers(text).map((number) => number.value)).toEqual([value])
		expect(scanNumbers(text)[0]?.unreadable).toBeUndefined()
	})
})

describe('scanNumbers — whole numeric forms', () => {
	it.each(WHOLE_NUMBER_FORMS)('%s reads whole or unreadable', (text, value) => {
		const numbers = scanNumbers(text)
		expect(numbers.length).toBeGreaterThan(0)
		expect(numbers.map((number) => number.value)).toEqual(numbers.map(() => value))
		expect(numbers.every((number) => number.unreadable !== undefined)).toBe(value === undefined)
		expect(numbers.length === 1 || value === undefined).toBe(true)
	})
})

// The number reader: every number with its span and what the words around it say, read exactly
// or not at all. It assigns nothing to a field, so these read the number and nothing further.

describe('scanNumbers — what reads to a value', () => {
	it.each<[string, number]>([
		['$350,000', 350000],
		['6.25%', 6.25],
		['.5', 0.5],
		['75k', 75000],
		['401k', 401000],
		['$1.2M', 1200000],
		['$2b', 2000000000],
		['250 grand', 250000],
		['3 thousand', 3000],
		['three hundred thousand dollars', 300000],
		['six and a half percent', 6.5],
		['2 and a quarter', 2.25],
		['two hundred and fifty', 250],
		['twenty-five dollars', 25],
		['a dozen', 12],
		['half a million', 500000],
		['half a dozen', 6],
		['a quarter million', 250000],
		['a quarter of a million', 250000],
		['a hundred', 100],
		['three point five', 3.5],
	])('%s reads as %d', (text, value) => {
		const [number] = scanNumbers(text)
		expect(number?.value).toBe(value)
		expect(number?.unreadable).toBeUndefined()
	})

	it('says what a number measures', () => {
		expect(scanNumbers('$5')[0]?.money).toBe(true)
		expect(scanNumbers('5 dollars')[0]?.money).toBe(true)
		expect(scanNumbers('5 usd')[0]?.money).toBe(true)
		expect(scanNumbers('5%')[0]?.percent).toBe(true)
		expect(scanNumbers('5 percent')[0]?.percent).toBe(true)
		expect(scanNumbers('5 per cent')[0]?.percent).toBe(true)
		expect(scanNumbers('5k')[0]?.scaled).toBe(true)
		expect(scanNumbers('five')[0]?.word).toBe(true)
		expect(scanNumbers('5')[0]?.money).toBeUndefined()
		expect(scanNumbers('5')[0]?.word).toBeUndefined()
	})

	it.each<[string, string | undefined]>([
		['40 hours', 'hour'],
		['40hrs', undefined],
		['40kg', undefined],
		['5 kilograms', 'kg'],
		['950 sqft', 'sqft'],
		['500km', undefined],
	])('%s reports its admitted unit as %s', (text, unit) => {
		expect(scanNumbers(text)[0]?.unit).toBe(unit)
	})

	it('binds no unit to a word that is not one', () => {
		expect(Object.hasOwn(scanNumbers('40 guests')[0] ?? {}, 'unit')).toBe(false)
	})
})

describe('scanNumbers — what cannot be read exactly', () => {
	it('marks exponent notation unreadable without exposing a foreign exponent fragment', () => {
		const numbers = scanNumbers('1e3')
		expect(numbers).toHaveLength(1)
		expect(numbers[0]?.unreadable).toBeDefined()
	})

	it('marks unsupported stacked word scales unreadable', () => {
		const numbers = scanNumbers('one thousand million')
		expect(numbers).toHaveLength(1)
		expect(numbers[0]?.unreadable).toBeDefined()
	})

	it('marks a scale result changed by rounding unreadable', () => {
		const numbers = scanNumbers('0.0000000001k')
		expect(numbers).toHaveLength(1)
		expect(numbers[0]?.unreadable).toBeDefined()
	})

	it.each<[string, string]>([
		['1.2m', 'undeclared'],
		['20s', 'undeclared'],
		['six figures', 'shorthand'],
		['twelve fifty', 'spoken'],
		['two fifty', 'spoken'],
		['€200,000', 'undeclared'],
		['£50', 'undeclared'],
		['200 euros', 'foreign currency'],
		['200.000', 'grouping'],
		['1,20,000', 'undeclared'],
		['a few thousand', 'loose'],
		['a couple hundred', 'loose'],
		['a couple', 'loose'],
		['several', 'loose'],
		['12 to 18', 'range'],
		['12-18', 'undeclared'],
		['5 or 6', 'range'],
		['between 5 and 6', 'range'],
		['20 x 30', 'dimensions'],
		['50 by 60', 'dimensions'],
		['1/2', 'undeclared'],
		['2½', 'undeclared'],
		['half a cup', 'fraction'],
		['twice a week', 'frequency'],
		['-5', 'undeclared'],
		['9007199254740993', 'overflow'],
		['1'.repeat(400), 'overflow'],
	])('%s is unreadable as %s', (text, reason) => {
		const [number] = scanNumbers(text)
		expect(number?.unreadable).toBe(reason)
	})

	it('holds no value it could not read exactly', () => {
		expect(scanNumbers('9007199254740993')[0]?.value).toBeUndefined()
		expect(scanNumbers('a couple')[0]?.value).toBeUndefined()
		expect(scanNumbers('1/2')[0]?.value).toBeUndefined()
	})

	it('marks both numbers of a pair, because together they state no one value', () => {
		const pair = scanNumbers('12 to 18')
		expect(pair.map((number) => number.unreadable)).toEqual(['range', 'range'])
	})
})

describe('scanNumbers — what belongs to no quantity', () => {
	it.each<[string, string | undefined]>([
		['in 2019', 'year'],
		['June 14', 'date'],
		['14 June', 'date'],
		['2024-01-02', undefined],
		['3/14/2024', undefined],
		['5pm', undefined],
		['5 pm', 'time'],
		['5:30', undefined],
		['555-0142', undefined],
		['555-123-4567', undefined],
		['call me at 5551234', 'phone'],
		['a 403(b)', undefined],
		['14th', undefined],
		['#12', undefined],
		['v2', undefined],
		['age 34', 'age'],
		["I'm 34", 'age'],
		['34 years old', 'age'],
		['3 years ago', 'past'],
		['every 2 weeks', 'period'],
		['NY 10001', 'zip'],
		['145 Main Street', 'address'],
	])('%s reports foreign classification %s', (text, foreign) => {
		const number = scanNumbers(text).at(-1)
		expect(number?.foreign).toBe(foreign)
		expect(foreign !== undefined || number?.unreadable === 'undeclared').toBe(true)
	})

	it('reads a value a word introduces as a reference, and names the word', () => {
		const [number] = scanNumbers('invoice 7731')
		expect(number?.reference).toBe('invoice')
		expect(number?.value).toBe(7731)
	})

	it('says a year-like number may be one, and leaves it a quantity with a head noun', () => {
		expect(scanNumbers('2019 dollars')[0]?.foreign).toBeUndefined()
		expect(scanNumbers('2019 guests')[0]?.yearish).toBe(true)
	})

	it('says a long digit run may be a phone number', () => {
		expect(scanNumbers('5551234567')[0]?.phone).toBe(true)
	})
})

describe('scanNumbers — what the words around it say', () => {
	it.each([
		'about 40',
		'around 40',
		'roughly 40',
		'up to 40',
		'at least 40',
		'40 or so',
		'40ish',
		'maybe 40',
		'I think 40',
	])('%s is hedged', (text) => {
		expect(scanNumbers(text)[0]?.hedged).toBe(true)
	})

	it('leaves a plain statement unhedged', () => {
		expect(scanNumbers('40 guests')[0]?.hedged).toBeUndefined()
	})

	it.each([
		'last 5 hours',
		'not 5',
		'in 3 months',
		'been 5',
		'actually 5',
		'sorry, 5',
		'used to be 5',
		'make that 5',
	])('%s is suspect', (text) => {
		expect(scanNumbers(text)[0]?.suspect).toBe(true)
	})

	it('leaves a verb "last" and a put-in count unsuspected', () => {
		expect(scanNumbers("it'll last 5 hours")[0]?.suspect).toBeUndefined()
		expect(scanNumbers('put in 60 hours')[0]?.suspect).toBeUndefined()
		expect(scanNumbers('sorry to ask, 5')[0]?.suspect).toBeUndefined()
	})

	it('marks a sentence that holds a change word, and only that sentence', () => {
		const numbers = scanNumbers('It was 5. The rent is 6.')
		expect(numbers.map((number) => number.changed === true)).toEqual([true, false])
	})

	it('marks a rate over a period the message also counts', () => {
		const [rate] = scanNumbers('40 hours a week for 2 weeks')
		expect(rate?.composite).toBe(true)
		expect(scanNumbers('40 hours a week')[0]?.composite).toBeUndefined()
	})

	it('marks a sentence a composite cue sits in', () => {
		expect(scanNumbers('double 5')[0]?.composite).toBe(true)
	})

	it('counts sentences and segments', () => {
		const numbers = scanNumbers('5, and 6. Then 7')
		expect(numbers.map((number) => number.sentence)).toEqual([0, 0, 1])
		expect(numbers[1]?.segment).toBeGreaterThan(numbers[0]?.segment ?? 0)
	})

	it("reads no sentence end from an abbreviation's dot", () => {
		const numbers = scanNumbers('5 hrs. and 6 kg')
		expect(numbers.map((number) => number.sentence)).toEqual([0, 0])
	})
})

describe('scanNumbers — spans', () => {
	it.each<[string, string]>([
		['pay $5 now', '$5'],
		['pay 5% now', '5%'],
		['pay 5k now', '5k'],
		['pay five dollars now', 'five dollars'],
		['pay three hundred now', 'three hundred'],
		['pay 2 and a half now', '2 and a half'],
		['call 555-0142 now', '555-0142'],
	])('in "%s" the span reads %s', (text, span) => {
		const [number] = scanNumbers(text)
		expect(text.slice(number?.start, number?.end)).toBe(span)
	})

	it('indexes the text as given, across what it normalizes', () => {
		const text = 'it’s 5–ish — $7'
		const numbers = scanNumbers(text)
		expect(numbers.map((number) => text.slice(number.start, number.end))).toEqual(['5–ish', '$7'])
	})
})

describe('scanNumbers — total on anything', () => {
	it('reads nothing from a text with no number', () => {
		expect(scanNumbers('')).toEqual([])
		expect(scanNumbers('   \n ')).toEqual([])
		expect(scanNumbers('no numbers here, thanks')).toEqual([])
	})

	it.each(['constructor 5', 'toString 5', '__proto__ 5', 'hasOwnProperty 5', 'valueOf'])(
		'%s reads no prototype member as a word',
		(text) => {
			const numbers = scanNumbers(text)
			expect(numbers.every((number) => number.value === 5)).toBe(true)
		},
	)

	it('reads a long text of number words without walking it again for each', () => {
		const count = Math.floor(INTERPRET_TEXT_LIMIT / 'one x '.length)
		const numbers = scanNumbers('one x '.repeat(count))
		expect(numbers).toHaveLength(count)
	})

	it('reads a long run of counted periods without comparing each to all', () => {
		const count = Math.floor(INTERPRET_TEXT_LIMIT / '5 hours a week for 2 weeks '.length)
		const numbers = scanNumbers('5 hours a week for 2 weeks '.repeat(count))
		expect(numbers.filter((number) => number.composite === true)).toHaveLength(count)
	})

	it('reads a long single cardinal', () => {
		const numbers = scanNumbers('one '.repeat(Math.floor(INTERPRET_TEXT_LIMIT / 'one '.length)))
		expect(numbers).toHaveLength(1)
		expect(numbers[0]?.unreadable).toBe('spoken')
	})
})

describe('scanNumbers — the contract', () => {
	it('publishes the one-word phone mark through the reader contract', () => {
		const numbers = scanNumbers('5551234567')
		expect(numbers[0]).toMatchObject({ phone: true })
		expect(Object.hasOwn(numbers[0] ?? {}, 'phoneLike')).toBe(false)
		expect(readNumbersContract.is(numbers)).toBe(true)
	})

	const samples = [
		'$350,000 at 6.25% over 30 years',
		'a few thousand, twelve fifty, 12 to 18, €5',
		'in 2019, call 555-0142, about 40 hours a week for 2 weeks',
		'9007199254740993 and 1/2',
	]

	it.each(samples)('what it reads from "%s" passes its contract', (text) => {
		expect(readNumbersContract.audit(scanNumbers(text))).toEqual([])
		expect(readNumbersContract.is(scanNumbers(text))).toBe(true)
	})

	it('never holds a value that is not a finite number', () => {
		const values = samples.flatMap((text) =>
			scanNumbers(text).flatMap((number) => number.value ?? []),
		)
		expect(values.length).toBeGreaterThan(0)
		expect(values.filter((value) => !Number.isFinite(value))).toEqual([])
	})
})
