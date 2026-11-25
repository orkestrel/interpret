import type {
	Determination,
	Notice,
	ProgramDefinition,
	ProgramResult,
	Status,
} from '@orkestrel/program'
import type {
	Derivation,
	Finding,
	Premise,
	QualificationDefinition,
	QualificationResult,
	Ruling,
} from '@orkestrel/qualifier'
import type {
	Evidence,
	LineDefinition,
	LineResult,
	RatingDefinition,
	RatingResult,
	Worksheet,
	WorksheetFactor,
	WorksheetGroup,
} from '@orkestrel/rater'
import type {
	Account,
	AccountDetail,
	AccountLine,
	FamilyDefinition,
	FamilyDerivation,
	FamilyFinding,
	FamilyLine,
	FamilyLineResult,
	FamilyNotice,
	FamilyPremise,
	FamilyProgram,
	FamilyProgramResult,
	FamilyQualification,
	FamilyQualificationResult,
	FamilyRating,
	FamilyRatingResult,
	FamilyResult,
	FamilyRuling,
	FamilyWorksheet,
	FamilyWorksheetFactor,
	FamilyWorksheetGroup,
	Glossary,
	GlossaryGap,
} from '@src/core'
import { isString } from '@orkestrel/contract'
import { buildNotice, buildProgramDefinition, createProgram, STATUSES } from '@orkestrel/program'
import { createQualificationDefinition, createQualifier, createRuling } from '@orkestrel/qualifier'
import { buildLineDefinition, buildRatingDefinition, createRater } from '@orkestrel/rater'
import {
	createAtom,
	createCompound,
	createFactorGroup,
	createFieldFactor,
	createLogicalDefinition,
	createLogicalReasoner,
	createLookupFactor,
	createQuantitativeDefinition,
	createRangeFactor,
	createRule,
	createStaticFactor,
	formatField,
} from '@orkestrel/reason'
import { invokeUnchecked, requireValue } from '@orkestrel/test'
import {
	DEFAULT_FORMATS,
	DEFAULT_LEXICON,
	FamilyNarrator,
	Interpret,
	isFamilyProgram,
	isFamilyProgramResult,
	isFamilyQualification,
	isFamilyQualificationResult,
	isFamilyRating,
	isFamilyRatingResult,
	Narrator,
	renderAccount,
} from '@src/core'
import { describe, expect, it } from 'vitest'

import {
	buildFamilyProgram,
	buildFamilyQualification,
	buildFamilyRating,
	collectFamilyFindings,
	FAMILY_BASE,
	FAMILY_GLOSSARY,
	FAMILY_PROGRAMS,
	FAMILY_RATINGS,
	FAMILY_SUBJECTS,
	FAMILY_WORDED,
} from '../../setup.js'

// The documents of a qualification, a rating, and a program, over the results the packages that own
// them give for the invented workshop.

const UNITS: ReadonlySet<string> = new Set([
	...Object.keys(DEFAULT_FORMATS),
	...Object.keys(FAMILY_GLOSSARY.formats),
])

const GLOSSARY: Glossary = FAMILY_GLOSSARY

const FAMILY = new FamilyNarrator(new Narrator({ glossary: GLOSSARY }), {
	glossary: GLOSSARY,
	units: UNITS,
})

const DETAILS: readonly AccountDetail[] = ['line', 'reasons', 'full']

const QUALIFIER = createQualifier({ labels: { noise: 'a label nobody reads' } })

const RATER = createRater({ labels: { cost: 'a label nobody reads' } })

const QUALIFICATION = buildFamilyQualification()

const RATING = buildFamilyRating()

const PROGRAM = buildFamilyProgram()

const QUALIFIED: ReadonlyArray<readonly [string, QualificationResult]> = Object.entries(
	FAMILY_SUBJECTS,
).map(([name, { subject }]) => [name, QUALIFIER.qualify(subject, QUALIFICATION)])

const RATED: ReadonlyArray<readonly [string, RatingResult]> = Object.entries(FAMILY_RATINGS).map(
	([name, { subject }]) => [name, RATER.rate(RATING, subject)],
)

const EXECUTED: ReadonlyArray<readonly [string, ProgramResult]> = Object.entries(
	FAMILY_PROGRAMS,
).map(([name, { subject }]) => [name, createProgram(PROGRAM).execute(subject)])

// Every document of the workshop: each result's account, and each guide.
const ACCOUNTS: readonly Account[] = [
	...QUALIFIED.map(([, result]) => FAMILY.narrate(QUALIFICATION, result)),
	...RATED.map(([, result]) => FAMILY.narrate(RATING, result)),
	...EXECUTED.map(([, result]) => FAMILY.narrate(PROGRAM, result)),
	...[QUALIFICATION, RATING, PROGRAM].map((definition) => FAMILY.describe(definition)),
]

const SECRET = 4321

// A pass whose lookup misses, so the run holds an error that no fault says.
const MISSED = createQualificationDefinition(
	'missed',
	'Missed booking',
	[
		createQuantitativeDefinition('size', 'Room size', [
			createFactorGroup(
				'sizes',
				'sum',
				[createLookupFactor('room', 'room', { hall: 100 }, { name: 'Room' })],
				{ name: 'Sizes' },
			),
		]),
		createLogicalDefinition('gates', 'Gates', [
			createRule(
				'big',
				[createAtom(['qualification', 'size'], 'above', 2)],
				createAtom('big', 'equals', true),
				{ name: 'Big room' },
			),
		]),
	],
	{ rulings: [createRuling('big', 'gates', 'big', 'restriction', { message: 'Too big.' })] },
)

const REFUSED = QUALIFIER.qualify({ room: 'attic' }, MISSED)

describe('FamilyNarrator', () => {
	describe('the structural types', () => {
		it('admit the packages’ own definitions and results, and the guards agree', () => {
			const qualification: QualificationDefinition = QUALIFICATION
			const rating: RatingDefinition = RATING
			const program: ProgramDefinition = PROGRAM
			const qualified: QualificationResult = requireValue(QUALIFIED[0])[1]
			const rated: RatingResult = requireValue(RATED[0])[1]
			const executed: ProgramResult = requireValue(EXECUTED[0])[1]
			const definitions: readonly [FamilyQualification, FamilyRating, FamilyProgram] = [
				qualification,
				rating,
				program,
			]
			const results: readonly [FamilyQualificationResult, FamilyRatingResult, FamilyProgramResult] =
				[qualified, rated, executed]
			expect(definitions.map((definition) => definition.id)).toEqual([
				'qualification',
				'rating',
				'program',
			])
			expect(results.every((result) => result.success)).toBe(true)
			expect(isFamilyQualification(qualification)).toBe(true)
			expect(isFamilyRating(rating)).toBe(true)
			expect(isFamilyProgram(program)).toBe(true)
			for (const [, result] of QUALIFIED) expect(isFamilyQualificationResult(result)).toBe(true)
			for (const [, result] of RATED) expect(isFamilyRatingResult(result)).toBe(true)
			for (const [, result] of EXECUTED) expect(isFamilyProgramResult(result)).toBe(true)
		})

		it('admit each part of them', () => {
			const ruling: Ruling = requireValue(QUALIFICATION.rulings?.[0])
			const finding: Finding = requireValue(requireValue(QUALIFIED[1])[1].findings[0])
			const premise: Premise = requireValue(finding.premises[0])
			const derivation: Derivation = requireValue(requireValue(QUALIFIED[0])[1].derivations[0])
			const line: LineDefinition = requireValue(RATING.lines[0])
			const rated: LineResult = requireValue(requireValue(RATED[4])[1].lines[2])
			const worksheet: Worksheet = rated.worksheet
			const group: WorksheetGroup = requireValue(worksheet.groups[0])
			const factor: WorksheetFactor = requireValue(group.factors[0])
			const evidence: Evidence = requireValue(factor.evidence[0])
			const notice: Notice = requireValue(PROGRAM.notices?.[0])
			const determination: Determination = requireValue(
				requireValue(EXECUTED[0])[1].determinations[0],
			)
			const parts: readonly [
				FamilyRuling,
				FamilyFinding,
				FamilyPremise,
				FamilyDerivation,
				FamilyLine,
				FamilyLineResult,
				FamilyWorksheet,
				FamilyWorksheetGroup,
				FamilyWorksheetFactor,
				FamilyPremise,
				FamilyNotice,
				FamilyFinding,
			] = [
				ruling,
				finding,
				premise,
				derivation,
				line,
				rated,
				worksheet,
				group,
				factor,
				evidence,
				notice,
				determination,
			]
			expect(parts.length).toBe(12)
		})
	})

	describe('a qualification’s result', () => {
		it('states the verdict with the findings that fix it, at each detail', () => {
			const account = FAMILY.narrate(
				QUALIFICATION,
				QUALIFIER.qualify({ ...FAMILY_BASE, guests: 20 }, QUALIFICATION),
			)
			expect(account).toMatchObject({
				id: 'qualification',
				name: 'Booking qualification',
				success: true,
			})
			expect(
				DETAILS.map((detail) => renderAccount(account, { detail }).split('\n').slice(0, 5)),
			).toEqual([
				[
					'Booking qualification: referred for review, because Crowded booking applies (booking load is 16, which is more than 10)',
				],
				[
					'Booking qualification: referred for review',
					'Referral: Crowded booking applies',
					'  booking load is 16, which is more than 10',
				],
				[
					'Booking qualification: referred for review',
					'Referral: Crowded booking applies',
					'  booking load is 16, which is more than 10',
					'booking load is 16',
					'Restriction: Restricted activity does not apply',
				],
			])
		})

		it('orders the met findings by effect, and nests a scoped one under its scope', () => {
			const subject = {
				...FAMILY_BASE,
				activity: 'torch welding',
				guests: 20,
				member: 'guest',
				tools: false,
				noise: 55,
			}
			const account = FAMILY.narrate(QUALIFICATION, QUALIFIER.qualify(subject, QUALIFICATION))
			expect(renderAccount(account).split('\n')).toEqual([
				'Booking qualification: not eligible',
				'Restriction: The workshop does not lend a room for torch welding.',
				'  activity is torch welding, which is one of torch welding, axe throwing, or glass blowing',
				'Referral: Crowded booking applies',
				'  booking load is 16, which is more than 10',
				'Condition: Visiting booker applies',
				'  workshop tier is guest',
				'room rent: eligible',
				'  Condition: Neighbours must be told.',
				'    noise level is 55, which is more than 40',
			])
			expect(renderAccount(account, { detail: 'line' })).toBe(
				'Booking qualification: not eligible, because The workshop does not lend a room for torch welding.',
			)
		})

		it('sorts an effect it has no order for after the ones it has, and words it as the engine does', () => {
			const [first, second] = requireValue(QUALIFIED[1])[1].findings
			const result: FamilyQualificationResult = {
				...requireValue(QUALIFIED[1])[1],
				eligibility: 'waived',
				findings: [
					{ ...requireValue(second), state: 'met', effect: 'waiver', message: 'Waived.' },
					requireValue(first),
				],
			}
			expect(renderAccount(FAMILY.narrate(QUALIFICATION, result)).split('\n').slice(0, 5)).toEqual([
				'Booking qualification: waived',
				'Restriction: The workshop does not lend a room for torch welding.',
				'  activity is torch welding, which is one of torch welding, axe throwing, or glass blowing',
				'waiver: Waived.',
			])
		})

		it('prints every derived number at full alone, and a failed derivation as no answer', () => {
			const standing = FAMILY.narrate(QUALIFICATION, requireValue(QUALIFIED[0])[1])
			expect(renderAccount(standing)).toBe('Booking qualification: eligible')
			expect(renderAccount(standing, { detail: 'full' }).split('\n')[1]).toBe('booking load is 4')
			const refused = requireValue(QUALIFIED.find(([name]) => name === 'refused'))[1]
			expect(
				renderAccount(FAMILY.narrate(QUALIFICATION, refused), { detail: 'full' }).split('\n')[2],
			).toBe('Booking load gave no answer')
		})

		it('cites what a run could not read, and prints it once', () => {
			const unread = requireValue(QUALIFIED.find(([name]) => name === 'unread'))[1]
			const account = FAMILY.narrate(QUALIFICATION, unread)
			expect(renderAccount(account, { detail: 'line' })).toBe(
				'Booking qualification: referred for review, because noise level is not known, and must be a number',
			)
			const full = renderAccount(account, { detail: 'full' }).split('\n')
			expect(full.filter((line) => line.includes('noise level'))).toEqual([
				'  noise level is not known, and must be a number',
			])
			expect(full.at(-1)).toBe('room rent: Condition: Loud activity cannot be decided')
		})

		it('names a scope by the glossary, and by its id with a gap where the glossary has none', () => {
			const late = requireValue(QUALIFIED.find(([name]) => name === 'late'))[1]
			const named = FAMILY.narrate(QUALIFICATION, late)
			expect(named.lines[1]?.text).toBe('room rent: not eligible')
			expect(named.lines[1]?.summary).toBe(
				'room rent: not eligible, because The room cannot be rented after 18:00.',
			)
			const bare = new FamilyNarrator(new Narrator()).narrate(QUALIFICATION, late)
			expect(bare.lines[1]?.text).toBe('rent: not eligible')
			expect(bare.lines[1]?.gaps).toContainEqual({ word: 'name', part: 'scope', id: 'rent' })
		})

		it('states a scope the result gave no eligibility as not known', () => {
			const late = requireValue(QUALIFIED.find(([name]) => name === 'late'))[1]
			const account = FAMILY.narrate(QUALIFICATION, { ...late, scopes: {} })
			expect(renderAccount(account).split('\n').slice(1, 3)).toEqual([
				'room rent: not known',
				'  Restriction: The room cannot be rented after 18:00.',
			])
		})

		it('carries where each line came from', () => {
			const late = requireValue(QUALIFIED.find(([name]) => name === 'late'))[1]
			const account = FAMILY.narrate(QUALIFICATION, late)
			expect(account.lines[1]?.source).toEqual({ scope: 'rent' })
			expect(account.lines[1]?.lines[0]?.source).toEqual({
				finding: 'afterhours',
				rule: 'afterhours',
				pass: 'gates',
				scope: 'rent',
			})
			expect(account.lines[1]?.lines[0]?.state).toBe('met')
			expect(account.lines[2]?.source).toEqual({ pass: 'load' })
		})

		it('limits its reasons as the narrator does', () => {
			const lexicon = { ...DEFAULT_LEXICON, limits: { list: 4, reasons: 1 } }
			const family = new FamilyNarrator(new Narrator({ glossary: GLOSSARY, lexicon }), {
				glossary: GLOSSARY,
				lexicon,
			})
			const gates = createLogicalDefinition('gates', 'Gates', [
				createRule('a', [createAtom('noise', 'above', 1)], createAtom('a', 'equals', true), {
					name: 'A',
				}),
				createRule('b', [createAtom('start', 'above', 1)], createAtom('b', 'equals', true), {
					name: 'B',
				}),
			])
			const definition = createQualificationDefinition('q', 'Two', [gates], {
				rulings: [
					createRuling('a', 'gates', 'a', 'restriction', { message: 'First.' }),
					createRuling('b', 'gates', 'b', 'restriction', { message: 'Second.' }),
				],
			})
			const result = QUALIFIER.qualify(FAMILY_BASE, definition)
			expect(renderAccount(family.narrate(definition, result), { detail: 'line' })).toBe(
				'Two: not eligible, because First.; and 1 more',
			)
		})
	})

	describe('a rating’s result', () => {
		it('states the total, and each line with its worksheet', () => {
			const rated = requireValue(RATED.find(([name]) => name === 'hall'))[1]
			expect(renderAccount(FAMILY.narrate(RATING, rated)).split('\n')).toEqual([
				'Booking rating: $270.00',
				'Room rent: $120.00',
				'  Hire: $120.00',
				'    Room rate: $120.00',
				'      looked up by room',
				'  Total: $120.00',
				'Guest fee: $100.00',
				'  Heads: $100.00',
				'    Per guest: $100.00',
				'      taken from guest count',
				'      bounds: $20.00 to $100.00',
				'  Total: $100.00',
				'Deposit: $50.00',
				'  Hold: $50.00',
				'    Deposit: $50.00',
				'      fixed at $50.00',
				'  Total: $50.00',
			])
		})

		it('refuses with the line that gave no answer, and says which check failed', () => {
			const rated = requireValue(RATED.find(([name]) => name === 'costly'))[1]
			const account = FAMILY.narrate(RATING, rated)
			expect(renderAccount(account, { detail: 'line' })).toBe(
				'Booking rating gave no answer, because Deposit gave no answer',
			)
			expect(renderAccount(account).split('\n').slice(-3)).toEqual([
				'Deposit gave no answer',
				'  Deposit did not apply',
				'    cost is $2,000.00, which is more than $1,250.00',
			])
		})

		it('refuses a subject its door refused with the fields, and no line', () => {
			const faults = [{ reason: 'missing', path: 'room', expected: 'string' }] as const
			const account = FAMILY.narrate(RATING, { lines: [], success: false, faults })
			expect(renderAccount(account).split('\n')).toEqual([
				'Booking rating gave no answer',
				'  room is not known, and must be text',
			])
			expect(renderAccount(account, { detail: 'line' })).toBe(
				'Booking rating gave no answer, because room is not known, and must be text',
			)
		})

		it('prints no factor and no group a line’s door never reached, and none that is disabled', () => {
			const [line] = RATING.lines
			const authored = requireValue(line)
			const shaped = {
				...authored,
				rate: {
					...authored.rate,
					groups: [
						...authored.rate.groups,
						createFactorGroup('off', 'sum', [createStaticFactor('extra', 5)], { enabled: false }),
					],
				},
			}
			const definition = buildRatingDefinition('rating', 'Booking rating', [shaped])
			const rated = RATER.rate(definition, FAMILY_BASE)
			expect(renderAccount(FAMILY.narrate(definition, rated), { detail: 'full' })).not.toContain(
				'off',
			)
			const unreached = {
				...requireValue(rated.lines[0]),
				worksheet: {
					...requireValue(rated.lines[0]).worksheet,
					success: false,
					groups: requireValue(rated.lines[0]).worksheet.groups.map((group) => ({
						...group,
						applied: false,
						factors: group.factors.map(({ value: _value, ...factor }) => ({
							...factor,
							applied: false,
						})),
					})),
				},
			}
			const refused = { lines: [unreached], success: false, faults: [] }
			expect(renderAccount(FAMILY.narrate(definition, refused), { detail: 'full' })).toBe(
				['Booking rating gave no answer', 'Room rent gave no answer'].join('\n'),
			)
		})

		it('names a line by its definition, in order where two share an id, and by its result where none has it', () => {
			const [line] = RATING.lines
			const authored = requireValue(line)
			const twins = buildRatingDefinition('rating', 'Booking rating', [
				authored,
				{ ...authored, name: 'Second rent' },
			])
			const rated = RATER.rate(twins, FAMILY_BASE)
			const account = FAMILY.narrate(twins, rated)
			expect(account.lines.slice(1).map((entry) => entry.text)).toEqual([
				'Room rent: $80.00',
				'Second rent: $80.00',
			])
			const other = buildRatingDefinition('rating', 'Booking rating', [])
			expect(
				FAMILY.narrate(other, rated)
					.lines.slice(1)
					.map((entry) => entry.text),
			).toEqual(['Room rent: 80', 'Second rent: 80'])
		})
	})

	describe('a program’s result', () => {
		it('states the status, the decision, the notices, and the two results', () => {
			const late = requireValue(EXECUTED.find(([name]) => name === 'late'))[1]
			const account = FAMILY.narrate(PROGRAM, late)
			expect(renderAccount(account, { detail: 'line' })).toBe(
				'Booking program: eligible with conditions, because Room rent: The room cannot be rented after 18:00.',
			)
			expect(renderAccount(account).split('\n').slice(0, 10)).toEqual([
				'Booking program: eligible with conditions',
				'Decision: approved',
				'Notice: The workshop closes at 18:00.',
				'Room rent: Notice: Rent for studio is due on arrival.',
				'Booking qualification: eligible',
				'  Room rent: not eligible',
				'    Restriction: The room cannot be rented after 18:00.',
				'      start hour is 20, which is more than 18',
				'Booking rating: $76.00',
				'  Guest fee: $26.00',
			])
		})

		it('states a limit with the checks that fixed it, and no decision where the result holds none', () => {
			const heavy = requireValue(EXECUTED.find(([name]) => name === 'heavy'))[1]
			const lines = renderAccount(FAMILY.narrate(PROGRAM, heavy)).split('\n')
			expect(lines.slice(3, 6)).toEqual([
				'Limit: A rated total above 200 needs a manual decision.',
				'  booking rated is true',
				'  rated total is $270.00, which is more than $200.00',
			])
			expect(lines.filter((line) => line.startsWith('Decision'))).toEqual([])
		})

		it.each(Object.entries(FAMILY_PROGRAMS))(
			'states the status and the decision the engine gave for %s',
			(name, expected) => {
				const result = requireValue(EXECUTED.find(([entry]) => entry === name))[1]
				const account = FAMILY.narrate(PROGRAM, result)
				expect(account.lines[0]?.text).toBe(
					`Booking program: ${DEFAULT_LEXICON.statuses[expected.status]}`,
				)
				expect(
					account.lines.map((line) => line.text).filter((text) => text.startsWith('Decision')),
				).toEqual(
					expected.decision === undefined
						? []
						: [`Decision: ${DEFAULT_LEXICON.decisions[expected.decision]}`],
				)
				for (const { effect, message } of expected.determinations) {
					expect(account.lines.map((line) => line.text).join('\n')).toContain(
						`${DEFAULT_LEXICON.effects[effect]}: ${message}`,
					)
				}
			},
		)

		it('cites what fixed each status', () => {
			const cited = new Map<string, string>(
				EXECUTED.map(([name, result]) => [
					name,
					renderAccount(FAMILY.narrate(PROGRAM, result), { detail: 'line' }),
				]),
			)
			expect(Object.fromEntries(cited)).toEqual({
				standing: 'Booking program: eligible',
				denied:
					'Booking program: not eligible, because The workshop does not lend a room for torch welding.',
				submitted:
					'Booking program: referred for review, because Crowded booking applies (booking load is 16, which is more than 10)',
				reviewed:
					'Booking program: referred for review, because Deposit: A person must review the deposit.',
				loud: 'Booking program: eligible with conditions, because Room rent: Neighbours must be told.',
				late: 'Booking program: eligible with conditions, because Room rent: The room cannot be rented after 18:00.',
				costly: 'Booking program: not fully rated, because Deposit gave no answer',
				unread:
					'Booking program: incomplete, because noise level is not known, and must be a number',
				heavy: 'Booking program: eligible',
			})
		})

		it('says a subject with no line left to rate is not fully rated, and why', () => {
			const subject = { ...FAMILY_BASE, start: 20, staff: 0 }
			const definition = {
				...PROGRAM,
				rating: { ...RATING, lines: RATING.lines.filter((line) => line.id !== 'fee') },
			}
			const result = createProgram(definition).execute(subject)
			expect(result.rating).toBeUndefined()
			expect(renderAccount(FAMILY.narrate(definition, result), { detail: 'line' })).toBe(
				'Booking program: not fully rated, because Room rent: The room cannot be rented after 18:00.; and Deposit: Guests without staff applies (staff on hand is 0, which is less than 1)',
			)
		})

		it('prints a field the program alone could not read beneath its verdict', () => {
			const standing = requireValue(EXECUTED[0])[1]
			const faults = [{ reason: 'missing', path: 'room', expected: 'string' }] as const
			const account = FAMILY.narrate(PROGRAM, { ...standing, status: 'incomplete', faults })
			expect(account.lines[0]?.lines.map((line) => line.text)).toEqual([
				'room is not known, and must be text',
			])
		})

		it('leaves out a rating where the definition or the result holds none', () => {
			const { rating: _rating, ...unrated } = requireValue(EXECUTED[0])[1]
			const { rating: _authored, ...bare } = PROGRAM
			for (const account of [
				FAMILY.narrate(PROGRAM, unrated),
				FAMILY.narrate(bare, requireValue(EXECUTED[0])[1]),
			]) {
				expect(renderAccount(account)).not.toContain('Booking rating')
			}
		})
	})

	describe('the guides', () => {
		it('a qualification’s states each ruling, with its scope, its words, and its condition', () => {
			const guide = FAMILY.describe(QUALIFICATION)
			expect(guide.success).toBeUndefined()
			const full = renderAccount(guide, { detail: 'full' }).split('\n')
			expect(full.slice(0, 2)).toEqual([
				'Booking qualification',
				'  Decides whether the workshop takes a booking.',
			])
			expect(full).toContain('deposit: Referral: Tools without training')
			const start = full.indexOf('room rent: After hours')
			expect(start).toBe(-1)
			const ruled = full.indexOf('room rent: Restriction: After hours')
			expect(full.slice(ruled, ruled + 4)).toEqual([
				'room rent: Restriction: After hours',
				'  A booking that starts after the workshop closes.',
				'  The room cannot be rented after 18:00.',
				'  applies when start hour is more than 18',
			])
			expect(guide.lines.find((line) => line.source.rule === 'afterhours')?.summary).toBe(
				'room rent: Restriction: After hours applies when start hour is more than 18',
			)
		})

		it('a qualification’s prints a numeric pass’s worksheet at full alone', () => {
			const guide = FAMILY.describe(QUALIFICATION)
			expect(renderAccount(guide)).not.toContain('Booking load')
			const full = renderAccount(guide, { detail: 'full' }).split('\n')
			const start = full.indexOf('Booking load')
			expect(full.slice(start, start + 6)).toEqual([
				'Booking load',
				'  Counts the guests a booking brings beyond what its staff can hold.',
				'  Total of the values that apply',
				'  Amount',
				'    Total of the values that apply',
				'    Guests',
			])
		})

		it('a qualification’s leaves out a ruling whose rule is disabled, and names a rule it lacks', () => {
			const gates = createLogicalDefinition('gates', 'Gates', [
				createRule('off', [createAtom('a', 'equals', 1)], createAtom('off', 'equals', true), {
					name: 'Off rule',
					enabled: false,
				}),
			])
			const definition = createQualificationDefinition('q', 'Q', [gates], {
				rulings: [
					createRuling('off', 'gates', 'off', 'restriction'),
					createRuling('lost', 'gates', 'lost', 'referral'),
				],
			})
			const guide = FAMILY.describe(definition)
			expect(renderAccount(guide, { detail: 'full' }).split('\n')).toEqual(['Q', 'Referral: lost'])
			expect(guide.lines[1]?.gaps).toEqual([{ word: 'name', part: 'rule', id: 'lost' }])
		})

		it('a rating’s states each line’s words and worksheet', () => {
			const full = renderAccount(FAMILY.describe(RATING), { detail: 'full' }).split('\n')
			expect(full.slice(0, 7)).toEqual([
				'Booking rating',
				'  Prices one booking.',
				'Room rent',
				'  What the room costs for the booking.',
				'  Total of the values that apply',
				'  Hire',
				'    Total of the values that apply',
			])
		})

		it('a program’s states its notices, its authority, and the two guides before it', () => {
			const guide = FAMILY.describe(PROGRAM)
			expect(renderAccount(guide).split('\n').slice(0, 6)).toEqual([
				'Booking program',
				'Notice: The workshop closes at 18:00.',
				'Booking authority',
				'  Heavy booking',
				'    applies when booking rated is true and rated total is more than $200.00',
				'Booking qualification',
			])
			expect(renderAccount(guide, { detail: 'line' })).toBe('Booking program')
			expect(renderAccount(guide)).toContain('\nBooking rating\n  Room rent\n')
		})

		it('a program’s names a notice’s scope by its rating line', () => {
			const definition = buildProgramDefinition('p', 'P', QUALIFICATION, RATING, {
				notices: [buildNotice('due', 'Rent is due.', { scope: 'rent' })],
			})
			expect(FAMILY.describe(definition).lines[1]?.text).toBe('Room rent: Notice: Rent is due.')
		})
	})

	describe('T19: a message prints only for a finding whose state is met', () => {
		it.each(QUALIFIED)('holds through the real qualifier for %s', (name, result) => {
			const account = FAMILY.narrate(QUALIFICATION, result)
			const texts: string[] = []
			JSON.stringify(account, (key, value: unknown) => {
				if ((key === 'text' || key === 'summary') && isString(value)) texts.push(value)
				return value
			})
			const written = texts.join('\n')
			const { messages, states } = requireValue(FAMILY_SUBJECTS[name])
			expect(result.findings.filter((finding) => finding.state !== 'met').length).toBeGreaterThan(6)
			for (const finding of result.findings) {
				if (finding.message === undefined) continue
				expect(written.includes(finding.message)).toBe(states[finding.id] === 'met')
			}
			for (const message of Object.values(messages)) expect(written).toContain(message)
		})

		it('holds for a determination a result gives another state', () => {
			const heavy = requireValue(EXECUTED.find(([name]) => name === 'heavy'))[1]
			const determinations = heavy.determinations.map((entry): FamilyFinding => ({
				...entry,
				state: 'unread',
			}))
			const account = FAMILY.narrate(PROGRAM, { ...heavy, determinations })
			const full = renderAccount(account, { detail: 'full' })
			for (const { message } of heavy.determinations) expect(full).not.toContain(message)
			expect(full).toContain('Limit: Heavy booking cannot be decided')
		})

		it('prints the rule’s name where a message is blank', () => {
			const restricted = requireValue(QUALIFIED[1])[1]
			const findings = restricted.findings.map((finding) => ({ ...finding, message: ' ' }))
			expect(
				FAMILY.narrate(QUALIFICATION, { ...restricted, findings }).lines.map((line) => line.text),
			).toContain('Restriction: Restricted activity applies')
		})

		it('fills nothing in a message', () => {
			const restricted = requireValue(QUALIFIED[1])[1]
			const findings = restricted.findings.map((finding) => ({
				...finding,
				message: 'Held for {{effect}}.',
			}))
			expect(
				FAMILY.narrate(QUALIFICATION, { ...restricted, findings }).lines.map((line) => line.text),
			).toContain('Restriction: Held for {{effect}}.')
		})
	})

	describe('T20: a finding’s cited checks fix its state', () => {
		const readings = Map.groupBy(
			collectFamilyFindings().map(({ tree, subject, finding }) => {
				const definition: FamilyQualification = {
					id: 'q',
					name: 'Q',
					passes: [tree],
					rulings: [{ id: 'ruling', pass: tree.id, rule: 'rule', effect: 'restriction' }],
				}
				const result = {
					id: 'q',
					name: 'Q',
					eligibility: 'eligible',
					scopes: {},
					findings: [finding],
					derivations: [],
					success: true,
					errors: [],
					faults: [],
				}
				const account = FAMILY.narrate(definition, result)
				const line = account.lines.find((entry) => entry.source.finding === 'ruling')
				const cited = line?.lines ?? []
				return {
					tree,
					subject,
					state: finding.state,
					cited: cited.flatMap((entry) => entry.source.check?.field ?? []),
					states: cited.map((entry) => entry.source.result?.state),
				}
			}),
			({ tree }) => tree.id,
		)

		it('holds for a settled state over every generated tree and assignment', () => {
			const all = [...readings.values()]
			const moved = all.flatMap((entries) =>
				entries
					.filter((entry) => entry.state !== 'unread')
					.filter(
						(entry) =>
							entry.cited.length === 0 ||
							entries.some(
								(other) =>
									other.state !== entry.state &&
									entry.cited.every((field) => other.subject[field] === entry.subject[field]),
							),
					),
			)
			expect(moved).toEqual([])
			expect(new Set(all.flat().map((entry) => entry.state))).toEqual(
				new Set(['met', 'unmet', 'unread']),
			)
		})

		it('cites unread checks alone for an unread state, and settling them settles it', () => {
			const open = [...readings.values()].flatMap((entries) =>
				entries
					.filter((entry) => entry.state === 'unread')
					.filter(
						(entry) =>
							entry.cited.length === 0 ||
							entry.states.some((state) => state !== 'unread') ||
							entries.some(
								(other) =>
									other.state === 'unread' &&
									['a', 'b', 'c'].every((field) =>
										entry.cited.includes(field)
											? other.subject[field] !== undefined
											: other.subject[field] === entry.subject[field],
									),
							),
					),
			)
			expect(open).toEqual([])
		})

		it('gives no reason for a premise list that does not line up', () => {
			const untrained = requireValue(QUALIFIED.find(([name]) => name === 'untrained'))[1]
			const finding = requireValue(untrained.findings.find((entry) => entry.id === 'untrained'))
			const [first, second] = finding.premises
			const misaligned: ReadonlyArray<readonly [string, FamilyFinding]> = [
				['a premise short', { ...finding, premises: [requireValue(first)] }],
				['a premise over', { ...finding, premises: [...finding.premises, requireValue(second)] }],
				['out of order', { ...finding, premises: [requireValue(second), requireValue(first)] }],
				[
					'another field',
					{
						...finding,
						premises: [{ ...requireValue(first), field: 'room' }, requireValue(second)],
					},
				],
				[
					'a premise over that was never checked',
					{ ...finding, premises: [...finding.premises, { field: 'room' }] },
				],
				['no field', { ...finding, premises: [{ state: 'unmet' }, requireValue(second)] }],
				['no state', { ...finding, premises: [{ field: 'trained' }, requireValue(second)] }],
				['another state', { ...finding, state: 'unread' }],
				[
					'another check',
					{
						...finding,
						premises: [{ ...requireValue(first), state: 'met' }, requireValue(second)],
					},
				],
				['a rule the pass lacks', { ...finding, rule: 'lost' }],
				['a pass the definition lacks', { ...finding, pass: 'lost' }],
				['no pass', { id: 'x', effect: 'referral', state: 'met', premises: finding.premises }],
			]
			const aligned = FAMILY.narrate(QUALIFICATION, { ...untrained, findings: [finding] })
			expect(aligned.lines[1]?.lines[0]?.lines.length).toBe(2)
			for (const [name, entry] of misaligned) {
				const account = FAMILY.narrate(QUALIFICATION, {
					...untrained,
					scopes: {},
					findings: [{ ...entry, scope: 'rent' }],
				})
				const pending: AccountLine[] = [...account.lines]
				for (const line of pending) pending.push(...line.lines)
				const line = requireValue(pending.find((read) => read.source.finding !== undefined))
				expect([name, line.lines]).toEqual([name, []])
				expect(line.summary).toBe(line.text)
			}
			expect(misaligned.length).toBe(12)
		})

		it('settles each premise of a rule on its own checks', () => {
			const gates = createLogicalDefinition('gates', 'Gates', [
				createRule(
					'both',
					[createAtom('tools', 'equals', true), createAtom('noise', 'above', 40)],
					createAtom('both', 'equals', true),
					{ name: 'Both' },
				),
			])
			const definition = createQualificationDefinition('q', 'Q', [gates], {
				rulings: [createRuling('both', 'gates', 'both', 'restriction')],
			})
			const account = FAMILY.narrate(definition, QUALIFIER.qualify(FAMILY_BASE, definition))
			expect(renderAccount(account, { detail: 'full' }).split('\n')).toEqual([
				'Q: eligible',
				'Restriction: Both does not apply',
				'  noise level is 30, which is not more than 40',
			])
		})

		it('reads a key another rule concludes as a plain fact', () => {
			const gates = createLogicalDefinition(
				'gates',
				'Gates',
				[
					createRule(
						'late',
						[createAtom('start', 'above', 18)],
						createAtom('late', 'equals', true),
						{
							name: 'Late start',
						},
					),
					createRule(
						'held',
						[createAtom('late', 'equals', true), createAtom('held', 'not', true)],
						createAtom('kept', 'equals', true),
						{ name: 'Held booking' },
					),
				],
				{ strategy: 'forward' },
			)
			const definition = createQualificationDefinition('q', 'Q', [gates], {
				rulings: [createRuling('held', 'gates', 'held', 'restriction')],
			})
			const result = QUALIFIER.qualify({ start: 20, held: false }, definition)
			expect(result.eligibility).toBe('ineligible')
			const account = FAMILY.narrate(definition, result)
			expect(renderAccount(account).split('\n')).toEqual([
				'Q: not eligible',
				'Restriction: Held booking applies',
				'  late is true',
				'  held is false',
			])
		})

		it('reads a rule that reads its own conclusion as a plain fact', () => {
			const rule = createRule(
				'loop',
				[createAtom('loop', 'equals', true)],
				createAtom('loop', 'equals', true),
				{ name: 'Loop' },
			)
			const definition: FamilyQualification = {
				id: 'q',
				name: 'Q',
				passes: [createLogicalDefinition('gates', 'Gates', [rule])],
			}
			const finding: FamilyFinding = {
				id: 'loop',
				pass: 'gates',
				rule: 'loop',
				effect: 'restriction',
				state: 'met',
				premises: [{ field: 'loop', actual: true, state: 'met' }],
			}
			const account = FAMILY.narrate(definition, {
				...requireValue(QUALIFIED[0])[1],
				findings: [finding],
			})
			expect(account.lines[1]?.lines.map((line) => line.text)).toEqual(['loop is true'])
		})
	})

	describe('T21: the verdict word is the result’s own', () => {
		it.each(QUALIFIED)(
			'states the eligibility and each scope the engine gave for %s',
			(name, result) => {
				const account = FAMILY.narrate(QUALIFICATION, result)
				const { eligibility, scopes } = requireValue(FAMILY_SUBJECTS[name])
				expect(account.lines[0]?.text).toBe(
					`Booking qualification: ${DEFAULT_LEXICON.eligibilities[eligibility]}`,
				)
				const named = new Map([
					['rent', 'room rent'],
					['deposit', 'deposit'],
				])
				expect(
					account.lines
						.filter((line) => line.source.finding === undefined && line.source.scope !== undefined)
						.map((line) => line.text)
						.toSorted(),
				).toEqual(
					Object.entries(scopes)
						.map(
							([scope, word]) =>
								`${named.get(scope) ?? ''}: ${DEFAULT_LEXICON.eligibilities[word]}`,
						)
						.toSorted(),
				)
			},
		)

		it('states no eligibility of a qualification whose errors outnumber its faults, and nothing it found', () => {
			expect(REFUSED.errors.length).toBeGreaterThan(REFUSED.faults.length)
			expect(REFUSED.eligibility).toBe('referral')
			expect(renderAccount(FAMILY.narrate(MISSED, REFUSED), { detail: 'full' })).toBe(
				'Missed booking gave no answer',
			)
			const both = QUALIFIER.qualify(
				{ room: 'attic' },
				{
					...MISSED,
					passes: [
						createQuantitativeDefinition('head', 'Heads', [
							createFactorGroup('heads', 'sum', [createFieldFactor('guests', 'guests')]),
						]),
						...MISSED.passes,
					],
				},
			)
			expect(both.faults.length).toBe(1)
			expect(both.errors.length).toBe(2)
			expect(renderAccount(FAMILY.narrate(MISSED, both), { detail: 'full' }).split('\n')).toEqual([
				'Missed booking gave no answer',
				'  guest count is not known, and must be a number',
			])
		})

		it.each(RATED)('states the total only where the rater gave one for %s', (name, result) => {
			const { total } = requireValue(FAMILY_RATINGS[name])
			expect(FAMILY.narrate(RATING, result).lines[0]?.text).toBe(
				total === undefined
					? 'Booking rating gave no answer'
					: `Booking rating: $${String(total)}.00`,
			)
		})

		it('states no total of a rating whose lines rated and whose sum overflowed', () => {
			const rate = createQuantitativeDefinition('big', 'Big', [
				createFactorGroup('g', 'sum', [createStaticFactor('f', 1e308)]),
			])
			const definition = buildRatingDefinition('rating', 'Overflow', [
				buildLineDefinition('a', 'First', rate),
				buildLineDefinition('b', 'Second', rate),
			])
			const result = RATER.rate(definition, {})
			expect(result.success).toBe(false)
			expect(FAMILY.narrate(definition, result).lines[0]?.text).toBe('Overflow gave no answer')
			expect(FAMILY.narrate(definition, { ...result, total: SECRET }).lines[0]?.text).toBe(
				'Overflow gave no answer',
			)
		})

		it('states each status the program can give', () => {
			const reached = new Set<Status>(EXECUTED.map(([, result]) => result.status))
			expect(reached).toEqual(new Set(STATUSES))
		})

		it('states `unrated` of a rating that failed with no fault', () => {
			const costly = requireValue(EXECUTED.find(([name]) => name === 'costly'))[1]
			expect(costly.errors.length).toBeGreaterThan(costly.faults.length)
			expect(FAMILY.narrate(PROGRAM, costly).lines[0]?.text).toBe(
				'Booking program: not fully rated',
			)
		})

		it('states the status of a program whose authority read a total no rating gave, and no limit', () => {
			const definition = buildProgramDefinition(
				'program',
				'Booking program',
				QUALIFICATION,
				RATING,
				{
					notices: [buildNotice('closing', 'The workshop closes at 18:00.')],
					authority: createLogicalDefinition('authority', 'Booking authority', [
						createRule(
							'large',
							[createAtom(['outcome', 'total'], 'above', 200)],
							createAtom('large', 'equals', true),
							{ name: 'Large total', description: 'The total is large.' },
						),
						createRule(
							'turned',
							[createAtom(['outcome', 'eligibility'], 'equals', 'ineligible')],
							createAtom('turned', 'equals', true),
							{ name: 'Turned down', description: 'The booking was turned down.' },
						),
					]),
				},
			)
			const result = createProgram(definition).execute({
				...FAMILY_BASE,
				activity: 'torch welding',
			})
			expect(result.errors.length).toBeGreaterThan(result.faults.length)
			expect(result.determinations.map((entry) => entry.effect)).toEqual(['notice', 'limit'])
			expect(renderAccount(FAMILY.narrate(definition, result)).split('\n').slice(0, 4)).toEqual([
				'Booking program: not eligible',
				'Notice: The workshop closes at 18:00.',
				'Booking qualification: not eligible',
				'  Restriction: The workshop does not lend a room for torch welding.',
			])
		})

		it('states no status of a program whose qualification’s errors outnumber its faults', () => {
			const definition = buildProgramDefinition('program', 'Booking program', MISSED, RATING)
			const result = createProgram(definition).execute({ ...FAMILY_BASE, room: 'attic' })
			expect(result.status).toBe('referral')
			expect(
				renderAccount(FAMILY.narrate(definition, result), { detail: 'full' }).split('\n'),
			).toEqual(['Booking program gave no answer', 'Missed booking gave no answer'])
		})

		it('prints an engine’s word the lexicon lacks, and quotes a blank one', () => {
			const standing = requireValue(EXECUTED[0])[1]
			const account = FAMILY.narrate(PROGRAM, { ...standing, status: 'paused', decision: 'held' })
			expect(account.lines.slice(0, 2).map((line) => line.text)).toEqual([
				'Booking program: paused',
				'Decision: held',
			])
			expect(FAMILY.narrate(PROGRAM, { ...standing, status: '' }).lines[0]?.text).toBe(
				'Booking program: ""',
			)
		})

		it('gives no answer for a result of another kind of definition', () => {
			const pairs: ReadonlyArray<readonly [FamilyDefinition, FamilyResult]> = [
				[QUALIFICATION, requireValue(RATED[0])[1]],
				[RATING, requireValue(EXECUTED[0])[1]],
				[PROGRAM, requireValue(QUALIFIED[0])[1]],
			]
			for (const [definition, result] of pairs) {
				expect(FAMILY.narrate(definition, result).lines.map((line) => line.text)).toEqual([
					`${definition.name} gave no answer`,
				])
			}
		})
	})

	describe('T22: a line states an amount only when its result holds one', () => {
		it.each(RATED)('holds for %s', (name, result) => {
			const { amounts } = requireValue(FAMILY_RATINGS[name])
			const account = FAMILY.narrate(RATING, result)
			const named = new Map([
				['rent', 'Room rent'],
				['fee', 'Guest fee'],
				['deposit', 'Deposit'],
			])
			expect(account.lines.slice(1).map((line) => line.text)).toEqual(
				[...named].map(([id, line]) => {
					const amount = amounts[id]
					return amount === undefined ? `${line} gave no answer` : `${line}: $${String(amount)}.00`
				}),
			)
		})

		it('states no number of a line whose result holds no amount, whatever its worksheet holds', () => {
			const standing = requireValue(RATED[0])[1]
			const [rent] = standing.lines
			const { amount: _amount, ...bare } = requireValue(rent)
			const worksheet = { ...bare.worksheet, value: SECRET }
			const account = FAMILY.narrate(RATING, { ...standing, lines: [{ ...bare, worksheet }] })
			const full = renderAccount(account, { detail: 'full' })
			expect(full).toContain('Room rent gave no answer')
			expect(full.replaceAll(',', '')).not.toContain(String(SECRET))
			const unsettled = {
				...requireValue(rent),
				amount: SECRET,
				worksheet: { ...bare.worksheet, success: false },
			}
			const refused = FAMILY.narrate(RATING, { ...standing, lines: [unsettled] })
			expect(refused.lines[1]?.text).toBe('Room rent gave no answer')
		})

		it('names no entry over a fallback of the same value, through the real rater', () => {
			const lines = new Map(
				RATED.map(([name, result]) => [
					name,
					renderAccount(FAMILY.narrate(RATING, result))
						.split('\n')
						.map((line) => line.trim())
						.find((line) => line.startsWith('looked up') || line.startsWith('its fallback')),
				]),
			)
			expect(Object.fromEntries(lines)).toEqual({
				standing: 'looked up by room, or its fallback',
				attic: 'looked up by room, or its fallback',
				hall: 'looked up by room',
				small: 'looked up by room',
				costly: 'looked up by room, or its fallback',
				noroom: undefined,
			})
		})

		it('says either of a lookup or a range with a fallback whose value was changed, and no raw number', () => {
			const transforms = [{ operation: 'multiply', operand: 2 }] as const
			const bounds = { minimum: 0, maximum: 1000 }
			const ranges = [{ bounds: { maximum: 10 }, value: 5 }]
			const factors = [
				createLookupFactor('a', 'room', { hall: 120 }, { fallback: 80, transforms }),
				createLookupFactor('b', 'room', { hall: 120 }, { fallback: 80, bounds }),
				createRangeFactor('c', 'guests', ranges, { fallback: 7, transforms }),
				createRangeFactor('d', 'guests', ranges, { fallback: 7, bounds }),
				createLookupFactor('e', 'room', { hall: 120, studio: 80, attic: 60 }, { transforms }),
				createRangeFactor('f', 'guests', [{ value: 5 }], { transforms }),
				createFieldFactor('g', 'guests', { transforms }),
				createStaticFactor('h', 5, { transforms }),
			]
			const definition = buildRatingDefinition('rating', 'Rating', [
				buildLineDefinition(
					'line',
					'Line',
					createQuantitativeDefinition('rate', 'Rate', [createFactorGroup('g', 'sum', factors)]),
				),
			])
			for (const subject of [FAMILY_BASE, { ...FAMILY_BASE, room: 'hall', guests: 20 }]) {
				const result = RATER.rate(definition, subject)
				expect(result.success).toBe(true)
				const account = FAMILY.narrate(definition, result)
				const group = requireValue(account.lines[1]?.lines[0])
				expect(
					group.lines.map((line) => line.lines[0]?.text.replace(/ first| the first/, '')),
				).toEqual([
					'looked up by room, or its fallback',
					'looked up by room, or its fallback',
					'looked up by guest count, or its fallback',
					'looked up by guest count, or its fallback',
					'looked up by room',
					group.lines[5]?.lines[0]?.text.replace(/ first| the first/, ''),
					'taken from guest count',
					'fixed at 5',
				])
				expect(group.lines[5]?.lines[0]?.text).toMatch(
					/^set by the (first )?range guest count falls in$/,
				)
				expect(renderAccount(account, { detail: 'full' })).not.toContain('before its changes')
			}
		})

		it('names the fallback where its value is no entry’s and nothing changed it', () => {
			const definition = buildRatingDefinition('rating', 'Rating', [
				buildLineDefinition(
					'line',
					'Line',
					createQuantitativeDefinition('rate', 'Rate', [
						createFactorGroup('g', 'sum', [
							createLookupFactor('a', 'room', { hall: 120 }, { fallback: 80, transforms: [] }),
						]),
					]),
				),
			])
			expect(
				renderAccount(FAMILY.narrate(definition, RATER.rate(definition, FAMILY_BASE))),
			).toContain('its fallback, because no entry matches room')
		})

		it('says a factor found no value, and names no missed entry', () => {
			const definition = buildRatingDefinition('rating', 'Rating', [
				buildLineDefinition(
					'line',
					'Line',
					createQuantitativeDefinition('rate', 'Rate', [
						createFactorGroup(
							'g',
							'sum',
							[
								createLookupFactor('a', 'room', { hall: 120 }, { name: 'Room' }),
								createRangeFactor('b', 'guests', [{ bounds: { maximum: 2 }, value: 5 }], {
									name: 'Guests',
								}),
								createFieldFactor('c', 'cost', {
									name: 'Cost',
									transforms: [{ operation: 'divide', operand: 0 }],
								}),
							],
							{ name: 'Group' },
						),
					]),
				),
			])
			const result = RATER.rate(definition, FAMILY_BASE)
			expect(result.success).toBe(false)
			const full = renderAccount(FAMILY.narrate(definition, result), { detail: 'full' })
			expect(full).toContain('Room found no value to use')
			expect(full).toContain('Guests found no value to use')
			expect(full).not.toContain('no entry matches')
			expect(full).not.toContain('looked up by')
			expect(full).not.toContain('set by')
		})

		it('gives a gated factor no reason where its evidence does not line up', () => {
			const costly = requireValue(RATED.find(([name]) => name === 'costly'))[1]
			const deposit = requireValue(costly.lines[2])
			const lines = [
				{
					...deposit,
					worksheet: {
						...deposit.worksheet,
						groups: deposit.worksheet.groups.map((group) => ({
							...group,
							factors: group.factors.map((factor) => ({
								...factor,
								evidence: [...factor.evidence, { field: 'cost' }],
							})),
						})),
					},
				},
			]
			const account = FAMILY.narrate(RATING, { ...costly, lines })
			expect(renderAccount(account)).not.toContain('cost is')
			expect(renderAccount(account)).toContain('Deposit did not apply')
		})
	})

	describe('T23: no worded member of a result is read', () => {
		it('a qualification’s account does not move when its worded members do', () => {
			for (const [, result] of [...QUALIFIED, ['missed', REFUSED] as const]) {
				const worded = FAMILY_WORDED.qualification(result)
				expect(worded).not.toEqual(result)
				expect(FAMILY.narrate(QUALIFICATION, worded)).toEqual(FAMILY.narrate(QUALIFICATION, result))
			}
		})

		it('a rating’s account does not move when its worded members do', () => {
			for (const [, result] of RATED) {
				const worded = FAMILY_WORDED.rating(result)
				expect(worded).not.toEqual(result)
				expect(FAMILY.narrate(RATING, worded)).toEqual(FAMILY.narrate(RATING, result))
			}
		})

		it('a program’s account does not move when its worded members do', () => {
			for (const [, result] of EXECUTED) {
				const worded = FAMILY_WORDED.program(result)
				expect(worded).not.toEqual(result)
				expect(FAMILY.narrate(PROGRAM, worded)).toEqual(FAMILY.narrate(PROGRAM, result))
			}
		})

		it('an account does not move when a premise’s comparison, expected value, or description does', () => {
			const restricted = requireValue(QUALIFIED[1])[1]
			const findings = restricted.findings.map((finding) => ({
				...finding,
				premises: finding.premises.map((premise) => ({
					...premise,
					comparison: 'not' as const,
					expected: SECRET,
					description: 'another sentence',
				})),
			}))
			expect(FAMILY.narrate(QUALIFICATION, { ...restricted, findings })).toEqual(
				FAMILY.narrate(QUALIFICATION, restricted),
			)
		})
	})

	describe('T24: a text holding an unfilled slot never prints in a guide', () => {
		const slotted = 'Text of {{slot}}'

		it.each(['Text of {{slot}}', '{{ spaced.path }}', 'a {{ a{b }} b', '\\{{slot}} kept'])(
			'holds for every text of every guide: %s',
			(text) => {
				const rule = createRule(
					'rule',
					[createAtom('noise', 'above', 40)],
					createAtom('ruled', 'equals', true),
					{ name: 'Rule', description: text },
				)
				const rate = createQuantitativeDefinition(
					'rate',
					'Rate',
					[
						createFactorGroup(
							'group',
							'sum',
							[createFieldFactor('factor', 'guests', { name: 'Factor', description: text })],
							{ name: 'Group', description: text },
						),
					],
					{ description: text },
				)
				const qualification = createQualificationDefinition(
					'q',
					'Q',
					[
						{ ...rate, id: 'pass' },
						createLogicalDefinition('gates', 'Gates', [rule], { description: text }),
					],
					{
						description: text,
						rulings: [createRuling('r', 'gates', 'rule', 'condition', { message: text })],
					},
				)
				const rating = buildRatingDefinition(
					'r',
					'R',
					[buildLineDefinition('line', 'Line', rate, { description: text })],
					{ description: text },
				)
				const program = buildProgramDefinition('p', 'P', qualification, rating, {
					description: text,
					notices: [buildNotice('n', text)],
					authority: createLogicalDefinition('authority', 'Authority', [rule], {
						description: text,
					}),
				})
				for (const definition of [qualification, rating, program]) {
					const texts: string[] = []
					JSON.stringify(FAMILY.describe(definition), (key, value: unknown) => {
						if ((key === 'text' || key === 'summary') && isString(value)) texts.push(value)
						return value
					})
					expect(texts.filter((entry) => entry.includes('{{') || entry.includes('}}'))).toEqual([])
				}
				expect(renderAccount(FAMILY.describe(program), { detail: 'full' })).toContain(
					'Condition: Rule',
				)
			},
		)

		it('prints the same texts where they hold no slot', () => {
			const guide = renderAccount(FAMILY.describe(QUALIFICATION), { detail: 'full' })
			expect(guide).toContain('The neighbors hear about a loud activity.')
			expect(guide).toContain('Neighbours must be told.')
			expect(guide).not.toContain('{{')
			const program = buildProgramDefinition('p', 'P', QUALIFICATION, RATING, {
				notices: [buildNotice('a', slotted), buildNotice('b', 'Text of a slot')],
			})
			expect(
				FAMILY.describe(program)
					.lines.map((line) => line.text)
					.filter((text) => text.startsWith('Notice')),
			).toEqual(['Notice: Text of a slot'])
		})
	})

	describe('T1, T5, and T7 over the family’s lines', () => {
		it('T1: a refused result names each field it did not read', () => {
			const accounts = [
				...QUALIFIED.map(([name, result]) => ({
					account: FAMILY.narrate(QUALIFICATION, result),
					faults: requireValue(FAMILY_SUBJECTS[name]).faults,
				})),
				...RATED.map(([name, result]) => ({
					account: FAMILY.narrate(RATING, result),
					faults: requireValue(FAMILY_RATINGS[name]).faults,
				})),
				...EXECUTED.map(([name, result]) => ({
					account: FAMILY.narrate(PROGRAM, result),
					faults: requireValue(FAMILY_PROGRAMS[name]).faults,
				})),
			]
			expect(accounts.flatMap(({ faults }) => faults).toSorted()).toEqual([
				'guests',
				'noise',
				'noise',
				'room',
			])
			for (const { account, faults } of accounts) {
				for (const field of faults) {
					const said = `${requireValue(FAMILY_GLOSSARY.labels[field])} is not known`
					for (const detail of DETAILS) expect(renderAccount(account, { detail })).toContain(said)
				}
			}
		})

		it('T1: a derivation that failed states no number', () => {
			const standing = requireValue(QUALIFIED[0])[1]
			for (const derivation of [
				{ id: 'load', value: SECRET, success: false },
				{ id: 'load', value: Number.POSITIVE_INFINITY, success: true },
			]) {
				const account = FAMILY.narrate(QUALIFICATION, { ...standing, derivations: [derivation] })
				const full = renderAccount(account, { detail: 'full' })
				expect(full).toContain('Booking load gave no answer')
				expect(full).not.toContain('booking load is 4321')
				expect(full).not.toContain('∞')
			}
		})

		it('T5: no text is blank, holds a line break, or prints a value no one gave', () => {
			const bare = new FamilyNarrator(new Narrator())
			const tricky = { id: '', name: ' \n', effect: '', message: 'one\ntwo' }
			const odd: FamilyQualificationResult = {
				...requireValue(QUALIFIED[0])[1],
				eligibility: '',
				scopes: { '': '', toString: 'eligible' },
				findings: [
					{ ...tricky, state: 'met', premises: [] },
					{ ...tricky, state: 'unread', premises: [{}], scope: '__proto__', rule: '' },
				],
				derivations: [{ id: '', value: Number.NaN, success: true }],
			}
			const accounts = [
				...ACCOUNTS,
				bare.narrate({ id: '', name: '', passes: [] }, odd),
				bare.describe({
					id: '',
					name: '',
					passes: [],
					rulings: [{ ...tricky, pass: '', rule: '' }],
				}),
				bare.narrate(
					{ id: '', name: '', lines: [] },
					{
						lines: [
							{
								id: '',
								name: '',
								amount: Number.NaN,
								worksheet: {
									value: Number.NaN,
									groups: [
										{
											id: '',
											applied: true,
											value: Number.NaN,
											factors: [{ id: '', applied: true, value: Number.NaN, evidence: [] }],
										},
									],
									success: true,
									errors: [],
									faults: [],
								},
							},
						],
						total: Number.NaN,
						success: true,
						faults: [],
					},
				),
			]
			for (const account of accounts) {
				const texts: string[] = []
				JSON.stringify(account, (key, value: unknown) => {
					if ((key === 'text' || key === 'summary') && isString(value)) texts.push(value)
					return value
				})
				expect(texts.length).toBeGreaterThan(0)
				expect(
					texts.filter(
						(text) => text.trim() === '' || /undefined|NaN|\n|\{\{|:\s*$|^\s*:/.test(text),
					),
				).toEqual([])
			}
		})

		it('T7: a supplied word keeps its case', () => {
			const glossary = {
				...GLOSSARY,
				labels: { ...GLOSSARY.labels, noise: 'nOiSe LEVEL' },
				scopes: { rent: 'ROOM rent' },
			}
			const family = new FamilyNarrator(new Narrator({ glossary }), { glossary, units: UNITS })
			const loud = requireValue(QUALIFIED.find(([name]) => name === 'loud'))[1]
			expect(renderAccount(family.narrate(QUALIFICATION, loud)).split('\n')).toEqual([
				'Booking qualification: eligible',
				'ROOM rent: eligible',
				'  Condition: Neighbours must be told.',
				'    nOiSe LEVEL is 55, which is more than 40',
			])
		})
	})

	describe('T10: a missing domain word is reported', () => {
		const gaps: readonly GlossaryGap[] = [
			...Object.keys(FAMILY_GLOSSARY.labels).map((field) => ({ word: 'label', field }) as const),
			...Object.keys(FAMILY_GLOSSARY.units).map((field) => ({ word: 'unit', field }) as const),
			...Object.keys(FAMILY_GLOSSARY.formats).map((unit) => ({ word: 'format', unit }) as const),
		]

		it('finds none where every word is supplied, on the lines and in the audit', () => {
			expect(FAMILY.audit([RATING, PROGRAM])).toEqual([])
			const pending: AccountLine[] = ACCOUNTS.flatMap((account) => account.lines)
			for (const line of pending) pending.push(...line.lines)
			// On its own, a qualification has no rating line to name the scope the glossary leaves out.
			const scope = { word: 'name', part: 'scope', id: 'deposit' }
			expect(FAMILY.audit([QUALIFICATION])).toEqual([scope])
			const held = new Set(pending.flatMap((line) => line.gaps).map((gap) => JSON.stringify(gap)))
			expect([...held]).toEqual([JSON.stringify(scope)])
		})

		it.each(gaps)('reports exactly $word $field $unit, from the audit and on a line', (gap) => {
			const glossary: Glossary = {
				...GLOSSARY,
				labels: Object.fromEntries(
					Object.entries(FAMILY_GLOSSARY.labels).filter(
						([field]) => gap.word !== 'label' || field !== gap.field,
					),
				),
				units: Object.fromEntries(
					Object.entries(FAMILY_GLOSSARY.units).filter(
						([field]) => gap.word !== 'unit' || field !== gap.field,
					),
				),
				formats: Object.fromEntries(
					Object.entries(FAMILY_GLOSSARY.formats).filter(
						([unit]) => gap.word !== 'format' || unit !== gap.unit,
					),
				),
			}
			const units = new Set([
				...Object.keys(DEFAULT_FORMATS),
				...Object.keys(glossary.formats ?? {}),
			])
			const family = new FamilyNarrator(new Narrator({ glossary }), { glossary, units })
			const audited = family.audit([PROGRAM]).map((entry) => ({
				...entry,
				...(entry.field === undefined ? {} : { field: formatField(entry.field) }),
			}))
			expect(audited).toEqual([gap])
			const pending: AccountLine[] = [
				...EXECUTED.flatMap(([, result]) => family.narrate(PROGRAM, result).lines),
				...RATED.flatMap(([, result]) => family.narrate(RATING, result).lines),
				family.describe(PROGRAM),
			].flatMap((entry) => ('role' in entry ? [entry] : entry.lines))
			for (const line of pending) pending.push(...line.lines)
			const held = pending
				.flatMap((line) => line.gaps)
				.map((entry) =>
					JSON.stringify({
						...entry,
						...(entry.field === undefined ? {} : { field: formatField(entry.field) }),
					}),
				)
			expect([...new Set(held)]).toEqual([JSON.stringify(gap)])
		})

		it('reports a name that is its id, once, for each part whose name prints', () => {
			const [rent, ...others] = RATING.lines
			const [load, gates] = QUALIFICATION.passes
			const program: FamilyProgram = {
				...PROGRAM,
				name: 'program',
				qualification: {
					...QUALIFICATION,
					name: 'qualification',
					passes: [{ ...requireValue(load), name: 'load' }, requireValue(gates)],
				},
				rating: {
					...RATING,
					name: 'rating',
					lines: [{ ...requireValue(rent), name: 'rent' }, ...others],
				},
				authority: { ...requireValue(PROGRAM.authority), name: 'authority' },
			}
			expect(FAMILY.audit([program])).toEqual([
				{ word: 'name', part: 'definition', id: 'program' },
				{ word: 'name', part: 'line', id: 'rent' },
				{ word: 'name', part: 'definition', id: 'authority' },
				{ word: 'name', part: 'definition', id: 'qualification' },
				{ word: 'name', part: 'pass', id: 'load' },
				{ word: 'name', part: 'definition', id: 'rating' },
			])
		})

		it('asks no name of a worksheet’s definition, which no line prints', () => {
			const [rent] = RATING.lines
			const line = { ...requireValue(rent), rate: { ...requireValue(rent).rate, name: 'rentRate' } }
			const rating = { ...RATING, lines: [line] }
			expect(FAMILY.audit([rating])).toEqual([])
			const pending: AccountLine[] = [
				...FAMILY.narrate(rating, RATER.rate(rating, FAMILY_BASE)).lines,
				...FAMILY.describe(rating).lines,
			]
			for (const entry of pending) pending.push(...entry.lines)
			expect(pending.flatMap((entry) => entry.gaps)).toEqual([])
		})

		it('reports a scope no rating line and no glossary names, and a rule named by its id', () => {
			const gatesOnly = createLogicalDefinition('gates', 'gates', [
				createRule('late', [createAtom('start', 'above', 18)], createAtom('late', 'equals', true)),
				createRule(
					'kept',
					[createAtom('late', 'equals', true)],
					createAtom('kept', 'equals', true),
					{
						name: 'Kept booking',
					},
				),
				createRule('unruled', [createAtom('lost', 'equals', 1)], createAtom('x', 'equals', true)),
				createRule('off', [createAtom('gone', 'equals', 1)], createAtom('y', 'equals', true), {
					enabled: false,
				}),
			])
			const definition = createQualificationDefinition('q', 'Q', [gatesOnly], {
				rulings: [
					createRuling('kept', 'gates', 'kept', 'restriction', {
						scope: 'bench',
						message: '{{start}}',
					}),
					createRuling('off', 'gates', 'off', 'restriction'),
				],
			})
			// The condition names the rule that concludes the key, and a finding's reason prints the key.
			expect(FAMILY.audit([definition])).toEqual([
				{ word: 'name', part: 'scope', id: 'bench' },
				{ word: 'label', field: 'late' },
				{ word: 'name', part: 'rule', id: 'late' },
				{ word: 'name', part: 'rule', id: 'off' },
			])
			const pending: AccountLine[] = [
				...FAMILY.narrate(definition, QUALIFIER.qualify({ start: 20, lost: 2 }, definition)).lines,
				...FAMILY.describe(definition).lines,
			]
			for (const line of pending) pending.push(...line.lines)
			const held = new Set(pending.flatMap((line) => line.gaps).map((gap) => JSON.stringify(gap)))
			expect(held).toEqual(new Set(FAMILY.audit([definition]).map((gap) => JSON.stringify(gap))))
		})

		it('asks a rating’s unit for its format', () => {
			const glossary = { ...GLOSSARY, values: { ...GLOSSARY.values, rating: 'ingot' } }
			const family = new FamilyNarrator(new Narrator({ glossary }), { glossary, units: UNITS })
			expect(family.audit([RATING])).toEqual([{ word: 'format', unit: 'ingot' }])
			expect(family.narrate(RATING, requireValue(RATED[0])[1]).lines[0]?.gaps).toEqual([
				{ word: 'format', unit: 'ingot' },
			])
		})
	})

	describe('through a Narrator and an Interpret', () => {
		const narrator = new Narrator({ glossary: GLOSSARY })
		const interpret = new Interpret({ narrator: { glossary: GLOSSARY } })
		const qualified = requireValue(QUALIFIED[4])[1]
		const rated = requireValue(RATED[4])[1]
		const executed = requireValue(EXECUTED[5])[1]
		const loan = createLogicalDefinition('loan', 'Loan', [
			createRule('adult', [createAtom('age', 'from', 18)], createAtom('adult', 'equals', true)),
		])

		it('describe writes the same guide', () => {
			for (const definition of [QUALIFICATION, RATING, PROGRAM]) {
				const guide = FAMILY.describe(definition)
				expect(narrator.describe(definition)).toEqual(guide)
				expect(interpret.describe(definition)).toEqual(guide)
			}
		})

		it('narrate writes the same account', () => {
			for (const writer of [narrator, interpret]) {
				expect(writer.narrate(QUALIFICATION, qualified)).toEqual(
					FAMILY.narrate(QUALIFICATION, qualified),
				)
				expect(writer.narrate(RATING, rated)).toEqual(FAMILY.narrate(RATING, rated))
				expect(writer.narrate(PROGRAM, executed)).toEqual(FAMILY.narrate(PROGRAM, executed))
			}
		})

		it('audit keeps each gap once, in the order of its definitions', () => {
			const bare = new Narrator()
			const alone = new FamilyNarrator(bare)
			expect(bare.audit([loan, RATING, loan, RATING])).toEqual([
				...bare.audit([loan]),
				...alone.audit([RATING]),
			])
			expect(bare.audit([RATING, loan])).toEqual([...alone.audit([RATING]), ...bare.audit([loan])])
			expect(narrator.audit([PROGRAM])).toEqual([])
		})

		it('narrate gives no answer for a pair no overload admits', () => {
			const answer = createLogicalReasoner().reason({ age: 30 }, loan)
			const pairs: ReadonlyArray<readonly [unknown, unknown, string]> = [
				[QUALIFICATION, rated, 'Booking qualification'],
				[RATING, answer, 'Booking rating'],
				[loan, executed, 'Loan'],
			]
			for (const writer of [narrator, interpret]) {
				for (const [definition, result, name] of pairs) {
					const account = invokeUnchecked<Account>(writer, writer.narrate, [definition, result])
					expect(account.lines.map((line) => line.summary)).toEqual([`${name} gave no answer`])
				}
			}
		})

		it('prints a unit the narrator’s formatters hold, and reports no gap for it', () => {
			const glossary = { ...GLOSSARY, values: { ...GLOSSARY.values, rating: 'ingot' } }
			const writer = new Narrator({
				glossary,
				formatters: { ingot: (value) => `${String(value)} ingots` },
			})
			const account = writer.narrate(RATING, requireValue(RATED[0])[1])
			expect(account.lines[0]).toMatchObject({ text: 'Booking rating: 156 ingots', gaps: [] })
			expect(writer.audit([RATING])).toEqual([])
		})
	})

	describe('what an account owns', () => {
		it('shares no object with its definition or its result', () => {
			for (const [, result] of EXECUTED) {
				const before = structuredClone(result)
				const account = FAMILY.narrate(PROGRAM, result)
				const copy = structuredClone(account)
				const pending: AccountLine[] = [...account.lines]
				for (const line of pending) pending.push(...line.lines)
				for (const { source } of pending) {
					if (source.check !== undefined) Reflect.set(source.check, 'value', SECRET)
					if (source.result !== undefined) Reflect.set(source.result, 'actual', SECRET)
					if (source.fault !== undefined) Reflect.set(source.fault, 'path', 'other')
				}
				expect(result).toEqual(before)
				expect(FAMILY.narrate(PROGRAM, result)).toEqual(copy)
			}
		})

		it('writes a rule too deep to settle without its reasons', () => {
			const deep = Array.from({ length: 20_000 }).reduce<
				ReturnType<typeof createAtom> | ReturnType<typeof createCompound>
			>((inner) => createCompound('not', [inner]), createAtom('a', 'equals', 1))
			const definition: FamilyQualification = {
				id: 'q',
				name: 'Q',
				passes: [
					createLogicalDefinition('gates', 'Gates', [
						createRule('deep', [deep], createAtom('b', 'equals', true), { name: 'Deep' }),
					]),
				],
			}
			const account = FAMILY.narrate(definition, {
				...requireValue(QUALIFIED[0])[1],
				findings: [
					{
						id: 'deep',
						pass: 'gates',
						rule: 'deep',
						effect: 'referral',
						state: 'met',
						premises: [{ field: 'a', actual: 1, state: 'met' }],
					},
				],
			})
			expect(account.lines[1]).toMatchObject({ text: 'Referral: Deep applies', lines: [] })
		})
	})
})
