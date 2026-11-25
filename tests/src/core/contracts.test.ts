import { admitValue, createContract, isRecord, seededRandom } from '@orkestrel/contract'
import { createLogicalReasoner, projectValue } from '@orkestrel/reason'
import {
	ACCOUNT_SHAPE_DEPTH,
	accountContract,
	amendmentContract,
	buildAccountLine,
	createAccountLineShape,
	createNarrator,
	interpretationContract,
	isAccount,
	isAccountLine,
	isAmendment,
	projectAccount,
	projectAccountLine,
	projectInterpretation,
	readNumberShape,
	readNumbersContract,
	renderAccount,
	scanNumbers,
} from '@src/core'
import { createHostileValues } from '@orkestrel/test'
import { describe, expect, it } from 'vitest'
import {
	buildCorpusInterpret,
	buildInterpretContractCases,
	buildRuleChain,
	collectEvidenceAccounts,
	collectFamilyAccounts,
	collectFixtureAccounts,
	measureLines,
	REFUSAL_READINGS,
} from '../../setup.js'

describe('standing guard contract table', () => {
	const table = buildInterpretContractCases()
	const accounts = [...collectFixtureAccounts(), ...collectEvidenceAccounts()]
	it('canonical positives and negative controls declare their direction and projection', () => {
		for (const row of table.definitions) {
			expect(row.direction).toBe('is implies guard')
			expect(row.project).toBeUndefined()
			expect(row.wire.is(row.positive)).toBe(true)
			expect(row.guard(row.positive)).toBe(true)
			expect(row.wire.is(row.negative)).toBe(false)
			expect(row.guard(row.negative)).toBe(false)
		}
		for (const row of table.numbers) {
			expect(row.direction).toBe('producer implies wire after projection')
			expect(row.guard).toBeUndefined()
			expect(row.wire.is(row.project(row.positive))).toBe(true)
			expect(row.wire.is(row.negative)).toBe(false)
		}
		for (const row of [
			...table.results.map((entry) => ({ ...entry, projected: entry.project(entry.positive) })),
			...table.members.map((entry) => ({ ...entry, projected: entry.project(entry.positive) })),
		]) {
			expect(row.direction).toBe('producer implies wire after projection')
			expect(row.guard(row.positive)).toBe(true)
			expect(row.wire.is(row.projected)).toBe(true)
			expect(row.wire.is(row.negative)).toBe(false)
			expect(row.guard(row.negative)).toBe(false)
			expect(row.guard({ ...row.positive, foreign: true })).toBe(true)
		}
	})
	it.each(table.definitions)('$name: generated admissions imply guard without discards', (row) => {
		const outcomes = Array.from({ length: 100 }, (_, seed) => {
			const value = row.wire.generate(seededRandom(seed))
			return { seed, admitted: row.wire.is(value), guarded: row.guard(value) }
		})
		expect(outcomes.filter((entry) => !entry.admitted)).toEqual([])
		expect(outcomes.filter((entry) => !entry.guarded)).toEqual([])
	})
	it('producer refusals and number readings cross their wire contracts', () => {
		const interpret = buildCorpusInterpret()
		try {
			for (const row of REFUSAL_READINGS) {
				const result = interpret.interpret(row.text)
				expect(interpretationContract.is(projectInterpretation(result))).toBe(true)
				const numbers = scanNumbers(row.text)
				expect(readNumbersContract.is(projectValue(numbers))).toBe(true)
				for (const number of numbers)
					expect(createContract(readNumberShape).is(projectValue(number))).toBe(true)
			}
		} finally {
			interpret.destroy()
		}
	})
	it('refuses non-record subject and definition roots and malformed refusals', () => {
		const row = table.results[0]
		if (row === undefined) throw new Error('Missing interpretation row')
		const projected = row.project(row.positive)
		if (!isRecord(projected)) throw new Error('Expected projected record')
		for (const field of ['subject', 'definition', 'refusals']) {
			for (const value of [42, null, [], 'text']) {
				expect(row.wire.is({ ...projected, [field]: value })).toBe(false)
			}
		}
	})
	// In parts, so that no case nears the timeout on a busy host.
	it.each(Array.from({ length: 10 }, (_, part) => part))(
		'T30: every account interpret writes passes its guard and its contract’s round trip, part %i',
		(part) => {
			for (const account of accounts.filter((_, index) => index % 10 === part)) {
				expect(isAccount(account)).toBe(true)
				const read: unknown = JSON.parse(JSON.stringify(projectAccount(account)))
				expect(accountContract.audit(read)).toEqual([])
				const admitted = admitValue(accountContract, read)
				const value: unknown = admitted.success ? admitted.value : admitted.error
				if (!isAccount(value)) throw new Error(`Account ${account.id} did not survive`)
				expect(value).toEqual(read)
				for (const detail of ['line', 'reasons', 'full'] as const) {
					expect(renderAccount(value, { detail })).toBe(renderAccount(account, { detail }))
				}
			}
		},
	)
	it('T30: every family account passes its guard and its contract’s round trip', () => {
		const family = collectFamilyAccounts()
		expect(family.length + accounts.length).toBeGreaterThan(400)
		for (const account of family) {
			expect(isAccount(account)).toBe(true)
			const read: unknown = JSON.parse(JSON.stringify(projectAccount(account)))
			expect(accountContract.audit(read)).toEqual([])
			expect(isAccount(read)).toBe(true)
		}
		expect(Math.max(...family.map((entry) => measureLines(entry.lines)))).toBe(ACCOUNT_SHAPE_DEPTH)
	})
	it('T30: the accounts read hold a line of every role', () => {
		expect(accounts.length).toBeGreaterThan(300)
		expect(new Set(accounts.flatMap((account) => account.lines.map((line) => line.role)))).toEqual(
			new Set(['verdict', 'reason', 'condition', 'step']),
		)
	})
	it('T30: refuses an account that is missing a member, misnames one, or adds one', () => {
		const [account] = accounts
		const projected = account === undefined ? undefined : projectAccount(account)
		if (!isRecord(projected) || !Array.isArray(projected.lines)) throw new Error('No account')
		const [line, ...rest] = projected.lines
		for (const changed of [
			{ ...line, role: 'title' },
			{ ...line, state: 'open' },
			{ ...line, text: 5 },
			{ ...line, source: { rule: 5 } },
			{ ...line, source: { check: { field: 'n', operator: 5 } } },
			{ ...line, source: { result: { check: { field: 'n', operator: 'equals' }, state: 'open' } } },
			{ ...line, source: { result: { state: 'met' } } },
			{ ...line, source: { refusal: { cause: 'tired' } } },
			{ ...line, source: { refusal: { cause: 'depth', depth: 'deep' } } },
			{ ...line, source: { fault: { reason: 'invented', path: [] } } },
			{ ...line, gaps: [{ word: 'plural' }] },
			{ ...line, gaps: [{ word: 'name', part: 'chapter' }] },
			{ ...line, lines: [{}] },
			{ ...line, lines: undefined },
		]) {
			const altered = { ...projected, lines: [changed, ...rest] }
			expect([accountContract.is(altered), isAccount(altered)]).toEqual([false, false])
		}
		for (const key of ['id', 'name', 'lines']) {
			const { [key]: _dropped, ...partial } = projected
			expect([accountContract.is(partial), isAccount(partial)]).toEqual([false, false])
		}
		expect(accountContract.is({ ...projected, extra: 1 })).toBe(false)
		expect(isAccount({ ...projected, extra: 1 })).toBe(true)
	})
	it('T30: spells out the lines of every account, and any JSON under a deeper one', () => {
		const chain = buildRuleChain(40)
		const account = createNarrator().narrate(
			chain,
			createLogicalReasoner().reason({ seed: true }, chain),
		)
		expect(measureLines(account.lines)).toBe(41)
		expect(accountContract.is(projectAccount(account))).toBe(true)
		const written = accounts.filter((entry) => entry.id !== 'chain')
		const depth = Math.max(...written.map((entry) => measureLines(entry.lines)))
		expect(depth).toBeLessThanOrEqual(ACCOUNT_SHAPE_DEPTH)
		const one = createContract(createAccountLineShape(1))
		const two = createContract(createAccountLineShape(2))
		const line = projectAccountLine(
			buildAccountLine({
				role: 'step',
				text: 'a',
				lines: [buildAccountLine({ role: 'step', text: 'b' })],
			}),
		)
		if (!isRecord(line)) throw new Error('Expected projected record')
		expect([one.is(line), two.is(line)]).toEqual([true, true])
		const broken = { ...line, lines: [{ role: 'step' }] }
		expect([one.is(broken), two.is(broken), isAccountLine(broken)]).toEqual([true, false, false])
	})
	it('what the amendment contract admits the guard admits, and the other way', () => {
		const samples: readonly unknown[] = [
			{},
			{ entities: [], removed: [] },
			{ entities: [{ name: 'age', value: null }] },
			{ entities: [{ name: '', value: { nested: [1, 'a', true] } }], removed: [''] },
			{ entities: undefined },
			{ entities: [{ name: 'age' }] },
			{ entities: [{ name: 'age', value: undefined }] },
			{ entities: [{ name: 'age', value: Number.NaN }] },
			{ entities: [{ name: 'age', value: 1, field: 'age' }] },
			{ entities: { age: 1 } },
			{ removed: 'age' },
			{ remove: [] },
			[],
			null,
			...createHostileValues(),
		]
		const verdicts = samples.map((sample) => [amendmentContract.is(sample), isAmendment(sample)])
		expect(verdicts.filter(([is, guarded]) => is !== guarded)).toEqual([])
		expect(verdicts.slice(0, 14).map(([is]) => is)).toEqual([
			...[true, true, true, true],
			...Array.from({ length: 10 }, () => false),
		])
	})
	it('preserves hinted audit faults and refuses unknown fault reasons', () => {
		const row = table.results[0]
		if (row === undefined) throw new Error('Missing interpretation row')
		const projected = row.project(row.positive)
		if (!isRecord(projected)) throw new Error('Expected projected record')
		const fault = { reason: 'variant', path: ['x'], variants: 2, key: 'kind', expected: ['a', 'b'] }
		expect(row.wire.is({ ...projected, repairs: [fault] })).toBe(true)
		expect(row.wire.is({ ...projected, repairs: [{ reason: 'invented', path: [] }] })).toBe(false)
	})
})
