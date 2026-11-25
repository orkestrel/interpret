import type { AuditFault, FieldPath } from '@orkestrel/contract'
import type {
	Check,
	CheckState,
	Definition,
	LogicalResult,
	ReasonResult,
	RuleResult,
} from '@orkestrel/reason'
import type {
	Account,
	AccountContext,
	AccountLine,
	AccountSource,
	AccountText,
	Glossary,
	GlossaryGap,
	Lexicon,
	NarratorFormatter,
	NarratorInterface,
	NarratorOptions,
	RuleReason,
} from './types.js'
import {
	attempt,
	isArray,
	isBoolean,
	isFunction,
	isNull,
	isNumber,
	isString,
	isSuccess,
	isUndefined,
	preview,
} from '@orkestrel/contract'
import { collectConcluders, formatField } from '@orkestrel/reason'
import { fillTemplate } from '@orkestrel/template'
import { DEFAULT_FORMATS, TEXT_BREAK_PATTERN } from './constants.js'
import {
	collectFieldGaps,
	collectGaps,
	collectNameGaps,
	collectReasons,
	collectUnitGaps,
	findWord,
	matchesNumericCheck,
	normalizeAccountLine,
	renderName,
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
	readonly #list: Intl.ListFormat
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
		this.#list = new Intl.ListFormat(this.#locale, { type: 'conjunction' })
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
		return this.#list.format(entries.value)
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
		const title = normalizeAccountLine({
			role: 'verdict',
			decisive: true,
			...named,
			source: {},
			lines: [],
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
			lines:
				result.reasoning === 'logical'
					? this.#logicalLines(definition, result)
					: [
							result.success
								? this.#answerLine(definition, result)
								: this.#refusedLine(definition, result),
						],
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
			case 'connectives':
			case 'aggregations':
			case 'faults':
			case 'values':
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

	#writeNumber(unit: string | undefined, raw: number): string {
		if (Number.isNaN(raw)) return this.#lexicon.missing
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

	#partLines(definition: Definition): readonly AccountLine[] {
		switch (definition.reasoning) {
			case 'logical':
				return definition.rules
					.filter((rule) => rule.enabled !== false)
					.map((rule) => this.#partLine(this.#writeName('rule', rule), { rule: rule.id }))
			case 'quantitative':
				return definition.groups
					.filter((group) => group.enabled !== false)
					.map((group) => ({
						...this.#partLine(this.#writeName('group', group), { group: group.id }),
						lines: group.factors
							.filter((factor) => factor.enabled !== false)
							.map((factor) =>
								this.#partLine(this.#writeName('factor', factor), {
									group: group.id,
									factor: factor.id,
								}),
							),
					}))
			case 'symbolic':
				return definition.equations.map((equation) =>
					this.#partLine(this.#writeName('equation', equation), {}),
				)
			case 'inferential':
				return definition.inferences
					.filter((inference) => inference.enabled !== false)
					.map((inference) => this.#partLine(this.#writeName('inference', inference), {}))
		}
	}

	#partLine(named: AccountText, source: AccountSource): AccountLine {
		return normalizeAccountLine({
			role: 'condition',
			decisive: false,
			...named,
			source,
			lines: [],
		})
	}

	// A refused run states no value, count, or solution: only the fields it did not read.
	#refusedLine(definition: Definition, result: ReasonResult): AccountLine {
		const named = this.#writeName('definition', definition)
		return normalizeAccountLine({
			role: 'verdict',
			...(result.reasoning === 'logical' ? { state: result.conclusion } : {}),
			decisive: true,
			text: this.line('result.refused', { name: named.text }),
			source: {},
			gaps: named.gaps,
			lines: result.faults.map((fault) => this.#faultLine(fault)),
		})
	}

	#faultLine(fault: AuditFault): AccountLine {
		return normalizeAccountLine({
			role: 'reason',
			state: 'unread',
			decisive: true,
			text: this.line('fact.unread', {
				label: this.label(fault.path),
				missing: this.phrase('faults', fault.reason, this.#lexicon.missing),
			}),
			source: { fault },
			gaps: this.#collectLabelGaps(fault.path),
			lines: [],
		})
	}

	// The one line of a run that reasons without rules and answered.
	#answerLine(definition: Definition, result: Exclude<ReasonResult, LogicalResult>): AccountLine {
		const answer = this.#writeAnswer(definition, result)
		if (answer === undefined) return this.#refusedLine(definition, result)
		return normalizeAccountLine({
			role: 'verdict',
			decisive: true,
			...answer,
			source: {},
			lines: [],
		})
	}

	#writeAnswer(
		definition: Definition,
		result: Exclude<ReasonResult, LogicalResult>,
	): AccountText | undefined {
		switch (result.reasoning) {
			case 'quantitative': {
				const named = this.#writeName('definition', definition)
				const unit = findWord(this.#glossary.values, definition.id)
				return {
					text: this.line('result.value', {
						name: named.text,
						value: this.#writeNumber(unit, result.value),
					}),
					gaps: [...named.gaps, ...collectUnitGaps(unit, this.#units)],
				}
			}
			case 'symbolic': {
				const solutions = Object.entries(result.solutions)
				if (solutions.length === 0) return undefined
				return {
					text: this.#list.format(
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
			case 'inferential':
				return {
					text: this.line('result.derived', {
						count: this.#plain.format(result.derived.length),
					}),
					gaps: [],
				}
		}
	}

	#logicalLines(definition: Definition, result: LogicalResult): readonly AccountLine[] {
		const context = this.#readContext(definition, result)
		const seen = new Set<string>()
		const verdict = result.success
			? this.#verdictLine(definition, result, context, seen)
			: this.#refusedLine(definition, result)
		// Written before the sections they follow, because the deciding lines chase first.
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

	// The verdict is the last enabled rule's line, under the definition's name.
	#verdictLine(
		definition: Definition,
		result: LogicalResult,
		context: AccountContext,
		seen: Set<string>,
	): AccountLine {
		const last = result.rules.at(-1)
		const answered = last !== undefined && last.state === result.conclusion
		const reasons = answered ? this.#readReasons(last, context) : []
		if (last !== undefined) seen.add(last.id)
		return normalizeAccountLine({
			role: 'verdict',
			state: result.conclusion,
			decisive: true,
			...this.#writeSettled(
				this.#writeName('definition', definition),
				result.conclusion,
				reasons,
				context,
			),
			source: last === undefined ? {} : { rule: last.id },
			lines: this.#reasonLines(reasons, context, seen),
		})
	}

	#countLine(result: LogicalResult): AccountLine {
		return normalizeAccountLine({
			role: 'step',
			decisive: false,
			text: this.line('result.count', {
				met: this.#plain.format(result.rules.filter((rule) => rule.state === 'met').length),
				total: this.#plain.format(result.rules.length),
			}),
			source: {},
			gaps: [],
			lines: [],
		})
	}

	// An unread rule decides the refusal it stands in, so it renders with the deciding lines.
	#sectionLines(
		result: LogicalResult,
		context: AccountContext,
		seen: Set<string>,
		state: CheckState,
	): readonly AccountLine[] {
		return result.rules
			.filter((rule) => rule.state === state)
			.map((rule) => ({
				...this.#ruleLine(rule, this.#readReasons(rule, context), context, seen),
				decisive: state === 'unread',
			}))
	}

	#ruleLine(
		rule: RuleResult,
		reasons: readonly RuleReason[],
		context: AccountContext,
		seen: Set<string>,
		reason?: RuleReason,
	): AccountLine {
		seen.add(rule.id)
		return normalizeAccountLine({
			role: 'reason',
			state: rule.state,
			decisive: true,
			...this.#writeSettled(this.#writeRuleName(rule, context), rule.state, reasons, context),
			source: { rule: rule.id, ...reason },
			lines: this.#reasonLines(reasons, context, seen),
		})
	}

	// Chases a rule once per account: a rule stated earlier in it nests nothing again, so a cycle
	// of rules ends and a chain of them stays linear.
	#chaseLine(
		rule: RuleResult,
		context: AccountContext,
		seen: Set<string>,
		reason: RuleReason,
	): AccountLine {
		const reasons = seen.has(rule.id) ? [] : this.#readReasons(rule, context)
		return this.#ruleLine(rule, reasons, context, seen, reason)
	}

	#readReasons(rule: RuleResult, context: AccountContext): readonly RuleReason[] {
		const authored = context.rules.get(rule.id)
		return authored === undefined ? [] : collectReasons(authored, rule)
	}

	#writeRuleName(rule: RuleResult, context: AccountContext): AccountText {
		return this.#writeName('rule', context.rules.get(rule.id) ?? { id: rule.id, name: rule.id })
	}

	#writeSettled(
		named: AccountText,
		state: CheckState,
		reasons: readonly RuleReason[],
		context: AccountContext,
	): AccountText {
		const name = named.text
		const verdict = this.#lexicon.rules[state]
		const cited = reasons.flatMap((reason) => this.#writeReason(reason, context))
		if (cited.length === 0) {
			return { text: this.line('rule.settled', { name, verdict }), gaps: named.gaps }
		}
		return {
			text: this.line('rule.because', {
				name,
				verdict,
				reasons: this.#list.format(cited.map((entry) => entry.text)),
			}),
			gaps: [...named.gaps, ...cited.flatMap((entry) => entry.gaps)],
		}
	}

	// A reason under a derived key is the concluding rule's name and state; any other is a fact.
	#writeReason(reason: RuleReason, context: AccountContext): readonly AccountText[] {
		const concluding = this.#findConcluding(reason, context)
		if (concluding.length === 0) return [this.#writeFact(reason)]
		return concluding.map((rule) =>
			this.#writeSettled(this.#writeRuleName(rule, context), rule.state, [], context),
		)
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
					? [this.#factLine(reason, context)]
					: concluding.map((rule) => this.#chaseLine(rule, context, seen, reason))
			}),
		)
		return isSuccess(lines) ? lines.value : []
	}

	#factLine(reason: RuleReason, context: AccountContext): AccountLine {
		const { check, result } = reason
		const fault =
			result.state === 'unread'
				? context.faults.find((entry) => formatField(entry.path) === formatField(check.field))
				: undefined
		return normalizeAccountLine({
			role: 'reason',
			state: result.state,
			decisive: true,
			...this.#writeFact(reason),
			source: { check, result, ...(fault === undefined ? {} : { fault }) },
			lines: [],
		})
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
	#writeFact({ check, result }: RuleReason): AccountText {
		const { field, operator, value: expected } = check
		const label = this.label(field)
		if (result.state === 'unread') {
			return {
				text: this.line('fact.unread', { label, missing: this.#lexicon.missing }),
				gaps: this.#collectLabelGaps(field),
			}
		}
		const gaps = collectFieldGaps(field, matchesNumericCheck(check), this.#glossary, this.#units)
		const actual = this.value(field, result.actual)
		const holds = result.state === 'met'
		// A boolean's value says both what it is and what it is not.
		const said = isBoolean(result.actual) || holds === (operator === 'equals')
		if ((operator === 'equals' || operator === 'not') && said) {
			return { text: this.line('fact.equal', { label, actual }), gaps }
		}
		const phrase = this.#lexicon.comparisons[operator]
		const comparison = holds ? phrase.holds : phrase.fails
		if (
			isArray(expected) &&
			(operator === 'any' || operator === 'none') &&
			(expected.length === 0 || expected.length > this.#lexicon.limits.list)
		) {
			const count = this.#plain.format(expected.length)
			return { text: this.line('fact.listed', { label, actual, comparison, count }), gaps }
		}
		const text = this.line('fact.compared', {
			label,
			actual,
			comparison,
			expected: this.#writeExpected(check),
		})
		return { text, gaps }
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

	// Only the label prints, so only the label can be missing.
	#collectLabelGaps(field: FieldPath): readonly GlossaryGap[] {
		return collectFieldGaps(field, false, this.#glossary, this.#units).filter(
			(gap) => gap.word === 'label',
		)
	}
}
