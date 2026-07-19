import type { Lexicon, NarratorOptions } from '@src/core'
import {
	atom,
	constant,
	equation,
	fact,
	factorGroup,
	fieldFactor,
	inference,
	inferentialDefinition,
	logicalDefinition,
	quantitativeDefinition,
	rule,
	symbolicDefinition,
	variable,
} from '@orkestrel/reason'
import { Narrator } from '@src/core'
import { describe, expect, it } from 'vitest'
import { TRICKY_KEYS } from '../../setup.js'

// The `Narrator` — a stateless, total, lexicon-driven reverse rendering
// engine (AGENTS §21 mechanism-never-policy). Every wording decision is data
// supplied via the lexicon/formatters seam, mirroring the forward
// `Formatter`'s `verbs` option.

const QUANTITATIVE = quantitativeDefinition('premium', 'Premium', [
	factorGroup('g', 'sum', [fieldFactor('v', 'value')]),
])
const LOGICAL = logicalDefinition('eligibility', 'Eligibility', [
	rule('adult', [atom('age', 'from', 18)], atom('adult', 'equals', true)),
])
const SYMBOLIC = symbolicDefinition('s1', 'Solve', [
	equation('e1', variable('x'), constant(5), 'x'),
])
const INFERENTIAL = inferentialDefinition(
	'mortality',
	'Mortality',
	[fact('f1', 'human', ['socrates'])],
	[inference('mortal', [fact('p1', 'human', ['?x'])], fact('c1', 'mortal', ['?x']))],
)

describe('Narrator', () => {
	describe('phrase', () => {
		it('renders a fixture domain phrase and misses cleanly to fallback/key', () => {
			const narrator = new Narrator({
				lexicon: {
					phrases: {
						comparison: { equals: 'is', above: 'over' },
						status: { active: 'currently active' },
					},
				},
			})
			expect(narrator.phrase('comparison', 'equals')).toBe('is')
			expect(narrator.phrase('comparison', 'above')).toBe('over')
			expect(narrator.phrase('status', 'active')).toBe('currently active')

			// missing table
			expect(narrator.phrase('missing-table', 'equals')).toBe('equals')
			expect(narrator.phrase('missing-table', 'equals', 'fallback')).toBe('fallback')
			// missing key within an existing table
			expect(narrator.phrase('comparison', 'missing-key')).toBe('missing-key')
			expect(narrator.phrase('comparison', 'missing-key', 'fallback')).toBe('fallback')
		})

		it('sweeps prototype-chain keys as tables and keys, missing cleanly every time', () => {
			const narrator = new Narrator({ lexicon: { phrases: { comparison: { equals: 'is' } } } })
			for (const key of TRICKY_KEYS) {
				expect(narrator.phrase(key, 'equals', 'fallback')).toBe('fallback')
				expect(narrator.phrase('comparison', key, 'fallback')).toBe('fallback')
				expect(narrator.phrase(key, key)).toBe(key)
			}
		})
	})

	describe('label', () => {
		it('renders a lexicon label and falls back to formatField on a miss', () => {
			const narrator = new Narrator({ lexicon: { labels: { age: 'Age', 'address.city': 'City' } } })
			expect(narrator.label('age')).toBe('Age')
			expect(narrator.label(['address', 'city'])).toBe('City')
			expect(narrator.label('income')).toBe('income')
			expect(narrator.label(['nested', 'path'])).toBe('nested.path')
		})

		it('sweeps prototype-chain keys, missing cleanly to formatField', () => {
			const narrator = new Narrator({ lexicon: { labels: { age: 'Age' } } })
			for (const key of TRICKY_KEYS) {
				expect(narrator.label(key)).toBe(key)
			}
		})
	})

	describe('line', () => {
		it('interpolates a matched template and returns empty string on a miss', () => {
			const narrator = new Narrator({
				lexicon: { templates: { greeting: 'Hello {{name}}, you are {{age}}' } },
			})
			expect(narrator.line('greeting', { name: 'Ada', age: 30 })).toBe('Hello Ada, you are 30')
			expect(narrator.line('missing', {})).toBe('')
		})

		it('sweeps prototype-chain keys as template ids, missing cleanly to empty string', () => {
			const narrator = new Narrator({ lexicon: { templates: { greeting: 'hi' } } })
			for (const key of TRICKY_KEYS) {
				expect(narrator.line(key, {})).toBe('')
			}
		})
	})

	describe('value', () => {
		it('formats through a registered formatter and falls back to String on a miss', () => {
			const narrator = new Narrator({
				formatters: { money: (value) => `$${String(value)}` },
			})
			expect(narrator.value('money', 5)).toBe('$5')
			expect(narrator.value('plain', 5)).toBe('5')
			expect(narrator.value('plain', 'text')).toBe('text')
		})

		it('catches a throwing formatter and falls back to String(raw) — total, never crashes', () => {
			const narrator = new Narrator({
				formatters: {
					broken: () => {
						throw new Error('boom')
					},
				},
			})
			expect(narrator.value('broken', 42)).toBe('42')
		})

		it('sweeps prototype-chain keys as units, missing cleanly to String(raw)', () => {
			const narrator = new Narrator({ formatters: { money: (value) => `$${String(value)}` } })
			for (const key of TRICKY_KEYS) {
				expect(narrator.value(key, 7)).toBe('7')
			}
		})
	})

	describe('— DEFAULT_LEXICON pinned strings', () => {
		it('reproduces the four reasoning kinds verbatim', () => {
			const narrator = new Narrator()
			expect(narrator.describe(QUANTITATIVE)).toBe('Premium: 1 factor group(s)')
			expect(narrator.describe(SYMBOLIC)).toBe('Solve: solve 1 equation(s)')
			expect(narrator.describe(LOGICAL)).toBe('Eligibility: 1 rule(s), strategy forward')
			expect(narrator.describe(INFERENTIAL)).toBe('Mortality: 1 fact(s)/1 inference(s), forward')
		})

		it('is deterministic across repeated calls', () => {
			const narrator = new Narrator()
			expect(narrator.describe(QUANTITATIVE)).toBe(narrator.describe(QUANTITATIVE))
		})
	})

	describe('— overriding lexicon', () => {
		it('renders through the overridden template', () => {
			const narrator = new Narrator({
				lexicon: {
					templates: { 'definition.quantitative': '{{name}} — {{count}} group(s) total' },
				},
			})
			expect(narrator.describe(QUANTITATIVE)).toBe('Premium — 1 group(s) total')
		})

		it('merges one overridden template while the rest still inherit the default', () => {
			const narrator = new Narrator({
				lexicon: { templates: { 'definition.quantitative': 'overridden: {{name}}' } },
			})
			expect(narrator.describe(QUANTITATIVE)).toBe('overridden: Premium')
			expect(narrator.describe(SYMBOLIC)).toBe('Solve: solve 1 equation(s)')
		})
	})

	describe('narrate — DEFAULT_LEXICON pinned strings', () => {
		it('reproduces a symbolic result verbatim, joining multiple solutions', () => {
			const narrator = new Narrator()
			expect(
				narrator.narrate({
					reasoning: 'symbolic',
					solutions: { x: 5 },
					success: true,
					trace: [],
					errors: [],
				}),
			).toBe('solved x=5')
			expect(
				narrator.narrate({
					reasoning: 'symbolic',
					solutions: { x: 5, y: 10 },
					success: true,
					trace: [],
					errors: [],
				}),
			).toBe('solved x=5, y=10')
		})

		it('reproduces a quantitative result verbatim, appending failures when present', () => {
			const narrator = new Narrator()
			expect(
				narrator.narrate({
					reasoning: 'quantitative',
					value: 42,
					groups: [],
					count: 2,
					success: true,
					trace: [],
					errors: [],
				}),
			).toBe('scored 42 across 2 group(s)')
			expect(
				narrator.narrate({
					reasoning: 'quantitative',
					value: 0,
					groups: [],
					count: 0,
					success: false,
					trace: [],
					errors: ['bad'],
				}),
			).toBe('scored 0 across 0 group(s); failed: bad')
		})

		it('reproduces logical results verbatim, met and unmet', () => {
			const narrator = new Narrator()
			expect(
				narrator.narrate({
					reasoning: 'logical',
					conclusion: true,
					rules: [],
					count: 3,
					success: true,
					trace: [],
					errors: [],
				}),
			).toBe('met: 3 rule(s)')
			expect(
				narrator.narrate({
					reasoning: 'logical',
					conclusion: false,
					rules: [],
					count: 3,
					success: true,
					trace: [],
					errors: [],
				}),
			).toBe('unmet: 3 rule(s)')
		})

		it('reproduces an inferential result verbatim', () => {
			const narrator = new Narrator()
			expect(
				narrator.narrate({
					reasoning: 'inferential',
					derived: [
						{ id: 'f1', predicate: 'p', terms: [] },
						{ id: 'f2', predicate: 'p', terms: [] },
					],
					success: true,
					trace: [],
					errors: [],
				}),
			).toBe('derived 2 fact(s)')
		})

		it('is deterministic across repeated calls', () => {
			const narrator = new Narrator()
			const result = {
				reasoning: 'logical' as const,
				conclusion: true,
				rules: [],
				count: 1,
				success: true,
				trace: [],
				errors: [],
			}
			expect(narrator.narrate(result)).toBe(narrator.narrate(result))
		})
	})

	describe('narrate — overriding lexicon', () => {
		it('renders through the overridden result templates', () => {
			const narrator = new Narrator({
				lexicon: {
					templates: {
						'result.logical': '{{status}} ({{count}} rule(s) checked)',
					},
				},
			})
			expect(
				narrator.narrate({
					reasoning: 'logical',
					conclusion: true,
					rules: [],
					count: 3,
					success: true,
					trace: [],
					errors: [],
				}),
			).toBe('met (3 rule(s) checked)')
		})
	})

	describe('constructed TRICKY_KEYS lexicon — exact hits, no cross-talk', () => {
		it('stores and retrieves phrase table names, phrase keys, template ids, and formatter unit names drawn from TRICKY_KEYS', () => {
			const [tableKey, phraseKey, templateKey, unitKey] = TRICKY_KEYS
			if (
				tableKey === undefined ||
				phraseKey === undefined ||
				templateKey === undefined ||
				unitKey === undefined
			) {
				throw new Error('TRICKY_KEYS must supply at least four entries')
			}
			const narrator = new Narrator({
				lexicon: {
					phrases: { [tableKey]: { [phraseKey]: 'phrase-value' } },
					templates: { [templateKey]: 'template {{x}}' },
				},
				formatters: { [unitKey]: (value) => `unit:${String(value)}` },
			})

			expect(narrator.phrase(tableKey, phraseKey)).toBe('phrase-value')
			expect(narrator.line(templateKey, { x: 1 })).toBe('template 1')
			expect(narrator.value(unitKey, 5)).toBe('unit:5')

			// Nothing inherited across the tricky keys — a different tricky key never
			// hits a sibling's stored value. Each sweep filters out the one stored
			// key first so every expect runs unconditionally.
			for (const other of TRICKY_KEYS.filter((key) => key !== phraseKey)) {
				expect(narrator.phrase(tableKey, other, 'fallback')).toBe('fallback')
			}
			for (const other of TRICKY_KEYS.filter((key) => key !== templateKey)) {
				expect(narrator.line(other, {})).toBe('')
			}
			for (const other of TRICKY_KEYS.filter((key) => key !== unitKey)) {
				expect(narrator.value(other, 5)).toBe('5')
			}
		})
	})

	describe('thousands grouping — intended behavior for large numbers', () => {
		it('pins the grouped rendering exactly as fillTemplate produces it', () => {
			const narrator = new Narrator()
			expect(
				narrator.narrate({
					reasoning: 'quantitative',
					value: 50000,
					groups: [],
					count: 3,
					success: true,
					trace: [],
					errors: [],
				}),
			).toBe('scored 50,000 across 3 group(s)')
		})
	})

	describe('narrate — multi-error failures suffix', () => {
		it('pins the joined "; failed: ..." rendering for two or more errors', () => {
			const narrator = new Narrator()
			expect(
				narrator.narrate({
					reasoning: 'quantitative',
					value: 0,
					groups: [],
					count: 0,
					success: false,
					trace: [],
					errors: ['bad group', 'missing factor'],
				}),
			).toBe('scored 0 across 0 group(s); failed: bad group, missing factor')
		})
	})

	describe('/ narrate — lexicon override coverage for all four reasoning kinds', () => {
		it('overrides every describe template', () => {
			const narrator = new Narrator({
				lexicon: {
					templates: {
						'definition.quantitative': 'Q: {{name}} ({{count}})',
						'definition.logical': 'L: {{name}} ({{count}}/{{strategy}})',
						'definition.symbolic': 'S: {{name}} ({{count}})',
						'definition.inferential': 'I: {{name}} ({{facts}}/{{inferences}}/{{strategy}})',
					},
				},
			})
			expect(narrator.describe(QUANTITATIVE)).toBe('Q: Premium (1)')
			expect(narrator.describe(LOGICAL)).toBe('L: Eligibility (1/forward)')
			expect(narrator.describe(SYMBOLIC)).toBe('S: Solve (1)')
			expect(narrator.describe(INFERENTIAL)).toBe('I: Mortality (1/1/forward)')
		})

		it('overrides every narrate template', () => {
			const narrator = new Narrator({
				lexicon: {
					templates: {
						'result.quantitative': 'Q: {{value}}/{{count}}',
						'result.logical': 'L: {{status}}/{{count}}',
						'result.symbolic': 'S: {{solved}}',
						'result.inferential': 'I: {{count}}',
					},
				},
			})
			expect(
				narrator.narrate({
					reasoning: 'quantitative',
					value: 1,
					groups: [],
					count: 2,
					success: true,
					trace: [],
					errors: [],
				}),
			).toBe('Q: 1/2')
			expect(
				narrator.narrate({
					reasoning: 'logical',
					conclusion: true,
					rules: [],
					count: 3,
					success: true,
					trace: [],
					errors: [],
				}),
			).toBe('L: met/3')
			expect(
				narrator.narrate({
					reasoning: 'symbolic',
					solutions: { x: 5 },
					success: true,
					trace: [],
					errors: [],
				}),
			).toBe('S: x=5')
			expect(
				narrator.narrate({
					reasoning: 'inferential',
					derived: [{ id: 'f1', predicate: 'p', terms: [] }],
					success: true,
					trace: [],
					errors: [],
				}),
			).toBe('I: 1')
		})
	})

	describe('totality against a type-violating lexicon / formatters (defense-in-depth)', () => {
		// Adversarial data built the same way the house convention builds off-shape
		// input elsewhere (e.g. tests/src/core/raters/validators.test.ts) —
		// `JSON.parse` assigned directly into a typed binding, no `as` cast.
		it('a null sub-record under phrases degrades to fallback/key, never throws', () => {
			const lexicon: Lexicon = JSON.parse('{"phrases":{"comparison":null}}')
			const narrator = new Narrator({ lexicon })
			expect(narrator.phrase('comparison', 'equals')).toBe('equals')
			expect(narrator.phrase('comparison', 'equals', 'fallback')).toBe('fallback')
		})

		it('a non-string phrase value degrades to fallback/key, never throws', () => {
			const lexicon: Lexicon = JSON.parse('{"phrases":{"comparison":{"equals":5}}}')
			const narrator = new Narrator({ lexicon })
			expect(narrator.phrase('comparison', 'equals')).toBe('equals')
			expect(narrator.phrase('comparison', 'equals', 'fallback')).toBe('fallback')
		})

		it('a non-string label value degrades to formatField, never throws', () => {
			const lexicon: Lexicon = JSON.parse('{"labels":{"age":5}}')
			const narrator = new Narrator({ lexicon })
			expect(narrator.label('age')).toBe('age')
		})

		it('a null template value degrades to empty string, never throws', () => {
			const lexicon: Lexicon = JSON.parse('{"templates":{"greeting":null}}')
			const narrator = new Narrator({ lexicon })
			expect(narrator.line('greeting', {})).toBe('')
		})

		it('a non-function formatter degrades to String(raw), never throws', () => {
			const options: NarratorOptions = JSON.parse('{"formatters":{"money":5}}')
			const narrator = new Narrator(options)
			expect(narrator.value('money', 42)).toBe('42')
		})
	})
})
