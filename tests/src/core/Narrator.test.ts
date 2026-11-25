import type { LogicalResult, SymbolicResult } from '@orkestrel/reason'
import type { AccountLine, GlossaryGap, NarratorFormatter, NarratorOptions } from '@src/core'
import {
	COMPARISONS,
	createAtom,
	createCompound,
	createConstant,
	createEquation,
	createFact,
	createInference,
	createInferentialDefinition,
	createInferentialReasoner,
	createLogicalDefinition,
	createLogicalReasoner,
	createQuantitativeReasoner,
	createReason,
	createRule,
	createSymbolicDefinition,
	createSymbolicReasoner,
	createVariable,
	isLogicalResult,
} from '@orkestrel/reason'
import { captureError, createHostileValues, requireValue } from '@orkestrel/test'
import { isInterpretError, Narrator, renderAccount, renderSubject } from '@src/core'
import { describe, expect, it } from 'vitest'
import {
	buildExpressionTrees,
	buildWorkshopArea,
	buildWorkshopFacts,
	buildWorkshopRules,
	buildWorkshopScore,
	collectTreeSubjects,
	renderInterpretUnit,
	TRICKY_KEYS,
	WORKSHOP_AREA,
	WORKSHOP_BASE,
	WORKSHOP_GLOSSARY,
	WORKSHOP_SCORES,
	WORKSHOP_SUBJECTS,
} from '../../setup.js'

// The `Narrator` writes a reasons run as a worded account. Every account here is written from the
// real engine's result, and every expectation is a literal or a fact of the fixture.

const REASON = createReason({
	reasoners: [
		createLogicalReasoner(),
		createQuantitativeReasoner(),
		createSymbolicReasoner(),
		createInferentialReasoner(),
	],
})

// The words a rule line uses for each state, written out so that no test reads the lexicon.
const STATE_WORDS = { met: 'holds', unmet: 'does not hold', unread: 'cannot be read' } as const

// Values no field may hold sensibly, for the totality sweeps.
const STRANGE_VALUES: readonly unknown[] = [
	...createHostileValues(),
	Number.NaN,
	Number.POSITIVE_INFINITY,
	Number.NEGATIVE_INFINITY,
	-0,
	undefined,
	null,
	true,
	false,
	'',
	' ',
	'one\ntwo',
	'one\r\ntwo',
	'one\u{2028}two\u{2029}three\u{85}four',
	Symbol('mark'),
	12n,
	Math.max,
	new Map([['a', 1]]),
	[],
	[Number.NaN, undefined, '', [1]],
	{ a: 1 },
]

// Every generated tree under every assignment: the engine's state, beside the words and the cited
// fields of the rule's line.
const SHIPPED = new Narrator()
const TREE_READINGS = buildExpressionTrees().map((definition) =>
	collectTreeSubjects().map((subject) => {
		const result = REASON.reason(subject, definition)
		if (!isLogicalResult(result)) throw new Error('Expected a logical result')
		const line = SHIPPED.narrate(definition, result).lines.find((entry) => entry.role === 'reason')
		return {
			subject,
			name: requireValue(definition.rules[0]).name,
			state: requireValue(result.rules[0]).state,
			text: line?.text ?? '',
			cited: (line?.lines ?? []).flatMap((entry) => entry.source.check?.field ?? []),
		}
	}),
)

// What no written text may hold: a missing value's name, a line break, or an empty slot.
const BLANK_TEXT =
	/undefined|NaN|[\n\v\f\r\x85\p{Zl}\p{Zp}]|^\s*$|\s$|\bis ,|\bis $|which is\s*(?:,|$)|, because\s*(?:,|$)/u

const WORKSHOP_HELD_FULL = [
	'Workshop booking holds, because Trusted booker holds, Quiet activity holds, Restricted activity does not hold, and cost is $1,000.00, which is at most $1,250.00',
	'  Trusted booker holds, because wOrkshop tier is gold',
	'    wOrkshop tier is gold',
	'  Quiet activity holds, because noise level is 30, which is not more than 40',
	'    noise level is 30, which is not more than 40',
	'  Restricted activity does not hold, because activity is pottery, which is not one of the 40 listed',
	'    activity is pottery, which is not one of the 40 listed',
	'  cost is $1,000.00, which is at most $1,250.00',
	'Rules that hold: 6 of 8',
	'Opening hours holds, because start hour is 10, which is between 8 and 18',
	'  start hour is 10, which is between 8 and 18',
	'Trusted booker holds, because wOrkshop tier is gold',
	'  wOrkshop tier is gold',
	'Quiet activity holds, because noise level is 30, which is not more than 40',
	'  noise level is 30, which is not more than 40',
	'Tools with training holds, because trained supervisor is true',
	'  trained supervisor is true',
	'One session holds, because morning session is true and evening session is false',
	'  morning session is true',
	'  evening session is false',
	'Approval holds, because Trusted booker holds, Quiet activity holds, Restricted activity does not hold, and cost is $1,000.00, which is at most $1,250.00',
	'  Trusted booker holds',
	'  Quiet activity holds',
	'  Restricted activity does not hold',
	'  cost is $1,000.00, which is at most $1,250.00',
	'Restricted activity does not hold, because activity is pottery, which is not one of the 40 listed',
	'  activity is pottery, which is not one of the 40 listed',
	'Over capacity does not hold, because places over capacity is $0.00, which is not more than $0.00',
	'  places over capacity is $0.00, which is not more than $0.00',
]

describe('Narrator', () => {
	describe('phrase', () => {
		it('reads the glossary tables, then the lexicon tables by name, then the fallback and the key', () => {
			const narrator = new Narrator({
				glossary: { labels: {}, phrases: { status: { active: 'under way' } } },
			})
			expect(narrator.phrase('status', 'active')).toBe('under way')
			expect(narrator.phrase('comparisons', 'from')).toBe('is at least')
			expect(narrator.phrase('checks', 'unread')).toBe('not known')
			expect(narrator.phrase('rules', 'unmet')).toBe('does not hold')
			expect(narrator.phrase('connectives', 'or')).toBe('or')
			expect(narrator.phrase('aggregations', 'maximum')).toBe('Highest')
			expect(narrator.phrase('faults', 'missing')).toBe('is not known')
			expect(narrator.phrase('values', 'null')).toBe('none')
			expect(narrator.phrase('frames', 'rule.settled')).toBe('{{name}} {{verdict}}')
			expect(narrator.phrase('status', 'closed', 'fallback')).toBe('fallback')
			expect(narrator.phrase('status', 'closed')).toBe('closed')
			expect(narrator.phrase('missing', 'active')).toBe('active')
			expect(narrator.phrase('limits', 'list')).toBe('list')
		})

		it('reads own keys alone', () => {
			const narrator = new Narrator({
				glossary: { labels: {}, phrases: { status: { active: 'under way' } } },
			})
			for (const key of TRICKY_KEYS) {
				expect(narrator.phrase(key, 'active', 'fallback')).toBe('fallback')
				expect(narrator.phrase('status', key, 'fallback')).toBe('fallback')
				expect(narrator.phrase('rules', key, 'fallback')).toBe('fallback')
				expect(narrator.phrase(key, key)).toBe(key)
			}
		})
	})

	describe('label', () => {
		it('renders the label keyed by the path, and the path without one', () => {
			const narrator = new Narrator({
				glossary: { labels: { age: 'Age', 'address.city': 'City' } },
			})
			expect(narrator.label('age')).toBe('Age')
			expect(narrator.label(['address', 'city'])).toBe('City')
			expect(narrator.label('income')).toBe('income')
			expect(narrator.label(['nested', 'path'])).toBe('nested.path')
		})

		it('reads own keys alone, and quotes a blank path', () => {
			const narrator = new Narrator({ glossary: { labels: { age: 'Age' } } })
			for (const key of TRICKY_KEYS.filter((entry) => entry !== '')) {
				expect(narrator.label(key)).toBe(key)
			}
			expect(narrator.label('')).toBe('""')
			expect(narrator.label([])).toBe('""')
		})
	})

	describe('line', () => {
		it('fills a glossary template, then a lexicon frame, and is empty for an unknown id', () => {
			const narrator = new Narrator({
				glossary: { labels: {}, templates: { greeting: 'Hello {{name}}, you are {{age}}' } },
			})
			expect(narrator.line('greeting', { name: 'Ada', age: 30 })).toBe('Hello Ada, you are 30')
			expect(narrator.line('rule.settled', { name: 'Ada', verdict: 'holds' })).toBe('Ada holds')
			expect(narrator.line('missing', {})).toBe('')
		})

		it('answers an empty string when a value cannot be written', () => {
			const narrator = new Narrator({ glossary: { labels: {}, templates: { note: '{{x}}' } } })
			expect(narrator.line('note', { x: Object.create(null) })).toBe('')
		})

		it('reads own keys alone', () => {
			const narrator = new Narrator()
			for (const key of TRICKY_KEYS) expect(narrator.line(key, {})).toBe('')
		})
	})

	describe('value', () => {
		it('formats a number in its field unit, and ungrouped without one', () => {
			const narrator = new Narrator({
				glossary: {
					labels: {},
					units: { cost: 'money', share: 'percent', visits: 'count', year: 'plain', size: 'acre' },
					formats: { money: { style: 'currency', currency: 'USD' } },
				},
			})
			expect(narrator.value('cost', 1250)).toBe('$1,250.00')
			expect(narrator.value('share', 0.22222)).toBe('22.22%')
			expect(narrator.value('visits', 50000)).toBe('50,000')
			expect(narrator.value('year', 2026)).toBe('2026')
			expect(narrator.value('size', 1234.5)).toBe('1234.5')
			expect(narrator.value('other', 1234567.125)).toBe('1234567.125')
			expect(narrator.value('other', 0.1 + 0.2)).toBe('0.30000000000000004')
		})

		it('prefers a formatter to a format, and a glossary format to a shipped one', () => {
			const narrator = new Narrator({
				glossary: {
					labels: {},
					units: { cost: 'money', visits: 'count' },
					formats: {
						money: { style: 'currency', currency: 'USD' },
						count: { minimumIntegerDigits: 4, useGrouping: false },
					},
				},
				formatters: { money: renderInterpretUnit },
			})
			expect(narrator.value('cost', 5)).toBe('unit:5')
			expect(narrator.value('visits', 7)).toBe('0007')
		})

		it.each<readonly [string, () => unknown]>([
			[
				'throws',
				() => {
					throw new Error('refused')
				},
			],
			['returns no text', () => 5],
			['returns blank text', () => ' '],
			['returns a line break', () => 'a\nb'],
		])('falls back to the format when the formatter %s', (_title, formatter) => {
			const formatters = {}
			Reflect.set(formatters, 'count', formatter)
			Reflect.set(formatters, 'acre', formatter)
			const narrator = new Narrator({
				glossary: { labels: {}, units: { cost: 'count', size: 'acre' } },
				formatters,
			})
			expect(narrator.value('cost', 4200)).toBe('4,200')
			expect(narrator.value('size', 4200)).toBe('4200')
		})

		it('words true, false, and null, keeps a string, and joins a list by the locale', () => {
			const narrator = new Narrator({
				lexicon: { values: { true: 'yes' } },
				glossary: { labels: {}, units: { cost: 'count' } },
			})
			expect(narrator.value('x', true)).toBe('yes')
			expect(narrator.value('x', false)).toBe('false')
			expect(narrator.value('x', null)).toBe('none')
			expect(narrator.value('x', ' gOLD  ')).toBe(' gOLD  ')
			expect(narrator.value('cost', [1000, 2000])).toBe('1,000 and 2,000')
			expect(narrator.value('x', ['a', 'b', 'c'])).toBe('a, b, and c')
			expect(narrator.value('x', [['a'], 'b'])).toBe('array and b')
		})

		it('previews anything else, and never prints an absent value as a word of code', () => {
			const narrator = new Narrator()
			expect(narrator.value('x', undefined)).toBe('is not known')
			expect(narrator.value('x', Number.NaN)).toBe('is not known')
			expect(narrator.value('x', Number.POSITIVE_INFINITY)).toBe('∞')
			expect(narrator.value('x', '')).toBe('""')
			expect(narrator.value('x', ' ')).toBe('" "')
			expect(narrator.value('x', [])).toBe('array')
			expect(narrator.value('x', { a: 1 })).toBe('object')
			expect(narrator.value('x', 12n)).toBe('12n')
		})

		it('carries grouping and list joining in the locale', () => {
			const narrator = new Narrator({
				glossary: { labels: {}, units: { visits: 'count' } },
				locale: 'de-DE',
			})
			expect(narrator.value('visits', 1234.5)).toBe('1.234,5')
			expect(narrator.value('other', 1234.5)).toBe('1234,5')
			expect(narrator.value('x', ['a', 'b'])).toBe('a und b')
		})

		it('reads own keys alone', () => {
			const narrator = new Narrator({ formatters: { money: renderInterpretUnit } })
			for (const key of TRICKY_KEYS) expect(narrator.value(key, 7)).toBe('7')
		})
	})

	describe('construction', () => {
		it.each<readonly [string, NarratorOptions, 'LEXICON' | 'GLOSSARY', string]>([
			[
				'a frame naming a slot its id does not offer',
				{ lexicon: { frames: { 'result.refused': '{{name}} at {{value}}' } } },
				'LEXICON',
				'frames."result.refused" names the slot "value", and it offers name',
			],
			['an empty word', { lexicon: { missing: ' ' } }, 'LEXICON', 'missing is empty'],
			[
				'a word with a line break',
				{ lexicon: { rules: { met: 'ho\nlds' } } },
				'LEXICON',
				'rules.met holds a line break',
			],
			[
				'a locale the host does not read',
				{ locale: 'not a tag' },
				'LEXICON',
				'The locale "not a tag" is not a language tag',
			],
			[
				'an empty label',
				{ glossary: { labels: { cost: '' } } },
				'GLOSSARY',
				'labels.cost is empty',
			],
			[
				'a label with a line break',
				{ glossary: { labels: { cost: 'a\rb' } } },
				'GLOSSARY',
				'labels.cost holds a line break',
			],
			[
				'a phrase table the lexicon owns',
				{ glossary: { labels: {}, phrases: { comparisons: { from: 'over' } } } },
				'GLOSSARY',
				'phrases.comparisons is a table of the lexicon',
			],
			[
				'a template the lexicon owns',
				{ glossary: { labels: {}, templates: { 'rule.because': '{{name}}' } } },
				'GLOSSARY',
				'templates."rule.because" is a frame of the lexicon',
			],
			[
				'a format the host refuses',
				{ glossary: { labels: {}, formats: { money: { style: 'currency' } } } },
				'GLOSSARY',
				'formats.money is not a number format the host reads',
			],
		])('refuses %s', (_title, options, code, finding) => {
			const error = captureError(() => new Narrator(options))
			if (!isInterpretError(error)) throw new Error('Expected an InterpretError')
			expect(error.code).toBe(code)
			expect(error.message).toContain(finding)
			expect(error.context).toEqual({ findings: [finding] })
		})

		it('accepts a unit with no format, and ignores a formatter that is no function', () => {
			const options: NarratorOptions = JSON.parse(
				'{"glossary":{"labels":{},"units":{"size":"acre"}},"formatters":{"acre":5}}',
			)
			const narrator = new Narrator(options)
			expect(narrator.value('size', 42)).toBe('42')
		})

		it('refuses words that are no plain data, whatever they are', () => {
			for (const value of createHostileValues()) {
				const options: NarratorOptions = JSON.parse('{}')
				Object.defineProperty(options, 'glossary', { value })
				const error = captureError(() => new Narrator(options))
				expect(isInterpretError(error) && error.code).toBe('GLOSSARY')
			}
		})

		it('owns its words, so a later change to the caller changes nothing', () => {
			const labels: Record<string, string> = { cost: 'Cost' }
			const frames: Record<string, string> = { 'rule.settled': '{{name}}: {{verdict}}' }
			const money: Intl.NumberFormatOptions = { style: 'currency', currency: 'USD' }
			const formatters: Record<string, NarratorFormatter> = { acre: renderInterpretUnit }
			const narrator = new Narrator({
				lexicon: { frames },
				glossary: { labels, units: { cost: 'money', size: 'acre' }, formats: { money } },
				formatters,
			})
			labels.cost = 'Price'
			frames['rule.settled'] = 'changed'
			money.currency = 'EUR'
			formatters.acre = String
			expect(narrator.label('cost')).toBe('Cost')
			expect(narrator.line('rule.settled', { name: 'A', verdict: 'holds' })).toBe('A: holds')
			expect(narrator.value('cost', 5)).toBe('$5.00')
			expect(narrator.value('size', 5)).toBe('unit:5')
		})

		it('stores and retrieves words under keys drawn from TRICKY_KEYS', () => {
			const [tableKey, phraseKey, templateKey, unitKey] = TRICKY_KEYS
			const narrator = new Narrator({
				glossary: {
					labels: {},
					units: { size: requireValue(unitKey) },
					phrases: { [requireValue(tableKey)]: { [requireValue(phraseKey)]: 'stored' } },
					templates: { [requireValue(templateKey)]: 'template {{x}}' },
				},
				formatters: { [requireValue(unitKey)]: renderInterpretUnit },
			})
			expect(narrator.phrase(requireValue(tableKey), requireValue(phraseKey))).toBe('stored')
			expect(narrator.line(requireValue(templateKey), { x: 1 })).toBe('template 1')
			expect(narrator.value('size', 5)).toBe('unit:5')
		})
	})

	describe('the guide', () => {
		it('writes the definition name and each enabled part, and carries no success', () => {
			const narrator = new Narrator()
			const score = narrator.describe(buildWorkshopScore())
			expect(renderAccount(score, { detail: 'full' }).split('\n')).toEqual([
				'Booking score',
				'Fees',
				'  Base fee',
				'  Service charge',
				'  Gold bonus',
				'Space',
				'  Room rate',
			])
			expect('success' in score).toBe(false)
			expect(
				renderAccount(narrator.describe(buildWorkshopRules()), { detail: 'full' }).split('\n'),
			).toEqual([
				'Workshop booking',
				'Restricted activity',
				'Over capacity',
				'Opening hours',
				'Trusted booker',
				'Quiet activity',
				'Tools with training',
				'One session',
				'Approval',
			])
			expect(renderAccount(narrator.describe(buildWorkshopArea()), { detail: 'full' })).toBe(
				'Floor area\nFloor area',
			)
			expect(renderAccount(narrator.describe(buildWorkshopFacts()), { detail: 'full' })).toBe(
				'Booking facts\nStaffing\nCleaning\nClosing',
			)
		})

		it('leaves a disabled rule out, and prints an id where a name is blank', () => {
			const definition = createLogicalDefinition('loan', '', [
				createRule('adult', [createAtom('age', 'from', 18)], createAtom('adult', 'equals', true), {
					name: ' ',
				}),
				createRule('off', [createAtom('age', 'from', 18)], createAtom('off', 'equals', true), {
					name: 'Off',
					enabled: false,
				}),
			])
			const account = new Narrator().describe(definition)
			expect(account.name).toBe('loan')
			expect(renderAccount(account, { detail: 'full' })).toBe('loan\nadult')
			expect(account.lines.flatMap((line) => line.gaps)).toEqual([
				{ word: 'name', part: 'definition', id: 'loan' },
				{ word: 'name', part: 'rule', id: 'adult' },
			])
		})
	})

	describe('narrate', () => {
		it('writes the verdict, the count, and each rule, at three levels of detail', () => {
			const definition = buildWorkshopRules()
			const held = requireValue(WORKSHOP_SUBJECTS.held)
			const account = new Narrator({ glossary: WORKSHOP_GLOSSARY }).narrate(
				definition,
				REASON.reason(held.subject, definition),
			)
			expect(account).toMatchObject({ id: 'workshop', name: 'Workshop booking', success: true })
			expect(renderAccount(account, { detail: 'full' }).split('\n')).toEqual(WORKSHOP_HELD_FULL)
			expect(renderAccount(account, { detail: 'reasons' }).split('\n')).toEqual(
				WORKSHOP_HELD_FULL.slice(0, 8),
			)
			expect(renderAccount(account)).toBe(renderAccount(account, { detail: 'reasons' }))
			expect(renderAccount(account, { detail: 'line' })).toBe(WORKSHOP_HELD_FULL[0])
		})

		it('cites the facts that decided a rule that does not hold', () => {
			const narrator = new Narrator({ glossary: WORKSHOP_GLOSSARY })
			const definition = buildWorkshopRules()
			const neither = requireValue(WORKSHOP_SUBJECTS.neither)
			expect(
				renderAccount(
					narrator.narrate(definition, REASON.reason(neither.subject, definition)),
				).split('\n'),
			).toEqual([
				'Workshop booking does not hold, because Trusted booker does not hold',
				'  Trusted booker does not hold, because wOrkshop tier is silver, which is not gold and booking score is 400, which is less than 700',
				'    wOrkshop tier is silver, which is not gold',
				'    booking score is 400, which is less than 700',
			])
			const restricted = requireValue(WORKSHOP_SUBJECTS.restricted)
			expect(
				renderAccount(
					narrator.narrate(definition, REASON.reason(restricted.subject, definition)),
				).split('\n'),
			).toEqual([
				'Workshop booking does not hold, because Restricted activity holds',
				'  Restricted activity holds, because activity is torch welding, which is one of the 40 listed',
				'    activity is torch welding, which is one of the 40 listed',
			])
		})

		it('prints a short list in full, and counts one past the limit and one that is empty', () => {
			const narrator = new Narrator({ lexicon: { limits: { list: 2 } } })
			const definition = createLogicalDefinition('list', 'List', [
				createRule(
					'two',
					[createAtom('kind', 'any', ['a', 'b'])],
					createAtom('x', 'equals', true),
					{
						name: 'Two',
					},
				),
				createRule(
					'three',
					[createAtom('kind', 'none', ['a', 'b', 'c'])],
					createAtom('y', 'equals', true),
					{ name: 'Three' },
				),
			])
			const texts = renderAccount(
				narrator.narrate(definition, REASON.reason({ kind: 'z' }, definition)),
				{ detail: 'full' },
			).split('\n')
			expect(texts).toContain('Two does not hold, because kind is z, which is not one of a and b')
			expect(texts).toContain('Three holds, because kind is z, which is not one of the 3 listed')
		})

		it('writes every comparison both ways', () => {
			const narrator = new Narrator()
			const facts = [
				['equals', 5, 5, 'n is 5'],
				['equals', 5, 6, 'n is 6, which is not 5'],
				['not', 5, 6, 'n is 6, which is not 5'],
				['not', 5, 5, 'n is 5'],
				['above', 5, 6, 'n is 6, which is more than 5'],
				['above', 5, 5, 'n is 5, which is not more than 5'],
				['below', 5, 4, 'n is 4, which is less than 5'],
				['below', 5, 5, 'n is 5, which is not less than 5'],
				['from', 5, 5, 'n is 5, which is at least 5'],
				['from', 5, 4, 'n is 4, which is less than 5'],
				['to', 5, 5, 'n is 5, which is at most 5'],
				['to', 5, 6, 'n is 6, which is more than 5'],
				['any', [5, 7], 5, 'n is 5, which is one of 5 and 7'],
				['any', [5, 7], 6, 'n is 6, which is not one of 5 and 7'],
				['none', [5, 7], 6, 'n is 6, which is not one of 5 and 7'],
				['none', [5, 7], 5, 'n is 5, which is one of 5 and 7'],
				['between', [5, 7], 5, 'n is 5, which is between 5 and 7'],
				['between', [5, 7], 8, 'n is 8, which is not between 5 and 7'],
				['outside', [5, 7], 8, 'n is 8, which is not between 5 and 7'],
				['outside', [5, 7], 5, 'n is 5, which is between 5 and 7'],
			] as const
			for (const [operator, expected, actual, text] of facts) {
				const definition = createLogicalDefinition('d', 'D', [
					createRule('r', [createAtom('n', operator, expected)], createAtom('x', 'equals', true)),
				])
				const account = narrator.narrate(definition, REASON.reason({ n: actual }, definition))
				expect(account.lines[0]?.lines.map((line) => line.text)).toEqual([text])
			}
			expect([...new Set(facts.map(([operator]) => operator))]).toEqual([...COMPARISONS])
		})

		it('states a boolean and a null by what they are', () => {
			const definition = createLogicalDefinition('d', 'D', [
				createRule(
					'r',
					[
						createCompound('or', [
							createAtom('paid', 'equals', true),
							createAtom('owner', 'not', null),
						]),
					],
					createAtom('x', 'equals', true),
				),
			])
			const account = new Narrator().narrate(
				definition,
				REASON.reason({ paid: false, owner: null }, definition),
			)
			expect(account.lines[0]?.text).toBe(
				'D does not hold, because paid is false and owner is none',
			)
		})

		it('chases each derived key once, so a cycle of rules ends', () => {
			const definition = createLogicalDefinition('loop', 'Loop', [
				createRule('p', [createAtom('q', 'equals', true)], createAtom('p', 'equals', true), {
					name: 'First rule',
				}),
				createRule('q', [createAtom('p', 'equals', true)], createAtom('q', 'equals', true), {
					name: 'Second rule',
				}),
			])
			const account = new Narrator().narrate(definition, REASON.reason({}, definition))
			expect(renderAccount(account).split('\n')).toEqual([
				'Loop does not hold, because First rule does not hold',
				'  First rule does not hold, because Second rule does not hold',
				'    Second rule does not hold',
			])
		})

		it('cites the rule that concluded a key, and every rule when none did', () => {
			const definition = createLogicalDefinition('either', 'Either', [
				createRule('a', [createAtom('a', 'equals', 1)], createAtom('ok', 'equals', true), {
					name: 'By a',
				}),
				createRule('b', [createAtom('b', 'equals', 1)], createAtom('ok', 'equals', true), {
					name: 'By b',
				}),
				createRule('c', [createAtom('ok', 'equals', true)], createAtom('done', 'equals', true), {
					name: 'Done',
				}),
			])
			const narrator = new Narrator()
			expect(
				narrator.narrate(definition, REASON.reason({ a: 2, b: 1 }, definition)).lines[0]?.text,
			).toBe('Either holds, because By b holds')
			expect(
				narrator.narrate(definition, REASON.reason({ a: 2, b: 2 }, definition)).lines[0]?.text,
			).toBe('Either does not hold, because By a does not hold and By b does not hold')
		})

		it('grows with the rules of a chain, not with their square', () => {
			const definition = createLogicalDefinition(
				'chain',
				'Chain',
				Array.from({ length: 200 }, (_, index) =>
					createRule(
						`r${String(index)}`,
						[createAtom(index === 0 ? 'seed' : `k${String(index - 1)}`, 'equals', true)],
						createAtom(`k${String(index)}`, 'equals', true),
					),
				),
				{ depth: 500 },
			)
			const account = new Narrator().narrate(definition, REASON.reason({ seed: true }, definition))
			expect(account.success).toBe(true)
			expect(renderAccount(account, { detail: 'full' }).split('\n').length).toBeLessThan(800)
			expect(renderAccount(account).split('\n').length).toBe(201)
		})

		it('prints a rule without reasons when its result does not answer it', () => {
			const definition = createLogicalDefinition('d', 'Loan', [
				createRule('r', [createAtom('age', 'from', 18)], createAtom('x', 'equals', true), {
					name: 'Adult',
				}),
			])
			const result = REASON.reason({ age: 30 }, definition)
			if (!isLogicalResult(result)) throw new Error('Expected a logical result')
			const [rule] = result.rules
			const narrator = new Narrator()
			const altered: readonly LogicalResult[] = [
				{ ...result, conclusion: 'unmet', rules: [{ ...requireValue(rule), state: 'unmet' }] },
				{ ...result, rules: [{ ...requireValue(rule), premises: ['unmet'] }] },
				{ ...result, rules: [{ ...requireValue(rule), checks: [] }] },
				{
					...result,
					rules: [
						{ ...requireValue(rule), checks: [{ field: 'other', state: 'met', actual: 30 }] },
					],
				},
			]
			expect(altered.map((entry) => renderAccount(narrator.narrate(definition, entry)))).toEqual([
				'Loan does not hold',
				'Loan holds',
				'Loan holds',
				'Loan holds',
			])
		})

		it('prints a rule id and its gap when the definition holds no such rule', () => {
			const definition = createLogicalDefinition('d', 'Loan', [
				createRule('r', [createAtom('age', 'from', 18)], createAtom('x', 'equals', true)),
			])
			const other = createLogicalDefinition('e', 'Other', [])
			const account = new Narrator().narrate(other, REASON.reason({ age: 30 }, definition))
			expect(renderAccount(account, { detail: 'full' }).split('\n')).toEqual([
				'Other holds',
				'Rules that hold: 1 of 1',
				'r holds',
			])
			expect(account.lines[2]?.gaps).toEqual([{ word: 'name', part: 'rule', id: 'r' }])
		})

		it('prints a verdict when no rule is enabled', () => {
			const definition = createLogicalDefinition('d', 'Loan', [
				createRule('r', [createAtom('age', 'from', 18)], createAtom('x', 'equals', true), {
					enabled: false,
				}),
			])
			const account = new Narrator().narrate(definition, REASON.reason({ age: 30 }, definition))
			expect(renderAccount(account, { detail: 'full' })).toBe(
				'Loan does not hold\nRules that hold: 0 of 0',
			)
		})

		it('writes one verdict line for a quantitative, a symbolic, and an inferential answer', () => {
			const narrator = new Narrator({
				glossary: {
					...WORKSHOP_GLOSSARY,
					values: { score: 'money' },
					units: { ...WORKSHOP_GLOSSARY.units, width: 'count' },
				},
			})
			const score = buildWorkshopScore()
			const gold = requireValue(WORKSHOP_SCORES.gold)
			expect(renderAccount(narrator.narrate(score, REASON.reason(gold.subject, score)))).toBe(
				'Booking score is $165.00',
			)
			const pair = createSymbolicDefinition('pair', 'Pair', [
				createEquation('w', createVariable('width'), createConstant(1200), 'width'),
				createEquation('d', createVariable('depth'), createConstant(10), 'depth'),
			])
			expect(renderAccount(narrator.narrate(pair, REASON.reason({}, pair)))).toBe(
				'width is 1,200 and depth is 10',
			)
			const facts = createInferentialDefinition(
				'facts',
				'Facts',
				[createFact('f', 'human', ['ada'])],
				[
					createInference(
						'mortal',
						[createFact('p', 'human', ['?x'])],
						createFact('c', 'mortal', ['?x']),
					),
				],
			)
			expect(renderAccount(narrator.narrate(facts, REASON.reason({}, facts)))).toBe(
				'Facts derived: 1',
			)
		})

		it('prints a verdict for a symbolic result with no solution', () => {
			const result: SymbolicResult = {
				reasoning: 'symbolic',
				solutions: {},
				success: true,
				trace: [],
				errors: [],
				faults: [],
				repairs: [],
				defaulted: [],
			}
			expect(
				renderAccount(new Narrator().narrate(createSymbolicDefinition('e', 'Empty', []), result)),
			).toBe('Empty gave no answer')
		})

		it('is deterministic across repeated calls', () => {
			const narrator = new Narrator({ glossary: WORKSHOP_GLOSSARY })
			const definition = buildWorkshopRules()
			const result = REASON.reason(WORKSHOP_BASE, definition)
			expect(narrator.narrate(definition, result)).toEqual(narrator.narrate(definition, result))
		})
	})

	describe('T1: a refused result states no value and names what it did not read', () => {
		it('names the missing field of a logical run, and counts nothing', () => {
			const definition = buildWorkshopRules()
			const nocost = requireValue(WORKSHOP_SUBJECTS.nocost)
			const account = new Narrator({ glossary: WORKSHOP_GLOSSARY }).narrate(
				definition,
				REASON.reason(nocost.subject, definition),
			)
			expect(account.success).toBe(false)
			const texts = renderAccount(account, { detail: 'full' }).split('\n')
			expect(texts.slice(0, 2)).toEqual(['Workshop booking gave no answer', '  cost is not known'])
			expect(texts.filter((text) => text.startsWith('Rules that hold'))).toEqual([])
			expect(renderAccount(account, { detail: 'line' })).toBe('Workshop booking gave no answer')
			expect(renderAccount(account).split('\n').slice(2)).toEqual([
				'Approval cannot be read, because Trusted booker holds, Quiet activity holds, Restricted activity does not hold, and cost is not known',
				'  Trusted booker holds, because wOrkshop tier is gold',
				'    wOrkshop tier is gold',
				'  Quiet activity holds, because noise level is 30, which is not more than 40',
				'    noise level is 30, which is not more than 40',
				'  Restricted activity does not hold, because activity is pottery, which is not one of the 40 listed',
				'    activity is pottery, which is not one of the 40 listed',
				'  cost is not known',
			])
		})

		it('names a field holding a value it cannot use, and never prints that value', () => {
			const definition = buildWorkshopRules()
			const account = new Narrator({ glossary: WORKSHOP_GLOSSARY }).narrate(
				definition,
				REASON.reason({ ...WORKSHOP_BASE, cost: 'plenty' }, definition),
			)
			expect(account.lines[0]?.lines).toEqual([
				{
					role: 'reason',
					state: 'unread',
					decisive: true,
					text: 'cost holds a value that cannot be used',
					source: {
						fault: { reason: 'type', path: 'cost', expected: 'number', received: '"plenty"' },
					},
					gaps: [],
					lines: [],
				},
			])
			expect(renderAccount(account, { detail: 'full' })).not.toContain('plenty')
		})

		it('carries the fault as the source of an unread fact', () => {
			const definition = buildWorkshopRules()
			const nonoise = requireValue(WORKSHOP_SUBJECTS.nonoise)
			const account = new Narrator({ glossary: WORKSHOP_GLOSSARY }).narrate(
				definition,
				REASON.reason(nonoise.subject, definition),
			)
			const quiet = account.lines.find((line) => line.source.rule === 'quiet')
			expect(quiet?.text).toBe('Quiet activity cannot be read, because noise level is not known')
			expect(quiet?.lines[0]?.source.fault).toEqual({
				reason: 'missing',
				path: 'noise',
				expected: 'number',
			})
		})

		it('states no value of a quantitative run, no solution of a symbolic one, and no count of a capped one', () => {
			const narrator = new Narrator({ glossary: WORKSHOP_GLOSSARY })
			const score = buildWorkshopScore()
			const area = buildWorkshopArea()
			const facts = buildWorkshopFacts()
			const nocost = requireValue(WORKSHOP_SCORES.nocost)
			const garage = requireValue(WORKSHOP_SCORES.garage)
			const refused = requireValue(WORKSHOP_AREA.refused)
			const accounts = [
				narrator.narrate(score, REASON.reason(nocost.subject, score)),
				narrator.narrate(score, REASON.reason(garage.subject, score)),
				narrator.narrate(area, REASON.reason(refused.subject, area)),
				narrator.narrate(facts, REASON.reason({}, facts)),
			]
			expect(accounts.map((account) => account.success)).toEqual([false, false, false, false])
			const texts = accounts.map((account) => renderAccount(account, { detail: 'full' }))
			expect(texts[0]).toBe('Booking score gave no answer\n  cost is not known')
			expect(texts[1]?.split('\n')[0]).toBe('Booking score gave no answer')
			expect(texts[2]).toBe('Floor area gave no answer\n  depth is not known')
			expect(texts[3]).toBe('Booking facts gave no answer')
			for (const text of texts) expect(text).not.toMatch(/\d/)
		})
	})

	describe('T2: a rule prints as holding only when its state is met', () => {
		it('agrees with the state the fixture gives every rule line of every subject', () => {
			const definition = buildWorkshopRules()
			const narrator = new Narrator({ glossary: WORKSHOP_GLOSSARY })
			const names = new Map(definition.rules.map((rule) => [rule.id, rule.name]))
			const stated = Object.values(WORKSHOP_SUBJECTS).map(({ subject, states }) => {
				const account = narrator.narrate(definition, REASON.reason(subject, definition))
				const lines = [...account.lines]
				for (const line of lines) lines.push(...line.lines)
				const rules = lines.filter((line) => line.source.rule !== undefined)
				for (const line of rules) {
					const id = line.source.rule ?? ''
					const name = line.role === 'verdict' ? 'Workshop booking' : requireValue(names.get(id))
					const state = requireValue(states[id])
					expect(line.state).toBe(state)
					const opening = `${name} ${STATE_WORDS[state]}`
					expect(line.text === opening || line.text.startsWith(`${opening}, because `)).toBe(true)
				}
				return new Set(rules.map((line) => line.source.rule)).size
			})
			expect(stated).toEqual(Object.values(WORKSHOP_SUBJECTS).map(() => 8))
		})

		it('agrees with the engine over every generated tree and assignment', () => {
			expect(
				TREE_READINGS.flat().filter(
					({ name, state, text }) => !text.startsWith(`${name} ${STATE_WORDS[state]}, because `),
				),
			).toEqual([])
			expect(TREE_READINGS.flat()).toHaveLength(818 * 27)
		})
	})

	describe('T3: a cited set fixes the state', () => {
		it('holds over every generated tree and every assignment, against the engine', () => {
			const moved = TREE_READINGS.flatMap((readings) =>
				readings.filter(
					(reading) =>
						reading.cited.length === 0 ||
						readings.some(
							(other) =>
								other.state !== reading.state &&
								reading.cited.every((field) => other.subject[field] === reading.subject[field]),
						),
				),
			)
			expect(moved).toEqual([])
			expect(new Set(TREE_READINGS.flat().map((reading) => reading.state))).toEqual(
				new Set(['met', 'unmet', 'unread']),
			)
		})

		it('cites no more than decides: one unmet operand, one met operand, one side of an implication', () => {
			const a = createAtom('a', 'equals', true)
			const b = createAtom('b', 'equals', true)
			const cases = [
				['and', [a, b], { a: false, b: false }, ['a is false']],
				['and', [a, b], { a: true, b: false }, ['b is false']],
				['and', [a, b], { a: true, b: true }, ['a is true', 'b is true']],
				['and', [a, b], { b: false }, ['b is false']],
				['or', [a, b], { a: true, b: true }, ['a is true']],
				['or', [a, b], { a: false, b: true }, ['b is true']],
				['or', [a, b], { a: false, b: false }, ['a is false', 'b is false']],
				['or', [a, b], { b: true }, ['b is true']],
				['not', [a], { a: false }, ['a is false']],
				['implies', [a, b], { a: false, b: false }, ['a is false']],
				['implies', [a, b], { a: true, b: true }, ['b is true']],
				['implies', [a, b], { a: true, b: false }, ['a is true', 'b is false']],
				['implies', [a, b], { b: true }, ['b is true']],
				['xor', [a, b], { a: true, b: false }, ['a is true', 'b is false']],
				['xor', [a, b], { a: true, b: true }, ['a is true', 'b is true']],
				['xor', [a, b], { a: true }, ['b is not known']],
				['and', [a, b], { a: true }, ['a is true', 'b is not known']],
				['or', [a, b], { a: false }, ['a is false', 'b is not known']],
				['implies', [a, b], { a: true }, ['a is true', 'b is not known']],
				['not', [a], {}, ['a is not known']],
			] as const
			for (const [operator, operands, subject, texts] of cases) {
				const definition = createLogicalDefinition('d', 'D', [
					createRule('r', [createCompound(operator, operands)], createAtom('x', 'equals', true)),
				])
				const account = new Narrator().narrate(definition, REASON.reason(subject, definition))
				const line = account.lines.find((entry) => entry.role === 'reason')
				expect(line?.lines.map((entry) => entry.text)).toEqual(texts)
			}
		})
	})

	describe('T5: no blank and no guess', () => {
		it('prints one whole line everywhere across the fixtures', () => {
			const rules = buildWorkshopRules()
			const score = buildWorkshopScore()
			const area = buildWorkshopArea()
			const facts = buildWorkshopFacts()
			for (const narrator of [new Narrator(), new Narrator({ glossary: WORKSHOP_GLOSSARY })]) {
				const accounts = [
					...Object.values(WORKSHOP_SUBJECTS).map(({ subject }) =>
						narrator.narrate(rules, REASON.reason(subject, rules)),
					),
					...Object.values(WORKSHOP_SCORES).map(({ subject }) =>
						narrator.narrate(score, REASON.reason(subject, score)),
					),
					...Object.values(WORKSHOP_AREA).map(({ subject }) =>
						narrator.narrate(area, REASON.reason(subject, area)),
					),
					narrator.narrate(facts, REASON.reason({}, facts)),
					...[rules, score, area, facts].map((definition) => narrator.describe(definition)),
				]
				const lines = accounts.flatMap((account) => account.lines)
				for (const line of lines) lines.push(...line.lines)
				expect(lines.filter((line) => BLANK_TEXT.test(line.text))).toEqual([])
				expect(lines.length).toBeGreaterThan(300)
			}
		})

		it('prints one whole line whatever a field, a check, or a name holds', () => {
			const narrator = new Narrator()
			const lines: AccountLine[] = []
			for (const actual of STRANGE_VALUES) {
				for (const expected of STRANGE_VALUES) {
					for (const operator of COMPARISONS) {
						const definition = createLogicalDefinition('d', 'one\ntwo', [
							createRule(
								'r',
								[createAtom('n', operator, expected)],
								createAtom('x', 'equals', true),
								{ name: 'a\u{2028}b' },
							),
						])
						const result = createLogicalReasoner().reason({ n: actual }, definition)
						lines.push(...narrator.narrate(definition, result).lines)
					}
				}
			}
			for (const line of lines) lines.push(...line.lines)
			expect(lines.filter((line) => BLANK_TEXT.test(line.text))).toEqual([])
			expect(new Set(lines.map((line) => line.state))).toEqual(
				new Set(['met', 'unmet', 'unread', undefined]),
			)
		})

		it('renders any value of a field as whole text', () => {
			const narrator = new Narrator()
			for (const value of STRANGE_VALUES) {
				const text = narrator.value('n', value)
				expect(text.trim()).not.toBe('')
				expect(text).not.toMatch(/undefined|NaN/)
			}
		})
	})

	describe('T6: one field formats one way', () => {
		it('prints one value alike in a fact, an expected value, a list, a solution, and a subject', () => {
			const narrator = new Narrator({ glossary: WORKSHOP_GLOSSARY })
			const definition = createLogicalDefinition('d', 'D', [
				createRule(
					'r',
					[
						createAtom('cost', 'to', 1250.5),
						createAtom('cost', 'any', [1250.5, 3]),
						createAtom(['terms', 'excess'], 'from', 1250.5),
					],
					createAtom('x', 'equals', true),
				),
			])
			const account = narrator.narrate(
				definition,
				REASON.reason({ cost: 1250.5, terms: { excess: 1250.5 } }, definition),
			)
			expect(account.lines[0]?.lines.map((line) => line.text)).toEqual([
				'cost is $1,250.50, which is at most $1,250.50',
				'cost is $1,250.50, which is one of $1,250.50 and $3.00',
				'places over capacity is $1,250.50, which is at least $1,250.50',
			])
			const solved = createSymbolicDefinition('s', 'S', [
				createEquation('e', createVariable('cost'), createConstant(1250.5), 'cost'),
			])
			expect(renderAccount(narrator.narrate(solved, REASON.reason({}, solved)))).toBe(
				'cost is $1,250.50',
			)
			expect(narrator.value('cost', 1250.5)).toBe('$1,250.50')
			expect(narrator.value('terms.excess', 1250.5)).toBe('$1,250.50')
			expect(renderSubject({ cost: 1250.5 }, narrator)).toBe('with cost: $1,250.50')
		})
	})

	describe('T7: a supplied word keeps its case', () => {
		it('prints a label, a rule name, and a value byte for byte', () => {
			const definition = createLogicalDefinition('d', 'the LOAN', [
				createRule('r', [createAtom('tier', 'equals', 'gOLD')], createAtom('ok', 'equals', true), {
					name: 'aPPROVED tier',
				}),
				createRule('s', [createAtom('ok', 'equals', true)], createAtom('x', 'equals', true), {
					name: 'LAST',
				}),
			])
			const account = new Narrator({ glossary: { labels: { tier: 'iD Trade' } } }).narrate(
				definition,
				REASON.reason({ tier: 'gOLD' }, definition),
			)
			expect(renderAccount(account).split('\n')).toEqual([
				'the LOAN holds, because aPPROVED tier holds',
				'  aPPROVED tier holds, because iD Trade is gOLD',
				'    iD Trade is gOLD',
			])
		})
	})

	describe('T8: a count names what it counts', () => {
		it('counts the met rules of the enabled ones', () => {
			const definition = createLogicalDefinition('d', 'Loan', [
				createRule('a', [createAtom('n', 'above', 1)], createAtom('a', 'equals', true)),
				createRule('b', [createAtom('n', 'above', 2)], createAtom('b', 'equals', true)),
				createRule('c', [createAtom('n', 'above', 9)], createAtom('c', 'equals', true)),
				createRule('d', [createAtom('n', 'above', 0)], createAtom('d', 'equals', true), {
					enabled: false,
				}),
			])
			const account = new Narrator().narrate(definition, REASON.reason({ n: 5 }, definition))
			expect(account.lines[1]).toEqual({
				role: 'step',
				decisive: false,
				text: 'Rules that hold: 2 of 3',
				source: {},
				gaps: [],
				lines: [],
			})
		})
	})

	describe('T9: one word is overridable alone', () => {
		it('changes only the sentences of one comparison in one wording', () => {
			const definition = buildWorkshopRules()
			const shipped = new Narrator({ glossary: WORKSHOP_GLOSSARY })
			const worded = new Narrator({
				glossary: WORKSHOP_GLOSSARY,
				lexicon: { comparisons: { to: { holds: 'stays within' } } },
			})
			const held = REASON.reason(WORKSHOP_BASE, definition)
			expect(renderAccount(shipped.narrate(definition, held), { detail: 'full' })).toBe(
				WORKSHOP_HELD_FULL.join('\n'),
			)
			expect(
				renderAccount(worded.narrate(definition, held), { detail: 'full' }).split('\n'),
			).toEqual(WORKSHOP_HELD_FULL.map((text) => text.replace('is at most', 'stays within')))
			const over = REASON.reason({ ...WORKSHOP_BASE, cost: 2000 }, definition)
			expect(renderAccount(worded.narrate(definition, over), { detail: 'line' })).toBe(
				'Workshop booking does not hold, because cost is $2,000.00, which is more than $1,250.00',
			)
			expect(worded.narrate(definition, over)).toEqual(shipped.narrate(definition, over))
		})

		it('writes another language from a complete set of words and a locale', () => {
			const narrator = new Narrator({
				locale: 'de-DE',
				lexicon: {
					comparisons: { from: { holds: 'mindestens', fails: 'unter' } },
					rules: { met: 'gilt', unmet: 'gilt nicht' },
					frames: {
						'rule.because': '{{name}} {{verdict}}, weil {{reasons}}',
						'fact.compared': '{{label}} {{actual}} ist, also {{comparison}} {{expected}}',
						'result.count': '{{met}} von {{total}} Regeln gelten',
					},
				},
				glossary: { labels: { preis: 'der Preis' }, units: { preis: 'count' } },
			})
			const definition = createLogicalDefinition('d', 'Der Kredit', [
				createRule('r', [createAtom('preis', 'from', 1000)], createAtom('x', 'equals', true)),
			])
			const account = narrator.narrate(definition, REASON.reason({ preis: 1500 }, definition))
			expect(account.lines.slice(0, 2).map((line) => line.text)).toEqual([
				'Der Kredit gilt, weil der Preis 1.500 ist, also mindestens 1.000',
				'1 von 1 Regeln gelten',
			])
		})
	})

	describe('T10: a missing domain word is reported', () => {
		it('reports exactly the removed label, unit, format, and name, from audit and on the lines', () => {
			const rules = buildWorkshopRules()
			const definition = {
				...rules,
				rules: rules.rules.map((rule) => (rule.id === 'quiet' ? { ...rule, name: 'quiet' } : rule)),
			}
			const { start: _start, ...labels } = WORKSHOP_GLOSSARY.labels
			const { cost: _cost, ...units } = WORKSHOP_GLOSSARY.units
			const { decibel: _decibel, ...formats } = WORKSHOP_GLOSSARY.formats
			const narrator = new Narrator({ glossary: { ...WORKSHOP_GLOSSARY, labels, units, formats } })
			const gaps: readonly GlossaryGap[] = [
				{ word: 'name', part: 'rule', id: 'quiet' },
				{ word: 'label', field: 'start' },
				{ word: 'format', unit: 'decibel' },
				{ word: 'unit', field: 'cost' },
			]
			expect(narrator.audit([definition])).toEqual(gaps)
			const account = narrator.narrate(definition, REASON.reason(WORKSHOP_BASE, definition))
			const lines = [...account.lines]
			for (const line of lines) lines.push(...line.lines)
			const carried = new Set(lines.flatMap((line) => line.gaps).map((gap) => JSON.stringify(gap)))
			expect([...carried].toSorted()).toEqual(gaps.map((gap) => JSON.stringify(gap)).toSorted())
			const texts = renderAccount(account, { detail: 'full' }).split('\n')
			expect(texts).toContain('Opening hours holds, because start is 10, which is between 8 and 18')
			expect(texts).toContain('  cost is 1000, which is at most 1250')
			expect(texts).toContain('quiet holds, because noise level is 30, which is not more than 40')
		})

		it('reports nothing for the complete glossary, over every fixture', () => {
			const narrator = new Narrator({ glossary: WORKSHOP_GLOSSARY })
			const definitions = [
				buildWorkshopRules(),
				buildWorkshopScore(),
				buildWorkshopArea(),
				buildWorkshopFacts(),
			]
			expect(narrator.audit(definitions)).toEqual([])
			const account = narrator.narrate(
				buildWorkshopRules(),
				REASON.reason(WORKSHOP_BASE, buildWorkshopRules()),
			)
			const lines = [...account.lines]
			for (const line of lines) lines.push(...line.lines)
			expect(lines.flatMap((line) => line.gaps)).toEqual([])
		})

		it('carries the gaps of a refusal, of a value, and of a solution on their lines', () => {
			const narrator = new Narrator({
				glossary: { labels: {}, values: { score: 'acre' }, units: { area: 'acre' } },
			})
			const score = buildWorkshopScore()
			const area = buildWorkshopArea()
			const refused = requireValue(WORKSHOP_AREA.refused)
			const solved = requireValue(WORKSHOP_AREA.solved)
			const gold = requireValue(WORKSHOP_SCORES.gold)
			expect(
				narrator.narrate(area, REASON.reason(refused.subject, area)).lines[0]?.lines[0]?.gaps,
			).toEqual([{ word: 'label', field: 'depth' }])
			expect(narrator.narrate(area, REASON.reason(solved.subject, area)).lines[0]?.gaps).toEqual([
				{ word: 'label', field: 'area' },
				{ word: 'format', unit: 'acre' },
			])
			expect(narrator.narrate(score, REASON.reason(gold.subject, score)).lines[0]?.gaps).toEqual([
				{ word: 'format', unit: 'acre' },
			])
		})

		it('counts a formatter as a format', () => {
			const narrator = new Narrator({
				glossary: { labels: {}, values: { score: 'acre' } },
				formatters: { acre: renderInterpretUnit },
			})
			const score = buildWorkshopScore()
			const gold = requireValue(WORKSHOP_SCORES.gold)
			const account = narrator.narrate(score, REASON.reason(gold.subject, score))
			expect(account.lines[0]?.gaps).toEqual([])
			expect(account.lines[0]?.text).toBe('Booking score is unit:165')
		})
	})
})
