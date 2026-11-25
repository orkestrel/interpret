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
	MessageSlot,
	QualificationDefinition,
	QualificationResult,
	Ruling,
} from '@orkestrel/qualifier'
import type {
	LineDefinition,
	LineResult,
	RatingDefinition,
	RatingResult,
	Worksheet,
	WorksheetFactor,
	WorksheetGroup,
} from '@orkestrel/rater'
import type { CheckResult, ReasonRefusal, ReasonResult } from '@orkestrel/reason'
import type {
	Account,
	AccountDefinition,
	AccountDetail,
	AccountLine,
	FamilyDefinition,
	FamilyDerivation,
	FamilyFinding,
	FamilyLine,
	FamilyLineResult,
	FamilyNotice,
	FamilyProgram,
	FamilyProgramResult,
	FamilyQualification,
	FamilyQualificationResult,
	FamilyRating,
	FamilyRatingResult,
	FamilyResult,
	FamilyRuling,
	FamilySlot,
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
	createCheck,
	createCompound,
	createFactorGroup,
	createFieldFactor,
	createDeductiveReasoner,
	createLogicalDefinition,
	createLogicalReasoner,
	createLookupFactor,
	createQuantitativeDefinition,
	createQuantitativeReasoner,
	createRangeFactor,
	createReason,
	createRule,
	createStaticFactor,
	createSymbolicReasoner,
	formatField,
	REASON_REFUSAL_CAUSES,
} from '@orkestrel/reason'
import { requireValue } from '@orkestrel/test'
import {
	DEFAULT_FORMATS,
	DEFAULT_LEXICON,
	FamilyNarrator,
	Interpret,
	isAccountResult,
	isFamilyFinding,
	isFamilyLineResult,
	isFamilyProgram,
	isFamilyProgramResult,
	isFamilyQualification,
	isFamilyQualificationResult,
	isFamilyRating,
	isFamilyRatingResult,
	mergeLexicon,
	Narrator,
	renderAccount,
} from '@src/core'
import { describe, expect, it } from 'vitest'

import {
	buildFamilyProgram,
	buildFamilyQualification,
	buildFamilyRating,
	buildWorkshopArea,
	buildWorkshopFacts,
	buildWorkshopScore,
	collectFamilyExecuted,
	collectFamilyFindings,
	collectWrittenTexts,
	createAnsweringEvaluator,
	createAnsweringReasoner,
	renderFamilyMessage,
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

const QUALIFIER = createQualifier()

const RATER = createRater()

const QUALIFICATION = buildFamilyQualification()

const RATING = buildFamilyRating()

const PROGRAM = buildFamilyProgram()

const QUALIFIED: ReadonlyArray<readonly [string, QualificationResult]> = Object.entries(
	FAMILY_SUBJECTS,
).map(([name, { subject }]) => [name, QUALIFIER.qualify(subject, QUALIFICATION)])

const RATED: ReadonlyArray<readonly [string, RatingResult]> = Object.entries(FAMILY_RATINGS).map(
	([name, { subject }]) => [name, RATER.rate(RATING, subject)],
)

const EXECUTED: ReadonlyArray<readonly [string, ProgramResult]> = collectFamilyExecuted().map(
	([name, result]) => [name, result],
)

// Each guide of the workshop, and the account of each result.
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
			const definitions: readonly [FamilyQualification, FamilyRating, FamilyProgram] = [
				qualification,
				rating,
				program,
			]
			const results: readonly [FamilyQualificationResult, FamilyRatingResult] = [qualified, rated]
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
		})

		it('admit a program’s own results, as the guard does', () => {
			const admitted: readonly FamilyProgramResult[] = EXECUTED.map(([, result]) => result)
			expect(admitted.filter((result) => !isFamilyProgramResult(result))).toEqual([])
		})

		it('admit each part of them', () => {
			const ruling: Ruling = requireValue(QUALIFICATION.rulings?.[0])
			const finding: Finding = requireValue(requireValue(QUALIFIED[1])[1].findings[0])
			const slot: MessageSlot = { field: ['room'], actual: 'hall' }
			const check: CheckResult = requireValue(finding.checks[0])
			const derivation: Derivation = requireValue(requireValue(QUALIFIED[0])[1].derivations[0])
			const line: LineDefinition = requireValue(RATING.lines[0])
			const rated: LineResult = requireValue(requireValue(RATED[4])[1].lines[2])
			const worksheet: Worksheet = rated.worksheet
			const group: WorksheetGroup = requireValue(worksheet.groups[0])
			const factor: WorksheetFactor = requireValue(group.factors[0])
			const gate: CheckResult = requireValue(factor.checks[0])
			const notice: Notice = requireValue(PROGRAM.notices?.[0])
			const parts: readonly [
				FamilyRuling,
				FamilyFinding,
				FamilySlot,
				CheckResult,
				FamilyDerivation,
				FamilyLine,
				FamilyLineResult,
				FamilyWorksheet,
				FamilyWorksheetGroup,
				FamilyWorksheetFactor,
				CheckResult,
				FamilyNotice,
			] = [
				ruling,
				finding,
				slot,
				check,
				derivation,
				line,
				rated,
				worksheet,
				group,
				factor,
				gate,
				notice,
			]
			expect(parts.length).toBe(12)
			expect([check, gate].every((read) => isAccountResult(read))).toBe(true)
		})

		it('admit a determination', () => {
			const determination: Determination = requireValue(
				requireValue(EXECUTED[0])[1].determinations[0],
			)
			const finding: FamilyFinding = determination
			expect(isFamilyFinding(finding)).toBe(true)
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
					{ ...requireValue(second), state: 'met', effect: 'waiver', message: ['Waived.'] },
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
				'      looked up by room: room is hall',
				'  Total: $120.00',
				'Guest fee: $100.00',
				'  Heads: $100.00',
				'    Per guest: $100.00',
				'      guest count is 50',
				'      changes: times 2, then plus 10',
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
				'Booking rating gave no answer, because Deposit, Hold: Deposit had to apply and did not',
			)
			expect(renderAccount(account).split('\n').slice(-3)).toEqual([
				'Deposit gave no answer',
				'  Hold: Deposit had to apply and did not',
				'    cost is $2,000.00, which is more than $1,250.00',
			])
			// The line states its own refusal, so the rating's verdict does not print it again.
			expect(account.lines[0]?.lines).toEqual([])
		})

		it('states a refusal of the rating’s own beneath its verdict, and a lookup’s with its value', () => {
			const overflowing = createRater({ total: () => Number.POSITIVE_INFINITY })
			const summed = FAMILY.narrate(RATING, overflowing.rate(RATING, FAMILY_BASE))
			expect(summed.lines[0]?.summary).toBe(
				'Booking rating gave no answer, because the run did not give a finite number',
			)
			expect(summed.lines[1]?.text).toBe('Room rent: $80.00')
			expect(summed.lines[0]?.lines.map((line) => line.text)).toEqual([
				'the run did not give a finite number',
			])
			const missed = buildRatingDefinition('rating', 'Rating', [
				buildLineDefinition(
					'line',
					'Rent',
					createQuantitativeDefinition('rate', 'Rate', [
						createFactorGroup(
							'g',
							'sum',
							[createLookupFactor('a', 'room', { hall: 120 }, { name: 'Room rate' })],
							{ name: 'Hire' },
						),
					]),
				),
			])
			const account = FAMILY.narrate(missed, RATER.rate(missed, FAMILY_BASE))
			expect(renderAccount(account, { detail: 'full' }).split('\n')).toEqual([
				'Rating gave no answer',
				'Rent gave no answer',
				'  Hire: Room rate has no entry for the value it read (room: studio)',
				'  Hire did not apply',
				'    Room rate found no value to use',
			])
			expect(account.lines[0]?.summary).toBe(
				'Rating gave no answer, because Rent, Hire: Room rate has no entry for the value it read (room: studio)',
			)
		})

		it('names an injected engine’s silence and its contradictions', () => {
			const rating = buildRatingDefinition('rating', 'Booking rating', [
				requireValue(RATING.lines[0]),
			])
			const texts = [
				{ success: false, refusals: [], faults: [] },
				{ success: true, value: Number.NaN, refusals: [], faults: [] },
			].map((answer) => {
				const reasoner = createAnsweringReasoner(createQuantitativeReasoner(), answer)
				const rater = createRater({ engine: createReason({ reasoners: [reasoner] }) })
				return FAMILY.narrate(rating, rater.rate(rating, FAMILY_BASE)).lines[0]?.summary
			})
			expect(texts).toEqual([
				'Booking rating gave no answer, because Room rent failed and gave no reason',
				'Booking rating gave no answer, because Room rent rests on a result that cannot be used',
			])
		})

		it('refuses a subject its door refused with the fields, and no line', () => {
			const faults = [{ reason: 'missing', path: 'room', expected: 'string' }] as const
			const account = FAMILY.narrate(RATING, { lines: [], success: false, refusals: [], faults })
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
			const refused = { lines: [unreached], success: false, refusals: [], faults: [] }
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
		it('states the status, the disposition, the notices, and the two results', () => {
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

		it('states a limit with the checks that fixed it, and no disposition where the result holds none', () => {
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
			'states the status and the disposition the engine gave for %s',
			(name, expected) => {
				const result = requireValue(EXECUTED.find(([entry]) => entry === name))[1]
				const account = FAMILY.narrate(PROGRAM, result)
				expect(account.lines[0]?.text).toBe(
					`Booking program: ${DEFAULT_LEXICON.statuses[expected.status]}`,
				)
				expect(
					account.lines.map((line) => line.text).filter((text) => text.startsWith('Decision')),
				).toEqual(
					expected.disposition === undefined
						? []
						: [`Decision: ${DEFAULT_LEXICON.dispositions[expected.disposition]}`],
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
				costly:
					'Booking program: not fully rated, because Deposit, Hold: Deposit had to apply and did not',
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
			const written = collectWrittenTexts(FAMILY.narrate(QUALIFICATION, result)).join('\n')
			const { messages, states } = requireValue(FAMILY_SUBJECTS[name])
			expect(result.findings.filter((finding) => finding.state !== 'met').length).toBeGreaterThan(6)
			for (const finding of result.findings) {
				if (finding.message === undefined) continue
				const message = renderFamilyMessage(finding.message)
				expect(written.includes(message)).toBe(states[finding.id] === 'met')
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
			const messages = heavy.determinations.map(({ message }) => renderFamilyMessage(message ?? []))
			expect(messages).not.toContain('')
			for (const message of messages) expect(full).not.toContain(message)
			expect(full).toContain('Limit: Heavy booking cannot be decided')
		})

		it('prints the rule’s name where a message is blank, or holds no part', () => {
			const restricted = requireValue(QUALIFIED[1])[1]
			for (const message of [[' '], ['', '\n'], []]) {
				const findings = restricted.findings.map((finding) => ({ ...finding, message }))
				expect(
					FAMILY.narrate(QUALIFICATION, { ...restricted, findings }).lines.map((line) => line.text),
				).toContain('Restriction: Restricted activity applies')
			}
		})

		it('prints each text of a message as it stands, and fills nothing in it', () => {
			const restricted = requireValue(QUALIFIED[1])[1]
			const findings = restricted.findings.map((finding) => ({
				...finding,
				message: ['Held for {{effect}}', '.'],
			}))
			expect(
				FAMILY.narrate(QUALIFICATION, { ...restricted, findings }).lines.map((line) => line.text),
			).toContain('Restriction: Held for {{effect}}.')
		})
	})

	// The message is authored over four fields, each formatted as its own field is, and the last is
	// one nobody gave.
	describe('T26: a slot prints the value its finding carries, in its field’s unit', () => {
		const gates = createLogicalDefinition('gates', 'Gates', [
			createRule('loud', [createAtom('noise', 'above', 40)], createAtom('loud', 'equals', true), {
				name: 'Loud booking',
			}),
			createRule('quiet', [createAtom('noise', 'to', 40)], createAtom('quiet', 'equals', true), {
				name: 'Quiet booking',
			}),
		])
		const authored =
			'Costs {{cost}} at {{ noise }} in {{room}}, tools {{tools}}, held by {{keeper.name}}.'
		const definition = createQualificationDefinition('q', 'Q', [gates], {
			rulings: [
				createRuling('loud', 'gates', 'loud', 'condition', { message: authored }),
				createRuling('quiet', 'gates', 'quiet', 'condition', { message: authored }),
			],
		})
		const result = QUALIFIER.qualify({ ...FAMILY_BASE, cost: 1250.5, noise: 55.25 }, definition)
		const written = 'Costs $1,250.50 at 55.3 in studio, tools true, held by not known.'

		it('through the real qualifier, and only for a met finding', () => {
			expect(result.findings.map((finding) => [finding.id, finding.state])).toEqual([
				['loud', 'met'],
				['quiet', 'unmet'],
			])
			const account = FAMILY.narrate(definition, result)
			expect(account.lines.map((line) => line.text)).toContain(`Condition: ${written}`)
			const texts = collectWrittenTexts(account)
			expect(texts.filter((text) => text.includes('Costs'))).not.toEqual([])
			expect(texts.filter((text) => text.includes('Quiet') && text.includes('Costs'))).toEqual([])
			expect(texts.filter((text) => text.includes('{{'))).toEqual([])
			// The one word asked is the label of no slot: the keeper is not a field a check reads.
			expect(account.lines.flatMap((line) => line.gaps)).toEqual([])
			const loud = requireValue(result.findings[0])
			for (const state of ['unmet', 'unread'] as const) {
				const findings = [{ ...loud, state }]
				const unmet = collectWrittenTexts(FAMILY.narrate(definition, { ...result, findings }))
				expect(unmet.filter((text) => text.includes('Costs'))).toEqual([])
			}
		})

		it('changing one value changes its slot alone', () => {
			const loud = requireValue(result.findings[0])
			const message = requireValue(loud.message)
			const changes = [
				['cost', 2000, written.replace('$1,250.50', '$2,000.00')],
				['noise', 41, written.replace('55.3', '41')],
				['room', 'hall, or loft', written.replace('studio', 'hall, or loft')],
				['tools', null, written.replace('tools true', 'tools none')],
				['keeper.name', 'Ada', written.replace('not known', 'Ada')],
			] as const
			for (const [field, actual, text] of changes) {
				const altered = message.map((part) =>
					!isString(part) && formatField(part.field) === field ? { ...part, actual } : part,
				)
				const findings = [{ ...loud, message: altered }]
				expect(FAMILY.narrate(definition, { ...result, findings }).lines[1]?.text).toBe(
					`Condition: ${text}`,
				)
			}
		})

		it('carries the gap of a slot whose number has no unit, and asks nothing for a message', () => {
			const glossary: Glossary = {
				...GLOSSARY,
				units: { noise: 'decibel', cost: 'ingot' },
			}
			const family = new FamilyNarrator(new Narrator({ glossary }), { glossary, units: UNITS })
			const gauged = createQualificationDefinition('q', 'Q', [gates], {
				rulings: [
					createRuling('loud', 'gates', 'loud', 'condition', { message: '{{cost}} {{staff}}' }),
				],
			})
			const account = family.narrate(
				gauged,
				QUALIFIER.qualify({ ...FAMILY_BASE, noise: 55 }, gauged),
			)
			expect(account.lines[1]?.text).toBe('Condition: 1000 2')
			expect(account.lines[1]?.gaps).toEqual([
				{ word: 'format', unit: 'ingot' },
				{ word: 'unit', field: ['staff'] },
			])
			expect(family.audit([gauged])).toEqual([])
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
					refusals: [],
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

		it('gives no reason for a list of checks that does not line up, or is empty', () => {
			const untrained = requireValue(QUALIFIED.find(([name]) => name === 'untrained'))[1]
			const finding = requireValue(untrained.findings.find((entry) => entry.id === 'untrained'))
			const [first, second] = finding.checks
			const one = requireValue(first)
			const two = requireValue(second)
			const misaligned: ReadonlyArray<readonly [string, FamilyFinding]> = [
				['a rule that never ran', { ...finding, checks: [] }],
				['a check short', { ...finding, checks: [one] }],
				['a check over', { ...finding, checks: [...finding.checks, two] }],
				['out of order', { ...finding, checks: [two, one] }],
				[
					'another field',
					{ ...finding, checks: [{ ...one, check: { ...one.check, field: 'room' } }, two] },
				],
				[
					'another comparison',
					{ ...finding, checks: [{ ...one, check: { ...one.check, operator: 'not' } }, two] },
				],
				[
					'another value',
					{ ...finding, checks: [{ ...one, check: { ...one.check, value: 'yes' } }, two] },
				],
				['another state', { ...finding, state: 'unread' }],
				['another reading', { ...finding, checks: [{ ...one, state: 'met' }, two] }],
				['a rule the pass lacks', { ...finding, rule: 'lost' }],
				['a pass the definition lacks', { ...finding, pass: 'lost' }],
				['no pass', { id: 'x', effect: 'referral', state: 'met', checks: finding.checks }],
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
				checks: [{ check: createCheck('loop', 'equals', true), actual: true, state: 'met' }],
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

		it('states no eligibility of a qualification that holds a refusal, and its causes alone', () => {
			const cause = 'Room size, Sizes: Room has no entry for the value it read (room: attic)'
			expect(REFUSED.refusals).toEqual([
				{
					cause: 'source',
					path: ['size'],
					group: 'sizes',
					factor: 'room',
					field: 'room',
					actual: 'attic',
				},
			])
			expect(REFUSED.eligibility).toBe('referral')
			const refused = FAMILY.narrate(MISSED, REFUSED)
			expect(renderAccount(refused, { detail: 'full' })).toBe(
				`Missed booking gave no answer\n  ${cause}`,
			)
			expect(renderAccount(refused, { detail: 'line' })).toBe(
				`Missed booking gave no answer, because ${cause}`,
			)
			expect(refused.lines[0]?.lines[0]?.source).toEqual({
				group: 'sizes',
				factor: 'room',
				refusal: REFUSED.refusals[0],
			})
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
			expect(both.refusals.length).toBe(1)
			expect(renderAccount(FAMILY.narrate(MISSED, both), { detail: 'full' }).split('\n')).toEqual([
				'Missed booking gave no answer',
				`  ${cause}`,
				'  guest count is not known, and must be a number',
			])
		})

		it('names each cause a qualification’s pass can give, with the pass it stands in', () => {
			const rule = createRule(
				'late',
				[createAtom('start', 'above', 18)],
				createAtom('late', 'equals', true),
				{ name: 'After hours' },
			)
			const ruled = createQualificationDefinition(
				'q',
				'Q',
				[createLogicalDefinition('gates', 'Gates', [rule])],
				{ rulings: [createRuling('late', 'gates', 'late', 'restriction')] },
			)
			const texts = [
				{ start: 20, late: true },
				{ success: false, refusals: [], faults: [] },
				{ success: true, rules: [] },
			].map((change) => {
				const reasoner =
					'start' in change
						? createLogicalReasoner()
						: createAnsweringReasoner(createLogicalReasoner(), change)
				const qualifier = createQualifier({ engine: createReason({ reasoners: [reasoner] }) })
				const subject = 'start' in change ? change : { start: 20 }
				return FAMILY.narrate(ruled, qualifier.qualify(subject, ruled)).lines[0]?.summary
			})
			expect(texts).toEqual([
				'Q gave no answer, because Gates was given a value that only its rules can set (late)',
				'Q gave no answer, because Gates failed and gave no reason',
				'Q gave no answer, because Gates: After hours rests on a result that cannot be used',
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
			expect(costly.faults).toEqual([])
			expect(costly.refusals.map((refusal) => [refusal.cause, refusal.path])).toEqual([
				['required', ['rating', 'deposit']],
				['unread', ['authority']],
			])
			const verdict = FAMILY.narrate(PROGRAM, costly).lines[0]
			expect(verdict?.text).toBe('Booking program: not fully rated')
			// The rating's own refusal prints in its section, and the authority's beneath the verdict.
			expect(verdict?.lines.map((line) => line.text)).toEqual([
				'Booking authority: Heavy booking could not read a value that the run itself supplies (rated total)',
			])
		})

		it('states the status of a program whose authority read a total no rating gave, its cause, and no limit', () => {
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
			expect(result.refusals.map((refusal) => [refusal.cause, refusal.path])).toEqual([
				['unread', ['authority']],
			])
			expect(result.determinations.map((entry) => entry.effect)).toEqual(['notice', 'limit'])
			const account = FAMILY.narrate(definition, result)
			expect(renderAccount(account).split('\n').slice(0, 5)).toEqual([
				'Booking program: not eligible',
				'  Booking authority: Large total could not read a value that the run itself supplies (rated total)',
				'Notice: The workshop closes at 18:00.',
				'Booking qualification: not eligible',
				'  Restriction: The workshop does not lend a room for torch welding.',
			])
			// Without that refusal, the limit prints as any other does.
			const read = FAMILY.narrate(definition, { ...result, refusals: [] })
			expect(read.lines.map((line) => line.text)).toContain('Limit: The booking was turned down.')
			const rated = result.refusals.map((refusal) => ({ ...refusal, path: ['rating'] }))
			const other = FAMILY.narrate(definition, { ...result, refusals: rated })
			expect(other.lines.map((line) => line.text)).toContain('Limit: The booking was turned down.')
		})

		it('states no status of a program whose qualification holds a refusal, and each cause once', () => {
			const definition = buildProgramDefinition('program', 'Booking program', MISSED, RATING)
			const result = createProgram(definition).execute({ ...FAMILY_BASE, room: 'attic' })
			expect(result.status).toBe('referral')
			const account = FAMILY.narrate(definition, result)
			expect(renderAccount(account, { detail: 'full' }).split('\n')).toEqual([
				'Booking program gave no answer',
				'Missed booking gave no answer',
				'  Room size, Sizes: Room has no entry for the value it read (room: attic)',
			])
			expect(account.lines[0]?.summary).toBe(
				'Booking program gave no answer, because Missed booking, Room size, Sizes: Room has no entry for the value it read (room: attic)',
			)
		})

		it('states once the field a section could not read and only a batch supplies, and what it fixed', () => {
			const gates = createLogicalDefinition('gates', 'Gates', [
				createRule(
					'busy',
					[createAtom(['aggregate', 'count'], 'above', 3)],
					createAtom('busy', 'equals', true),
					{ name: 'Busy day' },
				),
			])
			const qualification = createQualificationDefinition('entry', 'Entry check', [gates], {
				rulings: [createRuling('busy', 'gates', 'busy', 'restriction')],
			})
			const gated = buildProgramDefinition('program', 'Booking program', qualification)
			const referred = createProgram(gated).execute(FAMILY_BASE)
			expect(referred.faults).toEqual([])
			expect(referred.refusals.map((refusal) => [refusal.cause, refusal.path])).toEqual([
				['unread', ['qualification', 'gates']],
			])
			const held = FAMILY.narrate(gated, referred).lines[0]
			expect(held?.text).toBe('Booking program: referred for review')
			expect(held?.summary).toBe(
				'Booking program: referred for review, because aggregate.count is not known, and must be a number',
			)
			expect(held?.lines).toEqual([])

			const rating = buildRatingDefinition('rating', 'Booking rating', [
				buildLineDefinition(
					'share',
					'Share',
					createQuantitativeDefinition('rate', 'Rate', [
						createFactorGroup('g', 'sum', [
							createFieldFactor('count', ['aggregate', 'count'], { name: 'Count' }),
						]),
					]),
				),
			])
			const open = createQualificationDefinition('open', 'Open check', [
				createLogicalDefinition('gates', 'Gates', [
					createRule(
						'noisy',
						[createAtom('noise', 'above', 40)],
						createAtom('noisy', 'equals', true),
					),
				]),
			])
			const priced = buildProgramDefinition('program', 'Booking program', open, rating)
			const unrated = createProgram(priced).execute(FAMILY_BASE)
			expect(unrated.refusals.map((refusal) => [refusal.cause, refusal.path])).toEqual([
				['unread', ['rating', 'share']],
			])
			const missed = FAMILY.narrate(priced, unrated).lines[0]
			expect(missed?.text).toBe('Booking program: not fully rated')
			expect(missed?.summary).toBe(
				'Booking program: not fully rated, because aggregate.count is not known, and must be a number',
			)
			expect(missed?.lines).toEqual([])
		})

		it('prints a limit’s slot in the unit of the projection’s path it names', () => {
			const heavy = createLogicalDefinition('authority', 'Booking authority', [
				createRule(
					'heavy',
					[createAtom(['outcome', 'total'], 'above', 200)],
					createAtom('limited', 'equals', true),
					{ name: 'Heavy booking', description: 'A total of {{outcome.total}} needs a person.' },
				),
			])
			const definition = buildProgramDefinition('p', 'Program', QUALIFICATION, RATING, {
				authority: heavy,
			})
			const subject = requireValue(FAMILY_PROGRAMS.heavy).subject
			const account = FAMILY.narrate(definition, createProgram(definition).execute(subject))
			expect(account.lines.map((line) => line.text)).toContain(
				'Limit: A total of $270.00 needs a person.',
			)
			expect(account.lines.flatMap((line) => line.gaps)).toEqual([])
			expect(renderAccount(FAMILY.describe(definition), { detail: 'full' })).not.toContain('{{')
		})

		it('prints an engine’s word the lexicon lacks, and quotes a blank one', () => {
			const standing = requireValue(EXECUTED[0])[1]
			const account = FAMILY.narrate(PROGRAM, {
				...standing,
				status: 'paused',
				disposition: 'held',
			})
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
			// A rating that holds no refusal and no fault still says which line gave no answer.
			const silent = FAMILY.narrate(RATING, {
				...standing,
				lines: [unsettled],
				total: null,
				success: false,
			})
			expect(silent.lines[0]?.summary).toBe(
				`${RATING.name} gave no answer, because Room rent gave no answer`,
			)
		})

		it('states no number of a group whose result holds no value', () => {
			const standing = requireValue(RATED[0])[1]
			const rent = requireValue(standing.lines[0])
			const groups = rent.worksheet.groups.map(({ value: _value, ...group }) => group)
			for (const held of [groups, groups.map((group) => ({ ...group, value: null }))]) {
				const line = { ...rent, worksheet: { ...rent.worksheet, groups: held } }
				expect(isFamilyLineResult(line)).toBe(true)
				const named = requireValue(RATING.lines[0]).rate.groups[0]?.name
				const account = FAMILY.narrate(RATING, { ...standing, lines: [line] })
				expect(account.lines[1]?.lines[0]?.text).toBe(`${named ?? ''} applied`)
			}
			// A disabled group, and one that never ran, print no line.
			const skipped = groups.map((group) => ({
				...group,
				applied: false,
				factors: group.factors.map(({ value: _value, ...factor }) => factor),
			}))
			const worksheet = { ...rent.worksheet, groups: skipped }
			const account = FAMILY.narrate(RATING, { ...standing, lines: [{ ...rent, worksheet }] })
			expect(account.lines[1]?.lines.map((line) => line.source.group)).toEqual([undefined])
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
				standing: 'looked up by room: room is studio',
				attic: 'its fallback, because no entry matches room: room is attic',
				hall: 'looked up by room: room is hall',
				small: 'looked up by room: room is loft',
				costly: 'looked up by room: room is studio',
				noroom: undefined,
			})
		})

		it('says which gave a changed number, an entry or the fallback, and the number before its changes', () => {
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
			const texts = [FAMILY_BASE, { ...FAMILY_BASE, room: 'hall', guests: 20 }].map((subject) => {
				const result = RATER.rate(definition, subject)
				expect(result.success).toBe(true)
				const group = requireValue(FAMILY.narrate(definition, result).lines[1]?.lines[0])
				return group.lines.map((line) => line.lines.slice(0, 2).map(({ text }) => text))
			})
			const missed = 'its fallback, because no entry matches room: room is studio'
			const few = 'set by the first range guest count falls in: guest count is 8'
			const many = 'its fallback, because no entry matches guest count: guest count is 20'
			expect(texts).toEqual([
				[
					[missed, 'before its changes: 80'],
					[missed, 'bounds: 0 to 1000'],
					[few, 'before its changes: 5'],
					[few, 'bounds: 0 to 1000'],
					['looked up by room: room is studio', 'before its changes: 80'],
					[few, 'before its changes: 5'],
					['guest count is 8', 'changes: times 2'],
					['fixed at 5', 'changes: times 2'],
				],
				[
					['looked up by room: room is hall', 'before its changes: 120'],
					['looked up by room: room is hall', 'bounds: 0 to 1000'],
					[many, 'before its changes: 7'],
					[many, 'bounds: 0 to 1000'],
					['looked up by room: room is hall', 'before its changes: 120'],
					[few.replace('is 8', 'is 20'), 'before its changes: 5'],
					['guest count is 20', 'changes: times 2'],
					['fixed at 5', 'changes: times 2'],
				],
			])
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
			).toContain('its fallback, because no entry matches room: room is studio')
		})

		it('names the entry a factor missed, and the number one could not use came from', () => {
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
			expect(full.split('\n')).toEqual([
				'Rating gave no answer',
				'Line gave no answer',
				'  Group: Room has no entry for the value it read (room: studio)',
				'  Group: Guests has no entry for the value it read (guest count: 8)',
				'  Group: Cost did not give a finite number',
				'    cost is $1,000.00',
				'  Group did not apply',
				'    Room found no value to use',
				'    Guests found no value to use',
				'    Cost did not apply',
			])
		})

		it('reads a factor with no checks, or none that answers it, as found with no value', () => {
			const costly = requireValue(RATED.find(([name]) => name === 'costly'))[1]
			const deposit = requireValue(costly.lines[2])
			const emptied = {
				...deposit,
				worksheet: {
					...deposit.worksheet,
					refusals: [],
					groups: deposit.worksheet.groups.map((group) => ({
						...group,
						factors: group.factors.map((factor) => ({ ...factor, checks: [] })),
					})),
				},
			}
			const account = FAMILY.narrate(RATING, { ...costly, lines: [emptied] })
			expect(renderAccount(account, { detail: 'full' })).toContain('Deposit found no value to use')
			expect(renderAccount(account, { detail: 'full' })).not.toContain('cost is')
		})

		it('gives a gated factor no reason where its checks do not line up', () => {
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
								checks: [...factor.checks, ...factor.checks],
							})),
						})),
					},
				},
			]
			const account = FAMILY.narrate(RATING, { ...costly, lines })
			expect(renderAccount(account, { detail: 'full' })).not.toContain('cost is')
			expect(renderAccount(account, { detail: 'full' })).toContain('Deposit did not apply')
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

		it('an account does not move when a result holds the worded members the packages gave up', () => {
			const premises = [{ field: 'activity', label: 'x', description: 'another sentence' }]
			const restricted = requireValue(QUALIFIED[1])[1]
			const stale = {
				...restricted,
				errors: ['another text'],
				findings: restricted.findings.map((finding) => ({ ...finding, premises })),
			}
			expect(FAMILY.narrate(QUALIFICATION, stale)).toEqual(
				FAMILY.narrate(QUALIFICATION, restricted),
			)
			const costly = requireValue(RATED.find(([name]) => name === 'costly'))[1]
			const lines = costly.lines.map((line) => ({
				...line,
				worksheet: {
					...line.worksheet,
					errors: ['another text'],
					groups: line.worksheet.groups.map((group) => ({
						...group,
						factors: group.factors.map((factor) => ({ ...factor, evidence: premises })),
					})),
				},
			}))
			expect(FAMILY.narrate(RATING, { ...costly, lines })).toEqual(FAMILY.narrate(RATING, costly))
		})

		it('a thrown error’s message is the one text of a refusal that prints, and it prints quoted', () => {
			const evaluator = createAnsweringEvaluator(() => {
				throw new Error('clock stopped')
			})
			const engine = createReason({ reasoners: [createQuantitativeReasoner({ evaluator })] })
			const rating = buildRatingDefinition('rating', 'Booking rating', [
				requireValue(RATING.lines[2]),
			])
			const result = createRater({ engine }).rate(rating, FAMILY_BASE)
			const account = FAMILY.narrate(rating, result)
			expect(account.lines[0]?.summary).toBe(
				'Booking rating gave no answer, because Deposit, Hold: Deposit failed while it ran ("clock stopped")',
			)
			expect(FAMILY.narrate(rating, FAMILY_WORDED.rating(result))).toEqual(account)
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
					const texts = collectWrittenTexts(FAMILY.describe(definition))
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
			const clean = { refusals: [], faults: [] }
			for (const derivation of [
				{ id: 'load', value: SECRET, success: false, ...clean },
				{ id: 'load', value: Number.POSITIVE_INFINITY, success: true, ...clean },
				{ id: 'load', value: null, success: true, ...clean },
			]) {
				const account = FAMILY.narrate(QUALIFICATION, { ...standing, derivations: [derivation] })
				const full = renderAccount(account, { detail: 'full' })
				expect(full).toContain('Booking load gave no answer')
				expect(full).not.toContain('booking load is 4321')
				expect(full).not.toContain('∞')
			}
		})

		it('T1: a derivation that failed names its cause', () => {
			const refused = requireValue(QUALIFIED.find(([name]) => name === 'refused'))[1]
			const account = FAMILY.narrate(QUALIFICATION, refused)
			expect(account.lines.find((line) => line.source.pass === 'load')?.summary).toBe(
				'Booking load gave no answer, because guest count is not known, and must be a number',
			)
			const derivation = {
				...requireValue(refused.derivations[0]),
				faults: [],
				refusals: [{ cause: 'value', group: 'amount', factor: 'guests' }] as const,
			}
			expect(
				FAMILY.narrate(QUALIFICATION, { ...refused, derivations: [derivation] }).lines.find(
					(line) => line.source.pass === 'load',
				)?.summary,
			).toBe('Booking load gave no answer, because Amount: Guests did not give a finite number')
		})

		it('T5: no text is blank, holds a line break, or prints a value no one gave', () => {
			const bare = new FamilyNarrator(new Narrator())
			const tricky = { id: '', name: ' \n', effect: '', message: 'one\ntwo' }
			const said = { ...tricky, message: ['one\n', { field: '', actual: Number.NaN }] }
			const odd: FamilyQualificationResult = {
				...requireValue(QUALIFIED[0])[1],
				eligibility: '',
				scopes: { '': '', toString: 'eligible' },
				findings: [
					{ ...said, state: 'met', checks: [] },
					{ ...said, state: 'unread', checks: [], scope: '__proto__', rule: '' },
				],
				derivations: [{ id: '', value: Number.NaN, success: true, refusals: [], faults: [] }],
			}
			const refusals: readonly ReasonRefusal[] = [
				...REASON_REFUSAL_CAUSES.map((cause) => ({
					cause,
					path: ['', 'a\nb'],
					actual: Number.NaN,
				})),
				{ cause: 'thrown', message: '' },
				{ cause: 'operator', operator: '\n', key: '', index: Number.NaN },
				{ cause: 'depth', depth: Number.POSITIVE_INFINITY, group: '', factor: ' ' },
			]
			const accounts = [
				...ACCOUNTS,
				bare.narrate({ id: '', name: '', passes: [] }, odd),
				bare.narrate({ id: '', name: '', passes: [] }, { ...odd, refusals }),
				bare.narrate(
					{ id: '', name: '', lines: [] },
					{ lines: [], success: false, refusals, faults: [] },
				),
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
											factors: [
												{
													id: '',
													applied: true,
													value: Number.NaN,
													raw: null,
													fallback: true,
													checks: [],
												},
											],
										},
									],
									success: true,
									refusals: [],
									faults: [],
								},
							},
						],
						total: Number.NaN,
						success: true,
						refusals: [],
						faults: [],
					},
				),
			]
			for (const account of accounts) {
				const texts = collectWrittenTexts(account)
				expect(texts.length).toBeGreaterThan(0)
				expect(
					texts.filter(
						(text) =>
							text.trim() === '' ||
							/undefined|NaN|\n|\{\{|possible|supported through|:\s*$|^\s*:/.test(text),
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
			const executed = requireValue(EXECUTED[5])[1]
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

		it('narrate writes one account for every definition beside every result, through every entry point', () => {
			const area = buildWorkshopArea()
			const score = buildWorkshopScore()
			const facts = { ...buildWorkshopFacts(), depth: 10 }
			const executed = requireValue(EXECUTED[5])[1]
			const answers: ReadonlyArray<readonly [AccountDefinition, ReasonResult | FamilyResult]> = [
				[loan, createLogicalReasoner().reason({ age: 30 }, loan)],
				[
					score,
					createQuantitativeReasoner().reason({ cost: 100, member: 'gold', room: 'hall' }, score),
				],
				[area, createSymbolicReasoner().reason({ width: 4, depth: 5 }, area)],
				[facts, createDeductiveReasoner().reason({}, facts)],
				[QUALIFICATION, qualified],
				[RATING, requireValue(RATED[0])[1]],
				[PROGRAM, executed],
			]
			const quote = { lexicon: { frames: { 'value.quoted': '«{{value}}»' } }, glossary: GLOSSARY }
			const writers = [{ glossary: GLOSSARY }, quote].map((options) => {
				const owned = new Narrator(options)
				const lexicon = mergeLexicon(DEFAULT_LEXICON, 'lexicon' in options ? options.lexicon : {})
				return {
					narrator: owned,
					interpret: new Interpret({ narrator: options }),
					family: new FamilyNarrator(owned, { lexicon, glossary: GLOSSARY, units: UNITS }),
				}
			})
			const missed = writers.flatMap((writer) =>
				[undefined, '', ' '].flatMap((name) =>
					answers.flatMap(([authored], kind) =>
						answers.flatMap(([, result], other) => {
							const blank = name === undefined ? {} : { name }
							const definition = { ...authored, ...blank, ...(name === ' ' ? { id: ' ' } : {}) }
							const account = writer.narrator.narrate(definition, result)
							const texts = [
								writer.interpret.narrate(definition, result),
								...('reasoning' in definition || 'reasoning' in result
									? []
									: [writer.family.narrate(definition, result)]),
							].map((entry) => JSON.stringify(entry))
							const [line] = account.lines
							const refusal = {
								role: 'verdict',
								decisive: true,
								text: `${account.name} gave no answer`,
								summary: `${account.name} gave no answer`,
								source: {},
								gaps:
									name === undefined
										? []
										: [{ word: 'name', part: 'definition', id: definition.id }],
								lines: [],
							}
							const whole =
								kind === other ||
								JSON.stringify([line, account.lines.length]) === JSON.stringify([refusal, 1])
							const alike = texts.every((text) => text === JSON.stringify(account))
							return whole && alike && account.success === result.success
								? []
								: [[definition.id, name, kind, other, account.lines.length, line, texts]]
						}),
					),
				),
			)
			expect(missed.map(([id, name, kind, other]) => [id, name, kind, other])).toEqual([])
			expect(answers.length ** 2).toBe(49)
			// The matching pairs answer.
			for (const [definition, result] of answers) {
				expect(narrator.narrate(definition, result).lines[0]?.text).not.toContain('gave no answer')
			}
			const [plain] = answers
			expect(narrator.narrate(requireValue(plain)[0], rated).lines[0]?.state).toBeUndefined()
		})

		it('a refusal that read a field keeps its state', () => {
			expect(REFUSED.refusals.length).toBe(1)
			expect(narrator.narrate(MISSED, REFUSED).lines[0]?.state).toBe('unread')
			expect(interpret.narrate(MISSED, REFUSED).lines[0]?.state).toBe('unread')
		})

		it('a line of a rating prints the precision that moves its amount', () => {
			const parts = createQuantitativeDefinition(
				'parts',
				'Parts',
				[createFactorGroup('g', 'sum', [createStaticFactor('a', 2.5), createStaticFactor('b', 3)])],
				{ precision: 0 },
			)
			const rating = buildRatingDefinition('rating', 'Rating', [
				buildLineDefinition('parts', 'Parts', parts),
			])
			const account = new FamilyNarrator(new Narrator()).narrate(rating, RATER.rate(rating, {}))
			expect(renderAccount(account).split('\n')).toEqual([
				'Rating: 6',
				'Parts: 6',
				'  g: 5.5',
				'    a: 2.5',
				'      fixed at 2.5',
				'    b: 3',
				'      fixed at 3',
				'  decimal places: 0',
				'  Total: 6',
			])
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
			const answers: ReadonlyArray<readonly [FamilyDefinition, FamilyResult]> = [
				...QUALIFIED.map(([, result]) => [QUALIFICATION, result] as const),
				...RATED.map(([, result]) => [RATING, result] as const),
				...EXECUTED.map(([, result]) => [PROGRAM, result] as const),
				[MISSED, REFUSED],
			]
			for (const [definition, result] of answers) {
				const before = structuredClone(result)
				const account = FAMILY.narrate(definition, result)
				const copy = structuredClone(account)
				const pending: AccountLine[] = [...account.lines]
				for (const line of pending) pending.push(...line.lines)
				for (const { source } of pending) {
					if (source.check !== undefined) Reflect.set(source.check, 'value', SECRET)
					if (source.result !== undefined) Reflect.set(source.result, 'actual', SECRET)
					if (source.result !== undefined) Reflect.set(source.result.check, 'value', SECRET)
					if (source.fault !== undefined) Reflect.set(source.fault, 'path', 'other')
					if (source.refusal !== undefined) Reflect.set(source.refusal, 'cause', 'silent')
				}
				expect(result).toEqual(before)
				expect(FAMILY.narrate(definition, result)).toEqual(copy)
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
						checks: [{ check: createCheck('a', 'equals', 1), actual: 1, state: 'met' }],
					},
				],
			})
			expect(account.lines[1]).toMatchObject({ text: 'Referral: Deep applies', lines: [] })
		})
	})
})
