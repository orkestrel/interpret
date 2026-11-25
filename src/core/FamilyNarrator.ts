import type { AuditFault } from '@orkestrel/contract'
import type {
	CheckResult,
	Factor,
	FactorResult,
	GroupResult,
	LogicalDefinition,
	LogicalResult,
	QuantitativeDefinition,
	QuantitativeResult,
	Rule,
} from '@orkestrel/reason'
import type {
	Account,
	AccountLine,
	AccountRole,
	AccountSource,
	AccountText,
	FamilyDefinition,
	FamilyDerivation,
	FamilyFinding,
	FamilyLine,
	FamilyLineResult,
	FamilyNarratorInterface,
	FamilyNarratorOptions,
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
	Glossary,
	GlossaryGap,
	Lexicon,
	NarratorInterface,
} from './types.js'
import { attempt, isFiniteNumber, isSuccess } from '@orkestrel/contract'
import { formatField } from '@orkestrel/reason'
import { DEFAULT_LOCALE } from '@orkestrel/template'
import { DEFAULT_FORMATS, DEFAULT_LEXICON } from './constants.js'
import {
	buildAccountLine,
	cloneGlossaryGap,
	collectFaultFields,
	collectFieldGaps,
	collectGaps,
	collectNameGaps,
	collectReasons,
	collectUnitGaps,
	filterUniqueGaps,
	findWord,
	matchesChangedFactor,
	renderCitedReasons,
	renderName,
	settleOperands,
} from './helpers.js'

/**
 * Implements the guide, the result, and the audit of a qualification, a rating, and a program,
 * written through a narrator.
 *
 * @remarks
 * The options hold the words the narrator was built over, so that a gap is judged by the words
 * that print.
 *
 * @example
 * ```ts
 * import { FamilyNarrator, Narrator, renderAccount } from '@orkestrel/interpret'
 *
 * const glossary = { labels: {}, values: { prices: 'count' } }
 * const narrator = new FamilyNarrator(new Narrator({ glossary }), { glossary })
 * const rating = { id: 'prices', name: 'Prices', lines: [] }
 * const result = { lines: [], total: 1250, success: true, faults: [] }
 * renderAccount(narrator.narrate(rating, result)) // 'Prices: 1,250'
 * ```
 */
export class FamilyNarrator implements FamilyNarratorInterface {
	readonly #narrator: NarratorInterface
	readonly #lexicon: Lexicon
	readonly #glossary: Glossary
	readonly #units: ReadonlySet<string>
	readonly #plain: Intl.NumberFormat

	constructor(narrator: NarratorInterface, options?: FamilyNarratorOptions) {
		this.#narrator = narrator
		this.#lexicon = options?.lexicon ?? DEFAULT_LEXICON
		this.#glossary = options?.glossary ?? { labels: {} }
		this.#units = options?.units ?? new Set(Object.keys(DEFAULT_FORMATS))
		this.#plain = new Intl.NumberFormat(options?.locale ?? DEFAULT_LOCALE, DEFAULT_FORMATS.plain)
	}

	describe(definition: FamilyDefinition): Account {
		return {
			id: definition.id,
			name: this.#renderName(definition),
			lines: this.#guideLines(definition),
		}
	}

	narrate(definition: FamilyDefinition, result: FamilyResult): Account {
		return {
			id: definition.id,
			name: this.#renderName(definition),
			success: result.success,
			lines: this.#resultLines(definition, result),
		}
	}

	audit(definitions: readonly FamilyDefinition[]): readonly GlossaryGap[] {
		const gaps = definitions.flatMap((definition) => this.#collectGaps(definition))
		return filterUniqueGaps(gaps).map((gap) => cloneGlossaryGap(gap))
	}

	#guideLines(definition: FamilyDefinition): readonly AccountLine[] {
		if ('passes' in definition) return this.#qualificationGuide(definition, [])
		return 'lines' in definition ? this.#ratingGuide(definition) : this.#programGuide(definition)
	}

	#resultLines(definition: FamilyDefinition, result: FamilyResult): readonly AccountLine[] {
		if ('passes' in definition && 'scopes' in result) {
			return this.#qualificationLines(definition, result, [])
		}
		if ('lines' in definition && 'lines' in result) return this.#ratingLines(definition, result)
		if ('qualification' in definition && 'determinations' in result) {
			return this.#programLines(definition, result)
		}
		return this.#narrator.narrate(definition, this.#unreadResult([])).lines
	}

	// === The words

	// A blank id prints in the quote of the words this was built over.
	#renderName(named: { readonly id: string; readonly name: string }): string {
		return renderName(named, this.#lexicon.frames['value.quoted'])
	}

	#writeName(
		part: NonNullable<GlossaryGap['part']>,
		named: { readonly id: string; readonly name: string },
	): AccountText {
		return { text: this.#renderName(named), gaps: collectNameGaps(part, named) }
	}

	// A word the lexicon lacks prints as the engine's own.
	#writeWord(table: 'eligibilities' | 'effects' | 'statuses' | 'decisions', key: string): string {
		return this.#renderName({ id: key, name: this.#narrator.phrase(table, key) })
	}

	#writeCited(reasons: readonly AccountText[]): AccountText {
		return renderCitedReasons(reasons, this.#lexicon, (count) =>
			this.#narrator.line('reason.more', { count: this.#plain.format(count) }),
		)
	}

	// A scope's name is the rating line's of that id, else the glossary's, else the id with a gap.
	#writeScope(scope: string, lines: readonly FamilyLine[]): AccountText {
		const line = lines.find((entry) => entry.id === scope)
		if (line !== undefined) return this.#writeName('line', line)
		const word = findWord(this.#glossary.scopes, scope)
		if (word !== undefined) return { text: word, gaps: [] }
		return this.#writeName('scope', { id: scope, name: scope })
	}

	#writeScoped(
		written: AccountText,
		scope: string | undefined,
		lines: readonly FamilyLine[],
	): AccountText {
		if (scope === undefined) return written
		const named = this.#writeScope(scope, lines)
		return {
			text: this.#narrator.line('finding.scope', { scope: named.text, outcome: written.text }),
			gaps: [...named.gaps, ...written.gaps],
		}
	}

	#writeEffect(effect: string, written: AccountText): AccountText {
		const word = this.#writeWord('effects', effect)
		return {
			text: this.#narrator.line('finding.effect', { effect: word, finding: written.text }),
			gaps: written.gaps,
		}
	}

	#writeRuleName(finding: FamilyFinding, rule: Rule | undefined): AccountText {
		const id = finding.rule ?? finding.id
		return this.#writeName('rule', rule ?? { id, name: id })
	}

	// A message is the domain's sentence for a finding that is met, and for no other.
	#readMessage(finding: FamilyFinding): string | undefined {
		const { message, state } = finding
		return state !== 'met' || message === undefined || message.trim() === '' ? undefined : message
	}

	// A finding's outcome: its message, or its rule's name and state.
	#writeFinding(finding: FamilyFinding, rule: Rule | undefined): AccountText {
		const message = this.#readMessage(finding)
		if (message !== undefined) return { text: message, gaps: [] }
		const named = this.#writeRuleName(finding, rule)
		const verdict = this.#lexicon.rules[finding.state]
		return {
			text: this.#narrator.line('rule.settled', { name: named.text, verdict }),
			gaps: named.gaps,
		}
	}

	// A finding as a reason of a verdict: its message, or its rule's outcome with its own facts.
	#writeReason(
		finding: FamilyFinding,
		rule: Rule | undefined,
		faults: readonly AuditFault[],
		lines: readonly FamilyLine[],
	): AccountText {
		const facts =
			this.#readMessage(finding) === undefined ? this.#premiseLines(finding, rule, faults) : []
		if (facts.length === 0) {
			return this.#writeScoped(this.#writeFinding(finding, rule), finding.scope, lines)
		}
		const named = this.#writeRuleName(finding, rule)
		const verdict = this.#lexicon.rules[finding.state]
		const cited = this.#writeCited(facts)
		const text = this.#narrator.line('reason.rule', {
			name: named.text,
			verdict,
			reasons: cited.text,
		})
		return this.#writeScoped({ text, gaps: [...named.gaps, ...cited.gaps] }, finding.scope, lines)
	}

	// === What the documents share

	// A refusal and its causes are written as the narrator writes those of a run that read nothing.
	#refusalLine(
		named: { readonly id: string; readonly name: string },
		faults: readonly AuditFault[],
	): AccountLine {
		const { id, name } = named
		const { lines } = this.#narrator.narrate(
			{ reasoning: 'logical', id, name, strategy: 'forward', rules: [] },
			this.#unreadResult(faults),
		)
		const text = this.#narrator.line('result.refused', { name: this.#renderName(named) })
		return lines[0] ?? buildAccountLine({ role: 'verdict', decisive: true, text })
	}

	// The result of a run that read nothing, and of another kind than any family definition's.
	#unreadResult(faults: readonly AuditFault[]): LogicalResult {
		return {
			reasoning: 'logical',
			conclusion: 'unread',
			rules: [],
			count: 0,
			success: false,
			trace: [],
			errors: [],
			faults,
			repairs: [],
			defaulted: [],
		}
	}

	#faultLines(
		named: { readonly id: string; readonly name: string },
		faults: readonly AuditFault[],
	): readonly AccountLine[] {
		return faults.length === 0 ? [] : this.#refusalLine(named, faults).lines
	}

	// A verdict with its reasons, and the fields a run could not read.
	#outcomeLine(
		role: AccountRole,
		named: AccountText,
		outcome: string,
		reasons: readonly AccountText[],
		lines: readonly AccountLine[],
		source: AccountSource = {},
	): AccountLine {
		const name = named.text
		const cited = this.#writeCited(reasons)
		const scoped = role !== 'verdict'
		return buildAccountLine({
			role,
			decisive: true,
			text: scoped
				? this.#narrator.line('finding.scope', { scope: name, outcome })
				: this.#narrator.line('result.outcome', { name, outcome }),
			...(reasons.length === 0
				? {}
				: {
						summary: this.#narrator.line('result.decided', { name, outcome, reasons: cited.text }),
					}),
			source,
			gaps: [...named.gaps, ...cited.gaps],
			lines,
		})
	}

	// A document inside a program's stands as one line, with its own lines nested.
	#sectionLine(lines: readonly AccountLine[], role: AccountRole): readonly AccountLine[] {
		const [first, ...rest] = lines
		return first === undefined ? [] : [{ ...first, role, lines: [...first.lines, ...rest] }]
	}

	#titleLine(definition: FamilyDefinition): AccountLine {
		return buildAccountLine({
			role: 'verdict',
			decisive: true,
			...this.#writeName('definition', definition),
			lines: this.#descriptionLines(definition.description),
		})
	}

	#descriptionLines(description: string | undefined): readonly AccountLine[] {
		return description === undefined || description.trim() === '' || this.#matchesSlot(description)
			? []
			: [buildAccountLine({ role: 'condition', text: description })]
	}

	// An unfilled slot is any the qualifier would fill, which is wider than a template's own.
	#matchesSlot(text: string): boolean {
		return /\{\{[^}]+\}\}/.test(text)
	}

	#dropSlot<T extends { readonly description?: string }>(part: T): T {
		const { description } = part
		return description === undefined || !this.#matchesSlot(description)
			? part
			: { ...part, description: '' }
	}

	#describeRules(definition: LogicalDefinition): readonly AccountLine[] {
		const rules = definition.rules.map((rule) => this.#dropSlot(rule))
		return this.#narrator.describe(this.#dropSlot({ ...definition, rules })).lines
	}

	#describeWorksheet(definition: QuantitativeDefinition): readonly AccountLine[] {
		const groups = definition.groups.map((group) =>
			this.#dropSlot({ ...group, factors: group.factors.map((factor) => this.#dropSlot(factor)) }),
		)
		return this.#narrator.describe(this.#dropSlot({ ...definition, groups })).lines
	}

	#findRule(definition: FamilyQualification, pass: string, rule: string): Rule | undefined {
		return this.#findLogical(definition, pass)?.rules.find((entry) => entry.id === rule)
	}

	#findLogical(definition: FamilyQualification, pass: string): LogicalDefinition | undefined {
		return definition.passes
			.filter((entry) => entry.reasoning === 'logical')
			.find((entry) => entry.id === pass)
	}

	// === A finding

	#findingRule(definition: FamilyQualification, finding: FamilyFinding): Rule | undefined {
		return finding.pass === undefined || finding.rule === undefined
			? undefined
			: this.#findRule(definition, finding.pass, finding.rule)
	}

	#findingLine(
		finding: FamilyFinding,
		rule: Rule | undefined,
		faults: readonly AuditFault[],
		written: AccountText,
	): AccountLine {
		const lines = this.#premiseLines(finding, rule, faults)
		const cited = this.#writeCited(lines)
		const { id, scope, pass, state } = finding
		const ruled = finding.rule ?? rule?.id
		return buildAccountLine({
			role: 'reason',
			state,
			decisive: state === 'met',
			text: written.text,
			...(lines.length === 0
				? {}
				: {
						summary: this.#narrator.line('reason.step', {
							outcome: written.text,
							reasons: cited.text,
						}),
					}),
			source: {
				finding: id,
				...(ruled === undefined ? {} : { rule: ruled }),
				...(pass === undefined ? {} : { pass }),
				...(scope === undefined ? {} : { scope }),
			},
			gaps: [...written.gaps, ...cited.gaps],
			lines,
		})
	}

	// The facts that fix a finding's state: the rule's atoms paired with its premises, as the rule's
	// own result would hold them. The rule is narrated alone and concludes nothing, so a key another
	// rule concludes prints as a plain fact, because a finding holds no other rule's result.
	#premiseLines(
		finding: FamilyFinding,
		rule: Rule | undefined,
		faults: readonly AuditFault[],
	): readonly AccountLine[] {
		const checks = this.#readChecks(finding.premises)
		if (rule === undefined || checks === undefined) return []
		const settled = attempt(() => settleOperands(rule.premises, checks))
		if (!isSuccess(settled)) return []
		const premises = settled.value.map((premise) => premise.state)
		const result = { id: rule.id, state: finding.state, premises, checks }
		if (collectReasons(rule, result).length === 0) return []
		const { id, name } = rule
		const { lines } = this.#narrator.narrate(
			{ reasoning: 'logical', id, name, strategy: 'forward', rules: [this.#dropConclusion(rule)] },
			{
				reasoning: 'logical',
				conclusion: finding.state,
				rules: [result],
				count: finding.state === 'met' ? 1 : 0,
				success: finding.state !== 'unread',
				trace: [],
				errors: [],
				faults,
				repairs: [],
				defaulted: [],
			},
		)
		return lines[0]?.lines ?? []
	}

	#dropConclusion(rule: Rule): Rule {
		return {
			...rule,
			enabled: true,
			conclusion: { form: 'compound', operator: 'and', operands: [] },
		}
	}

	// A premise with no field or no state was never checked, so no list that holds one lines up.
	#readChecks(premises: readonly FamilyPremise[]): readonly CheckResult[] | undefined {
		const checks = premises.flatMap(({ field, actual, state }): readonly CheckResult[] =>
			field === undefined || state === undefined ? [] : [{ field, actual, state }],
		)
		return checks.length === premises.length ? checks : undefined
	}

	// === The qualification

	#qualificationLines(
		definition: FamilyQualification,
		result: FamilyQualificationResult,
		lines: readonly FamilyLine[],
	): readonly AccountLine[] {
		const { faults, findings } = result
		if (result.errors.length > faults.length) return [this.#refusalLine(definition, faults)]
		const causes = this.#faultLines(definition, faults)
		const met = findings.filter((finding) => finding.state === 'met')
		const open = met.filter((finding) => finding.scope === undefined)
		const verdict = this.#outcomeLine(
			'verdict',
			this.#writeName('definition', definition),
			this.#writeWord('eligibilities', result.eligibility),
			[
				...this.#writeDeciding(definition, result.eligibility, open, faults, lines),
				...(result.eligibility === 'referral' ? causes : []),
			],
			causes,
		)
		const scopes = new Set([
			...Object.keys(result.scopes),
			...met.flatMap(({ scope }) => (scope === undefined ? [] : [scope])),
		])
		const named = collectFaultFields(causes)
		return [
			verdict,
			...this.#sortFindings(open).map((finding) =>
				this.#qualifiedLine(definition, finding, faults, lines),
			),
			...[...scopes].map((scope) => this.#scopeLine(definition, result, scope, lines)),
			...result.derivations.map((derivation) => this.#derivationLine(definition, derivation)),
			...findings
				.filter((finding) => finding.state === 'unmet')
				.map((finding) => this.#qualifiedLine(definition, finding, faults, lines)),
			...findings
				.filter((finding) => finding.state === 'unread')
				.map((finding) => this.#qualifiedLine(definition, finding, faults, lines))
				.map((line) => ({
					...line,
					lines: line.lines.filter(
						({ source }) =>
							source.fault === undefined || !named.has(formatField(source.fault.path)),
					),
				})),
		]
	}

	#qualifiedLine(
		definition: FamilyQualification,
		finding: FamilyFinding,
		faults: readonly AuditFault[],
		lines: readonly FamilyLine[],
	): AccountLine {
		const rule = this.#findingRule(definition, finding)
		const written = this.#writeEffect(finding.effect, this.#writeFinding(finding, rule))
		const scoped = this.#writeScoped(written, finding.scope, lines)
		return this.#findingLine(finding, rule, faults, scoped)
	}

	// The findings that fix an eligibility: each restriction, or each referral, that is met.
	#writeDeciding(
		definition: FamilyQualification,
		eligibility: string,
		met: readonly FamilyFinding[],
		faults: readonly AuditFault[],
		lines: readonly FamilyLine[],
	): readonly AccountText[] {
		const effect = eligibility === 'ineligible' ? 'restriction' : eligibility
		return met
			.filter((finding) => finding.effect === effect)
			.map((finding) =>
				this.#writeReason(finding, this.#findingRule(definition, finding), faults, lines),
			)
	}

	#sortFindings(findings: readonly FamilyFinding[]): readonly FamilyFinding[] {
		const order = ['restriction', 'referral', 'condition']
		return [
			...order.flatMap((effect) => findings.filter((finding) => finding.effect === effect)),
			...findings.filter((finding) => !order.includes(finding.effect)),
		]
	}

	#scopeLine(
		definition: FamilyQualification,
		result: FamilyQualificationResult,
		scope: string,
		lines: readonly FamilyLine[],
	): AccountLine {
		const eligibility = findWord(result.scopes, scope)
		const met = result.findings.filter(
			(finding) => finding.state === 'met' && finding.scope === scope,
		)
		// Under its scope's line, a finding leaves the scope out.
		const plain = met.map(({ scope: _scope, ...finding }) => finding)
		return this.#outcomeLine(
			'reason',
			this.#writeScope(scope, lines),
			eligibility === undefined
				? this.#lexicon.missing
				: this.#writeWord('eligibilities', eligibility),
			eligibility === undefined
				? []
				: this.#writeDeciding(definition, eligibility, plain, result.faults, lines),
			this.#sortFindings(met).map((finding) => {
				const rule = this.#findingRule(definition, finding)
				const written = this.#writeEffect(finding.effect, this.#writeFinding(finding, rule))
				return this.#findingLine(finding, rule, result.faults, written)
			}),
			{ scope },
		)
	}

	// A derived number is a field a later pass reads, so it prints as that field's value.
	#derivationLine(definition: FamilyQualification, derivation: FamilyDerivation): AccountLine {
		const { id, value } = derivation
		const source = { pass: id }
		if (!derivation.success || !isFiniteNumber(value)) {
			const pass = definition.passes.find((entry) => entry.id === id) ?? { id, name: id }
			const named = this.#writeName('pass', pass)
			const text = this.#narrator.line('result.refused', { name: named.text })
			return buildAccountLine({ role: 'step', text, source, gaps: named.gaps })
		}
		const field = ['qualification', id]
		return buildAccountLine({
			role: 'step',
			text: this.#narrator.line('fact.equal', {
				label: this.#narrator.label(field),
				actual: this.#narrator.value(field, value),
			}),
			source,
			gaps: collectFieldGaps(field, true, this.#glossary, this.#units),
		})
	}

	#qualificationGuide(
		definition: FamilyQualification,
		lines: readonly FamilyLine[],
	): readonly AccountLine[] {
		const described = new Map(
			definition.passes
				.filter((pass) => pass.reasoning === 'logical')
				.map((pass) => [pass.id, this.#describeRules(pass)]),
		)
		return [
			this.#titleLine(definition),
			...(definition.rulings ?? [])
				.filter((ruling) => this.#findRule(definition, ruling.pass, ruling.rule)?.enabled !== false)
				.map((ruling) =>
					this.#rulingGuide(ruling, definition, described.get(ruling.pass) ?? [], lines),
				),
			...definition.passes
				.filter((pass) => pass.reasoning === 'quantitative')
				.map((pass) =>
					this.#worksheetGuide(this.#writeName('pass', pass), false, { pass: pass.id }, [], pass),
				),
		]
	}

	#rulingGuide(
		ruling: FamilyRuling,
		definition: FamilyQualification,
		described: readonly AccountLine[],
		lines: readonly FamilyLine[],
	): AccountLine {
		const { id, pass, rule, scope, message } = ruling
		const guide = described.find((line) => line.source.rule === rule)
		const authored = this.#findRule(definition, pass, rule) ?? { id: rule, name: rule }
		const named = this.#writeName('rule', authored)
		const gaps = [...named.gaps, ...(guide?.gaps ?? [])]
		const written = this.#writeScoped(
			this.#writeEffect(ruling.effect, { text: named.text, gaps }),
			scope,
			lines,
		)
		const summary = this.#writeScoped(
			this.#writeEffect(ruling.effect, { text: guide?.summary ?? named.text, gaps }),
			scope,
			lines,
		)
		const nested = guide?.lines ?? []
		return buildAccountLine({
			role: 'condition',
			decisive: true,
			...written,
			summary: summary.text,
			source: { finding: id, pass, rule, ...(scope === undefined ? {} : { scope }) },
			lines: [
				...nested.filter((line) => line.source.rule === undefined),
				...(message === undefined ? [] : this.#descriptionLines(message)),
				...nested.filter((line) => line.source.rule !== undefined),
			],
		})
	}

	// A worksheet's guide stands under the name that prints it, which is not its definition's own.
	#worksheetGuide(
		named: AccountText,
		decisive: boolean,
		source: AccountSource,
		lines: readonly AccountLine[],
		definition: QuantitativeDefinition,
	): AccountLine {
		const [title, ...groups] = this.#describeWorksheet(definition)
		return buildAccountLine({
			role: 'condition',
			decisive,
			...named,
			source,
			lines: [...lines, ...(title?.lines ?? []), ...groups],
		})
	}

	// === The rating

	#ratingLines(definition: FamilyRating, result: FamilyRatingResult): readonly AccountLine[] {
		const lines = result.lines.map((line, index) => {
			const paired = definition.lines[index]
			const authored =
				paired?.id === line.id ? paired : definition.lines.find((entry) => entry.id === line.id)
			return this.#rateLine(authored, line)
		})
		const { total } = result
		if (result.success && isFiniteNumber(total)) {
			const [verdict] = this.#amountLines(definition, undefined, total)
			return verdict === undefined ? lines : [verdict, ...lines]
		}
		const named = this.#writeName('definition', definition)
		const causes = this.#faultLines(definition, result.faults)
		const reasons = [...causes, ...this.#writeRefusedLines(definition, result)]
		const cited = this.#writeCited(reasons)
		const stated = collectFaultFields(lines)
		const verdict = buildAccountLine({
			role: 'verdict',
			decisive: true,
			text: this.#narrator.line('result.refused', { name: named.text }),
			...(reasons.length === 0
				? {}
				: {
						summary: this.#narrator.line('result.because', {
							name: named.text,
							reasons: cited.text,
						}),
					}),
			gaps: [...named.gaps, ...cited.gaps],
			lines: causes.filter(
				({ source }) => source.fault === undefined || !stated.has(formatField(source.fault.path)),
			),
		})
		return [verdict, ...lines]
	}

	// The lines that gave no answer and hold no field that says why.
	#writeRefusedLines(definition: FamilyRating, result: FamilyRatingResult): readonly AccountText[] {
		return result.lines
			.filter((line) => this.#readAmount(line) === undefined && line.worksheet.faults.length === 0)
			.map((line) => {
				const authored = definition.lines.find((entry) => entry.id === line.id)
				const named = this.#writeName('line', authored ?? line)
				return {
					text: this.#narrator.line('result.refused', { name: named.text }),
					gaps: named.gaps,
				}
			})
	}

	#readAmount({ amount, worksheet }: FamilyLineResult): number | undefined {
		return worksheet.success && isFiniteNumber(amount) ? amount : undefined
	}

	#rateLine(authored: FamilyLine | undefined, line: FamilyLineResult): AccountLine {
		const named = this.#writeName('line', authored ?? line)
		const { worksheet } = line
		const amount = this.#readAmount(line)
		const rate =
			authored === undefined
				? undefined
				: { ...this.#adaptRate(authored.rate, worksheet), name: named.text }
		const [verdict, ...rest] = this.#amountLines(
			rate ?? { id: '', name: named.text },
			rate,
			amount,
			worksheet,
		)
		const text = this.#narrator.line('result.refused', { name: named.text })
		return buildAccountLine({
			role: 'step',
			decisive: true,
			text: verdict?.text ?? text,
			summary: verdict?.summary ?? text,
			source: { line: line.id },
			gaps: [...named.gaps, ...(verdict?.gaps ?? []).filter((gap) => gap.part !== 'definition')],
			lines: [...(verdict?.lines ?? []), ...rest],
		})
	}

	// An amount is written as a worksheet's value is, in the unit the glossary names by its id.
	#amountLines(
		named: { readonly id: string; readonly name: string },
		rate: QuantitativeDefinition | undefined,
		amount: number | undefined,
		worksheet?: FamilyWorksheet,
	): readonly AccountLine[] {
		const { id, name } = named
		const result: QuantitativeResult = {
			reasoning: 'quantitative',
			value: amount ?? 0,
			groups: worksheet === undefined ? [] : this.#adaptGroups(rate, worksheet),
			count: 0,
			success: amount !== undefined,
			trace: [],
			errors: worksheet?.errors ?? [],
			faults: worksheet?.faults ?? [],
			repairs: [],
			defaulted: [],
		}
		return this.#narrator.narrate(
			rate ?? { reasoning: 'quantitative', id, name, aggregation: 'sum', groups: [] },
			result,
		).lines
	}

	// === The worksheet a rating holds, as a run's result

	// A factor the run never reached holds no value, and a group with none of its factors reached
	// was not reached either. Neither prints.
	#adaptGroups(
		rate: QuantitativeDefinition | undefined,
		worksheet: FamilyWorksheet,
	): readonly GroupResult[] {
		return worksheet.groups.flatMap((group) => {
			const authored = rate?.groups.find((entry) => entry.id === group.id)
			const factors = group.factors.flatMap((factor) =>
				factor.value === undefined
					? []
					: [
							this.#adaptFactor(
								authored?.factors.find((entry) => entry.id === factor.id),
								factor,
								factor.value,
							),
						],
			)
			const { id, applied, value } = group
			return factors.length === 0 ? [] : [{ id, applied, value, factors }]
		})
	}

	// A worksheet drops the raw value, which is the value itself where nothing changed it.
	#adaptFactor(
		authored: Factor | undefined,
		factor: FamilyWorksheetFactor,
		value: number,
	): FactorResult {
		const { id, applied, evidence } = factor
		const stated = applied && authored !== undefined
		const kept = stated && (!matchesChangedFactor(authored) || this.#matchesEither(authored))
		return {
			id,
			applied,
			value,
			...(kept ? { raw: value } : {}),
			...(this.#matchesGate(factor) ? { checks: this.#readChecks(evidence) ?? [] } : {}),
		}
	}

	#matchesGate(factor: FamilyWorksheetFactor): boolean {
		return !factor.applied && factor.evidence.some((row) => row.state !== undefined)
	}

	// A changed value does not say whether an entry or the fallback gave it.
	#matchesEither(factor: Factor): boolean {
		const { origin } = factor.source
		return (
			(origin === 'lookup' || origin === 'range') &&
			factor.fallback !== undefined &&
			matchesChangedFactor(factor)
		)
	}

	#adaptRate(rate: QuantitativeDefinition, worksheet: FamilyWorksheet): QuantitativeDefinition {
		return {
			...rate,
			groups: rate.groups.map((group) => {
				const read = worksheet.groups.find((entry) => entry.id === group.id)
				return {
					...group,
					factors: group.factors.map((factor) => {
						const result = read?.factors.find((entry) => entry.id === factor.id)
						return result === undefined
							? factor
							: this.#adaptSource(factor, result, worksheet.faults)
					}),
				}
			}),
		}
	}

	// The narrator reads a source to say where a number came from. Where a worksheet cannot say,
	// this private copy holds a source that says no more: a fallback equal to an entry, with no change
	// to count back over, where either may have given the value, and nothing to look up where a
	// factor found no value.
	#adaptSource(
		factor: Factor,
		result: FamilyWorksheetFactor,
		faults: readonly AuditFault[],
	): Factor {
		const { source } = factor
		const { value } = result
		if (value === undefined || (source.origin !== 'lookup' && source.origin !== 'range')) {
			return factor
		}
		if (result.applied) {
			if (!this.#matchesEither(factor)) return factor
			return {
				...factor,
				fallback: value,
				transforms: [],
				source:
					source.origin === 'lookup'
						? { ...source, table: { [formatField(source.field)]: value } }
						: { ...source, ranges: [{ value }] },
			}
		}
		const key = formatField(source.field)
		const unread = faults.some((fault) => formatField(fault.path) === key)
		return this.#matchesGate(result) || unread
			? factor
			: { ...factor, source: { origin: 'static', value } }
	}

	#ratingGuide(definition: FamilyRating): readonly AccountLine[] {
		return [
			this.#titleLine(definition),
			...definition.lines.map((line) =>
				this.#worksheetGuide(
					this.#writeName('line', line),
					true,
					{ line: line.id },
					this.#descriptionLines(line.description),
					line.rate,
				),
			),
		]
	}

	// === The program

	#programLines(definition: FamilyProgram, result: FamilyProgramResult): readonly AccountLine[] {
		const { qualification, rating, faults } = result
		const lines = definition.rating?.lines ?? []
		const sections = [
			...this.#sectionLine(
				this.#qualificationLines(definition.qualification, qualification, lines),
				'step',
			),
			...(definition.rating === undefined || rating === undefined
				? []
				: this.#sectionLine(this.#ratingLines(definition.rating, rating), 'step')),
		]
		const stated = collectFaultFields(sections)
		const causes = this.#faultLines(definition, faults)
		const rest = causes.filter(
			({ source }) => source.fault === undefined || !stated.has(formatField(source.fault.path)),
		)
		// The status is read from the qualification and the rating, before the authority runs.
		const refused = qualification.errors.length > qualification.faults.length
		const verdict = refused
			? { ...this.#refusalLine(definition, faults), lines: rest }
			: this.#outcomeLine(
					'verdict',
					this.#writeName('definition', definition),
					this.#writeWord('statuses', result.status),
					this.#writeStatusReasons(definition, result, causes),
					rest,
				)
		// The authority may be what failed, so a run with an error no fault says prints no limit.
		const limited = result.errors.length <= faults.length
		return [
			verdict,
			...(result.decision === undefined ? [] : [this.#decisionLine(result.decision)]),
			...result.determinations
				.filter((determination) => limited || determination.effect === 'notice')
				.map((determination) => this.#determinationLine(definition, determination, faults)),
			...sections,
		]
	}

	// What fixes a status, as the program derives it from the qualification and the rating.
	#writeStatusReasons(
		definition: FamilyProgram,
		result: FamilyProgramResult,
		causes: readonly AccountText[],
	): readonly AccountText[] {
		const { status, rating } = result
		if (status === 'incomplete') return causes
		if (status === 'unrated' && rating !== undefined) {
			return definition.rating === undefined
				? []
				: this.#writeRefusedLines(definition.rating, rating)
		}
		const { faults, findings } = result.qualification
		return findings
			.filter((finding) => finding.state === 'met' && this.#matchesStatus(finding, result))
			.map((finding) =>
				this.#writeReason(
					finding,
					this.#findingRule(definition.qualification, finding),
					faults,
					definition.rating?.lines ?? [],
				),
			)
	}

	#matchesStatus({ effect, scope }: FamilyFinding, result: FamilyProgramResult): boolean {
		switch (result.status) {
			case 'ineligible':
				return effect === 'restriction' && scope === undefined
			case 'referral':
				return (
					effect === 'referral' &&
					(scope === undefined) === (result.qualification.eligibility === 'referral')
				)
			case 'conditional':
				return effect === 'condition' || (effect === 'restriction' && scope !== undefined)
			case 'unrated':
				return effect === 'restriction' && scope !== undefined
			default:
				return false
		}
	}

	#decisionLine(decision: string): AccountLine {
		return buildAccountLine({
			role: 'step',
			decisive: true,
			text: this.#narrator.line('result.decision', {
				decision: this.#writeWord('decisions', decision),
			}),
		})
	}

	#determinationLine(
		definition: FamilyProgram,
		determination: FamilyFinding,
		faults: readonly AuditFault[],
	): AccountLine {
		const rule =
			determination.effect === 'notice'
				? undefined
				: definition.authority?.rules.find((entry) => entry.id === determination.id)
		const outcome = this.#writeFinding(determination, rule)
		const written = this.#writeScoped(
			this.#writeEffect(determination.effect, outcome),
			determination.scope,
			definition.rating?.lines ?? [],
		)
		return this.#findingLine(determination, rule, faults, written)
	}

	#programGuide(definition: FamilyProgram): readonly AccountLine[] {
		const lines = definition.rating?.lines ?? []
		return [
			this.#titleLine(definition),
			...(definition.notices ?? [])
				.filter(({ message }) => message.trim() !== '' && !this.#matchesSlot(message))
				.map((notice) => this.#noticeGuide(notice, lines)),
			...(definition.authority === undefined
				? []
				: this.#sectionLine(this.#describeRules(definition.authority), 'condition')),
			...this.#sectionLine(this.#qualificationGuide(definition.qualification, lines), 'condition'),
			...(definition.rating === undefined
				? []
				: this.#sectionLine(this.#ratingGuide(definition.rating), 'condition')),
		]
	}

	#noticeGuide(notice: FamilyNotice, lines: readonly FamilyLine[]): AccountLine {
		const { id, message, scope } = notice
		return buildAccountLine({
			role: 'condition',
			decisive: true,
			...this.#writeScoped(this.#writeEffect('notice', { text: message, gaps: [] }), scope, lines),
			source: { finding: id, ...(scope === undefined ? {} : { scope }) },
		})
	}

	// === The gaps

	#collectGaps(definition: FamilyDefinition): readonly GlossaryGap[] {
		if ('passes' in definition) return this.#qualificationGaps(definition, [])
		return 'lines' in definition ? this.#ratingGaps(definition) : this.#programGaps(definition)
	}

	#qualificationGaps(
		definition: FamilyQualification,
		lines: readonly FamilyLine[],
	): readonly GlossaryGap[] {
		const rulings = definition.rulings ?? []
		return [
			...collectNameGaps('definition', definition),
			...rulings.flatMap(({ scope }) =>
				scope === undefined ? [] : this.#writeScope(scope, lines).gaps,
			),
			...definition.passes.flatMap((pass) => {
				if (pass.reasoning === 'quantitative') {
					const field = ['qualification', pass.id]
					return [
						...collectNameGaps('pass', pass),
						...this.#partGaps(pass),
						...collectFieldGaps(field, true, this.#glossary, this.#units),
					]
				}
				const ruled = new Set(
					rulings.filter((ruling) => ruling.pass === pass.id).map((ruling) => ruling.rule),
				)
				return this.#ruleGaps(
					pass,
					pass.rules.filter((rule) => ruled.has(rule.id)),
				)
			}),
		]
	}

	#ratingGaps(definition: FamilyRating): readonly GlossaryGap[] {
		return [
			...collectNameGaps('definition', definition),
			...collectUnitGaps(findWord(this.#glossary.values, definition.id), this.#units),
			...definition.lines.flatMap((line) => [
				...collectNameGaps('line', line),
				...this.#partGaps(line.rate),
			]),
		]
	}

	#programGaps(definition: FamilyProgram): readonly GlossaryGap[] {
		const { authority, rating } = definition
		const lines = rating?.lines ?? []
		return [
			...collectNameGaps('definition', definition),
			...(definition.notices ?? []).flatMap(({ scope }) =>
				scope === undefined ? [] : this.#writeScope(scope, lines).gaps,
			),
			...(authority === undefined
				? []
				: [
						...collectNameGaps('definition', authority),
						...this.#ruleGaps(
							authority,
							authority.rules.filter((rule) => rule.enabled !== false),
						),
					]),
			...this.#qualificationGaps(definition.qualification, lines),
			...(rating === undefined ? [] : this.#ratingGaps(rating)),
		]
	}

	// The name of a worksheet's definition never prints, so it can't be missing.
	#partGaps(definition: QuantitativeDefinition | LogicalDefinition): readonly GlossaryGap[] {
		return collectGaps([definition], this.#glossary, this.#units).filter(
			(gap) => gap.part !== 'definition',
		)
	}

	// A guide's condition names the rules a derived key reads as, and a finding's reason prints the
	// key as a field, so both are needed. A disabled rule prints its name alone.
	#ruleGaps(definition: LogicalDefinition, rules: readonly Rule[]): readonly GlossaryGap[] {
		const guide = this.#describeRules(definition)
		return rules.flatMap((rule) =>
			rule.enabled === false
				? collectNameGaps('rule', rule)
				: [
						...this.#partGaps({ ...definition, rules: [this.#dropConclusion(rule)] }),
						...guide.filter((line) => line.source.rule === rule.id).flatMap((line) => line.gaps),
					],
		)
	}
}
