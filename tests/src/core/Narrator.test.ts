import type { Definition, LogicalResult, Subject, SymbolicResult } from '@orkestrel/reason'
import type {
	AccountLine,
	Glossary,
	GlossaryGap,
	NarratorFormatter,
	NarratorOptions,
} from '@src/core'
import {
	arrayShape,
	isArray,
	isObject,
	nullShape,
	numberShape,
	objectShape,
	stringShape,
	undefinedShape,
	unionShape,
} from '@orkestrel/contract'
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
	createSubjectDoor,
	createSymbolicDefinition,
	createSymbolicReasoner,
	createVariable,
	formatField,
	isLogicalResult,
	isQuantitativeResult,
} from '@orkestrel/reason'
import { captureError, createHostileValues, requireValue } from '@orkestrel/test'
import {
	compileEntities,
	isInterpretError,
	Narrator,
	NUMBER_REFUSAL_REASONS,
	NUMBER_UNREADABLE_REASONS,
	renderAccount,
	renderSubject,
	scanNumbers,
} from '@src/core'
import { describe, expect, it } from 'vitest'
import {
	buildExpressionTrees,
	buildWorkshopArea,
	buildWorkshopFacts,
	buildWorkshopFees,
	buildWorkshopGates,
	buildWorkshopRules,
	buildWorkshopScore,
	collectTreeSubjects,
	FAULT_BOUNDS,
	FAULT_PLAIN,
	FAULT_SHAPES,
	FAULT_WORDS,
	MALFORMED_RECORDS,
	REFUSAL_MAPPINGS,
	REFUSAL_SENTENCES,
	renderInterpretUnit,
	STRANGE_RECORDS,
	TRICKY_KEYS,
	UNREADABLE_SENTENCES,
	WORKSHOP_AREA,
	WORKSHOP_BASE,
	WORKSHOP_FEES,
	WORKSHOP_GATES,
	WORKSHOP_GLOSSARY,
	WORKSHOP_RESTRICTED,
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
	/undefined|NaN|∞|[\n\v\f\r\x85\p{Zl}\p{Zp}]|^\s*$|\s$|\bis ,|\bis $|which is\s*(?:,|$)|, because\s*(?:,|$)|\(\s*\)|:\s*$|\b(?:when|by|from|at|if|then|either|or|and|be|than|of|have)\s*(?:,|$)|\bnot\s*,|\band {2}is not|\bfor\s*\)/u

const WORKSHOP_HELD_LINE =
	'Workshop booking holds, because Trusted booker applies (wOrkshop tier is gold); Quiet activity applies (noise level is 30, which is not more than 40); Restricted activity does not apply (activity is pottery, which is not one of the 40 listed); and cost is $1,000.00, which is at most $1,250.00'

const WORKSHOP_HELD_FULL = [
	'Workshop booking holds',
	'  Trusted booker applies',
	'    wOrkshop tier is gold',
	'  Quiet activity applies',
	'    noise level is 30, which is not more than 40',
	'  Restricted activity does not apply',
	'    activity is pottery, which is not one of the 40 listed',
	'  cost is $1,000.00, which is at most $1,250.00',
	'Rules of Workshop booking that apply: 6 of 8',
	'Opening hours applies',
	'  start hour is 10, which is in the range 8 to 18',
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
			expect(narrator.phrase('expected', 'integer')).toBe('a whole number')
			expect(narrator.phrase('constraints', 'over')).toBe('more than {{limit}}')
			expect(narrator.phrase('lengths', 'min')).toBe('a length of at least {{limit}}')
			expect(narrator.phrase('operations', 'percentage')).toBe('{{right}}% of {{left}}')
			expect(narrator.phrase('transforms', 'round')).toBe('rounded to a whole number')
			expect(narrator.phrase('refusals', 'collection')).toBe(
				'{{text}} was not taken, because another number in the same list was not',
			)
			expect(narrator.phrase('unreadables', 'foreign currency')).toBe(
				'it is in a currency unit other than dollars',
			)
			expect(narrator.phrase('eligibilities', 'referral')).toBe('referred for review')
			expect(narrator.phrase('effects', 'notice')).toBe('Notice')
			expect(narrator.phrase('statuses', 'unrated')).toBe('not fully rated')
			expect(narrator.phrase('decisions', 'submitted')).toBe('submitted for review')
			expect(narrator.phrase('joins', 'steps')).toBe(', then ')
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

		it('refuses options it cannot read, under the code of the words they hold', () => {
			const revoked = Proxy.revocable<NarratorOptions>({}, {})
			revoked.revoke()
			const formatters = Proxy.revocable<Record<string, NarratorFormatter>>({}, {})
			formatters.revoke()
			const members = { count: renderInterpretUnit }
			Object.defineProperty(members, 'money', {
				enumerable: true,
				get: () => {
					throw new Error('refused')
				},
			})
			const keys = ['lexicon', 'glossary', 'formatters', 'locale'] as const
			const throwing = keys.map((key): readonly [string, NarratorOptions, string] => {
				const options: NarratorOptions = {}
				Object.defineProperty(options, key, {
					enumerable: true,
					get: () => {
						throw new Error('refused')
					},
				})
				return [key, options, `${key} cannot be read`]
			})
			const cases: ReadonlyArray<readonly [string, NarratorOptions, string]> = [
				['lexicon', revoked.proxy, 'lexicon cannot be read'],
				['formatters', { formatters: formatters.proxy }, 'formatters cannot be read'],
				['formatters', { formatters: members }, 'formatters cannot be read'],
				...throwing,
			]
			for (const [key, options, finding] of cases) {
				const error = captureError(() => new Narrator(options))
				if (!isInterpretError(error)) throw new Error('Expected an InterpretError')
				expect(error.code).toBe(key === 'lexicon' || key === 'locale' ? 'LEXICON' : 'GLOSSARY')
				expect(error.context).toEqual({ findings: [finding] })
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
				`  applies when activity is one of ${WORKSHOP_RESTRICTED.slice(0, -1).join(', ')}, or ${requireValue(WORKSHOP_RESTRICTED.at(-1))}`,
				'Over capacity',
				'  A booking that asks for more places than the room holds is over capacity.',
				'  applies when places over capacity is more than $0.00',
				'Opening hours',
				'  A booking must start while the workshop is open.',
				'  applies when start hour is in the range 8 to 18',
				'Trusted booker',
				'  A gold member, or a booker with a good score, is trusted.',
				'  applies when wOrkshop tier is gold or booking score is at least 700',
				'Quiet activity',
				'  An activity that stays at or under the noise limit is quiet.',
				'  applies when noise level is not more than 40',
				'Tools with training',
				'  A booking that brings tools needs a trained supervisor.',
				'  applies when tools brought is not true or trained supervisor is true',
				'One session',
				'  A booking takes the morning or the evening, never both.',
				'  applies when either morning session is true or evening session is true, but not both',
				'Approval',
				'  A trusted, quiet booking of an unrestricted activity within budget is approved.',
				'  applies when Trusted booker applies, Quiet activity applies, Restricted activity does not apply, and cost is at most $1,250.00',
			])
			expect(renderAccount(account).split('\n')).toEqual(
				texts.filter((text) => !/^ {2}.*\.$/.test(text)),
			)
			expect(renderAccount(account, { detail: 'line' })).toBe('Workshop booking')
			const approval = account.lines.find((line) => line.source.rule === 'approve')
			expect(approval?.text).toBe('Approval')
			expect(approval?.summary).toBe(
				'Approval applies when Trusted booker applies, Quiet activity applies, Restricted activity does not apply, and cost is at most $1,250.00',
			)
		})

		it('writes each group with its aggregation, and each factor with its source and gate', () => {
			const narrator = new Narrator({ glossary: WORKSHOP_GLOSSARY })
			const account = narrator.describe(buildWorkshopFees())
			const deposit = account.lines[1]?.lines.find((line) => line.source.factor === 'deposit')
			expect(deposit?.summary).toBe('Deposit applies when cost is at most $1,250.00')
			expect(renderAccount(account, { detail: 'full' }).split('\n')).toEqual([
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
				'    applies when cost is at most $1,250.00',
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
				'    applies when tools brought is true and noise level is at most 40',
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
				[createCompound('implies', [a, b]), 'a is not x or b is more than 2'],
				[createCompound('xor', [a, b]), 'either a is x or b is more than 2, but not both'],
				[
					createCompound('not', [createCompound('and', [a, b])]),
					'not (a is x and b is more than 2)',
				],
				[createCompound('not', [createCompound('or', [a, b])]), 'not (a is x or b is more than 2)'],
				[
					createCompound('not', [createCompound('implies', [a, b])]),
					'a is x and b is not more than 2',
				],
				[
					createCompound('not', [
						createCompound('implies', [
							createCompound('or', [a, b]),
							createCompound('and', [b, c]),
						]),
					]),
					'(a is x or b is more than 2) and not (b is more than 2 and c is not z)',
				],
				[
					createCompound('or', [createCompound('not', [createCompound('implies', [a, b])]), c]),
					'(a is x and b is not more than 2) or c is not z',
				],
				[
					createCompound('implies', [createCompound('not', [a]), createCompound('or', [b, c])]),
					'a is x or (b is more than 2 or c is not z)',
				],
				[
					createCompound('implies', [createCompound('implies', [a, b]), c]),
					'(a is x and b is not more than 2) or c is not z',
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
					'not (a is x and b is more than 2) or c is z',
				],
				[
					createCompound('xor', [createCompound('implies', [a, b]), c]),
					'either (a is not x or b is more than 2) or c is not z, but not both',
				],
				[createCompound('and', [createCompound('or', [a])]), 'a is x'],
				[createCompound('not', [createCompound('and', [a])]), 'a is not x'],
			] as const
			for (const [premise, condition] of cases) {
				const definition = createLogicalDefinition('d', 'D', [
					createRule('r', [premise], createAtom('x', 'equals', true), { name: 'Rule' }),
				])
				expect(renderAccount(new Narrator().describe(definition))).toBe(
					`D\nRule\n  applies when ${condition}`,
				)
			}
			const several = createLogicalDefinition('d', 'D', [
				createRule('r', [createCompound('or', [a, b]), c], createAtom('x', 'equals', true), {
					name: 'Rule',
				}),
			])
			expect(renderAccount(new Narrator().describe(several))).toBe(
				'D\nRule\n  applies when (a is x or b is more than 2) and c is not z',
			)
		})

		// Each condition's words are read as a truth table over the four assignments of two checks,
		// written out by hand, and held to the state the engine gives the rule.
		it.each([
			['implies', false, 'a is not true or b is true', ['met', 'unmet', 'met', 'met']],
			['implies', true, 'a is true and b is not true', ['unmet', 'met', 'unmet', 'unmet']],
			[
				'xor',
				false,
				'either a is true or b is true, but not both',
				['unmet', 'met', 'met', 'unmet'],
			],
			[
				'xor',
				true,
				'not (either a is true or b is true, but not both)',
				['met', 'unmet', 'unmet', 'met'],
			],
		] as const)(
			'words %s (under not: %s) as what makes the rule apply',
			(operator, negated, condition, states) => {
				const plain = createCompound(operator, [
					createAtom('a', 'equals', true),
					createAtom('b', 'equals', true),
				])
				const definition = createLogicalDefinition('d', 'D', [
					createRule(
						'r',
						[negated ? createCompound('not', [plain]) : plain],
						createAtom('x', 'equals', true),
						{ name: 'Rule' },
					),
				])
				expect(requireValue(new Narrator().describe(definition).lines[1]).summary).toBe(
					`Rule applies when ${condition}`,
				)
				const assignments = [
					[true, true],
					[true, false],
					[false, true],
					[false, false],
				] as const
				const read = assignments.map(([a, b]) => {
					const result = REASON.reason({ a, b }, definition)
					if (!isLogicalResult(result)) throw new Error('Expected a logical result')
					return result.conclusion
				})
				expect(read).toEqual(states)
			},
		)

		it('words a condition for every generated tree', () => {
			const wrong = buildExpressionTrees().flatMap((definition) => {
				const rule = requireValue(definition.rules[0])
				const text = requireValue(SHIPPED.describe(definition).lines[1]).summary
				const opening = `${rule.name} applies when `
				return text.startsWith(opening) && text.length > opening.length ? [] : [definition.id]
			})
			expect(wrong).toEqual([])
		})

		it('prints every member of a list in a condition, whatever the limit', () => {
			const definition = createLogicalDefinition('d', 'D', [
				createRule(
					'region',
					[createAtom('region', 'any', ['north', 'south', 'east', 'west', 'central'])],
					createAtom('region.ok', 'equals', true),
					{ name: 'Served region' },
				),
				createRule(
					'code',
					[createAtom('code', 'none', [1, 2, 3, 4, 5, 6])],
					createAtom('code.ok', 'equals', true),
					{ name: 'Allowed code' },
				),
				createRule(
					'empty',
					[createAtom('code', 'any', [])],
					createAtom('empty.ok', 'equals', true),
					{ name: 'Empty list' },
				),
				createRule(
					'nothing',
					[createAtom('code', 'any', [null])],
					createAtom('nothing.ok', 'equals', true),
					{ name: 'Null list' },
				),
			])
			const expected = [
				'D',
				'Served region',
				'  applies when Region is one of north, south, east, west, or central',
				'Allowed code',
				'  applies when Code is not one of 1, 2, 3, 4, 5, or 6',
				'Empty list',
				'  applies when Code is one of []',
				'Null list',
				'  applies when Code is one of none',
			]
			const glossary = { labels: { region: 'Region', code: 'Code' } }
			for (const list of [0, 4, 30]) {
				const narrator = new Narrator({ glossary, lexicon: { limits: { list } } })
				expect(
					renderAccount(narrator.describe(definition), { detail: 'full' }).split('\n'),
				).toEqual(expected)
			}
			const guide = new Narrator({ glossary: WORKSHOP_GLOSSARY }).describe(buildWorkshopRules())
			expect(WORKSHOP_RESTRICTED.filter((name) => !guide.lines[1]?.summary.includes(name))).toEqual(
				[],
			)
		})

		it("quotes a list's members where one holds a joining text, and no other list", () => {
			const cases = [
				[['Paris, France', 'Rome, Italy'], '"Paris, France" or "Rome, Italy"'],
				[['Paris, France', 'Rome'], '"Paris, France" or "Rome"'],
				[['Paris', 'Rome', 'Oslo'], 'Paris, Rome, or Oslo'],
				[['salt and pepper', 'sugar'], 'salt and pepper or sugar'],
				[['salt or pepper', 'sugar'], '"salt or pepper" or "sugar"'],
				[['Paris, Rome'], '"Paris, Rome"'],
				[['Paris'], 'Paris'],
				[['or else', 'sugar'], '"or else" or "sugar"'],
				[['color', 'anchor'], 'color or anchor'],
				[['a, b', 5, true, null, ''], '"a, b", "5", "true", "none", or ""'],
				[['a', ''], 'a or ""'],
				[[], '[]'],
			] as const
			for (const [list, text] of cases) {
				const definition = createLogicalDefinition('d', 'D', [
					createRule('r', [createAtom('place', 'any', list)], createAtom('x', 'equals', true), {
						name: 'R',
					}),
				])
				const guide = new Narrator({ glossary: { labels: { place: 'Place' } } }).describe(
					definition,
				)
				expect(guide.lines[1]?.summary).toBe(`R applies when Place is one of ${text}`)
				expect(guide.lines[1]?.lines[0]?.text).toBe(`applies when Place is one of ${text}`)
			}
			expect(new Narrator().value('place', ['Paris, France', 'Rome'])).toBe(
				'"Paris, France" and "Rome"',
			)
			expect(new Narrator().value('place', ['salt or pepper', 'sugar'])).toBe(
				'salt or pepper and sugar',
			)
			const marked = new Narrator({ lexicon: { frames: { 'value.quoted': '«{{value}}»' } } })
			expect(marked.value('place', ['a, b', 'c'])).toBe('«a, b» and «c»')
		})

		it('keeps every member recoverable, whatever the length, the operator, the locale, or the document', () => {
			// Each locale's joining texts, written out by hand, longest first.
			const locales = [
				['en-US', /, or | or |, /u, ', '],
				['de-DE', / oder |, /u, ' oder '],
				['es-ES', / o | u |, /u, ' o '],
				['ja-JP', /、または|または|、/u, '、'],
			] as const
			for (const [locale, joins, join] of locales) {
				const narrator = new Narrator({ locale, lexicon: { limits: { list: 40 } } })
				for (const length of [1, 2, 3, 40]) {
					const plain = Array.from({ length }, (_, index) => `m${String(index)}`)
					const held = plain.map((member, index) => (index === 0 ? `${member}${join}x` : member))
					for (const operator of ['any', 'none'] as const) {
						for (const members of [plain, held]) {
							const atom = createAtom('kind', operator, members)
							const definition = createLogicalDefinition('d', 'D', [
								createRule('r', [atom], createAtom('x', 'equals', true), { name: 'R' }),
								createRule('s', [createCompound('not', [atom])], createAtom('y', 'equals', true), {
									name: 'S',
								}),
							])
							const result = REASON.reason({ kind: 'z' }, definition)
							const guide = narrator.describe(definition)
							const account = narrator.narrate(definition, result)
							const texts = [
								...guide.lines.slice(1).map((line) => line.lines[0]?.text ?? ''),
								...account.lines.slice(1).map((line) => line.lines[0]?.text ?? ''),
							]
							expect(texts).toHaveLength(4)
							for (const text of texts) {
								const list = text.split(/ is (?:not )?one of /u).at(-1) ?? ''
								const quoted = [...list.matchAll(/"([^"]*)"/gu)].map((match) => match[1])
								expect(quoted.length > 0).toBe(members === held)
								expect(members === held ? quoted : list.split(joins)).toEqual(members)
							}
						}
					}
				}
			}
		})

		it('joins a list as a disjunction, grouped where it stands inside another condition', () => {
			const region = createAtom('region', 'any', ['north', 'south'])
			const lone = createAtom('region', 'none', ['north'])
			const code = createAtom('code', 'equals', 5)
			const cases = [
				[[region], 'region is one of north or south'],
				[[createCompound('not', [region])], 'region is not one of north or south'],
				[[region, code], '(region is one of north or south) and code is 5'],
				[[createCompound('or', [region, code])], '(region is one of north or south) or code is 5'],
				[
					[createCompound('or', [createCompound('not', [region]), code])],
					'(region is not one of north or south) or code is 5',
				],
				[[createCompound('or', [lone, code])], 'region is not one of north or code is 5'],
			] as const
			for (const [premises, condition] of cases) {
				const definition = createLogicalDefinition('d', 'D', [
					createRule('r', premises, createAtom('x', 'equals', true), { name: 'R' }),
				])
				expect(new Narrator().describe(definition).lines[1]?.summary).toBe(
					`R applies when ${condition}`,
				)
			}
		})

		it('words every comparison holding and failing', () => {
			const cases = [
				['equals', 5, 'n is 5', 'n is not 5'],
				['not', 5, 'n is not 5', 'n is 5'],
				['above', 5, 'n is more than 5', 'n is not more than 5'],
				['below', 5, 'n is less than 5', 'n is not less than 5'],
				['from', 5, 'n is at least 5', 'n is less than 5'],
				['to', 5, 'n is at most 5', 'n is more than 5'],
				['any', [5, 7], 'n is one of 5 or 7', 'n is not one of 5 or 7'],
				['none', [5, 7], 'n is not one of 5 or 7', 'n is one of 5 or 7'],
				['between', [5, 7], 'n is in the range 5 to 7', 'n is outside the range 5 to 7'],
				['outside', [5, 7], 'n is outside the range 5 to 7', 'n is in the range 5 to 7'],
				[
					'any',
					[1, 2, 3, 4, 5],
					'n is one of 1, 2, 3, 4, or 5',
					'n is not one of 1, 2, 3, 4, or 5',
				],
				[
					'none',
					[1, 2, 3, 4, 5],
					'n is not one of 1, 2, 3, 4, or 5',
					'n is one of 1, 2, 3, 4, or 5',
				],
				['any', [], 'n is one of []', 'n is not one of []'],
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
					`  applies when ${holds}`,
					'S',
					`  applies when ${fails}`,
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
			const summaries = new Narrator().describe(definition).lines.map((line) => line.summary)
			expect(summaries.slice(4)).toEqual([
				'R1 applies when Tin applies',
				'R2 applies when Gold applies or Gilt applies',
				'R3 applies when Gold does not apply and Gilt does not apply',
				'R4 applies when Gold does not apply, Gilt does not apply, and Tin does not apply',
				'R5 applies when tier is lead',
				'R6 applies when (Gold applies or Gilt applies) and a is 1',
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
				'loan\nadult\n  applies when age is at least 18',
			)
			expect(account.lines.flatMap((line) => line.gaps)).toEqual([
				{ word: 'name', part: 'definition', id: 'loan' },
				{ word: 'name', part: 'rule', id: 'adult' },
				{ word: 'label', field: 'age' },
				{ word: 'unit', field: 'age' },
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
			const rules = buildWorkshopRules()
			const gates = buildWorkshopGates()
			const runs = [
				...Object.values(WORKSHOP_SUBJECTS).map(({ subject }) => [rules, subject] as const),
				...Object.values(WORKSHOP_GATES).map(({ subject }) => [gates, subject] as const),
			]
			for (const [definition, subject] of runs) {
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
				'Rules of List that apply: 1 of 2',
				'Three applies',
				'  kind is z, which is not one of the 3 listed',
				'Two does not apply',
				'  kind is z, which is not one of a or b',
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
				['any', [5, 7], 5, 'n is 5, which is one of 5 or 7'],
				['any', [5, 7], 6, 'n is 6, which is not one of 5 or 7'],
				['none', [5, 7], 6, 'n is 6, which is not one of 5 or 7'],
				['none', [5, 7], 5, 'n is 5, which is one of 5 or 7'],
				['between', [5, 7], 5, 'n is 5, which is in the range 5 to 7'],
				['between', [5, 7], 8, 'n is 8, which is outside the range 5 to 7'],
				['outside', [5, 7], 8, 'n is 8, which is outside the range 5 to 7'],
				['outside', [5, 7], 5, 'n is 5, which is in the range 5 to 7'],
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
				'Rules of Other that apply: 1 of 1',
				'r applies',
			])
			expect(account.lines[0]?.summary).toBe('Rules of Other that apply: 1 of 1 (r)')
			expect(account.lines[0]?.gaps).toEqual([{ word: 'name', part: 'rule', id: 'r' }])
			expect(account.lines[1]?.gaps).toEqual([{ word: 'name', part: 'rule', id: 'r' }])
		})

		it('counts no rule when no rule is enabled', () => {
			const definition = createLogicalDefinition('d', 'Loan', [
				createRule('r', [createAtom('age', 'from', 18)], createAtom('x', 'equals', true), {
					enabled: false,
				}),
			])
			const account = new Narrator().narrate(definition, REASON.reason({ age: 30 }, definition))
			expect(renderAccount(account, { detail: 'full' })).toBe('Rules of Loan that apply: 0 of 0')
			expect(renderAccount(account, { detail: 'line' })).toBe('Rules of Loan that apply: 0 of 0')
		})

		it('counts independent rules, names those that apply, and gives their facts as its reasons', () => {
			const definition = buildWorkshopGates()
			const narrator = new Narrator({ glossary: WORKSHOP_GLOSSARY })
			const dawn = requireValue(WORKSHOP_GATES.dawn)
			const account = narrator.narrate(definition, REASON.reason(dawn.subject, definition))
			expect(renderAccount(account, { detail: 'line' })).toBe(
				'Rules of Booking gates that apply: 2 of 5 (Early start and Loud activity)',
			)
			expect(renderAccount(account).split('\n')).toEqual([
				'Rules of Booking gates that apply: 2 of 5',
				'Early start applies',
				'  start hour is 9, which is less than 10',
				'Loud activity applies',
				'  noise level is 40.5, which is more than 40',
			])
			expect(renderAccount(account, { detail: 'full' }).split('\n')).toEqual([
				'Rules of Booking gates that apply: 2 of 5',
				'Early start applies',
				'  start hour is 9, which is less than 10',
				'Loud activity applies',
				'  noise level is 40.5, which is more than 40',
				'High cost does not apply',
				'  cost is $1,000.00, which is not more than $1,250.00',
				'Visiting booker does not apply',
				'  wOrkshop tier is gold, which is not guest',
				'Large party does not apply',
				'  guest count is 8, which is not more than 30',
			])
			expect(account.lines[0]).toEqual({
				role: 'verdict',
				decisive: true,
				text: 'Rules of Booking gates that apply: 2 of 5',
				summary: 'Rules of Booking gates that apply: 2 of 5 (Early start and Loud activity)',
				source: {},
				gaps: [],
				lines: [],
			})
		})

		it('bounds the names a gates verdict gives, and says how many more', () => {
			const definition = buildWorkshopGates()
			const festival = requireValue(WORKSHOP_GATES.festival)
			const result = REASON.reason(festival.subject, definition)
			const lines = [undefined, 1, 5].map((reasons) =>
				renderAccount(
					new Narrator({
						glossary: WORKSHOP_GLOSSARY,
						...(reasons === undefined ? {} : { lexicon: { limits: { reasons } } }),
					}).narrate(definition, result),
					{ detail: 'line' },
				),
			)
			expect(lines).toEqual([
				'Rules of Booking gates that apply: 5 of 5 (Early start, Loud activity, High cost, Visiting booker, and 1 more)',
				'Rules of Booking gates that apply: 5 of 5 (Early start and 4 more)',
				'Rules of Booking gates that apply: 5 of 5 (Early start, Loud activity, High cost, Visiting booker, and Large party)',
			])
		})

		it('decides by the goal where the last enabled rule reads what another concludes', () => {
			const early = createRule(
				'early',
				[createAtom('start', 'below', 10)],
				createAtom('early', 'equals', true),
				{ name: 'Early' },
			)
			const staffed = createRule(
				'staffed',
				[createCompound('not', [createAtom('early', 'equals', true)])],
				createAtom('staffed', 'equals', true),
				{ name: 'Staffed' },
			)
			const loud = createRule(
				'loud',
				[createAtom('noise', 'above', 40)],
				createAtom('loud', 'equals', true),
				{ name: 'Loud' },
			)
			const narrator = new Narrator()
			const subject = { start: 9, noise: 50 }
			const texts = [
				[early, staffed],
				[early, staffed, loud],
				[early, staffed, { ...loud, enabled: false }],
				[early, { ...loud, enabled: false }],
				[{ ...early, enabled: false }, loud, staffed],
			].map((rules) => {
				const definition = createLogicalDefinition('d', 'Day', rules)
				return renderAccount(narrator.narrate(definition, REASON.reason(subject, definition)), {
					detail: 'line',
				})
			})
			expect(texts).toEqual([
				'Day does not hold, because Early applies (start is 9, which is less than 10)',
				'Rules of Day that apply: 2 of 3 (Early and Loud)',
				'Day does not hold, because Early applies (start is 9, which is less than 10)',
				'Day holds, because start is 9, which is less than 10',
				'Day gave no answer, because Staffed cannot be decided (early is not known, and must be true or false)',
			])
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
			).toBe('Booking score: $165.00')
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

	describe('ownership', () => {
		const path = ['seat', 'free']
		// Without its validation, which refuses a check that expects a record.
		const engine = createReason({
			validate: false,
			reasoners: [createLogicalReasoner(), createQuantitativeReasoner(), createSymbolicReasoner()],
		})
		const logical = createLogicalDefinition('d', 'D', [
			createRule(
				'first',
				[createAtom(path, 'any', ['a', 'b', 'c']), createAtom('kind', 'equals', { deep: [1] })],
				createAtom('one', 'equals', true),
			),
			createRule(
				'second',
				[createAtom('one', 'equals', true), createAtom(['seat', 'cost'], 'above', 5)],
				createAtom('two', 'equals', true),
			),
		])
		const sheet = createQuantitativeDefinition('q', 'Q', [
			createFactorGroup('g', 'sum', [
				createFieldFactor('f', ['seat', 'cost']),
				createStaticFactor('s', 1, {
					checks: [{ field: path, operator: 'any', value: ['a', 'b'] }],
				}),
			]),
		])
		const solved = createSymbolicDefinition('s', 'S', [
			createEquation('e', createVariable('x'), createVariable('y'), 'x'),
		])
		const subject = { seat: { free: 'z', cost: 9 }, kind: { deep: [1] } }
		const runs = [
			[logical, subject],
			[logical, { seat: { free: 'a', cost: 9 }, kind: { deep: [1] } }],
			[logical, { seat: { free: 'a', cost: 'x' } }],
			[sheet, subject],
			[sheet, {}],
			[solved, {}],
		] as const

		it('shares no object between two accounts, or with the definition, the result, or the subject', () => {
			const narrator = new Narrator()
			for (const [definition, given] of runs) {
				const result = engine.reason(given, definition)
				const roots: readonly object[] = [
					definition,
					result,
					given,
					narrator.narrate(definition, result),
					narrator.narrate(definition, result),
					narrator.describe(definition),
					narrator.describe(definition),
					narrator.audit([definition]),
					narrator.audit([definition]),
				]
				const reached = roots.map((root) => {
					const nodes: object[] = [root]
					for (const node of nodes) nodes.push(...Object.values(node).filter(isObject))
					return new Set(nodes)
				})
				const shared = reached.slice(3).flatMap((nodes, index) =>
					reached
						.filter((others) => others !== nodes)
						.flatMap((others) => [...others].filter((node) => nodes.has(node)))
						.map((node) => [index, node]),
				)
				expect(shared).toEqual([])
			}
		})

		it('keeps the evidence of a line as it was, and a later account, whatever a caller writes to it', () => {
			const narrator = new Narrator()
			const result = engine.reason(subject, logical)
			const before = JSON.stringify(narrator.narrate(logical, result))
			const account = narrator.narrate(logical, result)
			const nodes: object[] = [account]
			for (const node of nodes) nodes.push(...Object.values(node).filter(isObject))
			for (const node of nodes) Reflect.deleteProperty(node, isArray(node) ? 0 : 'value')
			for (const node of nodes) Reflect.set(node, 'field', 'changed')
			expect(JSON.stringify(narrator.narrate(logical, result))).toBe(before)
			const line = narrator.narrate(logical, engine.reason(subject, logical)).lines[0]?.lines[0]
			expect(line?.lines[0]?.source).toEqual({
				check: { field: ['seat', 'free'], operator: 'any', value: ['a', 'b', 'c'] },
				result: { field: ['seat', 'free'], state: 'unmet', actual: 'z' },
			})
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
			expect(texts.filter((text) => text.includes('that apply'))).toEqual([])
			expect(texts.at(-1)).toBe('Approval cannot be decided')
			expect(renderAccount(account, { detail: 'line' })).toBe(
				'Workshop booking cannot be decided, because cost is not known, and must be a number',
			)
			expect(renderAccount(account)).toBe(
				'Workshop booking cannot be decided\n  cost is not known, and must be a number',
			)
		})

		it('names a field left unread through a derived key', () => {
			const definition = buildWorkshopRules()
			const nonoise = requireValue(WORKSHOP_SUBJECTS.nonoise)
			const account = new Narrator({ glossary: WORKSHOP_GLOSSARY }).narrate(
				definition,
				REASON.reason(nonoise.subject, definition),
			)
			expect(renderAccount(account, { detail: 'line' })).toBe(
				'Workshop booking cannot be decided, because Quiet activity cannot be decided (noise level is not known, and must be a number)',
			)
			expect(renderAccount(account).split('\n')).toEqual([
				'Workshop booking cannot be decided',
				'  Quiet activity cannot be decided',
				'    noise level is not known, and must be a number',
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
				'Loan gave no answer, because Income cannot be decided (income is not known, and must be a number); and Debt cannot be decided (debt is not known, and must be a number)',
			)
			expect(renderAccount(account, { detail: 'full' }).split('\n')).toEqual([
				'Loan gave no answer',
				'  Income cannot be decided',
				'    income is not known, and must be a number',
				'  Debt cannot be decided',
				'    debt is not known, and must be a number',
				'Age applies',
				'  age is 30, which is at least 18',
				'Income cannot be decided',
				'Debt cannot be decided',
			])
		})

		it('refuses a run without a goal, and names each rule left unread with its field', () => {
			const definition = buildWorkshopGates()
			const narrator = new Narrator({ glossary: WORKSHOP_GLOSSARY })
			const accounts = [WORKSHOP_GATES.noguests, WORKSHOP_GATES.nostart].map((entry) =>
				narrator.narrate(definition, REASON.reason(requireValue(entry).subject, definition)),
			)
			expect(accounts.map((account) => renderAccount(account, { detail: 'line' }))).toEqual([
				'Booking gates gave no answer, because Large party cannot be decided (guest count is not known, and must be a number)',
				'Booking gates gave no answer, because Early start cannot be decided (start hour is not known, and must be a number)',
			])
			expect(accounts.map((account) => renderAccount(account).split('\n'))).toEqual([
				[
					'Booking gates gave no answer',
					'  Large party cannot be decided',
					'    guest count is not known, and must be a number',
				],
				[
					'Booking gates gave no answer',
					'  Early start cannot be decided',
					'    start hour is not known, and must be a number',
				],
			])
			expect(renderAccount(requireValue(accounts[0]), { detail: 'full' }).split('\n')).toEqual([
				'Booking gates gave no answer',
				'  Large party cannot be decided',
				'    guest count is not known, and must be a number',
				'Early start applies',
				'  start hour is 9, which is less than 10',
				'Loud activity does not apply',
				'  noise level is 30, which is not more than 40',
				'High cost does not apply',
				'  cost is $1,000.00, which is not more than $1,250.00',
				'Visiting booker does not apply',
				'  wOrkshop tier is gold, which is not guest',
				'Large party cannot be decided',
			])
		})

		it('states a rule left unread beside a goal left unread', () => {
			const definition = createLogicalDefinition('d', 'Loan', [
				createRule('a', [createAtom('income', 'above', 1)], createAtom('a', 'equals', true), {
					name: 'Income',
				}),
				createRule('b', [createAtom('debt', 'below', 9)], createAtom('b', 'equals', true), {
					name: 'Debt',
				}),
				createRule('c', [createAtom('b', 'equals', true)], createAtom('c', 'equals', true), {
					name: 'Grant',
				}),
			])
			const account = new Narrator().narrate(definition, REASON.reason({}, definition))
			expect(renderAccount(account, { detail: 'line' })).toBe(
				'Loan cannot be decided, because Debt cannot be decided (debt is not known, and must be a number)',
			)
			expect(renderAccount(account).split('\n')).toEqual([
				'Loan cannot be decided',
				'  Debt cannot be decided',
				'    debt is not known, and must be a number',
				'Income cannot be decided',
				'  income is not known, and must be a number',
			])
		})

		it('gives no verdict of a goal settled beside a rule left unread', () => {
			const definition = createLogicalDefinition('d', 'Loan', [
				createRule('a', [createAtom('income', 'above', 1)], createAtom('a', 'equals', true), {
					name: 'Income',
				}),
				createRule('b', [createAtom('debt', 'below', 9)], createAtom('b', 'equals', true), {
					name: 'Debt',
				}),
				createRule('c', [createAtom('b', 'equals', true)], createAtom('c', 'equals', true), {
					name: 'Grant',
				}),
			])
			const account = new Narrator().narrate(definition, REASON.reason({ debt: 1 }, definition))
			expect(renderAccount(account).split('\n')).toEqual([
				'Loan gave no answer',
				'  Income cannot be decided',
				'    income is not known, and must be a number',
			])
		})

		it('names two independent rules left unread', () => {
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
				'Loan gave no answer',
				'  Income cannot be decided',
				'    income is not known, and must be a number',
				'  Debt cannot be decided',
				'    debt is not known, and must be a number',
			])
		})

		it('states nothing a run derived where its errors hold more than its faults', () => {
			const flip = createRule(
				'r1',
				[createAtom('loop', 'not', true)],
				createAtom('loop', 'equals', true),
				{ name: 'Flip rule' },
			)
			const seat = createRule(
				'r2',
				[createAtom('loop', 'equals', true)],
				createAtom('seat', 'equals', true),
				{ name: 'Seat rule' },
			)
			const chain = ['seed', 'k1', 'k2'].map((field, index) =>
				createRule(
					`c${String(index)}`,
					[createAtom(field, 'equals', true)],
					createAtom(`k${String(index + 1)}`, 'equals', true),
					{ name: `Rule ${String(index)}` },
				),
			)
			const gold = createRule(
				'gold',
				[createAtom('age', 'from', 18)],
				createAtom('tier', 'equals', 'gold'),
				{ name: 'Gold rule' },
			)
			const tin = createRule(
				'tin',
				[createAtom('age', 'from', 21)],
				createAtom('tier', 'equals', 'tin'),
				{ name: 'Tin rule' },
			)
			const high = createRule(
				'high',
				[createAtom('tier', 'above', 5)],
				createAtom('high', 'equals', true),
				{ name: 'High rule' },
			)
			const cases = [
				['a negative cycle', [flip, seat], {}, { age: 30 }],
				['a depth cap', chain, { depth: 1 }, { seed: true }],
				['a supplied conclusion key', [gold, high], {}, { age: 30, tier: 'gold' }],
				['a conflict', [gold, tin], {}, { age: 30 }],
				['a conclusion read as a number', [gold, high], {}, { age: 30 }],
			] as const
			const narrator = new Narrator()
			for (const [title, rules, options, subject] of cases) {
				const definition = createLogicalDefinition('d', 'Eligibility', rules, options)
				// The reasoner alone, because the engine refuses a negative cycle before it runs.
				const result = createLogicalReasoner().reason(subject, definition)
				if (!isLogicalResult(result)) throw new Error('Expected a logical result')
				expect([title, result.success, result.faults]).toEqual([title, false, []])
				expect(result.errors.length).toBeGreaterThan(0)
				const account = narrator.narrate(definition, result)
				for (const detail of ['line', 'reasons', 'full'] as const) {
					expect([title, renderAccount(account, { detail })]).toEqual([
						title,
						'Eligibility gave no answer',
					])
				}
			}
			const income = createRule(
				'income',
				[createAtom('income', 'above', 1)],
				createAtom('paid', 'equals', true),
				{ name: 'Income rule' },
			)
			const both = createLogicalDefinition('d', 'Eligibility', [gold, high, income])
			const account = narrator.narrate(both, createLogicalReasoner().reason({ age: 30 }, both))
			expect(renderAccount(account, { detail: 'full' })).toBe(
				'Eligibility gave no answer\n  income is not known, and must be a number',
			)
			expect(renderAccount(account, { detail: 'line' })).toBe(
				'Eligibility gave no answer, because income is not known, and must be a number',
			)
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
			).toBe(
				'Loan gave no answer, because Age is not known, and must be a number; and agee is not expected',
			)
			const plain = createLogicalDefinition('d', 'Loan', rules)
			const supplied = narrator.narrate(plain, REASON.reason({ age: 30, a: true }, plain))
			expect(renderAccount(supplied, { detail: 'full' })).toBe('Loan gave no answer')
			expect(renderAccount(supplied, { detail: 'line' })).toBe('Loan gave no answer')
		})

		it('names a field holding a value it cannot use, with what it needed and what it got', () => {
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
					text: 'cost must be a number, and "plenty" is not',
					summary: 'cost must be a number, and "plenty" is not',
					source: {
						check: { field: 'cost', operator: 'to', value: 1250 },
						result: { field: 'cost', state: 'unread', actual: 'plenty' },
						fault: { reason: 'type', path: 'cost', expected: 'number', received: '"plenty"' },
					},
					gaps: [],
					lines: [],
				},
			])
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
				'Quiet activity cannot be decided, because noise level is not known, and must be a number',
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
				'Booking score gave no answer, because Base fee found no value to use (cost is not known, and must be a number)',
				'Booking score gave no answer, because Room rate found no value to use (no entry matches room)',
				'Floor area gave no answer, because depth is not known, and must be a number',
				'Booking facts gave no answer',
			])
			const texts = accounts.map((account) => renderAccount(account, { detail: 'full' }))
			expect(texts[0]?.split('\n')).toEqual([
				'Booking score gave no answer',
				'  Base fee found no value to use',
				'    cost is not known, and must be a number',
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
				'    no entry matches room',
				'Fees applied',
				'  Base fee applied',
				'  Service charge applied',
				'  Gold bonus applied',
				'Space did not apply',
				'  Room rate found no value to use',
			])
			expect(texts[2]).toBe('Floor area gave no answer\n  depth is not known, and must be a number')
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
				'Booking fees gave no answer, because Crowd charge found no value to use (guest count must be a number, and "many" is not)',
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
					'    guest count must be a number, and "many" is not',
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

		it('says that no entry matched where a lookup or a range found none, and its field is read', () => {
			const narrator = new Narrator()
			const tables = createQuantitativeDefinition('d', 'D', [
				createFactorGroup('g', 'sum', [
					createLookupFactor('l', 'kind', { a: 1 }, { name: 'L' }),
					createRangeFactor('r', 'size', [{ bounds: { maximum: 5 }, value: 1 }], { name: 'R' }),
				]),
			])
			const texts = [{ kind: 'z', size: 9 }, { kind: 'z' }, { size: 9 }].map(
				(subject) => narrator.narrate(tables, REASON.reason(subject, tables)).lines[0]?.summary,
			)
			expect(texts).toEqual([
				'D gave no answer, because L found no value to use (no entry matches kind); and R found no value to use (no entry matches size)',
				'D gave no answer, because L found no value to use (no entry matches kind); and R found no value to use (size is not known, and must be a number)',
				'D gave no answer, because L found no value to use (kind is not known, and must be one of its allowed forms); and R found no value to use (no entry matches size)',
			])
		})

		it('says where the number of a refused factor came from, as it does of one that applied', () => {
			const narrator = new Narrator({ glossary: { labels: { t: 'Tier', n: 'Count' } } })
			const divided = { transforms: [{ operation: 'divide', operand: 0 }] } as const
			const sources = [
				[
					createLookupFactor('f', 't', { gold: 5 }, { name: 'Rate', fallback: 9, ...divided }),
					{ t: 'bronze' },
					'its fallback, because no entry matches Tier',
				],
				[
					createLookupFactor('f', 't', { gold: 5 }, { name: 'Rate', fallback: 9, ...divided }),
					{ t: 'gold' },
					'looked up by Tier',
				],
				[
					createLookupFactor('f', 't', { gold: 5 }, { name: 'Rate', fallback: 5, ...divided }),
					{ t: 'bronze' },
					'looked up by Tier, or its fallback',
				],
				[
					createRangeFactor('f', 'n', [{ bounds: { maximum: 3 }, value: 2 }], {
						name: 'Rate',
						fallback: 8,
						...divided,
					}),
					{ n: 5 },
					'its fallback, because no entry matches Count',
				],
				[
					createRangeFactor('f', 'n', [{ bounds: { maximum: 3 }, value: 8 }], {
						name: 'Rate',
						fallback: 8,
						...divided,
					}),
					{ n: 5 },
					'looked up by Count, or its fallback',
				],
				[createFieldFactor('f', 'n', { name: 'Rate', ...divided }), { n: 5 }, 'Count is 5'],
				[
					createLookupFactor('f', 't', { gold: 5 }, { name: 'Rate', ...divided }),
					{ t: 'bronze' },
					'no entry matches Tier',
				],
				[
					createLookupFactor('f', 't', { gold: 5 }, { name: 'Rate', fallback: 9, ...divided }),
					{},
					'Tier is not known, and must be one of its allowed forms',
				],
			] as const
			for (const [factor, subject, source] of sources) {
				const definition = createQuantitativeDefinition('q', 'Quote', [
					createFactorGroup('g', 'sum', [factor], { name: 'Group' }),
				])
				const result = REASON.reason(subject, definition)
				expect(result.success).toBe(false)
				const account = narrator.narrate(definition, result)
				expect(renderAccount(account).split('\n')).toEqual([
					'Quote gave no answer',
					'  Rate found no value to use',
					`    ${source}`,
				])
				expect(account.lines[0]?.summary).toBe(
					`Quote gave no answer, because Rate found no value to use (${source})`,
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
				'Booking score gave no answer, because Gold bonus did not apply (wOrkshop tier is not known, and must be text)',
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

		it('agrees with the state the fixture gives every gate, and claims no outcome of them together', () => {
			const definition = buildWorkshopGates()
			const narrator = new Narrator({ glossary: WORKSHOP_GLOSSARY })
			const names = new Map(definition.rules.map((rule) => [rule.id, rule.name]))
			for (const { subject, success, states } of Object.values(WORKSHOP_GATES)) {
				const account = narrator.narrate(definition, REASON.reason(subject, definition))
				const lines = account.lines.slice(1)
				for (const line of lines) {
					const state = requireValue(states[line.source.rule ?? ''])
					const name = requireValue(names.get(line.source.rule ?? ''))
					expect(line.state).toBe(state)
					expect(line.text).toBe(`${name} ${RULE_WORDS[state]}`)
					expect(line.decisive).toBe(success && state === 'met')
				}
				expect(new Set(lines.map((line) => line.source.rule)).size).toBe(5)
				const verdict = requireValue(account.lines[0])
				expect(verdict.text).not.toMatch(/\bholds?\b|cannot be decided/)
				// The verdict names only rules that apply, and a refusal only rules left unread.
				const named = [...names].filter(([, name]) => verdict.summary.includes(name))
				const expected = success ? 'met' : 'unread'
				expect(named.filter(([id]) => states[id] !== expected)).toEqual([])
				expect(named.length > 0).toBe(Object.values(states).includes(expected))
			}
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
				['xor', [a, b], { a: true }, ['b is not known, and must be true or false']],
				['and', [a, b], { a: true }, ['b is not known, and must be true or false']],
				['or', [a, b], { a: false }, ['b is not known, and must be true or false']],
				['implies', [a, b], { a: true }, ['b is not known, and must be true or false']],
				['implies', [a, b], { b: false }, ['a is not known, and must be true or false']],
				[
					'and',
					[a, b],
					{},
					[
						'a is not known, and must be true or false',
						'b is not known, and must be true or false',
					],
				],
				['not', [a], {}, ['a is not known, and must be true or false']],
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
				'Booking score: 130',
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
			expect(renderAccount(account, { detail: 'line' })).toBe('Booking score: 130')
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
					'Booking fees: $121.35',
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
					'Booking fees: $210.90',
					'Hire: $210.00',
					'  Room rate: $40.00',
					'    hourly rate is $20.00',
					'  Crowd charge: $120.00',
					'    its fallback, because no entry matches guest count',
					'    before its changes: 40',
					'  Deposit: $50.00',
					'    fixed at $50.00',
					'Share: $0.90',
					'  Discount: 0.9',
					'    fixed at 0.9',
					'  Season: 1',
					'    its fallback, because no entry matches season',
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
				return account.lines.map((line) => line.text)
			})
			expect(last).toEqual([
				['D: 7', 'a: 3', 'b: 4', 'Total: 7'],
				['D: 9', 'base: 2', 'a: 3', 'b: 4', 'Total: 9'],
				['D: 3.5', 'a: 3', 'b: 4', 'Average: 3.5'],
				['D: 4', 'a: 3', 'b: 4', 'Highest: 4'],
				['D: 6', 'base: 2', 'a: 3', 'b: 4'],
				['D: 5', 'a: 3', 'b: 4', 'bounds: at most 5'],
			])
		})

		it('says so where a value is both the fallback and an entry', () => {
			const narrator = new Narrator({
				glossary: { labels: { tier: 'Customer tier', b: 'Field B' } },
			})
			const tables = createQuantitativeDefinition('d', 'D', [
				createFactorGroup('g', 'sum', [
					createLookupFactor(
						'rate',
						'tier',
						{ gold: 5, silver: 3 },
						{ name: 'Tier rate', fallback: 5 },
					),
					createRangeFactor(
						'band',
						'b',
						[
							{ bounds: { maximum: 3 }, value: 2 },
							{ bounds: { minimum: 7 }, value: 8 },
						],
						{ name: 'Band', fallback: 8 },
					),
				]),
			])
			const texts = [
				{ tier: 'bronze', b: 5 },
				{ tier: 'gold', b: 9 },
				{ tier: 'silver', b: 1 },
			].map((subject) => {
				const account = narrator.narrate(tables, REASON.reason(subject, tables))
				return account.lines[1]?.lines.map((line) => [
					line.text,
					line.lines.map(({ text }) => text),
				])
			})
			const unsettled = [
				['Tier rate: 5', ['looked up by Customer tier, or its fallback']],
				['Band: 8', ['looked up by Field B, or its fallback']],
			]
			expect(texts).toEqual([
				unsettled,
				unsettled,
				[
					['Tier rate: 3', ['looked up by Customer tier']],
					['Band: 2', ['set by the range Field B falls in']],
				],
			])
		})

		it('states a weight only under an aggregation that uses it', () => {
			const narrator = new Narrator()
			const weighted = AGGREGATIONS.map((aggregation) => {
				const worksheet = createQuantitativeDefinition('d', 'D', [
					createFactorGroup('g', aggregation, [
						createStaticFactor('one', 4, { name: 'One', weight: 3 }),
						createStaticFactor('two', 5, { name: 'Two', weight: 1 }),
					]),
				])
				const account = narrator.narrate(worksheet, REASON.reason({}, worksheet))
				return [aggregation, account.lines[1]?.lines[0]?.lines.map((line) => line.text)]
			})
			expect(Object.fromEntries(weighted)).toEqual({
				sum: ['fixed at 4', 'weight: 3'],
				product: ['fixed at 4', 'weight: 3'],
				average: ['fixed at 4', 'weight: 3'],
				minimum: ['fixed at 4'],
				maximum: ['fixed at 4'],
			})
		})

		it('states a base, a weight, and a bound wherever one is authored', () => {
			const worksheet = createQuantitativeDefinition(
				'w',
				'Quote',
				[
					createFactorGroup(
						'g',
						'sum',
						[
							createStaticFactor('s', 3, {
								name: 'Seats',
								weight: 2,
								bounds: { minimum: 4, maximum: 9 },
							}),
							createFieldFactor('f', 'n', { name: 'Nights', weight: 1, bounds: { maximum: 50 } }),
							createStaticFactor('o', 5, {
								name: 'Off',
								weight: 3,
								bounds: { minimum: 1 },
								checks: [{ field: 'n', operator: 'above', value: 100 }],
							}),
						],
						{ name: 'Stay', base: 10, bounds: { minimum: 5 } },
					),
					createFactorGroup('h', 'sum', [createStaticFactor('t', 1, { name: 'Tax' })], {
						name: 'Extra',
						base: 0,
						bounds: {},
					}),
					createFactorGroup(
						'p',
						'product',
						[createStaticFactor('r', 2, { name: 'Ratio', bounds: { maximum: 3 } })],
						{ name: 'Scale', base: 1 },
					),
				],
				{ base: 100, bounds: { minimum: 50, maximum: 1500 } },
			)
			const narrator = new Narrator({
				glossary: {
					labels: { n: 'night count' },
					units: { n: 'plain' },
					values: { w: 'money' },
					formats: { money: { style: 'currency', currency: 'USD' } },
				},
			})
			const account = narrator.narrate(worksheet, REASON.reason({ n: 7 }, worksheet))
			const texts = renderAccount(account, { detail: 'full' }).split('\n')
			expect(texts).toEqual([
				'Quote: $129.00',
				'base: $100.00',
				'Stay: $25.00',
				'  base: $10.00',
				'  Seats: $4.00',
				'    fixed at 3',
				'    bounds: $4.00 to $9.00',
				'    weight: 2',
				'  Nights: $7.00',
				'    night count is 7',
				'    bounds: at most $50.00',
				'  Off did not apply',
				'    night count is 7, which is not more than 100',
				'  bounds: at least $5.00',
				'Extra: $1.00',
				'  Tax: $1.00',
				'    fixed at $1.00',
				'Scale: $3.00',
				'  base: $1.00',
				'  Ratio: 2',
				'    fixed at 2',
				'    bounds: at most 3',
				'bounds: $50.00 to $1,500.00',
			])
			expect(renderAccount(account).split('\n')).toEqual(
				texts.filter((text) => !/Off did not|not more than/.test(text)),
			)
			expect(renderAccount(account, { detail: 'line' })).toBe('Quote: $129.00')
			const base = account.lines[1]
			expect([base?.role, base?.source, base?.lines]).toEqual(['step', {}, []])
			expect(account.lines[2]?.lines[0]?.source).toEqual({ group: 'g' })
			expect(account.lines[2]?.lines[1]?.lines[2]?.source).toEqual({ group: 'g', factor: 's' })
			const unformatted = new Narrator({ glossary: { labels: {}, values: { w: 'guilder' } } })
			const lines = [...unformatted.narrate(worksheet, REASON.reason({ n: 7 }, worksheet)).lines]
			for (const line of lines) lines.push(...line.lines)
			expect(
				lines
					.filter((line) => /^(?:base|bounds|weight): /.test(line.text))
					.map((line) => [line.text, line.gaps.length]),
			).toEqual([
				['base: 100', 1],
				['bounds: 50 to 1500', 1],
				['base: 10', 1],
				['bounds: at least 5', 1],
				['base: 1', 1],
				['bounds: 4 to 9', 1],
				['weight: 2', 0],
				['bounds: at most 50', 1],
				['bounds: at most 3', 0],
			])
		})

		it('states no base, weight, or bound of a refused run, or of a group that did not apply', () => {
			const factors = [
				createFieldFactor('f', 'n', { name: 'F', weight: 4, bounds: { maximum: 9 } }),
				createStaticFactor('s', 1, {
					name: 'S',
					weight: 4,
					bounds: { maximum: 9 },
					checks: [{ field: 'on', operator: 'equals', value: true }],
				}),
			]
			const worksheet = createQuantitativeDefinition(
				'w',
				'W',
				[
					createFactorGroup('g', 'sum', factors, {
						name: 'G',
						base: 4,
						bounds: { maximum: 9 },
						strict: true,
					}),
					createFactorGroup('h', 'sum', [createStaticFactor('t', 1, { name: 'T' })], { name: 'H' }),
				],
				{ base: 4, bounds: { maximum: 9 } },
			)
			const narrator = new Narrator()
			const texts = [{ on: true }, { n: 2, on: false }].map((subject) =>
				renderAccount(narrator.narrate(worksheet, REASON.reason(subject, worksheet)), {
					detail: 'full',
				}).split('\n'),
			)
			expect(texts).toEqual([
				[
					'W gave no answer',
					'  F found no value to use',
					'    n is not known, and must be a number',
					'G did not apply',
					'  F found no value to use',
					'  S applied',
					'H applied',
					'  T applied',
				],
				[
					'W: 5',
					'base: 4',
					'G did not apply',
					'  F applied',
					'  S did not apply',
					'    on is false',
					'H: 1',
					'  T: 1',
					'    fixed at 1',
					'bounds: at most 9',
				],
			])
		})

		it('states only the finite ends of a bound, and no base or weight that is not finite', () => {
			const ends = [
				{ minimum: Number.NEGATIVE_INFINITY, maximum: 9 },
				{ minimum: 0, maximum: Number.POSITIVE_INFINITY },
				{ minimum: Number.NEGATIVE_INFINITY, maximum: Number.POSITIVE_INFINITY },
				{ minimum: 0, maximum: 0 },
			]
			const texts = ends.map((bounds) => {
				const worksheet = createQuantitativeDefinition(
					'w',
					'W',
					[createFactorGroup('g', 'sum', [createStaticFactor('s', 0)])],
					{ bounds },
				)
				// The reasoner alone, because the engine's shape refuses an infinite bound.
				const result = createQuantitativeReasoner().reason({}, worksheet)
				const account = new Narrator().narrate(worksheet, result)
				return account.lines.slice(2).map((line) => line.text)
			})
			expect(texts).toEqual([['bounds: at most 9'], ['bounds: at least 0'], [], ['bounds: 0 to 0']])
			const broken = createQuantitativeDefinition(
				'w',
				'W',
				[
					createFactorGroup('g', 'sum', [createStaticFactor('s', 1, { weight: Number.NaN })], {
						base: Number.POSITIVE_INFINITY,
					}),
				],
				{ base: Number.NaN },
			)
			const result = createQuantitativeReasoner().reason({}, broken)
			if (!isQuantitativeResult(result)) throw new Error('Expected a quantitative result')
			const claimed = new Narrator().narrate(broken, {
				...result,
				success: true,
				value: 1,
				groups: [
					{ id: 'g', applied: true, value: 1, factors: [{ id: 's', applied: true, value: 1 }] },
				],
			})
			expect(renderAccount(claimed, { detail: 'full' }).split('\n')).toEqual([
				'W: 1',
				'g: 1',
				'  s: 1',
				'    fixed at 1',
				'Total: 1',
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
				'Other: 165',
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
			const gates = buildWorkshopGates()
			for (const narrator of [new Narrator(), new Narrator({ glossary: WORKSHOP_GLOSSARY })]) {
				const accounts = [
					...Object.values(WORKSHOP_SUBJECTS).map(({ subject }) =>
						narrator.narrate(rules, REASON.reason(subject, rules)),
					),
					...Object.values(WORKSHOP_GATES).map(({ subject }) =>
						narrator.narrate(gates, REASON.reason(subject, gates)),
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
					...[rules, gates, score, fees, area, facts].map((definition) =>
						narrator.describe(definition),
					),
				]
				const lines = accounts.flatMap((account) => account.lines)
				for (const line of lines) lines.push(...line.lines)
				expect(
					lines.filter((line) => BLANK_TEXT.test(line.text) || BLANK_TEXT.test(line.summary)),
				).toEqual([])
				expect(lines.length).toBeGreaterThan(300)
			}
		})

		// One case for each value a field holds, so that no case nears the timeout on a busy host.
		it.each([...STRANGE_VALUES.keys()])(
			'prints one whole line whatever a check or a name holds, for a field holding strange value %i',
			(index) => {
				const narrator = new Narrator()
				const lines: AccountLine[] = []
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
						const subject = { n: STRANGE_VALUES[index] }
						const result = createLogicalReasoner().reason(subject, definition)
						lines.push(...narrator.narrate(definition, result).lines)
						lines.push(...narrator.describe(definition).lines)
					}
				}
				for (const line of lines) lines.push(...line.lines)
				expect(
					lines.filter((line) => BLANK_TEXT.test(line.text) || BLANK_TEXT.test(line.summary)),
				).toEqual([])
				expect(lines.map((line) => line.state)).toContain('unread')
			},
		)

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
									createStaticFactor('s', number, {
										name: ' ',
										description: 'x\ny',
										weight: number,
										bounds: { minimum: number, maximum: number },
									}),
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
							{ aggregation, base: number, bounds: { maximum: number } },
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
				'cost is $1,250.50, which is one of $1,250.50 or $3.00',
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
				'  applies when places over capacity is in the range $3.00 to $1,250.50 and cost is $1,250.50',
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
				'W: 2501',
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
			).toEqual(['the SUM: 2', 'gROUP: 2', '  fACTOR: 2', '    iD Trade is 2', 'Total: 2'])
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
		it('counts the met rules of the enabled ones, beside a goal', () => {
			const definition = createLogicalDefinition('d', 'Loan', [
				createRule('a', [createAtom('n', 'above', 1)], createAtom('a', 'equals', true)),
				createRule('c', [createAtom('n', 'above', 9)], createAtom('c', 'equals', true)),
				createRule('b', [createAtom('a', 'equals', true)], createAtom('b', 'equals', true)),
				createRule('d', [createAtom('n', 'above', 0)], createAtom('d', 'equals', true), {
					enabled: false,
				}),
			])
			const account = new Narrator().narrate(definition, REASON.reason({ n: 5 }, definition))
			expect(account.lines[0]?.text).toBe('Loan holds')
			expect(account.lines[1]).toEqual({
				role: 'step',
				decisive: false,
				text: 'Rules of Loan that apply: 2 of 3',
				summary: 'Rules of Loan that apply: 2 of 3',
				source: {},
				gaps: [],
				lines: [],
			})
		})

		it('counts in the verdict where there is no goal, once, whatever the last rule settled on', () => {
			const definition = buildWorkshopGates()
			const narrator = new Narrator({ glossary: WORKSHOP_GLOSSARY })
			const texts = ['calm', 'crowd', 'dawn', 'festival'].map((name) => {
				const { subject } = requireValue(WORKSHOP_GATES[name])
				const account = narrator.narrate(definition, REASON.reason(subject, definition))
				return renderAccount(account, { detail: 'full' })
					.split('\n')
					.filter((text) => /\d of \d/.test(text))
			})
			expect(texts).toEqual([
				['Rules of Booking gates that apply: 0 of 5'],
				['Rules of Booking gates that apply: 1 of 5'],
				['Rules of Booking gates that apply: 2 of 5'],
				['Rules of Booking gates that apply: 5 of 5'],
			])
			const { subject } = requireValue(WORKSHOP_GATES.calm)
			const calm = narrator.narrate(definition, REASON.reason(subject, definition))
			expect(renderAccount(calm)).toBe('Rules of Booking gates that apply: 0 of 5')
			expect(renderAccount(calm, { detail: 'line' })).toBe(
				'Rules of Booking gates that apply: 0 of 5',
			)
		})

		it('counts the met rules of the enabled ones, without a goal', () => {
			const definition = createLogicalDefinition('d', 'Loan', [
				createRule('a', [createAtom('n', 'above', 1)], createAtom('a', 'equals', true)),
				createRule('b', [createAtom('n', 'above', 9)], createAtom('b', 'equals', true)),
				createRule('d', [createAtom('n', 'above', 0)], createAtom('d', 'equals', true), {
					enabled: false,
				}),
			])
			const account = new Narrator().narrate(definition, REASON.reason({ n: 5 }, definition))
			expect(account.lines[0]?.summary).toBe('Rules of Loan that apply: 1 of 2 (a)')
		})
	})

	describe('T8: a count reads for any number', () => {
		it('names what it counts at 0, 1, and 5, alone and with the rules that apply', () => {
			const narrator = new Narrator()
			const counts = [0, 1, 5].map((total) => {
				const rules = Array.from({ length: total }, (_, index) =>
					createRule(
						`r${String(index)}`,
						[createAtom('n', 'above', 0)],
						createAtom(`k${String(index)}`, 'equals', true),
						{ name: `R${String(index)}` },
					),
				)
				const definition = createLogicalDefinition('d', 'Loan', rules)
				// The reasoner alone, because the engine refuses a definition with no rule.
				const result = createLogicalReasoner().reason({ n: 1 }, definition)
				const account = narrator.narrate(definition, result)
				const counted = account.lines.find((line) => / that apply: /u.test(line.text))
				return [counted?.text, counted?.summary]
			})
			expect(counts).toEqual([
				['Rules of Loan that apply: 0 of 0', 'Rules of Loan that apply: 0 of 0'],
				['Rules of Loan that apply: 1 of 1', 'Rules of Loan that apply: 1 of 1'],
				[
					'Rules of Loan that apply: 5 of 5',
					'Rules of Loan that apply: 5 of 5 (R0, R1, R2, R3, and 1 more)',
				],
			])
		})
	})

	// T13. Each fault is the subject door's own, or the engine's over a check.
	describe('T13: a fault states what its fault holds', () => {
		const door = createSubjectDoor()
		const narrator = new Narrator({
			glossary: {
				labels: { amount: 'the AMOUNT', 'plan.term': 'plan term' },
				units: { amount: 'money', 'plan.term': 'month' },
				formats: {
					money: { style: 'currency', currency: 'USD' },
					month: { style: 'unit', unit: 'month' },
				},
			},
		})
		const kinds = Object.keys(FAULT_SHAPES)
		const words = Object.entries(FAULT_WORDS)

		it('states the kind a missing field needed, and nothing received', () => {
			const { faults } = door.admit({}, objectShape(FAULT_SHAPES))
			expect(faults.map((fault) => fault.reason)).toEqual(kinds.map(() => 'missing'))
			expect(faults.map((fault) => narrator.explain(fault))).toEqual(
				words.map(([kind, word]) => `${kind} is not known, and must be ${word}`),
			)
			const union = door.admit({}, objectShape({ u: unionShape(numberShape(), nullShape()) }))
			expect(union.faults.map((fault) => narrator.explain(fault))).toEqual([
				'u is not known, and must be one of its allowed forms',
			])
		})

		it('states the kind a field of another kind needed, and what it got', () => {
			const received = [
				[new Map(), 'instance'],
				[Symbol('mark'), 'Symbol(mark)'],
			] as const
			for (const [value, preview] of received) {
				const subject = Object.fromEntries(kinds.map((kind) => [kind, value]))
				const { faults } = door.admit(subject, objectShape(FAULT_SHAPES))
				expect(faults.map((fault) => fault.reason)).toEqual(kinds.map(() => 'type'))
				expect(faults.map((fault) => narrator.explain(fault))).toEqual(
					words.map(([kind, word]) => `${kind} must be ${word}, and ${preview} is not`),
				)
			}
			const { faults } = door.admit({ u: 5 }, objectShape({ u: undefinedShape() }))
			expect(faults.map((fault) => narrator.explain(fault))).toEqual([
				'u must be absent, and 5 is not',
			])
			const nested = door.admit(
				{ list: [1, 'x'] },
				objectShape({ list: arrayShape(numberShape()) }),
			)
			expect(nested.faults.map((fault) => narrator.explain(fault))).toEqual([
				'list.1 must be a number, and "x" is not',
			])
		})

		it('reads a value that is no number as no value, as it does everywhere', () => {
			const { faults } = door.admit({ amount: Number.NaN }, objectShape({ amount: numberShape() }))
			expect(faults).toEqual([
				{ reason: 'type', path: ['amount'], expected: 'number', received: 'NaN' },
			])
			expect(faults.map((fault) => narrator.explain(fault))).toEqual([
				'the AMOUNT is not known, and must be a number',
			])
		})

		it("states a bound in its field's unit, with what it got, and a length plain", () => {
			for (const [shape, value, text] of FAULT_BOUNDS) {
				const { faults } = door.admit({ amount: value }, objectShape({ amount: shape }))
				expect(faults.map((fault) => [fault.reason, narrator.explain(fault)])).toEqual([
					['constraint', text],
				])
			}
			const { faults } = door.admit(
				{ plan: { term: 3 } },
				objectShape({ plan: objectShape({ term: numberShape({ min: 6 }) }) }),
			)
			expect(faults.map((fault) => narrator.explain(fault))).toEqual([
				'plan term must be at least 6 mths, and 3 is not',
			])
		})

		it('keeps its words for a fault that holds no expectation', () => {
			for (const [subject, shape, texts] of FAULT_PLAIN) {
				const { faults } = door.admit(subject, shape)
				expect(faults.map((fault) => narrator.explain(fault))).toEqual(texts)
			}
		})

		it('writes a fault in an account as explain does, with the gaps its words needed', () => {
			const bare = new Narrator({ glossary: { labels: {}, units: { size: 'acre' } } })
			const definition = createLogicalDefinition(
				'd',
				'Loan',
				[createRule('r', [createAtom('amount', 'above', 1)], createAtom('x', 'equals', true))],
				{
					shape: objectShape({
						amount: numberShape({ max: 5 }),
						size: numberShape({ min: 2 }),
						note: stringShape({ min: 3 }),
						kind: stringShape(),
					}),
				},
			)
			const result = REASON.reason({ amount: 9, size: 1, note: 'a', kind: 5n }, definition)
			const account = bare.narrate(definition, result)
			expect(account.lines[0]?.lines.map((line) => line.text)).toEqual(
				result.faults.map((fault) => bare.explain(fault)),
			)
			expect(account.lines[0]?.lines.map((line) => [line.text, line.gaps])).toEqual([
				[
					'amount must be at most 5, and 9 is not',
					[
						{ word: 'label', field: ['amount'] },
						{ word: 'unit', field: ['amount'] },
					],
				],
				[
					'size must be at least 2, and 1 is not',
					[
						{ word: 'label', field: ['size'] },
						{ word: 'format', unit: 'acre' },
					],
				],
				['note must have a length of at least 3', [{ word: 'label', field: ['note'] }]],
				['kind must be text, and 5n is not', [{ word: 'label', field: ['kind'] }]],
			])
		})

		// The engine keeps one fault for a field, and a second reader's kind is not in it.
		it('states no expectation to a reader that needed another kind than the one fault holds', () => {
			const definition = createLogicalDefinition('d', 'Loan', [
				createRule('r', [createAtom('tier', 'above', 1)], createAtom('x', 'equals', true), {
					name: 'Number',
				}),
				createRule('s', [createAtom('tier', 'equals', 'gold')], createAtom('y', 'equals', true), {
					name: 'Text',
				}),
			])
			const account = new Narrator().narrate(definition, REASON.reason({}, definition))
			expect(renderAccount(account).split('\n')).toEqual([
				'Loan gave no answer',
				'  Number cannot be decided',
				'    tier is not known, and must be a number',
				'  Text cannot be decided',
				'    tier is not known',
			])
			const odd = new Narrator().narrate(definition, REASON.reason({ tier: ['a'] }, definition))
			expect(renderAccount(odd).split('\n')).toEqual([
				'Loan gave no answer',
				'  Number cannot be decided',
				'    tier must be a number, and array is not',
				'  Text cannot be decided',
				'    tier is not a value that can be used',
			])
			const worksheet = createQuantitativeDefinition('q', 'Q', [
				createFactorGroup('g', 'sum', [
					createFieldFactor('f', 'tier', { name: 'Field' }),
					createLookupFactor('l', 'tier', { gold: 1 }, { name: 'Lookup' }),
				]),
			])
			const sheet = new Narrator().narrate(worksheet, REASON.reason({}, worksheet))
			expect(renderAccount(sheet).split('\n')).toEqual([
				'Q gave no answer',
				'  Field found no value to use',
				'    tier is not known, and must be a number',
				'  Lookup found no value to use',
				'    tier is not known',
			])
		})

		it('rewords one expectation, one bound, or one frame alone', () => {
			const reworded = new Narrator({
				lexicon: {
					expected: { number: 'a figure' },
					constraints: { max: 'no more than {{limit}}' },
					frames: { 'fault.type': '{{label}}: {{expected}}, not {{received}}' },
				},
			})
			const shape = objectShape({ a: numberShape(), b: numberShape({ max: 5 }), c: stringShape() })
			const { faults } = door.admit({ a: new Map(), b: 9 }, shape)
			expect(faults.map((fault) => reworded.explain(fault))).toEqual([
				'a: a figure, not instance',
				'b must be no more than 5, and 9 is not',
				'c is not known, and must be text',
			])
		})
	})

	describe('T14: a number refusal has a sentence', () => {
		const shape = objectShape({
			rate: numberShape(),
			years: numberShape(),
			values: arrayShape(numberShape()),
		})
		const narrator = new Narrator({ glossary: { labels: { rate: 'the RATE' } } })

		it('words each refusal reason over a real text', () => {
			const texts = REFUSAL_SENTENCES.map(([reason, text, mappings]) => {
				const { refusals } = compileEntities(scanNumbers(text), [...mappings], text, shape)
				const refusal = requireValue(refusals?.items.find((item) => item.reason === reason))
				return narrator.explain(refusal)
			})
			expect(texts).toEqual(REFUSAL_SENTENCES.map((row) => row[3]))
			expect([...new Set(REFUSAL_SENTENCES.map(([reason]) => reason))]).toEqual(
				NUMBER_REFUSAL_REASONS,
			)
		})

		it('words each cause a number could not be read for, over a real text', () => {
			const texts = UNREADABLE_SENTENCES.map(([cause, text]) => {
				const mappings = [REFUSAL_MAPPINGS.rate]
				const { refusals } = compileEntities(scanNumbers(text), mappings, text, shape)
				const refusal = requireValue(refusals?.items.find((item) => item.unreadable === cause))
				expect(refusal.reason).toBe('unreadable')
				return narrator.explain(refusal)
			})
			expect(texts).toEqual(
				UNREADABLE_SENTENCES.map(
					([, , refused, cause]) =>
						`"${refused}" was not taken, because ${cause} (considered for the RATE)`,
				),
			)
			// The reader produces `signed` no longer, and a record can still hold it.
			expect(
				NUMBER_UNREADABLE_REASONS.filter(
					(cause) => !UNREADABLE_SENTENCES.some(([held]) => held === cause),
				),
			).toEqual(['signed'])
			expect(
				narrator.explain({
					text: '"-5"',
					start: 0,
					end: 2,
					reason: 'unreadable',
					unreadable: 'signed',
				}),
			).toBe('"-5" was not taken, because it carries a sign')
			expect(narrator.explain({ text: '"5"', start: 0, end: 1, reason: 'unreadable' })).toBe(
				'"5" was not taken, because it could not be read as an exact number',
			)
		})

		it('answers one line for a record that stops answering part of the way through', () => {
			const refusal = { text: '"5"', start: 0, end: 1, reason: 'unreadable', field: ['rate'] }
			const fault = { reason: 'type', path: ['rate'], expected: 'number', received: '"x"' }
			const texts = [refusal, fault].flatMap((record) =>
				Array.from({ length: 80 }, (_, length) => {
					const reads = Array.from({ length }).values()
					const failing = new Proxy(record, {
						get: (target, key) => {
							if (reads.next().done === true) throw new Error('refused')
							return Reflect.get(target, key)
						},
					})
					return String(Reflect.apply(narrator.explain, narrator, [failing]))
				}),
			)
			expect(new Set(texts)).toEqual(
				new Set([
					'not known',
					'"5" was not taken, because it could not be read as an exact number (considered for the RATE)',
					'the RATE must be a number, and "x" is not',
				]),
			)
		})

		it('answers one whole line for every record, whatever it holds', () => {
			const records: readonly unknown[] = [
				...createHostileValues(),
				...STRANGE_VALUES,
				...MALFORMED_RECORDS,
			]
			for (const record of records) {
				expect(Reflect.apply(narrator.explain, narrator, [record])).toBe('not known')
			}
			expect(
				STRANGE_RECORDS.map(([record]) => Reflect.apply(narrator.explain, narrator, [record])),
			).toEqual(STRANGE_RECORDS.map(([, text]) => text))
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
			expect(texts).toContain('  start is 10, which is in the range 8 to 18')
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

		it('carries a removed word on every line whose text or summary changes without it', () => {
			const quote = createQuantitativeDefinition(
				'fees',
				'Quote',
				[
					createFactorGroup(
						'stay',
						'sum',
						[
							createStaticFactor('seats', 10, { name: 'Seats' }),
							createFieldFactor('guests', 'guests', { name: 'Guests', weight: 2 }),
						],
						{ name: 'Stay', base: 10, bounds: { minimum: 5 } },
					),
				],
				{ base: 100, bounds: { minimum: 50, maximum: 1500 } },
			)
			const runs: ReadonlyArray<readonly [Definition, Subject]> = [
				...Object.values(WORKSHOP_SUBJECTS).map(
					({ subject }) => [buildWorkshopRules(), subject] as const,
				),
				...Object.values(WORKSHOP_GATES).map(
					({ subject }) => [buildWorkshopGates(), subject] as const,
				),
				...Object.values(WORKSHOP_SCORES).map(
					({ subject }) => [buildWorkshopScore(), subject] as const,
				),
				...Object.values(WORKSHOP_FEES).map(
					({ subject }) => [buildWorkshopFees(), subject] as const,
				),
				...Object.values(WORKSHOP_AREA).map(
					({ subject }) => [buildWorkshopArea(), subject] as const,
				),
				[quote, { guests: 1234 }],
			]
			const { labels, units, formats } = WORKSHOP_GLOSSARY
			const removals: ReadonlyArray<readonly [string, Glossary]> = [
				...Object.keys(labels).map(
					(key) =>
						[
							`label ${key}`,
							{
								...WORKSHOP_GLOSSARY,
								labels: Object.fromEntries(Object.entries(labels).filter(([word]) => word !== key)),
							},
						] as const,
				),
				...Object.keys(units).map(
					(key) =>
						[
							`unit ${key}`,
							{
								...WORKSHOP_GLOSSARY,
								units: Object.fromEntries(Object.entries(units).filter(([word]) => word !== key)),
							},
						] as const,
				),
				...Object.keys(formats).map(
					(key) =>
						[
							`format ${key}`,
							{
								...WORKSHOP_GLOSSARY,
								formats: Object.fromEntries(
									Object.entries(formats).filter(([word]) => word !== key),
								),
							},
						] as const,
				),
			]
			const complete = new Narrator({ glossary: WORKSHOP_GLOSSARY })
			const missed = removals.flatMap(([removed, glossary]) => {
				const narrator = new Narrator({ glossary })
				return runs.flatMap(([definition, subject]) => {
					const result = REASON.reason(subject, definition)
					const [whole, less] = [complete, narrator].map((writer) => {
						const lines = [
							...writer.narrate(definition, result).lines,
							...writer.describe(definition).lines,
						]
						for (const line of lines) lines.push(...line.lines)
						return lines
					})
					return requireValue(less).flatMap((line, index) => {
						const other = requireValue(requireValue(whole)[index])
						const carried = line.gaps.map(
							(gap) =>
								`${gap.word} ${gap.field === undefined ? String(gap.unit) : formatField(gap.field)}`,
						)
						const changed = line.text !== other.text || line.summary !== other.summary
						return changed && !carried.includes(removed) ? [[removed, line.text]] : []
					})
				})
			})
			expect(missed).toEqual([])
		})

		it('carries a missing name on every line whose text or summary prints its id', () => {
			const narrator = new Narrator({ glossary: WORKSHOP_GLOSSARY })
			const logical = [
				[buildWorkshopRules(), WORKSHOP_SUBJECTS],
				[buildWorkshopGates(), WORKSHOP_GATES],
			] as const
			const quantitative = [
				[buildWorkshopScore(), WORKSHOP_SCORES],
				[buildWorkshopFees(), WORKSHOP_FEES],
			] as const
			const runs: ReadonlyArray<readonly [string, Definition, Definition, Subject]> = [
				...logical.flatMap(([definition, cases]) =>
					Object.values(cases).flatMap(({ subject }) =>
						definition.rules.map(
							({ id }) =>
								[
									`rule ${id}`,
									definition,
									{
										...definition,
										rules: definition.rules.map((rule) =>
											rule.id === id ? { ...rule, name: id } : rule,
										),
									},
									subject,
								] as const,
						),
					),
				),
				...quantitative.flatMap(([definition, cases]) =>
					Object.values(cases).flatMap(({ subject }) =>
						definition.groups.flatMap((group) =>
							[group, ...group.factors].map(
								({ id }) =>
									[
										`${id === group.id ? 'group' : 'factor'} ${id}`,
										definition,
										{
											...definition,
											groups: definition.groups.map((part) => ({
												...part,
												name: part.id === id ? id : part.name,
												factors: part.factors.map((factor) =>
													factor.id === id ? { ...factor, name: id } : factor,
												),
											})),
										},
										subject,
									] as const,
							),
						),
					),
				),
			]
			const missed = runs.flatMap(([removed, definition, unnamed, subject]) => {
				const result = REASON.reason(subject, definition)
				const [whole, less] = [definition, unnamed].map((described) => {
					const lines = [
						...narrator.narrate(described, result).lines,
						...narrator.describe(described).lines,
					]
					for (const line of lines) lines.push(...line.lines)
					return lines
				})
				return requireValue(less).flatMap((line, index) => {
					const other = requireValue(requireValue(whole)[index])
					const carried = line.gaps.map((gap) => `${String(gap.part)} ${String(gap.id)}`)
					const changed = line.text !== other.text || line.summary !== other.summary
					return changed && !carried.includes(removed) ? [[removed, line.text]] : []
				})
			})
			expect(missed).toEqual([])
			expect(runs.length).toBeGreaterThan(100)
		})

		it("carries another rule's missing name on the line whose condition prints it", () => {
			const definition = createLogicalDefinition('d', 'D', [
				createRule('adult', [createAtom('age', 'from', 18)], createAtom('adult', 'equals', true)),
				createRule('ok', [createAtom('adult', 'equals', true)], createAtom('ok', 'equals', true), {
					name: 'Approved',
				}),
			])
			const guide = new Narrator({
				glossary: { labels: { age: 'Age' }, units: { age: 'plain' } },
			}).describe(definition)
			expect(guide.lines[2]?.summary).toBe('Approved applies when adult applies')
			expect(guide.lines[2]?.gaps).toEqual([{ word: 'name', part: 'rule', id: 'adult' }])
		})

		it('reports nothing for the complete glossary, over every fixture', () => {
			const narrator = new Narrator({ glossary: WORKSHOP_GLOSSARY })
			const definitions = [
				buildWorkshopRules(),
				buildWorkshopGates(),
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
			expect(account.lines[0]?.text).toBe('Booking score: unit:165')
		})
	})
})
