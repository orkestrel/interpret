import type { AuditFault, FieldPath } from '@orkestrel/contract'
import type {
	Check,
	CheckState,
	Definition,
	Expression,
	Factor,
	FactorGroup,
	FactorResult,
	GroupResult,
	LogicalDefinition,
	LogicalResult,
	QuantitativeDefinition,
	QuantitativeResult,
	ReasonResult,
	Rule,
	RuleResult,
} from '@orkestrel/reason'
import type {
	Account,
	AccountContext,
	AccountLine,
	AccountSource,
	AccountText,
	FrameName,
	Glossary,
	GlossaryGap,
	Lexicon,
	NarratorFormatter,
	NarratorInterface,
	NarratorOptions,
	RuleReason,
	WorksheetContext,
} from './types.js'
import {
	attempt,
	isArray,
	isBoolean,
	isFiniteNumber,
	isFunction,
	isNull,
	isNumber,
	isString,
	isSuccess,
	isUndefined,
	preview,
} from '@orkestrel/contract'
import { collectConcluders, combineStates, formatField, readClosedState } from '@orkestrel/reason'
import { fillTemplate } from '@orkestrel/template'
import { DEFAULT_FORMATS, TEXT_BREAK_PATTERN } from './constants.js'
import {
	buildAccountLine,
	collectFaultFields,
	collectFieldGaps,
	collectGaps,
	collectNameGaps,
	collectReasons,
	collectUnitGaps,
	findConditionRules,
	findDecidingOperands,
	findSoleExpression,
	findWord,
	matchesNumericCheck,
	renderName,
	renderReasons,
	resolveGlossary,
	resolveLexicon,
	resolveLocale,
} from './helpers.js'

/**
 * Implements a stateless rendering engine that writes a reasons run as a worded account, over
 * the general words it ships and the domain's words it is given.
 *
 * @remarks
 * The general words are a `Lexicon`, each overridable on its own. The domain's words are a
 * `Glossary`. The instance owns both from construction, so a later change to the caller's
 * object changes nothing. Construction throws `InterpretError` with code `LEXICON` or
 * `GLOSSARY` for malformed words, and no method throws afterwards.
 *
 * @example
 * ```ts
 * import { Narrator } from '@orkestrel/interpret'
 *
 * const narrator = new Narrator({
 * 	lexicon: { comparisons: { from: { fails: 'is below' } } },
 * 	glossary: {
 * 		labels: { cost: 'Cost' },
 * 		units: { cost: 'money' },
 * 		formats: { money: { style: 'currency', currency: 'USD' } },
 * 	},
 * })
 * narrator.label('cost') // 'Cost'
 * narrator.value('cost', 1250) // '$1,250.00'
 * narrator.phrase('comparisons', 'from') // 'is at least'
 * ```
 */
export class Narrator implements NarratorInterface {
	readonly #lexicon: Lexicon
	readonly #glossary: Glossary
	readonly #locale: string
	readonly #formatters: ReadonlyMap<string, NarratorFormatter>
	readonly #formats: ReadonlyMap<string, Intl.NumberFormat>
	readonly #plain: Intl.NumberFormat
	readonly #every: Intl.ListFormat
	readonly #either: Intl.ListFormat
	readonly #units: ReadonlySet<string>

	constructor(options?: NarratorOptions) {
		this.#lexicon = resolveLexicon(options?.lexicon)
		this.#glossary = resolveGlossary(options?.glossary)
		this.#locale = resolveLocale(options?.locale)
		this.#formatters = new Map(
			Object.entries(options?.formatters ?? {}).filter(([, formatter]) => isFunction(formatter)),
		)
		this.#formats = new Map(
			Object.entries({ ...DEFAULT_FORMATS, ...this.#glossary.formats }).map(([unit, format]) => [
				unit,
				new Intl.NumberFormat(this.#locale, format),
			]),
		)
		this.#plain = new Intl.NumberFormat(this.#locale, DEFAULT_FORMATS.plain)
		this.#every = new Intl.ListFormat(this.#locale, { type: 'conjunction' })
		this.#either = new Intl.ListFormat(this.#locale, { type: 'disjunction' })
		this.#units = new Set([...this.#formats.keys(), ...this.#formatters.keys()])
	}

	phrase(table: string, key: string, fallback?: string): string {
		const phrases = this.#glossary.phrases
		const supplied =
			phrases !== undefined && Object.hasOwn(phrases, table) ? phrases[table] : undefined
		return findWord(supplied ?? this.#findTable(table), key) ?? fallback ?? key
	}

	label(field: FieldPath): string {
		const key = formatField(field)
		const path = key.trim() === '' ? preview(key) : key
		return findWord(this.#glossary.labels, key) ?? path
	}

	value(field: FieldPath, raw: unknown): string {
		if (!isArray(raw)) return this.#writeScalar(field, raw)
		const entries = attempt(() =>
			Array.from(raw, (entry) =>
				isArray(entry) ? preview(entry) : this.#writeScalar(field, entry),
			),
		)
		if (!isSuccess(entries) || entries.value.length === 0) return preview(raw)
		return this.#every.format(entries.value)
	}

	line(id: string, values: Readonly<Record<string, unknown>>): string {
		const template =
			findWord(this.#glossary.templates, id) ?? findWord(this.#lexicon.frames, id) ?? ''
		const filled = attempt(() =>
			fillTemplate(template, values, { missing: 'empty', locale: this.#locale }),
		)
		return isSuccess(filled) ? filled.value : ''
	}

	describe(definition: Definition): Account {
		const named = this.#writeName('definition', definition)
		const aggregation =
			definition.reasoning === 'quantitative' ? [this.#aggregationLine(definition)] : []
		const title = buildAccountLine({
			role: 'verdict',
			decisive: true,
			...named,
			lines: [...this.#descriptionLines(definition.description), ...aggregation],
		})
		return {
			id: definition.id,
			name: named.text,
			lines: [title, ...this.#partLines(definition)],
		}
	}

	narrate(definition: Definition, result: ReasonResult): Account {
		return {
			id: definition.id,
			name: renderName(definition),
			success: result.success,
			lines: this.#resultLines(definition, result),
		}
	}

	audit(definitions: readonly Definition[]): readonly GlossaryGap[] {
		return collectGaps(definitions, this.#glossary, this.#units)
	}

	// Reads one of the lexicon's string tables by name; a comparison reads its holding wording.
	#findTable(table: string): Readonly<Record<string, string>> | undefined {
		switch (table) {
			case 'comparisons':
				return Object.fromEntries(
					Object.entries(this.#lexicon.comparisons).map(([key, phrase]) => [key, phrase.holds]),
				)
			case 'checks':
			case 'rules':
			case 'verdicts':
			case 'aggregations':
			case 'faults':
			case 'values':
			case 'joins':
			case 'frames':
				return this.#lexicon[table]
			default:
				return undefined
		}
	}

	// A blank string prints quoted, because a blank slot reads as a missing word.
	#writeScalar(field: FieldPath, raw: unknown): string {
		if (isString(raw)) return raw.trim() === '' ? preview(raw) : raw
		if (isNumber(raw)) {
			return this.#writeNumber(findWord(this.#glossary.units, formatField(field)), raw)
		}
		if (isBoolean(raw)) return raw ? this.#lexicon.values.true : this.#lexicon.values.false
		if (isNull(raw)) return this.#lexicon.values.null
		return isUndefined(raw) ? this.#lexicon.missing : preview(raw)
	}

	// A number that is not finite is no value, so it never prints.
	#writeNumber(unit: string | undefined, raw: number): string {
		if (!isFiniteNumber(raw)) return this.#lexicon.missing
		if (unit === undefined) return this.#plain.format(raw)
		const formatter = this.#formatters.get(unit)
		if (formatter !== undefined) {
			const written = attempt((): unknown => formatter(raw))
			if (
				isSuccess(written) &&
				isString(written.value) &&
				written.value.trim() !== '' &&
				!TEXT_BREAK_PATTERN.test(written.value)
			) {
				return written.value
			}
		}
		return (this.#formats.get(unit) ?? this.#plain).format(raw)
	}

	#writeName(
		part: NonNullable<GlossaryGap['part']>,
		named: { readonly id: string; readonly name: string },
	): AccountText {
		return { text: renderName(named), gaps: collectNameGaps(part, named) }
	}

	// Writes at most the lexicon's limit of reasons, then how many more there are.
	#writeReasons(reasons: readonly AccountText[]): AccountText {
		const shown = reasons.slice(0, this.#lexicon.limits.reasons)
		const more = reasons.length - shown.length
		const texts = shown.map((reason) => reason.text)
		const rest = more === 0 ? [] : [this.line('reason.more', { count: this.#plain.format(more) })]
		return {
			text: renderReasons([...texts, ...rest], this.#lexicon.joins),
			gaps: shown.flatMap((reason) => reason.gaps),
		}
	}

	#resultLines(definition: Definition, result: ReasonResult): readonly AccountLine[] {
		switch (result.reasoning) {
			case 'logical':
				return this.#logicalLines(definition, result)
			case 'quantitative':
				return this.#worksheetLines(definition, result)
			default: {
				const answer = result.success ? this.#writeAnswer(result) : undefined
				if (answer !== undefined) {
					return [buildAccountLine({ role: 'verdict', decisive: true, ...answer })]
				}
				const lines = result.faults.map((fault) => this.#faultLine(fault))
				return [this.#refusedLine(definition, lines, lines)]
			}
		}
	}

	#writeAnswer(
		result: Exclude<ReasonResult, LogicalResult | QuantitativeResult>,
	): AccountText | undefined {
		if (result.reasoning === 'inferential') {
			const count = this.#plain.format(result.derived.length)
			return { text: this.line('result.derived', { count }), gaps: [] }
		}
		const solutions = Object.entries(result.solutions)
		if (solutions.length === 0) return undefined
		return {
			text: this.#every.format(
				solutions.map(([target, value]) =>
					this.line('result.solution', {
						label: this.label(target),
						value: this.value(target, value),
					}),
				),
			),
			gaps: solutions.flatMap(([target]) =>
				collectFieldGaps(target, false, this.#glossary, this.#units),
			),
		}
	}

	// A refused run states no value, count, or solution: only the causes its evidence holds.
	#refusedLine(
		definition: Definition,
		reasons: readonly AccountText[],
		lines: readonly AccountLine[],
		state?: CheckState,
	): AccountLine {
		const named = this.#writeName('definition', definition)
		const cited = this.#writeReasons(reasons)
		const name = named.text
		return buildAccountLine({
			role: 'verdict',
			...(state === undefined ? {} : { state }),
			decisive: true,
			text: this.line('result.refused', { name }),
			...(reasons.length === 0
				? {}
				: { summary: this.line('result.because', { name, reasons: cited.text }) }),
			gaps: [...named.gaps, ...cited.gaps],
			lines,
		})
	}

	#faultLine(fault: AuditFault, source: AccountSource = {}): AccountLine {
		return buildAccountLine({
			role: 'reason',
			state: 'unread',
			decisive: true,
			...this.#writeUnread(fault.path, fault),
			source: { ...source, fault },
		})
	}

	// An unread value prints its label and what its fault makes it, or the word for no value.
	#writeUnread(field: FieldPath, fault?: AuditFault): AccountText {
		const missing =
			fault === undefined
				? this.#lexicon.missing
				: this.phrase('faults', fault.reason, this.#lexicon.missing)
		return {
			text: this.line('fact.unread', { label: this.label(field), missing }),
			gaps: this.#collectLabelGaps(field),
		}
	}

	#logicalLines(definition: Definition, result: LogicalResult): readonly AccountLine[] {
		const context = this.#readContext(definition, result)
		const seen = new Set<string>()
		const verdict = this.#verdictLine(definition, result, context, seen)
		// Written before the sections they follow, because the deciding lines nest first.
		const unread = this.#sectionLines(result, context, seen, 'unread')
		return [
			verdict,
			...(result.success ? [this.#countLine(result)] : []),
			...this.#sectionLines(result, context, seen, 'met'),
			...this.#sectionLines(result, context, seen, 'unmet'),
			...unread,
		]
	}

	#readContext(definition: Definition, result: LogicalResult): AccountContext {
		const rules =
			definition.reasoning === 'logical'
				? definition.rules.filter((rule) => rule.enabled !== false)
				: []
		const results = new Map(result.rules.map((rule) => [rule.id, rule]))
		return {
			rules: new Map(rules.map((rule) => [rule.id, rule])),
			results,
			concluders: collectConcluders(rules.filter((rule) => results.has(rule.id))),
			faults: result.faults,
		}
	}

	// The verdict is the last enabled rule's outcome under the definition's name. A run that rule
	// does not decide is refused, and names every rule and field left unread.
	#verdictLine(
		definition: Definition,
		result: LogicalResult,
		context: AccountContext,
		seen: Set<string>,
	): AccountLine {
		const last = result.rules.at(-1)
		const answered = last !== undefined && last.state === result.conclusion
		const reasons = answered ? this.#readReasons(last, context) : []
		if (result.success || (result.conclusion === 'unread' && reasons.length > 0)) {
			if (last !== undefined) seen.add(last.id)
			const named = this.#writeName('definition', definition)
			const word = this.#lexicon.verdicts[result.conclusion]
			return buildAccountLine({
				role: 'verdict',
				state: result.conclusion,
				decisive: true,
				...this.#writeOutcome(named, word, reasons, context),
				source: last === undefined ? {} : { rule: last.id },
				lines: this.#reasonLines(reasons, context, seen),
			})
		}
		const unread = result.rules.filter((rule) => rule.state === 'unread')
		const lines = unread.map((rule) => this.#ruleLine(rule, context, seen))
		const named = collectFaultFields(lines)
		const rest = result.faults
			.filter((fault) => !named.has(formatField(fault.path)))
			.map((fault) => this.#faultLine(fault))
		return this.#refusedLine(
			definition,
			[...unread.map((rule) => this.#writeRule(rule, context)), ...rest],
			[...lines, ...rest],
			result.conclusion,
		)
	}

	#countLine(result: LogicalResult): AccountLine {
		return buildAccountLine({
			role: 'step',
			text: this.line('result.count', {
				met: this.#plain.format(result.rules.filter((rule) => rule.state === 'met').length),
				total: this.#plain.format(result.rules.length),
			}),
		})
	}

	// A rule left unread decides the refusal it stands in, unless the verdict already stated it.
	#sectionLines(
		result: LogicalResult,
		context: AccountContext,
		seen: Set<string>,
		state: CheckState,
	): readonly AccountLine[] {
		return result.rules
			.filter((rule) => rule.state === state)
			.map((rule) => {
				const decisive = state === 'unread' && !seen.has(rule.id)
				return { ...this.#ruleLine(rule, context, seen), decisive }
			})
	}

	// Nests a rule's reasons once per account, so a cycle of rules ends, a chain of them stays
	// linear, and no fact prints twice.
	#ruleLine(
		rule: RuleResult,
		context: AccountContext,
		seen: Set<string>,
		reason?: RuleReason,
	): AccountLine {
		const reasons = this.#readReasons(rule, context)
		const nested = seen.has(rule.id) ? [] : reasons
		seen.add(rule.id)
		const word = this.#lexicon.rules[rule.state]
		return buildAccountLine({
			role: 'reason',
			state: rule.state,
			decisive: true,
			...this.#writeOutcome(this.#writeRuleName(rule, context), word, reasons, context),
			source: { rule: rule.id, ...reason },
			lines: this.#reasonLines(nested, context, seen),
		})
	}

	#readReasons(rule: RuleResult, context: AccountContext): readonly RuleReason[] {
		const authored = context.rules.get(rule.id)
		return authored === undefined ? [] : collectReasons(authored, rule)
	}

	#writeRuleName(rule: RuleResult, context: AccountContext): AccountText {
		return this.#writeName('rule', context.rules.get(rule.id) ?? { id: rule.id, name: rule.id })
	}

	// Writes an outcome alone, and with its reasons.
	#writeOutcome(
		named: AccountText,
		verdict: string,
		reasons: readonly RuleReason[],
		context: AccountContext,
	): AccountText & { readonly summary: string } {
		const name = named.text
		const text = this.line('rule.settled', { name, verdict })
		if (reasons.length === 0) return { text, summary: text, gaps: named.gaps }
		const cited = this.#writeReasons(
			reasons.flatMap((reason) => this.#writeReason(reason, context)),
		)
		return {
			text,
			summary: this.line('rule.because', { name, verdict, reasons: cited.text }),
			gaps: [...named.gaps, ...cited.gaps],
		}
	}

	#writeReason(reason: RuleReason, context: AccountContext): readonly AccountText[] {
		const concluding = this.#findConcluding(reason, context)
		return concluding.length === 0
			? [this.#writeFact(reason, context.faults)]
			: concluding.map((rule) => this.#writeRule(rule, context))
	}

	// Writes a rule's outcome with its own facts in parentheses, one level deep.
	#writeRule(rule: RuleResult, context: AccountContext): AccountText {
		const named = this.#writeRuleName(rule, context)
		const verdict = this.#lexicon.rules[rule.state]
		const facts = this.#readReasons(rule, context).flatMap((reason) => {
			const concluding = this.#findConcluding(reason, context)
			return concluding.length === 0
				? [this.#writeFact(reason, context.faults)]
				: concluding.map((entry) => this.#writeSettled(entry, context))
		})
		if (facts.length === 0) return this.#writeSettled(rule, context)
		const cited = this.#writeReasons(facts)
		return {
			text: this.line('reason.rule', { name: named.text, verdict, reasons: cited.text }),
			gaps: [...named.gaps, ...cited.gaps],
		}
	}

	#writeSettled(rule: RuleResult, context: AccountContext): AccountText {
		const named = this.#writeRuleName(rule, context)
		return {
			text: this.line('rule.settled', {
				name: named.text,
				verdict: this.#lexicon.rules[rule.state],
			}),
			gaps: named.gaps,
		}
	}

	// A chain of rules too long for the stack keeps the lines it could nest.
	#reasonLines(
		reasons: readonly RuleReason[],
		context: AccountContext,
		seen: Set<string>,
	): readonly AccountLine[] {
		const lines = attempt(() =>
			reasons.flatMap((reason) => {
				const concluding = this.#findConcluding(reason, context)
				return concluding.length === 0
					? [this.#factLine(reason, context.faults)]
					: concluding.map((rule) => this.#ruleLine(rule, context, seen, reason))
			}),
		)
		return isSuccess(lines) ? lines.value : []
	}

	#factLine(
		reason: RuleReason,
		faults: readonly AuditFault[],
		source: AccountSource = {},
	): AccountLine {
		const fault = this.#findFault(reason, faults)
		return buildAccountLine({
			role: 'reason',
			state: reason.result.state,
			decisive: true,
			...this.#writeFact(reason, faults),
			source: { ...source, ...reason, ...(fault === undefined ? {} : { fault }) },
		})
	}

	#findFault({ check, result }: RuleReason, faults: readonly AuditFault[]): AuditFault | undefined {
		return result.state === 'unread'
			? faults.find((fault) => formatField(fault.path) === formatField(check.field))
			: undefined
	}

	// The rules that fixed a derived key: the first that concluded it, or every one that did not.
	#findConcluding(reason: RuleReason, context: AccountContext): readonly RuleResult[] {
		const key = formatField(reason.check.field)
		const concluding = (context.concluders.get(key) ?? []).flatMap((rule) => {
			const read = context.results.get(rule.id)
			return read === undefined ? [] : [read]
		})
		const met = concluding.find((rule) => rule.state === 'met')
		if (met !== undefined) return [met]
		const unread = concluding.filter((rule) => rule.state === 'unread')
		return reason.result.state === 'unread' && unread.length > 0 ? unread : concluding
	}

	// States one check as a true sentence about its field, whichever way it read.
	#writeFact(reason: RuleReason, faults: readonly AuditFault[]): AccountText {
		const { check, result } = reason
		const { field, operator } = check
		if (result.state === 'unread') return this.#writeUnread(field, this.#findFault(reason, faults))
		const actual = this.value(field, result.actual)
		const holds = result.state === 'met'
		// A boolean's value says both what it is and what it is not.
		const said = isBoolean(result.actual) || holds === (operator === 'equals')
		if ((operator === 'equals' || operator === 'not') && said) {
			const text = this.line('fact.equal', { label: this.label(field), actual })
			return { text, gaps: this.#collectCheckGaps(check) }
		}
		return this.#writeCheck(check, holds, 'fact', { actual })
	}

	// Writes a check in its holding or failing words, as a fact or as a condition.
	#writeCheck(
		check: Check,
		holds: boolean,
		frame: 'fact' | 'condition',
		slots: Readonly<Record<string, string>>,
	): AccountText {
		const { field, operator, value: expected } = check
		const gaps = this.#collectCheckGaps(check)
		const phrase = this.#lexicon.comparisons[operator]
		const values = {
			...slots,
			label: this.label(field),
			comparison: holds ? phrase.holds : phrase.fails,
		}
		if (
			isArray(expected) &&
			(operator === 'any' || operator === 'none') &&
			(expected.length === 0 || expected.length > this.#lexicon.limits.list)
		) {
			const count = this.#plain.format(expected.length)
			return { text: this.line(`${frame}.listed`, { ...values, count }), gaps }
		}
		return {
			text: this.line(`${frame}.compared`, { ...values, expected: this.#writeExpected(check) }),
			gaps,
		}
	}

	#writeExpected({ field, operator, value: expected }: Check): string {
		if (!isArray(expected) || (operator !== 'between' && operator !== 'outside')) {
			return this.value(field, expected)
		}
		const [minimum, maximum] = expected
		return this.line('value.range', {
			minimum: this.value(field, minimum),
			maximum: this.value(field, maximum),
		})
	}

	#collectCheckGaps(check: Check): readonly GlossaryGap[] {
		return collectFieldGaps(check.field, matchesNumericCheck(check), this.#glossary, this.#units)
	}

	// Only the label prints, so only the label can be missing.
	#collectLabelGaps(field: FieldPath): readonly GlossaryGap[] {
		return collectFieldGaps(field, false, this.#glossary, this.#units).filter(
			(gap) => gap.word === 'label',
		)
	}

	#worksheetLines(definition: Definition, result: QuantitativeResult): readonly AccountLine[] {
		const authored = definition.reasoning === 'quantitative' ? definition : undefined
		const unit = findWord(this.#glossary.values, definition.id)
		const context: WorksheetContext = {
			groups: new Map((authored?.groups ?? []).map((group) => [group.id, group])),
			faults: result.faults,
			stated: result.success && isFiniteNumber(result.value),
			unit: authored?.aggregation === 'product' ? undefined : unit,
		}
		const groups = result.groups.map((group) => this.#groupLine(group, context))
		if (!context.stated) return [this.#causeLine(definition, result, context), ...groups]
		const named = this.#writeName('definition', definition)
		const value = this.#writeNumber(unit, result.value)
		const gaps = collectUnitGaps(unit, this.#units)
		const verdict = buildAccountLine({
			role: 'verdict',
			decisive: true,
			text: this.line('result.value', { name: named.text, value }),
			gaps: [...named.gaps, ...gaps],
		})
		return [verdict, ...groups, ...this.#totalLines(authored, value, gaps)]
	}

	// The total prints only where the aggregation alone gives the value, because a bound or a base
	// beside an average, say, would make its name false.
	#totalLines(
		definition: QuantitativeDefinition | undefined,
		value: string,
		gaps: readonly GlossaryGap[],
	): readonly AccountLine[] {
		if (definition === undefined || definition.bounds !== undefined) return []
		const { aggregation, base } = definition
		if (aggregation !== 'sum' && base !== undefined && base !== 0) return []
		const word = this.#lexicon.aggregations[aggregation]
		return [
			buildAccountLine({
				role: 'step',
				decisive: true,
				text: this.line('worksheet.total', { aggregation: word, value }),
				gaps,
			}),
		]
	}

	// The refusal names each factor the run could not go without, and each field left unread.
	#causeLine(
		definition: Definition,
		result: QuantitativeResult,
		context: WorksheetContext,
	): AccountLine {
		const causes = result.groups.flatMap((group) =>
			group.factors
				.filter((factor) => this.#matchesCause(group, factor, context))
				.map((factor) => this.#factorLine(group, factor, context, true)),
		)
		const named = collectFaultFields(causes)
		const rest = result.faults
			.filter((fault) => !named.has(formatField(fault.path)))
			.map((fault) => this.#faultLine(fault))
		return this.#refusedLine(
			definition,
			[...causes.map((cause) => this.#writeCause(cause)), ...rest],
			[...causes, ...rest],
		)
	}

	#matchesCause(group: GroupResult, factor: FactorResult, context: WorksheetContext): boolean {
		if (factor.applied) return false
		if (factor.checks === undefined) return true
		const gate = combineStates(
			'and',
			factor.checks.map((check) => check.state),
		)
		return gate === 'unread' || this.#findFactor(group, factor, context)?.required === true
	}

	#writeCause(line: AccountLine): AccountText {
		if (line.lines.length === 0) return line
		const cited = this.#writeReasons(line.lines)
		return {
			text: this.line('reason.step', { outcome: line.text, reasons: cited.text }),
			gaps: [...line.gaps, ...cited.gaps],
		}
	}

	#findFactor(
		group: GroupResult,
		factor: FactorResult,
		context: WorksheetContext,
	): Factor | undefined {
		return context.groups.get(group.id)?.factors.find((entry) => entry.id === factor.id)
	}

	#groupLine(group: GroupResult, context: WorksheetContext): AccountLine {
		const authored = context.groups.get(group.id)
		const named = this.#writeName('group', authored ?? { id: group.id, name: group.id })
		const stated = context.stated && group.applied
		return buildAccountLine({
			role: 'step',
			decisive: stated,
			...this.#writeStep('worksheet.group', named, group, stated, context.unit),
			source: { group: group.id },
			lines: group.factors.map((factor) =>
				this.#factorLine(
					group,
					factor,
					{
						...context,
						stated: context.stated && (group.applied || !factor.applied),
						unit: authored?.aggregation === 'product' ? undefined : context.unit,
					},
					context.stated,
				),
			),
		})
	}

	// A step that applied states its number where one is an answer, and one that did not states none.
	#writeStep(
		frame: FrameName,
		named: AccountText,
		step: { readonly applied: boolean; readonly value: number },
		stated: boolean,
		unit: string | undefined,
	): AccountText {
		const name = named.text
		if (!step.applied) return { text: this.line('worksheet.unapplied', { name }), gaps: named.gaps }
		if (!stated || !isFiniteNumber(step.value)) {
			return { text: this.line('worksheet.applied', { name }), gaps: named.gaps }
		}
		return {
			text: this.line(frame, { name, value: this.#writeNumber(unit, step.value) }),
			gaps: [...named.gaps, ...collectUnitGaps(unit, this.#units)],
		}
	}

	#factorLine(
		group: GroupResult,
		factor: FactorResult,
		context: WorksheetContext,
		nested: boolean,
	): AccountLine {
		const authored = this.#findFactor(group, factor, context)
		const named = this.#writeName('factor', authored ?? { id: factor.id, name: factor.id })
		const source = { group: group.id, factor: factor.id }
		const lines =
			!nested || authored === undefined || (factor.applied && !context.stated)
				? []
				: this.#evidenceLines(authored, factor, context, source)
		const step = this.#writeStep('worksheet.factor', named, factor, context.stated, context.unit)
		if (factor.applied) {
			return buildAccountLine({ role: 'step', decisive: context.stated, ...step, source, lines })
		}
		const name = named.text
		const cited = this.#writeReasons(lines)
		const gated = factor.checks !== undefined
		const text = gated ? step.text : this.line('worksheet.empty', { name })
		const summary = gated
			? this.line('worksheet.blocked', { name, reasons: cited.text })
			: this.line('reason.step', { outcome: text, reasons: cited.text })
		return buildAccountLine({
			role: 'step',
			decisive: nested && !context.stated,
			text,
			...(lines.length === 0 ? {} : { summary }),
			source,
			gaps: [...named.gaps, ...cited.gaps],
			lines,
		})
	}

	// What a factor's outcome was written from: the checks that gated it, the field its source
	// could not read, or where its number came from.
	#evidenceLines(
		factor: Factor,
		result: FactorResult,
		context: WorksheetContext,
		source: AccountSource,
	): readonly AccountLine[] {
		if (result.checks !== undefined) {
			const checks = factor.checks ?? []
			const reasons = result.checks.flatMap((read, index) => {
				const check = checks[index]
				return check !== undefined && formatField(check.field) === formatField(read.field)
					? [{ check, result: read }]
					: []
			})
			if (reasons.length !== checks.length) return []
			const states = reasons.map((reason) => reason.result.state)
			return findDecidingOperands('and', states).flatMap((index) => {
				const reason = reasons[index]
				return reason === undefined ? [] : [this.#factLine(reason, context.faults, source)]
			})
		}
		const origin = factor.source
		const fault =
			origin.origin === 'static' || result.raw !== undefined
				? undefined
				: context.faults.find((entry) => formatField(entry.path) === formatField(origin.field))
		if (fault !== undefined) return [this.#faultLine(fault, source)]
		// A factor with no value says where it looked, and states no number.
		if (!result.applied && origin.origin === 'static') return []
		const read = result.applied ? result : undefined
		return this.#writeSource(factor, context.unit, read).map((entry) =>
			buildAccountLine({ role: 'reason', decisive: true, ...entry, source }),
		)
	}

	// States where a factor's number comes from, and the number itself before its changes.
	#writeSource(
		factor: Factor,
		unit: string | undefined,
		result?: FactorResult,
	): readonly AccountText[] {
		const { source } = factor
		const raw = result?.raw
		if (source.origin === 'static') {
			if (!isFiniteNumber(source.value)) return []
			const changed = factor.transforms !== undefined || factor.bounds !== undefined
			const value = this.#writeNumber(changed ? undefined : unit, source.value)
			return [{ text: this.line('source.static', { value }), gaps: [] }]
		}
		const label = this.label(source.field)
		const gaps = this.#collectLabelGaps(source.field)
		if (source.origin === 'field') {
			if (raw === undefined) return [{ text: this.line('source.field', { label }), gaps }]
			return [
				{
					text: this.line('fact.equal', { label, actual: this.value(source.field, raw) }),
					gaps: collectFieldGaps(source.field, true, this.#glossary, this.#units),
				},
			]
		}
		const entries =
			source.origin === 'lookup'
				? Object.values(source.table)
				: source.ranges.map((range) => range.value)
		const missed = raw !== undefined && raw === factor.fallback && !entries.includes(raw)
		const frame: FrameName = missed ? 'source.fallback' : `source.${source.origin}`
		const chosen = { text: this.line(frame, { label }), gaps }
		if (raw === undefined || raw === result?.value || !isFiniteNumber(raw)) return [chosen]
		const value = this.#writeNumber(undefined, raw)
		return [chosen, { text: this.line('worksheet.raw', { value }), gaps: [] }]
	}

	#partLines(definition: Definition): readonly AccountLine[] {
		switch (definition.reasoning) {
			case 'logical':
				return this.#ruleGuide(definition)
			case 'quantitative':
				return definition.groups
					.filter((group) => group.enabled !== false)
					.map((group) => this.#groupGuide(group, definition))
			case 'symbolic':
				return definition.equations.map((equation) =>
					this.#partLine(this.#writeName('equation', equation), {}, equation.description, [
						buildAccountLine({
							role: 'condition',
							decisive: true,
							text: this.line('equation.target', { label: this.label(equation.target) }),
							gaps: this.#collectLabelGaps(equation.target),
						}),
					]),
				)
			case 'inferential':
				return definition.inferences
					.filter((inference) => inference.enabled !== false)
					.map((inference) =>
						this.#partLine(this.#writeName('inference', inference), {}, inference.description, []),
					)
		}
	}

	#partLine(
		named: AccountText,
		source: AccountSource,
		description: string | undefined,
		lines: readonly AccountLine[],
		summary = named.text,
	): AccountLine {
		return buildAccountLine({
			role: 'condition',
			decisive: true,
			...named,
			summary,
			source,
			lines: [...this.#descriptionLines(description), ...lines],
		})
	}

	#descriptionLines(description: string | undefined): readonly AccountLine[] {
		return description === undefined || description.trim() === ''
			? []
			: [buildAccountLine({ role: 'condition', text: description })]
	}

	#aggregationLine(aggregated: FactorGroup | QuantitativeDefinition): AccountLine {
		const aggregation = this.#lexicon.aggregations[aggregated.aggregation]
		return buildAccountLine({
			role: 'condition',
			decisive: true,
			text: this.line('group.aggregation', { aggregation }),
		})
	}

	#ruleGuide(definition: LogicalDefinition): readonly AccountLine[] {
		const rules = definition.rules.filter((rule) => rule.enabled !== false)
		const concluders = collectConcluders(rules)
		return rules.map((rule) => {
			const source = { rule: rule.id }
			const named = this.#writeName('rule', rule)
			const lines = this.#conditionLines('rule.condition', named, rule.premises, concluders, source)
			return this.#partLine(named, source, rule.description, lines, lines[0]?.text)
		})
	}

	#groupGuide(group: FactorGroup, definition: QuantitativeDefinition): AccountLine {
		const unit =
			definition.aggregation === 'product' || group.aggregation === 'product'
				? undefined
				: findWord(this.#glossary.values, definition.id)
		const factors = group.factors
			.filter((factor) => factor.enabled !== false)
			.map((factor) => this.#factorGuide(factor, group, unit))
		return this.#partLine(this.#writeName('group', group), { group: group.id }, group.description, [
			this.#aggregationLine(group),
			...factors,
		])
	}

	#factorGuide(factor: Factor, group: FactorGroup, unit: string | undefined): AccountLine {
		const source = { group: group.id, factor: factor.id }
		const named = this.#writeName('factor', factor)
		const origin = this.#writeSource(factor, unit).map((entry) =>
			buildAccountLine({ role: 'condition', decisive: true, ...entry, source }),
		)
		const checks = (factor.checks ?? []).map((check): Expression => ({ form: 'atom', check }))
		const gate = this.#conditionLines('factor.condition', named, checks, new Map(), source)
		return this.#partLine(named, source, factor.description, [...origin, ...gate])
	}

	// A tree too deep to walk has no condition to print.
	#conditionLines(
		frame: FrameName,
		named: AccountText,
		premises: readonly Expression[],
		concluders: ReadonlyMap<string, readonly Rule[]>,
		source: AccountSource,
	): readonly AccountLine[] {
		if (premises.length === 0) return []
		const every: Expression = { form: 'compound', operator: 'and', operands: premises }
		const written = attempt(() => this.#writeCondition(every, false, concluders))
		if (!isSuccess(written)) return []
		const condition = written.value.text
		return [
			buildAccountLine({
				role: 'condition',
				decisive: true,
				text: this.line(frame, { name: named.text, condition }),
				source,
				gaps: written.value.gaps,
			}),
		]
	}

	// Writes an expression as a condition, parenthesized where it stands inside another.
	#writeCondition(
		expression: Expression,
		inner: boolean,
		concluders: ReadonlyMap<string, readonly Rule[]>,
	): AccountText {
		const sole = findSoleExpression(expression)
		if (sole.form === 'atom') return this.#writeAtom(sole.check, true, inner, concluders)
		const { operator, operands } = sole
		if (operator === 'not') return this.#writeNegation(operands, inner, concluders)
		const parts = operands.map((operand) => this.#writeCondition(operand, true, concluders))
		const [first, second] = parts
		const gaps = parts.flatMap((part) => part.gaps)
		if (operator === 'and' || operator === 'or') {
			const list = operator === 'and' ? this.#every : this.#either
			return this.#writeGroup(list.format(parts.map((part) => part.text)), gaps, inner)
		}
		if (first === undefined || second === undefined || parts.length !== 2) {
			return { text: this.#lexicon.missing, gaps }
		}
		const slots = { first: first.text, second: second.text }
		return this.#writeGroup(this.line(`condition.${operator}`, slots), gaps, inner)
	}

	#writeGroup(condition: string, gaps: readonly GlossaryGap[], inner: boolean): AccountText {
		return { text: inner ? this.line('condition.group', { condition }) : condition, gaps }
	}

	// Under `not`, a check takes its failing words and a second `not` cancels the first.
	#writeNegation(
		operands: readonly Expression[],
		inner: boolean,
		concluders: ReadonlyMap<string, readonly Rule[]>,
	): AccountText {
		const [operand] = operands
		if (operand === undefined || operands.length !== 1) {
			return { text: this.#lexicon.missing, gaps: [] }
		}
		const sole = findSoleExpression(operand)
		if (sole.form === 'atom') return this.#writeAtom(sole.check, false, inner, concluders)
		const [twice, ...rest] = sole.operands
		if (sole.operator === 'not' && twice !== undefined && rest.length === 0) {
			return this.#writeCondition(twice, inner, concluders)
		}
		const written = this.#writeCondition(sole, false, concluders)
		return {
			text: this.line('condition.not', { condition: written.text }),
			gaps: written.gaps,
		}
	}

	// A conclusion key reads as the rules that bear on it; any other check as its own words.
	#writeAtom(
		check: Check,
		holds: boolean,
		inner: boolean,
		concluders: ReadonlyMap<string, readonly Rule[]>,
	): AccountText {
		const rules = findConditionRules(check, concluders)
		const { field, operator, value: expected } = check
		if (rules.length === 0) {
			if ((operator === 'equals' && holds) || (operator === 'not' && !holds)) {
				const slots = { label: this.label(field), expected: this.value(field, expected) }
				return {
					text: this.line('condition.equal', slots),
					gaps: this.#collectCheckGaps(check),
				}
			}
			return this.#writeCheck(check, holds, 'condition', {})
		}
		const applies = holds === (readClosedState(operator) !== 'met')
		const verdict = this.#lexicon.rules[applies ? 'met' : 'unmet']
		const named = rules.map((rule) => this.#writeName('rule', rule))
		const texts = named.map(({ text: name }) => this.line('rule.settled', { name, verdict }))
		const list = applies ? this.#either : this.#every
		return this.#writeGroup(
			list.format(texts),
			named.flatMap((entry) => entry.gaps),
			inner && rules.length > 1,
		)
	}
}
