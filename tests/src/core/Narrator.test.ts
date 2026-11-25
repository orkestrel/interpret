import type { LogicalResult, SymbolicResult } from '@orkestrel/reason'
import type { AccountLine, GlossaryGap, NarratorFormatter, NarratorOptions } from '@src/core'
import { numberShape, objectShape } from '@orkestrel/contract'
import {
	AGGREGATIONS,
	COMPARISONS,
	createAtom,
	createCompound,
	createConstant,
	createEquation,
	createFact,
	createFactorGroup,
	createFieldFactor,
	createInference,
	createInferentialDefinition,
	createInferentialReasoner,
	createLogicalDefinition,
	createLogicalReasoner,
	createLookupFactor,
	createQuantitativeDefinition,
	createQuantitativeReasoner,
	createRangeFactor,
	createReason,
	createRule,
	createStaticFactor,
	createSymbolicDefinition,
	createSymbolicReasoner,
	createVariable,
	isLogicalResult,
	isQuantitativeResult,
} from '@orkestrel/reason'
import { captureError, createHostileValues, requireValue } from '@orkestrel/test'
import { isInterpretError, Narrator, renderAccount, renderSubject } from '@src/core'
import { describe, expect, it } from 'vitest'
import {
	buildExpressionTrees,
	buildWorkshopArea,
	buildWorkshopFacts,
	buildWorkshopFees,
	buildWorkshopRules,
	buildWorkshopScore,
	collectTreeSubjects,
	renderInterpretUnit,
	TRICKY_KEYS,
	WORKSHOP_AREA,
	WORKSHOP_BASE,
	WORKSHOP_FEES,
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

// The words for each state, of a rule and of a definition, written out so that no test reads the
// lexicon.
const RULE_WORDS = {
	met: 'applies',
	unmet: 'does not apply',
	unread: 'cannot be decided',
} as const
const VERDICT_WORDS = {
	met: 'holds',
	unmet: 'does not hold',
	unread: 'cannot be decided',
} as const

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
// checks of the rule's line, or of the verdict's where the verdict states the rule's reasons.
const SHIPPED = new Narrator()
const TREE_READINGS = buildExpressionTrees().map((definition) =>
	collectTreeSubjects().map((subject) => {
		const result = REASON.reason(subject, definition)
		if (!isLogicalResult(result)) throw new Error('Expected a logical result')
		const { lines } = SHIPPED.narrate(definition, result)
		const line = lines.find((entry) => entry.role === 'reason')
		const cited = lines.find((entry) => entry.role === 'verdict')?.lines ?? []
		return {
			subject,
			name: requireValue(definition.rules[0]).name,
			title: definition.name,
			state: requireValue(result.rules[0]).state,
			text: line?.text ?? '',
			summary: line?.summary ?? '',
			verdict: lines[0]?.summary ?? '',
			cited: cited.flatMap((entry) => entry.source.check?.field ?? []),
			states: cited.map((entry) => entry.state),
		}
	}),
)

// What no written text may hold: a missing value's name, a line break, or an empty slot.
const BLANK_TEXT =
	/undefined|NaN|∞|[\n\v\f\r\x85\p{Zl}\p{Zp}]|^\s*$|\s$|\bis ,|\bis $|which is\s*(?:,|$)|, because\s*(?:,|$)|\(\s*\)|:\s*$|\b(?:when|by|from|at|if|then|either|or|and|not)\s*(?:,|$)/u

const WORKSHOP_HELD_LINE =
	'Workshop booking holds, because Trusted booker applies (wOrkshop tier is gold); Quiet activity applies (noise level is 30, which is not more than 40); Restricted activity does not apply (activity is pottery, which is not one of the 40 listed); and 1 more'

const WORKSHOP_HELD_FULL = [
	'Workshop booking holds',
	'  Trusted booker applies',
	'    wOrkshop tier is gold',
	'  Quiet activity applies',
	'    noise level is 30, which is not more than 40',
	'  Restricted activity does not apply',
	'    activity is pottery, which is not one of the 40 listed',
	'  cost is $1,000.00, which is at most $1,250.00',
	'Rules that hold: 6 of 8',
	'Opening hours applies',
	'  start hour is 10, which is within 8 to 18',
	'Trusted booker applies',
	'Quiet activity applies',
	'Tools with training applies',
	'  trained supervisor is true',
	'One session applies',
	'  morning session is true',
	'  evening session is false',
	'Approval applies',
	'Restricted activity does not apply',
	'Over capacity does not apply',
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
			expect(narrator.phrase('rules', 'unmet')).toBe('does not apply')
			expect(narrator.phrase('verdicts', 'unmet')).toBe('does not hold')
			expect(narrator.phrase('joins', 'reasons')).toBe('; ')
			expect(narrator.phrase('connectives', 'or')).toBe('or')
			expect(narrator.phrase('aggregations', 'maximum')).toBe('Highest')
			expect(narrator.phrase('faults', 'missing')).toBe('not known')
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
			expect(narrator.value('x', undefined)).toBe('not known')
			expect(narrator.value('x', Number.NaN)).toBe('not known')
			expect(narrator.value('x', Number.POSITIVE_INFINITY)).toBe('not known')
			expect(narrator.value('x', Number.NEGATIVE_INFINITY)).toBe('not known')
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
		it('writes each rule with its description and its condition, and carries no success', () => {
			const account = new Narrator({ glossary: WORKSHOP_GLOSSARY }).describe(buildWorkshopRules())
			expect('success' in account).toBe(false)
			const texts = renderAccount(account, { detail: 'full' }).split('\n')
			expect(texts).toEqual([
				'Workshop booking',
				'  Decides whether a community workshop lends a room for an activity.',
				'Restricted activity',
				'  The workshop never lends a room for an activity on its restricted list.',
				'  Restricted activity holds when activity is one of the 40 listed',
				'Over capacity',
				'  A booking that asks for more places than the room holds is over capacity.',
				'  Over capacity holds when places over capacity is more than $0.00',
				'Opening hours',
				'  A booking must start while the workshop is open.',
				'  Opening hours holds when start hour is within 8 to 18',
				'Trusted booker',
				'  A gold member, or a booker with a good score, is trusted.',
				'  Trusted booker holds when wOrkshop tier is gold or booking score is at least 700',
				'Quiet activity',
				'  An activity that stays at or under the noise limit is quiet.',
				'  Quiet activity holds when noise level is not more than 40',
				'Tools with training',
				'  A booking that brings tools needs a trained supervisor.',
				'  Tools with training holds when if tools brought is true, then trained supervisor is true',
				'One session',
				'  A booking takes the morning or the evening, never both.',
				'  One session holds when either morning session is true or evening session is true, but not both',
				'Approval',
				'  A trusted, quiet booking of an unrestricted activity within budget is approved.',
				'  Approval holds when Trusted booker applies, Quiet activity applies, Restricted activity does not apply, and cost is at most $1,250.00',
			])
			expect(renderAccount(account).split('\n')).toEqual(
				texts.filter((text) => !/^ {2}.*\.$/.test(text)),
			)
			expect(renderAccount(account, { detail: 'line' })).toBe('Workshop booking')
			const approval = account.lines.find((line) => line.source.rule === 'approve')
			expect(approval?.text).toBe('Approval')
			expect(approval?.summary).toBe(texts.at(-1)?.trim())
		})

		it('writes each group with its aggregation, and each factor with its source and gate', () => {
			const narrator = new Narrator({ glossary: WORKSHOP_GLOSSARY })
			expect(
				renderAccount(narrator.describe(buildWorkshopFees()), { detail: 'full' }).split('\n'),
			).toEqual([
				'Booking fees',
				'  Prices one booking.',
				'  Total of the values that apply',
				'Hire',
				'  What the room itself costs.',
				'  Total of the values that apply',
				'  Room rate',
				'    The hourly rate, for a session of two hours.',
				'    taken from hourly rate',
				'  Crowd charge',
				'    set by the range guest count falls in',
				'  Deposit',
				'    fixed at $50.00',
				'    Deposit applies when cost is at most $1,250.00',
				'Share',
				'  Product of the values that apply',
				'  Discount',
				'    fixed at 0.9',
				'  Season',
				'    looked up by season',
				'Extras',
				'  Average of the values that apply',
				'  Tool hire',
				'    fixed at $10.00',
				'    Tool hire applies when tools brought is true and noise level is at most 40',
				'  Towels',
				'    fixed at $20.00',
			])
		})

		it('writes each equation with its target, and each inference by name', () => {
			const narrator = new Narrator({ glossary: WORKSHOP_GLOSSARY })
			expect(
				renderAccount(narrator.describe(buildWorkshopArea()), { detail: 'full' }).split('\n'),
			).toEqual([
				'Floor area',
				'Floor area',
				'  The floor area is the width times the depth.',
				'  solves for floor area',
			])
			expect(renderAccount(narrator.describe(buildWorkshopFacts()), { detail: 'full' })).toBe(
				'Booking facts\nStaffing\nCleaning\nClosing',
			)
		})

		it('words every connective, under not, and nested', () => {
			const a = createAtom('a', 'equals', 'x')
			const b = createAtom('b', 'above', 2)
			const c = createAtom('c', 'not', 'z')
			const cases = [
				[a, 'a is x'],
				[createCompound('not', [a]), 'a is not x'],
				[createCompound('not', [c]), 'c is z'],
				[createCompound('not', [b]), 'b is not more than 2'],
				[createCompound('and', [a, b, c]), 'a is x, b is more than 2, and c is not z'],
				[createCompound('or', [a, b]), 'a is x or b is more than 2'],
				[createCompound('implies', [a, b]), 'if a is x, then b is more than 2'],
				[createCompound('xor', [a, b]), 'either a is x or b is more than 2, but not both'],
				[
					createCompound('not', [createCompound('and', [a, b])]),
					'not (a is x and b is more than 2)',
				],
				[createCompound('not', [createCompound('or', [a, b])]), 'not (a is x or b is more than 2)'],
				[
					createCompound('not', [createCompound('implies', [a, b])]),
					'not (if a is x, then b is more than 2)',
				],
				[
					createCompound('not', [createCompound('xor', [a, b])]),
					'not (either a is x or b is more than 2, but not both)',
				],
				[createCompound('not', [createCompound('not', [a])]), 'a is x'],
				[
					createCompound('not', [createCompound('not', [createCompound('or', [a, b])])]),
					'a is x or b is more than 2',
				],
				[
					createCompound('and', [createCompound('or', [a, b]), c]),
					'(a is x or b is more than 2) and c is not z',
				],
				[
					createCompound('or', [createCompound('not', [createCompound('and', [a, b])]), c]),
					'not (a is x and b is more than 2) or c is not z',
				],
				[
					createCompound('implies', [createCompound('and', [a, b]), createCompound('not', [c])]),
					'if (a is x and b is more than 2), then c is z',
				],
				[
					createCompound('xor', [createCompound('implies', [a, b]), c]),
					'either (if a is x, then b is more than 2) or c is not z, but not both',
				],
				[createCompound('and', [createCompound('or', [a])]), 'a is x'],
				[createCompound('not', [createCompound('and', [a])]), 'a is not x'],
			] as const
			for (const [premise, condition] of cases) {
				const definition = createLogicalDefinition('d', 'D', [
					createRule('r', [premise], createAtom('x', 'equals', true), { name: 'Rule' }),
				])
				expect(renderAccount(new Narrator().describe(definition))).toBe(
					`D\nRule\n  Rule holds when ${condition}`,
				)
			}
			const several = createLogicalDefinition('d', 'D', [
				createRule('r', [createCompound('or', [a, b]), c], createAtom('x', 'equals', true), {
					name: 'Rule',
				}),
			])
			expect(renderAccount(new Narrator().describe(several))).toBe(
				'D\nRule\n  Rule holds when (a is x or b is more than 2) and c is not z',
			)
		})

		it('words a condition for every generated tree', () => {
			const wrong = buildExpressionTrees().flatMap((definition) => {
				const rule = requireValue(definition.rules[0])
				const text = requireValue(SHIPPED.describe(definition).lines[1]).summary
				const opening = `${rule.name} holds when `
				return text.startsWith(opening) && text.length > opening.length ? [] : [definition.id]
			})
			expect(wrong).toEqual([])
		})

		it('words every comparison holding and failing', () => {
			const cases = [
				['equals', 5, 'n is 5', 'n is not 5'],
				['not', 5, 'n is not 5', 'n is 5'],
				['above', 5, 'n is more than 5', 'n is not more than 5'],
				['below', 5, 'n is less than 5', 'n is not less than 5'],
				['from', 5, 'n is at least 5', 'n is less than 5'],
				['to', 5, 'n is at most 5', 'n is more than 5'],
				['any', [5, 7], 'n is one of 5 and 7', 'n is not one of 5 and 7'],
				['none', [5, 7], 'n is not one of 5 and 7', 'n is one of 5 and 7'],
				['between', [5, 7], 'n is within 5 to 7', 'n is outside 5 to 7'],
				['outside', [5, 7], 'n is outside 5 to 7', 'n is within 5 to 7'],
				['any', [1, 2, 3, 4, 5], 'n is one of the 5 listed', 'n is not one of the 5 listed'],
				['none', [1, 2, 3, 4, 5], 'n is not one of the 5 listed', 'n is one of the 5 listed'],
			] as const
			for (const [operator, expected, holds, fails] of cases) {
				const atom = createAtom('n', operator, expected)
				const definition = createLogicalDefinition('d', 'D', [
					createRule('r', [atom], createAtom('x', 'equals', true), { name: 'R' }),
					createRule('s', [createCompound('not', [atom])], createAtom('y', 'equals', true), {
						name: 'S',
					}),
				])
				expect(renderAccount(new Narrator().describe(definition)).split('\n')).toEqual([
					'D',
					'R',
					`  R holds when ${holds}`,
					'S',
					`  S holds when ${fails}`,
				])
			}
		})

		it('words a derived key as the rules that bear on it', () => {
			const definition = createLogicalDefinition('d', 'D', [
				createRule('gold', [createAtom('a', 'equals', 1)], createAtom('tier', 'equals', 'gold'), {
					name: 'Gold',
				}),
				createRule('gilt', [createAtom('b', 'equals', 1)], createAtom('tier', 'equals', 'gold'), {
					name: 'Gilt',
				}),
				createRule('tin', [createAtom('c', 'equals', 1)], createAtom('tier', 'equals', 'tin'), {
					name: 'Tin',
				}),
				createRule('r1', [createAtom('tier', 'equals', 'tin')], createAtom('x1', 'equals', true), {
					name: 'R1',
				}),
				createRule('r2', [createAtom('tier', 'equals', 'gold')], createAtom('x2', 'equals', true), {
					name: 'R2',
				}),
				createRule('r3', [createAtom('tier', 'not', 'gold')], createAtom('x3', 'equals', true), {
					name: 'R3',
				}),
				createRule(
					'r4',
					[createCompound('not', [createAtom('tier', 'any', ['gold', 'tin'])])],
					createAtom('x4', 'equals', true),
					{ name: 'R4' },
				),
				createRule('r5', [createAtom('tier', 'equals', 'lead')], createAtom('x5', 'equals', true), {
					name: 'R5',
				}),
				createRule(
					'r6',
					[createAtom('tier', 'equals', 'gold'), createAtom('a', 'equals', 1)],
					createAtom('x6', 'equals', true),
					{ name: 'R6' },
				),
			])
			const texts = renderAccount(new Narrator().describe(definition)).split('\n')
			expect(texts.filter((text) => /^ {2}R\d/.test(text))).toEqual([
				'  R1 holds when Tin applies',
				'  R2 holds when Gold applies or Gilt applies',
				'  R3 holds when Gold does not apply and Gilt does not apply',
				'  R4 holds when Gold does not apply, Gilt does not apply, and Tin does not apply',
				'  R5 holds when tier is lead',
				'  R6 holds when (Gold applies or Gilt applies) and a is 1',
			])
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
			expect(renderAccount(account, { detail: 'full' })).toBe(
				'loan\nadult\n  adult holds when age is at least 18',
			)
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
			expect(renderAccount(account, { detail: 'line' })).toBe(WORKSHOP_HELD_LINE)
			const approval = account.lines.findLast((line) => line.source.rule === 'approve')
			expect(approval?.summary).toBe(
				WORKSHOP_HELD_LINE.replace('Workshop booking holds', 'Approval applies'),
			)
		})

		it('prints no fact twice, at any detail', () => {
			const narrator = new Narrator({ glossary: WORKSHOP_GLOSSARY })
			const definition = buildWorkshopRules()
			for (const { subject } of Object.values(WORKSHOP_SUBJECTS)) {
				const account = narrator.narrate(definition, REASON.reason(subject, definition))
				const facts = renderAccount(account, { detail: 'full' })
					.split('\n')
					.filter((text) => / is /.test(text))
					.map((text) => text.trim())
				expect(facts).toEqual([...new Set(facts)])
			}
		})

		it('cites the facts that decided a rule that does not apply', () => {
			const narrator = new Narrator({ glossary: WORKSHOP_GLOSSARY })
			const definition = buildWorkshopRules()
			const loud = requireValue(WORKSHOP_SUBJECTS.loud)
			const neither = requireValue(WORKSHOP_SUBJECTS.neither)
			const accounts = [loud, neither].map(({ subject }) =>
				narrator.narrate(definition, REASON.reason(subject, definition)),
			)
			expect(accounts.map((account) => renderAccount(account, { detail: 'line' }))).toEqual([
				'Workshop booking does not hold, because Quiet activity does not apply (noise level is 55, which is more than 40)',
				'Workshop booking does not hold, because Trusted booker does not apply (wOrkshop tier is silver, which is not gold; and booking score is 400, which is less than 700)',
			])
			expect(accounts.map((account) => renderAccount(account).split('\n'))).toEqual([
				[
					'Workshop booking does not hold',
					'  Quiet activity does not apply',
					'    noise level is 55, which is more than 40',
				],
				[
					'Workshop booking does not hold',
					'  Trusted booker does not apply',
					'    wOrkshop tier is silver, which is not gold',
					'    booking score is 400, which is less than 700',
				],
			])
		})

		it('gives at most the limit of reasons, then how many more', () => {
			const definition = createLogicalDefinition('d', 'D', [
				createRule(
					'r',
					['a', 'b', 'c', 'd', 'e'].map((field) => createAtom(field, 'above', 0)),
					createAtom('x', 'equals', true),
				),
			])
			const result = REASON.reason({ a: 1, b: 2, c: 3, d: 4, e: 5 }, definition)
			const accounts = [1, 2, 5].map((reasons) =>
				new Narrator({
					lexicon: {
						limits: { reasons },
						joins: { reasons: ' / ', last: ' + ' },
						frames: { 'reason.more': '{{count}} others' },
						comparisons: { above: { holds: 'tops' } },
					},
				}).narrate(definition, result),
			)
			expect(accounts.map((account) => account.lines[0]?.summary)).toEqual([
				'D holds, because a is 1, which tops 0 + 4 others',
				'D holds, because a is 1, which tops 0 / b is 2, which tops 0 + 3 others',
				'D holds, because a is 1, which tops 0 / b is 2, which tops 0 / c is 3, which tops 0 / d is 4, which tops 0 + e is 5, which tops 0',
			])
			expect(accounts.map((account) => account.lines[0]?.lines.length)).toEqual([5, 5, 5])
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
			expect(texts).toEqual([
				'List holds',
				'  kind is z, which is not one of the 3 listed',
				'Rules that hold: 1 of 2',
				'Three applies',
				'Two does not apply',
				'  kind is z, which is not one of a and b',
			])
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
				['between', [5, 7], 5, 'n is 5, which is within 5 to 7'],
				['between', [5, 7], 8, 'n is 8, which is outside 5 to 7'],
				['outside', [5, 7], 8, 'n is 8, which is outside 5 to 7'],
				['outside', [5, 7], 5, 'n is 5, which is within 5 to 7'],
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
			expect(account.lines[0]?.summary).toBe(
				'D does not hold, because paid is false; and owner is none',
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
				'Loop does not hold',
				'  First rule does not apply',
				'    Second rule does not apply',
			])
			expect(renderAccount(account, { detail: 'line' })).toBe(
				'Loop does not hold, because First rule does not apply (Second rule does not apply)',
			)
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
				narrator.narrate(definition, REASON.reason({ a: 2, b: 1 }, definition)).lines[0]?.summary,
			).toBe('Either holds, because By b applies (b is 1)')
			expect(
				narrator.narrate(definition, REASON.reason({ a: 2, b: 2 }, definition)).lines[0]?.summary,
			).toBe(
				'Either does not hold, because By a does not apply (a is 2, which is not 1); and By b does not apply (b is 2, which is not 1)',
			)
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
			expect(renderAccount(account, { detail: 'full' }).split('\n').length).toBe(402)
			expect(renderAccount(account).split('\n').length).toBe(201)
			expect(account.lines[0]?.summary).toBe('Chain holds, because r198 applies (r197 applies)')
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
				'r applies',
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
			expect(
				renderAccount(narrator.narrate(score, REASON.reason(gold.subject, score)), {
					detail: 'line',
				}),
			).toBe('Booking score is $165.00')
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
			expect(texts.filter((text) => text.startsWith('Rules that hold'))).toEqual([])
			expect(texts.at(-1)).toBe('Approval cannot be decided')
			expect(renderAccount(account, { detail: 'line' })).toBe(
				'Workshop booking cannot be decided, because cost is not known',
			)
			expect(renderAccount(account)).toBe('Workshop booking cannot be decided\n  cost is not known')
		})

		it('names a field left unread through a derived key', () => {
			const definition = buildWorkshopRules()
			const nonoise = requireValue(WORKSHOP_SUBJECTS.nonoise)
			const account = new Narrator({ glossary: WORKSHOP_GLOSSARY }).narrate(
				definition,
				REASON.reason(nonoise.subject, definition),
			)
			expect(renderAccount(account, { detail: 'line' })).toBe(
				'Workshop booking cannot be decided, because Quiet activity cannot be decided (noise level is not known)',
			)
			expect(renderAccount(account).split('\n')).toEqual([
				'Workshop booking cannot be decided',
				'  Quiet activity cannot be decided',
				'    noise level is not known',
			])
		})

		it('names every rule left unread when the last one was settled', () => {
			const definition = createLogicalDefinition('d', 'Loan', [
				createRule('a', [createAtom('income', 'above', 1)], createAtom('a', 'equals', true), {
					name: 'Income',
				}),
				createRule('b', [createAtom('debt', 'below', 9)], createAtom('b', 'equals', true), {
					name: 'Debt',
				}),
				createRule('c', [createAtom('age', 'from', 18)], createAtom('c', 'equals', true), {
					name: 'Age',
				}),
			])
			const account = new Narrator().narrate(definition, REASON.reason({ age: 30 }, definition))
			expect(renderAccount(account, { detail: 'line' })).toBe(
				'Loan gave no answer, because Income cannot be decided (income is not known); and Debt cannot be decided (debt is not known)',
			)
			expect(renderAccount(account, { detail: 'full' }).split('\n')).toEqual([
				'Loan gave no answer',
				'  Income cannot be decided',
				'    income is not known',
				'  Debt cannot be decided',
				'    debt is not known',
				'Age applies',
				'  age is 30, which is at least 18',
				'Income cannot be decided',
				'Debt cannot be decided',
			])
		})

		it('states a rule left unread beside a last rule left unread', () => {
			const definition = createLogicalDefinition('d', 'Loan', [
				createRule('a', [createAtom('income', 'above', 1)], createAtom('a', 'equals', true), {
					name: 'Income',
				}),
				createRule('b', [createAtom('debt', 'below', 9)], createAtom('b', 'equals', true), {
					name: 'Debt',
				}),
			])
			const account = new Narrator().narrate(definition, REASON.reason({}, definition))
			expect(renderAccount(account).split('\n')).toEqual([
				'Loan cannot be decided',
				'  debt is not known',
				'Income cannot be decided',
				'  income is not known',
			])
		})

		it('names the fields a door refused, and nothing where the evidence holds no cause', () => {
			const rules = [
				createRule('a', [createAtom('age', 'from', 18)], createAtom('a', 'equals', true), {
					name: 'Adult',
				}),
			]
			const shaped = createLogicalDefinition('d', 'Loan', rules, {
				shape: objectShape({ age: numberShape() }),
			})
			const narrator = new Narrator({ glossary: { labels: { age: 'Age' } } })
			expect(
				renderAccount(narrator.narrate(shaped, REASON.reason({ agee: 3 }, shaped)), {
					detail: 'line',
				}),
			).toBe('Loan gave no answer, because Age is not known; and agee is not expected')
			const plain = createLogicalDefinition('d', 'Loan', rules)
			const supplied = narrator.narrate(plain, REASON.reason({ age: 30, a: true }, plain))
			expect(renderAccount(supplied, { detail: 'full' })).toBe('Loan gave no answer')
			expect(renderAccount(supplied, { detail: 'line' })).toBe('Loan gave no answer')
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
					text: 'cost is not a value that can be used',
					summary: 'cost is not a value that can be used',
					source: {
						check: { field: 'cost', operator: 'to', value: 1250 },
						result: { field: 'cost', state: 'unread', actual: 'plenty' },
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
			const quiet = account.lines[0]?.lines[0]
			expect(quiet?.source.rule).toBe('quiet')
			expect(quiet?.summary).toBe(
				'Quiet activity cannot be decided, because noise level is not known',
			)
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
			expect(accounts.map((account) => renderAccount(account, { detail: 'line' }))).toEqual([
				'Booking score gave no answer, because Base fee found no value to use (cost is not known)',
				'Booking score gave no answer, because Room rate found no value to use (looked up by room)',
				'Floor area gave no answer, because depth is not known',
				'Booking facts gave no answer',
			])
			const texts = accounts.map((account) => renderAccount(account, { detail: 'full' }))
			expect(texts[0]?.split('\n')).toEqual([
				'Booking score gave no answer',
				'  Base fee found no value to use',
				'    cost is not known',
				'Fees applied',
				'  Base fee found no value to use',
				'  Service charge applied',
				'  Gold bonus applied',
				'Space applied',
				'  Room rate applied',
			])
			expect(texts[1]?.split('\n')).toEqual([
				'Booking score gave no answer',
				'  Room rate found no value to use',
				'    looked up by room',
				'Fees applied',
				'  Base fee applied',
				'  Service charge applied',
				'  Gold bonus applied',
				'Space did not apply',
				'  Room rate found no value to use',
			])
			expect(texts[2]).toBe('Floor area gave no answer\n  depth is not known')
			expect(texts[3]).toBe('Booking facts gave no answer')
			for (const text of texts) expect(text).not.toMatch(/\d/)
		})

		it('names a required factor that did not apply, and a field a range could not read', () => {
			const narrator = new Narrator({ glossary: WORKSHOP_GLOSSARY })
			const fees = buildWorkshopFees()
			const costly = requireValue(WORKSHOP_FEES.costly)
			const crowd = requireValue(WORKSHOP_FEES.crowd)
			const accounts = [costly, crowd].map(({ subject }) =>
				narrator.narrate(fees, REASON.reason(subject, fees)),
			)
			expect(accounts.map((account) => account.lines[0]?.summary)).toEqual([
				'Booking fees gave no answer, because Deposit did not apply (cost is $2,000.00, which is more than $1,250.00)',
				'Booking fees gave no answer, because Crowd charge found no value to use (guest count is not a value that can be used)',
			])
			expect(accounts.map((account) => renderAccount(account).split('\n'))).toEqual([
				[
					'Booking fees gave no answer',
					'  Deposit did not apply',
					'    cost is $2,000.00, which is more than $1,250.00',
				],
				[
					'Booking fees gave no answer',
					'  Crowd charge found no value to use',
					'    guest count is not a value that can be used',
				],
			])
			expect(accounts[0]?.lines[0]?.lines[0]?.summary).toBe(
				'Deposit did not apply, because cost is $2,000.00, which is more than $1,250.00',
			)
			expect(accounts[1]?.lines[0]?.lines[0]?.lines[0]?.source.fault?.reason).toBe('type')
			// The engine's own numbers for these runs, which no line may hold.
			for (const account of accounts) {
				expect(renderAccount(account, { detail: 'full' })).not.toMatch(
					/71\.35|106\.35|1\.35|\b40\b|\b55\b|\b90\b/,
				)
			}
		})

		it('names a gate it could not read', () => {
			const narrator = new Narrator({ glossary: WORKSHOP_GLOSSARY })
			const score = buildWorkshopScore()
			const subject = { cost: 100, room: 'hall' }
			expect(
				renderAccount(narrator.narrate(score, REASON.reason(subject, score)), { detail: 'line' }),
			).toBe(
				'Booking score gave no answer, because Gold bonus did not apply (wOrkshop tier is not known)',
			)
		})

		it('prints no number that is not finite', () => {
			const narrator = new Narrator()
			const score = createQuantitativeDefinition(
				'd',
				'D',
				[
					createFactorGroup('g', 'sum', [
						createStaticFactor('f', Number.POSITIVE_INFINITY, { name: 'F' }),
						createStaticFactor('o', 1e308, {
							name: 'O',
							transforms: [{ operation: 'multiply', operand: 10 }],
						}),
					]),
				],
				{ aggregation: 'maximum' },
			)
			const result = createQuantitativeReasoner().reason({}, score)
			if (!isQuantitativeResult(result)) throw new Error('Expected a quantitative result')
			expect(result.value).toBeNaN()
			const account = narrator.narrate(score, result)
			expect(renderAccount(account, { detail: 'full' })).not.toMatch(/NaN|∞|\d/)
			const claimed = narrator.narrate(score, { ...result, success: true })
			expect(renderAccount(claimed, { detail: 'full' })).not.toMatch(/NaN|∞|\d/)
			expect(claimed.lines[0]?.text).toBe('D gave no answer')
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
					const state = requireValue(states[id])
					const opening =
						line.role === 'verdict'
							? `Workshop booking ${VERDICT_WORDS[state]}`
							: `${requireValue(names.get(id))} ${RULE_WORDS[state]}`
					expect(line.state).toBe(state)
					expect(line.text).toBe(opening)
					expect(line.summary.startsWith(`${opening}, because `)).toBe(true)
				}
				return new Set(rules.map((line) => line.source.rule)).size
			})
			expect(stated).toEqual(Object.values(WORKSHOP_SUBJECTS).map(() => 8))
		})

		it('agrees with the engine over every generated tree and assignment', () => {
			expect(
				TREE_READINGS.flat().filter(
					({ name, title, state, text, summary, verdict }) =>
						text !== `${name} ${RULE_WORDS[state]}` ||
						!summary.startsWith(`${text}, because `) ||
						!verdict.startsWith(`${title} ${VERDICT_WORDS[state]}, because `),
				),
			).toEqual([])
			expect(TREE_READINGS.flat()).toHaveLength(818 * 27)
		})
	})

	describe('T3: a cited set fixes the state', () => {
		it('holds for a settled state over every generated tree and assignment, against the engine', () => {
			const moved = TREE_READINGS.flatMap((readings) =>
				readings
					.filter((reading) => reading.state !== 'unread')
					.filter(
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

		it('cites unread checks alone for an unread state, and settling them settles the rule, whichever way', () => {
			const open = TREE_READINGS.flatMap((readings) =>
				readings
					.filter((reading) => reading.state === 'unread')
					.filter(
						(reading) =>
							reading.cited.length === 0 ||
							reading.states.some((state) => state !== 'unread') ||
							reading.cited.some((field) => reading.subject[field] !== undefined) ||
							readings.some(
								(other) =>
									other.state === 'unread' &&
									['a', 'b', 'c'].every((field) =>
										reading.cited.includes(field)
											? other.subject[field] !== undefined
											: other.subject[field] === reading.subject[field],
									),
							),
					),
			)
			expect(open).toEqual([])
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
				['and', [a, b], { a: true }, ['b is not known']],
				['or', [a, b], { a: false }, ['b is not known']],
				['implies', [a, b], { a: true }, ['b is not known']],
				['implies', [a, b], { b: false }, ['a is not known']],
				['and', [a, b], {}, ['a is not known', 'b is not known']],
				['not', [a], {}, ['a is not known']],
			] as const
			for (const [operator, operands, subject, texts] of cases) {
				const definition = createLogicalDefinition('d', 'D', [
					createRule('r', [createCompound(operator, operands)], createAtom('x', 'equals', true)),
				])
				const account = new Narrator().narrate(definition, REASON.reason(subject, definition))
				expect(account.lines[0]?.lines.map((entry) => entry.text)).toEqual(texts)
			}
		})
	})

	describe('T4: a missing number is explained by its evidence', () => {
		it('names the unmet check of a gated factor, and prints no number for it', () => {
			const score = buildWorkshopScore()
			const silver = requireValue(WORKSHOP_SCORES.silver)
			const account = new Narrator({ glossary: WORKSHOP_GLOSSARY }).narrate(
				score,
				REASON.reason(silver.subject, score),
			)
			const texts = renderAccount(account, { detail: 'full' }).split('\n')
			expect(texts).toEqual([
				'Booking score is 130',
				'Fees: 110',
				'  Base fee: 100',
				'    cost is $100.00',
				'  Service charge: 10',
				'    fixed at 10',
				'  Gold bonus did not apply',
				'    wOrkshop tier is silver, which is not gold',
				'Space: 20',
				'  Room rate: 20',
				'    looked up by room',
				'Total: 130',
			])
			expect(renderAccount(account).split('\n')).toEqual(
				texts.filter((text) => !/Gold bonus|not gold/.test(text)),
			)
			expect(renderAccount(account, { detail: 'line' })).toBe('Booking score is 130')
			const gated = account.lines[1]?.lines[2]
			expect(gated?.summary).toBe(
				'Gold bonus did not apply, because wOrkshop tier is silver, which is not gold',
			)
			expect(gated?.source).toEqual({ group: 'fees', factor: 'discount' })
			expect(gated?.lines[0]?.source).toEqual({
				group: 'fees',
				factor: 'discount',
				check: { field: 'member', operator: 'equals', value: 'gold' },
				result: { field: 'member', state: 'unmet', actual: 'silver' },
			})
		})

		it('says where every number came from: a field, a fixed value, a table, a range, and a fallback', () => {
			const narrator = new Narrator({ glossary: WORKSHOP_GLOSSARY })
			const fees = buildWorkshopFees()
			const accounts = [WORKSHOP_FEES.peak, WORKSHOP_FEES.spare].map((entry) =>
				narrator.narrate(fees, REASON.reason(requireValue(entry).subject, fees)),
			)
			expect(
				accounts.map((account) => renderAccount(account, { detail: 'full' }).split('\n')),
			).toEqual([
				[
					'Booking fees is $121.35',
					'Hire: $105.00',
					'  Room rate: $40.00',
					'    hourly rate is $20.00',
					'  Crowd charge: $15.00',
					'    set by the range guest count falls in',
					'    before its changes: 5',
					'  Deposit: $50.00',
					'    fixed at $50.00',
					'Share: $1.35',
					'  Discount: 0.9',
					'    fixed at 0.9',
					'  Season: 1.5',
					'    looked up by season',
					'Extras: $15.00',
					'  Tool hire: $10.00',
					'    fixed at $10.00',
					'  Towels: $20.00',
					'    fixed at $20.00',
					'Total: $121.35',
				],
				[
					'Booking fees is $210.90',
					'Hire: $210.00',
					'  Room rate: $40.00',
					'    hourly rate is $20.00',
					'  Crowd charge: $120.00',
					'    its fallback, because guest count matches no entry',
					'    before its changes: 40',
					'  Deposit: $50.00',
					'    fixed at $50.00',
					'Share: $0.90',
					'  Discount: 0.9',
					'    fixed at 0.9',
					'  Season: 1',
					'    its fallback, because season matches no entry',
					'Extras did not apply',
					'  Tool hire did not apply',
					'    tools brought is false',
					'  Towels applied',
					'Total: $210.90',
				],
			])
		})

		it('states a total only where the aggregation alone gives the value', () => {
			const narrator = new Narrator()
			const groups = [
				createFactorGroup('a', 'sum', [createStaticFactor('x', 3)]),
				createFactorGroup('b', 'sum', [createStaticFactor('y', 4)]),
			]
			const last = [
				createQuantitativeDefinition('d', 'D', groups),
				createQuantitativeDefinition('d', 'D', groups, { base: 2 }),
				createQuantitativeDefinition('d', 'D', groups, { aggregation: 'average' }),
				createQuantitativeDefinition('d', 'D', groups, { aggregation: 'maximum' }),
				createQuantitativeDefinition('d', 'D', groups, { aggregation: 'maximum', base: 2 }),
				createQuantitativeDefinition('d', 'D', groups, { bounds: { maximum: 5 } }),
			].map((definition) => {
				const account = narrator.narrate(definition, REASON.reason({}, definition))
				return [account.lines[0]?.text, account.lines.slice(3).map((line) => line.text)]
			})
			expect(last).toEqual([
				['D is 7', ['Total: 7']],
				['D is 9', ['Total: 9']],
				['D is 3.5', ['Average: 3.5']],
				['D is 4', ['Highest: 4']],
				['D is 6', []],
				['D is 5', []],
			])
		})

		it('states a gate without facts when the result does not answer the factor', () => {
			const score = buildWorkshopScore()
			const silver = requireValue(WORKSHOP_SCORES.silver)
			const result = REASON.reason(silver.subject, score)
			if (!isQuantitativeResult(result)) throw new Error('Expected a quantitative result')
			const altered = {
				...result,
				groups: result.groups.map((group) => ({
					...group,
					factors: group.factors.map((factor) =>
						factor.id === 'discount' ? { ...factor, checks: [] } : factor,
					),
				})),
			}
			const line = new Narrator().narrate(score, altered).lines[1]?.lines[2]
			expect([line?.text, line?.summary, line?.lines]).toEqual([
				'Gold bonus did not apply',
				'Gold bonus did not apply',
				[],
			])
		})

		it('prints ids and their gaps when the definition holds no such group', () => {
			const score = buildWorkshopScore()
			const gold = requireValue(WORKSHOP_SCORES.gold)
			const other = createQuantitativeDefinition('o', 'Other', [])
			const account = new Narrator().narrate(other, REASON.reason(gold.subject, score))
			expect(renderAccount(account, { detail: 'full' }).split('\n')).toEqual([
				'Other is 165',
				'fees: 135',
				'  base: 100',
				'  service: 10',
				'  discount: 25',
				'space: 30',
				'  room: 30',
				'Total: 165',
			])
			expect(account.lines[1]?.gaps).toEqual([{ word: 'name', part: 'group', id: 'fees' }])
		})
	})

	describe('T5: no blank and no guess', () => {
		it('prints one whole line everywhere across the fixtures', () => {
			const rules = buildWorkshopRules()
			const score = buildWorkshopScore()
			const area = buildWorkshopArea()
			const facts = buildWorkshopFacts()
			const fees = buildWorkshopFees()
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
					...Object.values(WORKSHOP_FEES).map(({ subject }) =>
						narrator.narrate(fees, REASON.reason(subject, fees)),
					),
					narrator.narrate(facts, REASON.reason({}, facts)),
					...[rules, score, fees, area, facts].map((definition) => narrator.describe(definition)),
				]
				const lines = accounts.flatMap((account) => account.lines)
				for (const line of lines) lines.push(...line.lines)
				expect(
					lines.filter((line) => BLANK_TEXT.test(line.text) || BLANK_TEXT.test(line.summary)),
				).toEqual([])
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
								{ name: 'a\u{2028}b', description: 'c\nd' },
							),
						])
						const result = createLogicalReasoner().reason({ n: actual }, definition)
						lines.push(...narrator.narrate(definition, result).lines)
						lines.push(...narrator.describe(definition).lines)
					}
				}
			}
			for (const line of lines) lines.push(...line.lines)
			expect(
				lines.filter((line) => BLANK_TEXT.test(line.text) || BLANK_TEXT.test(line.summary)),
			).toEqual([])
			expect(new Set(lines.map((line) => line.state))).toEqual(
				new Set(['met', 'unmet', 'unread', undefined]),
			)
		})

		it('prints one whole line whatever a worksheet reads', () => {
			const narrator = new Narrator()
			const numbers = [0, -0, 1e308, -1e308, Number.NaN, Number.POSITIVE_INFINITY]
			const lines: AccountLine[] = []
			for (const actual of STRANGE_VALUES) {
				for (const number of numbers) {
					for (const aggregation of AGGREGATIONS) {
						const definition = createQuantitativeDefinition(
							'q',
							'q\nq',
							[
								createFactorGroup('g', aggregation, [
									createStaticFactor('s', number, { name: ' ', description: 'x\ny' }),
									createFieldFactor('f', 'n', {
										transforms: [{ operation: 'multiply', operand: 10 }],
									}),
									createLookupFactor('l', 'n', { true: number, a: 1 }, { fallback: 2 }),
									createRangeFactor('r', 'n', [{ value: number }]),
									createStaticFactor('c', 1, {
										checks: [{ field: 'n', operator: 'equals', value: number }],
									}),
								]),
							],
							{ aggregation },
						)
						const result = createQuantitativeReasoner().reason({ n: actual }, definition)
						if (!isQuantitativeResult(result)) throw new Error('Expected a quantitative result')
						lines.push(...narrator.narrate(definition, result).lines)
						lines.push(...narrator.narrate(definition, { ...result, success: true }).lines)
						lines.push(...narrator.describe(definition).lines)
					}
				}
			}
			for (const line of lines) lines.push(...line.lines)
			expect(
				lines.filter((line) => BLANK_TEXT.test(line.text) || BLANK_TEXT.test(line.summary)),
			).toEqual([])
		})

		it('states no number for a step whose number is not finite', () => {
			const score = buildWorkshopScore()
			const gold = requireValue(WORKSHOP_SCORES.gold)
			const result = REASON.reason(gold.subject, score)
			if (!isQuantitativeResult(result)) throw new Error('Expected a quantitative result')
			const altered = {
				...result,
				groups: result.groups.map((group) => ({
					...group,
					value: Number.NaN,
					factors: group.factors.map((factor) => ({
						...factor,
						value: Number.POSITIVE_INFINITY,
					})),
				})),
			}
			const texts = new Narrator()
				.narrate(score, altered)
				.lines.flatMap((line) => [line, ...line.lines])
				.filter((line) => line.role === 'step')
				.map((line) => line.text)
			expect(texts).toEqual([
				'Fees applied',
				'Base fee applied',
				'Service charge applied',
				'Gold bonus applied',
				'Space applied',
				'Room rate applied',
				'Total: 165',
			])
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

		it('prints one value alike in a condition, and in a step and its gate', () => {
			const narrator = new Narrator({ glossary: WORKSHOP_GLOSSARY })
			const rules = createLogicalDefinition('d', 'D', [
				createRule(
					'r',
					[
						createAtom(['terms', 'excess'], 'between', [3, 1250.5]),
						createAtom('cost', 'equals', 1250.5),
					],
					createAtom('x', 'equals', true),
					{ name: 'R' },
				),
			])
			expect(renderAccount(narrator.describe(rules)).split('\n').at(-1)).toBe(
				'  R holds when places over capacity is within $3.00 to $1,250.50 and cost is $1,250.50',
			)
			const worksheet = createQuantitativeDefinition('w', 'W', [
				createFactorGroup(
					'g',
					'sum',
					[
						createFieldFactor('f', 'cost', { name: 'F' }),
						createFieldFactor('e', ['terms', 'excess'], { name: 'E' }),
						createStaticFactor('s', 1, {
							name: 'S',
							checks: [{ field: 'cost', operator: 'below', value: 1250.5 }],
						}),
					],
					{ name: 'G' },
				),
			])
			const subject = { cost: 1250.5, terms: { excess: 1250.5 } }
			expect(
				renderAccount(narrator.narrate(worksheet, REASON.reason(subject, worksheet)), {
					detail: 'full',
				}).split('\n'),
			).toEqual([
				'W is 2501',
				'G: 2501',
				'  F: 1250.5',
				'    cost is $1,250.50',
				'  E: 1250.5',
				'    places over capacity is $1,250.50',
				'  S did not apply',
				'    cost is $1,250.50, which is not less than $1,250.50',
				'Total: 2501',
			])
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
				'the LOAN holds',
				'  aPPROVED tier applies',
				'    iD Trade is gOLD',
			])
			expect(renderAccount(account, { detail: 'line' })).toBe(
				'the LOAN holds, because aPPROVED tier applies (iD Trade is gOLD)',
			)
		})

		it('prints a group, a factor, a description, and a target byte for byte', () => {
			const narrator = new Narrator({
				glossary: { labels: { tier: 'iD Trade', x: 'the X' }, units: { tier: 'plain' } },
			})
			const worksheet = createQuantitativeDefinition('w', 'the SUM', [
				createFactorGroup(
					'g',
					'sum',
					[createFieldFactor('f', 'tier', { name: 'fACTOR', description: 'As iT is.' })],
					{ name: 'gROUP' },
				),
			])
			expect(
				renderAccount(narrator.narrate(worksheet, REASON.reason({ tier: 2 }, worksheet))).split(
					'\n',
				),
			).toEqual(['the SUM is 2', 'gROUP: 2', '  fACTOR: 2', '    iD Trade is 2', 'Total: 2'])
			expect(renderAccount(narrator.describe(worksheet), { detail: 'full' }).split('\n')).toEqual([
				'the SUM',
				'  Total of the values that apply',
				'gROUP',
				'  Total of the values that apply',
				'  fACTOR',
				'    As iT is.',
				'    taken from iD Trade',
			])
			const solved = createSymbolicDefinition('s', 'S', [
				createEquation('e', createVariable('x'), createConstant(1), 'x', { name: 'eQUATION' }),
			])
			expect(renderAccount(narrator.describe(solved)).split('\n')).toEqual([
				'S',
				'eQUATION',
				'  solves for the X',
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
				summary: 'Rules that hold: 2 of 3',
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
					verdicts: { met: 'steht' },
				},
				glossary: { labels: { preis: 'der Preis' }, units: { preis: 'count' } },
			})
			const definition = createLogicalDefinition('d', 'Der Kredit', [
				createRule('r', [createAtom('preis', 'from', 1000)], createAtom('x', 'equals', true)),
			])
			const account = narrator.narrate(definition, REASON.reason({ preis: 1500 }, definition))
			expect(account.lines.map((line) => line.summary)).toEqual([
				'Der Kredit steht, weil der Preis 1.500 ist, also mindestens 1.000',
				'1 von 1 Regeln gelten',
				'r gilt, weil der Preis 1.500 ist, also mindestens 1.000',
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
			expect(texts).toContain('  start is 10, which is within 8 to 18')
			expect(texts).toContain('  cost is 1000, which is at most 1250')
			expect(texts).toContain('quiet applies')
			const guide = narrator.describe(definition)
			const parts = [...guide.lines]
			for (const line of parts) parts.push(...line.lines)
			expect(
				[
					...new Set(parts.flatMap((line) => line.gaps).map((gap) => JSON.stringify(gap))),
				].toSorted(),
			).toEqual(gaps.map((gap) => JSON.stringify(gap)).toSorted())
		})

		it('reports what a worksheet and its guide lack, from audit and on the lines', () => {
			const named = buildWorkshopFees()
			const fees = {
				...named,
				groups: named.groups.map((group) => ({
					...group,
					...(group.id === 'share' ? { name: 'share' } : {}),
					factors: group.factors.map((factor) =>
						factor.id === 'towels' ? { ...factor, name: 'towels' } : factor,
					),
				})),
			}
			const { season: _season, ...labels } = WORKSHOP_GLOSSARY.labels
			const { 'terms.rate': _rate, ...units } = WORKSHOP_GLOSSARY.units
			const narrator = new Narrator({
				glossary: { ...WORKSHOP_GLOSSARY, labels, units, values: { fees: 'guilder' } },
			})
			const gaps: readonly GlossaryGap[] = [
				{ word: 'name', part: 'group', id: 'share' },
				{ word: 'name', part: 'factor', id: 'towels' },
				{ word: 'unit', field: ['terms', 'rate'] },
				{ word: 'label', field: 'season' },
				{ word: 'format', unit: 'guilder' },
			]
			expect(narrator.audit([fees])).toEqual(gaps)
			const peak = requireValue(WORKSHOP_FEES.peak)
			const lines = [...narrator.narrate(fees, REASON.reason(peak.subject, fees)).lines]
			for (const line of lines) lines.push(...line.lines)
			const carried = new Set(lines.flatMap((line) => line.gaps).map((gap) => JSON.stringify(gap)))
			expect([...carried].toSorted()).toEqual(gaps.map((gap) => JSON.stringify(gap)).toSorted())
			expect(lines.map((line) => line.text)).toEqual(
				expect.arrayContaining([
					'share: 1.35',
					'towels: 20',
					'hourly rate is 20',
					'looked up by season',
				]),
			)
		})

		it('reports nothing for the complete glossary, over every fixture', () => {
			const narrator = new Narrator({ glossary: WORKSHOP_GLOSSARY })
			const definitions = [
				buildWorkshopRules(),
				buildWorkshopScore(),
				buildWorkshopFees(),
				buildWorkshopArea(),
				buildWorkshopFacts(),
			]
			expect(narrator.audit(definitions)).toEqual([])
			const guides = definitions.flatMap((definition) => narrator.describe(definition).lines)
			for (const line of guides) guides.push(...line.lines)
			expect(guides.flatMap((line) => line.gaps)).toEqual([])
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
