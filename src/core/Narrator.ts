import type { AuditFault, FaultKind, FieldPath } from '@orkestrel/contract'
import type {
	Aggregation,
	Bounds,
	ChainStrategy,
	Check,
	CheckState,
	Definition,
	Equation,
	Expression,
	Fact,
	Factor,
	FactorGroup,
	FactorRange,
	FactorResult,
	GroupResult,
	Inference,
	InferentialDefinition,
	InferentialResult,
	LogicalDefinition,
	LogicalResult,
	QuantitativeDefinition,
	QuantitativeResult,
	ReasonResult,
	Rule,
	RuleResult,
	SymbolicExpression,
	SymbolicResult,
	Transform,
} from '@orkestrel/reason'
import type {
	Account,
	AccountContext,
	AccountLine,
	AccountRole,
	AccountSource,
	AccountText,
	FrameName,
	Glossary,
	GlossaryGap,
	Lexicon,
	NarratorFormatter,
	NarratorInterface,
	NarratorOptions,
	NumberRefusal,
	RuleReason,
	WorksheetContext,
} from './types.js'
import {
	attempt,
	isArray,
	isAuditFault,
	isBoolean,
	isFiniteNumber,
	isInteger,
	isNull,
	isNumber,
	isString,
	isSuccess,
	isUndefined,
	preview,
} from '@orkestrel/contract'
import {
	collectConcluders,
	combineStates,
	CONFIDENCE_PRECISION,
	formatField,
	readClosedState,
	readExpectedKind,
	resolveOperand,
	roundTo,
} from '@orkestrel/reason'
import { fillTemplate } from '@orkestrel/template'
import { DEFAULT_FORMATS, TEXT_BREAK_PATTERN } from './constants.js'
import {
	buildAccountLine,
	collectFactGaps,
	collectFaultFields,
	collectFieldGaps,
	collectGaps,
	collectListJoins,
	collectNameGaps,
	collectReasons,
	collectSlots,
	collectUnitGaps,
	findConditionRules,
	findDecidingOperands,
	findFactSentence,
	findGoalRule,
	findSoleExpression,
	findSubjectKey,
	findWord,
	matchesChangedFactor,
	matchesNumericCheck,
	matchesSubjectKeys,
	normalizeLine,
	readNarratorOption,
	renderCitedReasons,
	renderName,
	resolveFormatters,
	resolveGlossary,
	resolveLexicon,
	resolveLocale,
} from './helpers.js'
import { isNumberRefusal } from './validators.js'

/**
 * Implements a stateless rendering engine that writes a reasons run as a worded account, over
 * the general words it ships and the domain's words it is given.
 *
 * @remarks
 * The general words are a `Lexicon`, each overridable on its own. The domain's words are a
 * `Glossary`. The instance owns both from construction, so a later change to the caller's
 * object changes nothing. Construction throws `InterpretError` with code `LEXICON` or
 * `GLOSSARY` for malformed words, and for options it cannot read. No lookup throws afterwards,
 * and no document of plain data does.
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
	readonly #percent: Intl.NumberFormat
	readonly #every: Intl.ListFormat
	readonly #either: Intl.ListFormat
	readonly #units: ReadonlySet<string>

	constructor(options?: NarratorOptions) {
		this.#lexicon = resolveLexicon(readNarratorOption(options, 'lexicon'))
		this.#glossary = resolveGlossary(readNarratorOption(options, 'glossary'))
		this.#locale = resolveLocale(readNarratorOption(options, 'locale'))
		this.#formatters = resolveFormatters(readNarratorOption(options, 'formatters'))
		this.#formats = new Map(
			Object.entries({ ...DEFAULT_FORMATS, ...this.#glossary.formats }).map(([unit, format]) => [
				unit,
				new Intl.NumberFormat(this.#locale, format),
			]),
		)
		this.#plain = new Intl.NumberFormat(this.#locale, DEFAULT_FORMATS.plain)
		this.#percent = new Intl.NumberFormat(this.#locale, DEFAULT_FORMATS.percent)
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
		return isArray(raw) ? this.#writeList(field, raw, this.#every) : this.#writeScalar(field, raw)
	}

	line(id: string, values: Readonly<Record<string, unknown>>): string {
		const template = findWord(this.#glossary.templates, id) ?? findWord(this.#lexicon.frames, id)
		return this.#fill(template ?? '', values)
	}

	describe(definition: Definition): Account {
		const named = this.#writeName('definition', definition)
		const title = buildAccountLine({
			role: 'verdict',
			decisive: true,
			...named,
			lines: [
				...this.#descriptionLines(definition.description),
				...this.#definitionGuide(definition),
			],
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

	explain(fault: AuditFault): string
	explain(refusal: NumberRefusal): string
	// A record neither guard admits, and one that throws as it is read, reads as a value nobody read.
	explain(record: AuditFault | NumberRefusal): string {
		const written = attempt(() => {
			if (isNumberRefusal(record)) return this.#writeRefusal(record)
			return isAuditFault(record) ? this.#writeFault(record).text : ''
		})
		const text = isSuccess(written) ? normalizeLine(written.value) : ''
		return text.trim() === '' ? this.#lexicon.missing : text
	}

	audit(definitions: readonly Definition[]): readonly GlossaryGap[] {
		return collectGaps(definitions, this.#glossary, this.#units)
	}

	#fill(template: string, values: Readonly<Record<string, unknown>>): string {
		const filled = attempt(() =>
			fillTemplate(template, values, { missing: 'empty', locale: this.#locale }),
		)
		return isSuccess(filled) ? filled.value : ''
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
			case 'expected':
			case 'constraints':
			case 'lengths':
			case 'operations':
			case 'transforms':
			case 'refusals':
			case 'unreadables':
			case 'eligibilities':
			case 'effects':
			case 'statuses':
			case 'decisions':
			case 'values':
			case 'joins':
			case 'frames':
				return this.#lexicon[table]
			default:
				return undefined
		}
	}

	// Quotes every member where one holds a joining text, so that the list can be told apart. A space
	// on each side of a member finds a joining text it would complete beside its neighbor.
	#writeList(field: FieldPath, raw: readonly unknown[], list: Intl.ListFormat): string {
		const read = attempt(() =>
			Array.from(raw, (entry) => ({
				entry,
				text: isArray(entry) ? preview(entry) : this.#writeScalar(field, entry),
			})),
		)
		if (!isSuccess(read) || read.value.length === 0) return preview(raw)
		const texts = read.value.map(({ text }) => text)
		const joins = collectListJoins(list, texts)
		const quoted = texts.some((text) => joins.some((join) => ` ${text} `.includes(join)))
		if (!quoted) return list.format(texts)
		return list.format(
			read.value.map(({ entry, text }) =>
				this.line('value.quoted', { value: isString(entry) ? entry : text }),
			),
		)
	}

	// A blank string prints quoted, because a blank slot reads as a missing word.
	#writeScalar(field: FieldPath | undefined, raw: unknown): string {
		if (isString(raw)) return raw.trim() === '' ? preview(raw) : raw
		if (isNumber(raw)) {
			const unit =
				field === undefined ? undefined : findWord(this.#glossary.units, formatField(field))
			return this.#writeNumber(unit, raw)
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

	#writeMore(count: number): string {
		return this.line('reason.more', { count: this.#plain.format(count) })
	}

	#resultLines(definition: Definition, result: ReasonResult): readonly AccountLine[] {
		switch (result.reasoning) {
			case 'logical':
				return this.#logicalLines(definition, result)
			case 'quantitative':
				return this.#worksheetLines(definition, result)
			default: {
				const answered = result.success ? this.#answerLines(definition, result) : []
				if (answered.length > 0) return answered
				const lines = result.faults.map((fault) => this.#faultLine(fault))
				return [this.#refusedLine(definition, lines, lines)]
			}
		}
	}

	#answerLines(
		definition: Definition,
		result: SymbolicResult | InferentialResult,
	): readonly AccountLine[] {
		return result.reasoning === 'symbolic'
			? this.#solutionLines(definition, result)
			: this.#derivedLines(definition, result)
	}

	// A later equation solves its target again, so a solution is the last one's of its target.
	#solutionLines(definition: Definition, result: SymbolicResult): readonly AccountLine[] {
		const equations = definition.reasoning === 'symbolic' ? definition.equations : []
		return Object.entries(result.solutions).map(([target, value]) => {
			const equation = equations.findLast((entry) => entry.target === target)
			return buildAccountLine({
				role: 'verdict',
				decisive: true,
				text: this.line('result.solution', {
					label: this.label(target),
					value: this.value(target, value),
				}),
				...(equation === undefined ? {} : { source: { equation: equation.id } }),
				gaps: collectFieldGaps(target, false, this.#glossary, this.#units),
				lines: equation === undefined ? [] : this.#equationLines(equation, 'reason'),
			})
		})
	}

	// A proof stands for the one conclusion it proved, and any other run counts what it derived.
	#derivedLines(definition: Definition, result: InferentialResult): readonly AccountLine[] {
		const authored = definition.reasoning === 'inferential' ? definition : undefined
		const keyed = authored !== undefined && matchesSubjectKeys(authored, this.#glossary)
		const { derived, proof } = result
		const proved = proof !== undefined && derived.length === 1
		const inference = proved ? proof.inference : undefined
		const facts = derived.map((fact) =>
			buildAccountLine({
				role: proved ? 'verdict' : 'step',
				decisive: true,
				...this.#writeDerived(fact, keyed),
				source: { fact: fact.id },
				lines: inference === undefined ? [] : [this.#provedLine(inference, authored)],
			}),
		)
		if (proved) return facts
		const count = this.#plain.format(derived.length)
		const text = this.line('result.derived', { count })
		return [buildAccountLine({ role: 'verdict', decisive: true, text }), ...facts]
	}

	#provedLine(inference: string, definition: InferentialDefinition | undefined): AccountLine {
		const named = this.#writeName(
			'inference',
			definition?.inferences.find((entry) => entry.id === inference && entry.enabled !== false) ?? {
				id: inference,
				name: inference,
			},
		)
		return buildAccountLine({
			role: 'reason',
			decisive: true,
			text: this.line('fact.proved', { name: named.text }),
			source: { inference },
			gaps: named.gaps,
		})
	}

	#writeDerived(fact: Fact, keyed: boolean): AccountText {
		const written = this.#writeStatement(fact, keyed)
		const confidence = this.#writeConfidence(fact.confidence)
		return confidence === undefined
			? written
			: { ...written, text: this.line('fact.confidence', { fact: written.text, confidence }) }
	}

	// A confidence the percent format would round prints as it is, so that none below 1 reads as 100%.
	#writeConfidence(confidence: number | undefined): string | undefined {
		if (!isFiniteNumber(confidence) || confidence >= 1) return undefined
		return roundTo(confidence, CONFIDENCE_PRECISION) === confidence
			? this.#percent.format(confidence)
			: this.#plain.format(confidence)
	}

	// States a fact as its predicate's sentence, as its subject's field, or as it is authored.
	#writeStatement(fact: Fact, keyed: boolean): AccountText {
		const gaps = collectFactGaps(fact, keyed, this.#glossary, this.#units)
		const key = keyed ? findSubjectKey(fact) : undefined
		if (key !== undefined) {
			const actual = this.value(key, fact.terms[1])
			return { text: this.line('fact.equal', { label: this.label(key), actual }), gaps }
		}
		const texts = fact.terms.map((term) =>
			isArray(term) ? preview(term) : this.#writeScalar(undefined, term),
		)
		const join = this.#lexicon.joins.terms
		const quoted = texts.some((text) => ` ${text} `.includes(join))
		const terms = texts
			.map((text, index) => {
				const term = fact.terms[index]
				return quoted ? this.line('value.quoted', { value: isString(term) ? term : text }) : text
			})
			.join(join)
		const sentence = findFactSentence(fact, this.#glossary.predicates)
		if (sentence !== undefined) {
			const slots = texts.map((text, index) => [String(index + 1), text])
			return { text: this.#fill(sentence, { ...Object.fromEntries(slots), terms }), gaps }
		}
		const predicate = this.#writeScalar(undefined, fact.predicate)
		return {
			text: terms === '' ? predicate : this.line('fact.stated', { predicate, terms }),
			gaps,
		}
	}

	// Writes an equation as its own tree. A tree too deep to walk has no text to print.
	#equationLines(equation: Equation, role: AccountRole): readonly AccountLine[] {
		const written = attempt(() =>
			[equation.left, equation.right].map((side) => this.#writeSide(side, false)),
		)
		if (!isSuccess(written)) return []
		const [left, right] = written.value
		return [
			buildAccountLine({
				role,
				decisive: true,
				text: this.line('equation.form', { left: left?.text, right: right?.text }),
				source: { equation: equation.id },
				gaps: written.value.flatMap((side) => side.gaps),
			}),
		]
	}

	// An operation inside another is parenthesized, and so is a negative constant, so that the text
	// has one reading. An operation the engine reads no right side of prints none.
	#writeSide(expression: SymbolicExpression, inner: boolean): AccountText {
		if (expression.form === 'variable') {
			const { name } = expression
			return { text: this.label(name), gaps: this.#collectLabelGaps(name) }
		}
		if (expression.form === 'constant') {
			const { value } = expression
			const text = this.#writeNumber(undefined, value)
			return this.#writeNested(text, [], inner && (value < 0 || Object.is(value, -0)))
		}
		const template = findWord(this.#lexicon.operations, expression.operator) ?? ''
		const slots = collectSlots(template)
		const left = this.#writeSide(expression.left, true)
		const right =
			expression.right === undefined || !slots.includes('right')
				? { text: this.#lexicon.missing, gaps: [] }
				: this.#writeSide(expression.right, true)
		const text = this.#fill(template, { left: left.text, right: right.text })
		return this.#writeNested(text, [...left.gaps, ...right.gaps], inner)
	}

	#writeNested(expression: string, gaps: readonly GlossaryGap[], inner: boolean): AccountText {
		return { text: inner ? this.line('equation.group', { expression }) : expression, gaps }
	}

	// A refused run states no value, count, or solution: only the causes its evidence holds.
	#refusedLine(
		definition: Definition,
		reasons: readonly AccountText[],
		lines: readonly AccountLine[],
		state?: CheckState,
	): AccountLine {
		const named = this.#writeName('definition', definition)
		const cited = renderCitedReasons(reasons, this.#lexicon, (count) => this.#writeMore(count))
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

	#faultLine(fault: AuditFault, source: AccountSource = {}, kind?: FaultKind): AccountLine {
		return buildAccountLine({
			role: 'reason',
			state: 'unread',
			decisive: true,
			...this.#writeFault(fault, kind),
			source: { ...source, fault },
		})
	}

	// An unread value prints its label and what its fault makes it, or the word for no value.
	#writeUnread(field: FieldPath, reason?: AuditFault['reason']): AccountText {
		const missing =
			reason === undefined
				? this.#lexicon.missing
				: this.phrase('faults', reason, this.#lexicon.missing)
		return {
			text: this.line('fact.unread', { label: this.label(field), missing }),
			gaps: this.#collectLabelGaps(field),
		}
	}

	// States what a fault needed of its field, and what it got where the fault holds that. A run holds
	// one fault for a field, so a reader that needed another kind states no expectation.
	#writeFault(fault: AuditFault, kind?: FaultKind): AccountText {
		const { path } = fault
		const plain = this.#writeUnread(path, fault.reason)
		const { gaps } = plain
		const label = this.label(path)
		if (kind !== undefined && 'expected' in fault && fault.expected !== kind) return plain
		if (fault.reason === 'missing' || fault.reason === 'type') {
			const expected = findWord(this.#lexicon.expected, fault.expected)
			if (expected === undefined) return plain
			// `NaN` and an absent value print as no value everywhere.
			if (
				fault.reason === 'missing' ||
				fault.received === preview(Number.NaN) ||
				fault.received === preview(undefined)
			) {
				const absent = this.#lexicon.faults.missing
				return { text: this.line('fault.missing', { label, missing: absent, expected }), gaps }
			}
			const received = this.#writeScalar(path, fault.received)
			return { text: this.line('fault.type', { label, expected, received }), gaps }
		}
		return fault.reason === 'constraint' ? (this.#writeBound(fault) ?? plain) : plain
	}

	// A bound on text, a date, or a list is a length, and any other prints in its field's unit.
	#writeBound(
		fault: Extract<AuditFault, { readonly reason: 'constraint' }>,
	): AccountText | undefined {
		const { path, expected, constraint, limit } = fault
		const label = this.label(path)
		const sized =
			(constraint === 'min' || constraint === 'max') &&
			(expected === 'string' || expected === 'date' || expected === 'array')
		const template = findWord(sized ? this.#lexicon.lengths : this.#lexicon.constraints, constraint)
		if (template === undefined) return undefined
		const bound =
			sized && isNumber(limit) ? this.#writeNumber(undefined, limit) : this.value(path, limit)
		const words = { label, constraint: this.#fill(template, { limit: bound }) }
		if (sized) return { text: this.line('fault.length', words), gaps: this.#collectLabelGaps(path) }
		const received = this.#writeScalar(path, fault.received)
		return {
			text: this.line('fault.constraint', { ...words, received }),
			gaps: isNumber(limit)
				? collectFieldGaps(path, true, this.#glossary, this.#units)
				: this.#collectLabelGaps(path),
		}
	}

	#writeRefusal({ text, reason, unreadable, field }: NumberRefusal): string {
		const refused = text.trim() === '' ? preview(text) : text
		const refusal =
			reason === 'unreadable' && unreadable !== undefined
				? this.line('refusal.unreadable', {
						text: refused,
						cause: this.#lexicon.unreadables[unreadable],
					})
				: this.#fill(this.#lexicon.refusals[reason], { text: refused })
		return field === undefined
			? refusal
			: this.line('refusal.field', { refusal, label: this.label(field) })
	}

	// A refused run derives nothing it can't vouch for: an error that is no fault's leaves every state
	// in doubt, where a rule settled beside a missing input stays settled whatever the input is.
	#logicalLines(definition: Definition, result: LogicalResult): readonly AccountLine[] {
		if (!result.success && result.errors.length > result.faults.length) {
			const faults = result.faults.map((fault) => this.#faultLine(fault))
			return [this.#refusedLine(definition, faults, faults)]
		}
		const context = this.#readContext(definition, result)
		const seen = new Set<string>()
		const goal = this.#findGoal(definition, result, context)
		const gates = result.success && goal === undefined
		const verdict = gates
			? this.#gatesLine(definition, result, context)
			: this.#verdictLine(definition, result, context, seen, goal)
		// Written before the sections they follow, because the deciding lines nest first.
		const unread = this.#sectionLines(result, context, seen, 'unread', true)
		return [
			verdict,
			...(result.success && !gates ? [this.#countLine(definition, result)] : []),
			...this.#sectionLines(result, context, seen, 'met', gates),
			...this.#sectionLines(result, context, seen, 'unmet', false),
			...unread,
		]
	}

	// The goal rule's result, where it is the outcome the run concluded.
	#findGoal(
		definition: Definition,
		result: LogicalResult,
		context: AccountContext,
	): RuleResult | undefined {
		const goal = definition.reasoning === 'logical' ? findGoalRule(definition) : undefined
		const read = goal === undefined ? undefined : context.results.get(goal.id)
		return read?.state === result.conclusion ? read : undefined
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

	// The verdict is the goal rule's outcome under the definition's name. A run no goal answers is
	// refused, and names every rule and field left unread.
	#verdictLine(
		definition: Definition,
		result: LogicalResult,
		context: AccountContext,
		seen: Set<string>,
		goal: RuleResult | undefined,
	): AccountLine {
		const reasons = goal === undefined ? [] : this.#readReasons(goal, context)
		const answered = result.success || (result.conclusion === 'unread' && reasons.length > 0)
		if (goal !== undefined && answered) {
			seen.add(goal.id)
			const named = this.#writeName('definition', definition)
			const word = this.#lexicon.verdicts[goal.state]
			return buildAccountLine({
				role: 'verdict',
				state: goal.state,
				decisive: true,
				...this.#writeOutcome(named, word, reasons, context),
				source: { rule: goal.id },
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

	// Independent rules answer as a count, and the rules that apply are its reasons.
	#gatesLine(definition: Definition, result: LogicalResult, context: AccountContext): AccountLine {
		const named = this.#writeName('definition', definition)
		const count = this.#readCount(named, result)
		const met = result.rules.filter((rule) => rule.state === 'met')
		const shown = met
			.slice(0, this.#lexicon.limits.reasons)
			.map((rule) => this.#writeRuleName(rule, context))
		const more = met.length - shown.length
		const rest = more === 0 ? [] : [this.line('reason.more', { count: this.#plain.format(more) })]
		const rules = this.#every.format([...shown.map((rule) => rule.text), ...rest])
		return buildAccountLine({
			role: 'verdict',
			decisive: true,
			text: this.line('result.count', count),
			...(met.length === 0 ? {} : { summary: this.line('result.applied', { ...count, rules }) }),
			gaps: [...named.gaps, ...shown.flatMap((rule) => rule.gaps)],
		})
	}

	#countLine(definition: Definition, result: LogicalResult): AccountLine {
		const named = this.#writeName('definition', definition)
		return buildAccountLine({
			role: 'step',
			text: this.line('result.count', this.#readCount(named, result)),
			gaps: named.gaps,
		})
	}

	#readCount(
		named: AccountText,
		result: LogicalResult,
	): Readonly<Record<'name' | 'met' | 'total', string>> {
		const met = result.rules.filter((rule) => rule.state === 'met')
		return {
			name: named.text,
			met: this.#plain.format(met.length),
			total: this.#plain.format(result.rules.length),
		}
	}

	// A rule the verdict already stated decides nothing more in its section.
	#sectionLines(
		result: LogicalResult,
		context: AccountContext,
		seen: Set<string>,
		state: CheckState,
		decisive: boolean,
	): readonly AccountLine[] {
		return result.rules
			.filter((rule) => rule.state === state)
			.map((rule) => {
				const decides = decisive && !seen.has(rule.id)
				return { ...this.#ruleLine(rule, context, seen), decisive: decides }
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
		const cited = renderCitedReasons(
			reasons.flatMap((reason) => this.#writeReason(reason, context)),
			this.#lexicon,
			(count) => this.#writeMore(count),
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
		const cited = renderCitedReasons(facts, this.#lexicon, (count) => this.#writeMore(count))
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
		if (result.state === 'unread') {
			const fault = this.#findFault(reason, faults)
			return fault === undefined
				? this.#writeUnread(field)
				: this.#writeFault(fault, readExpectedKind(check))
		}
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
		// A fact counts a long list, and a condition prints it whole, because it states the rule.
		if (
			frame === 'fact' &&
			isArray(expected) &&
			(operator === 'any' || operator === 'none') &&
			(expected.length === 0 || expected.length > this.#lexicon.limits.list)
		) {
			const count = this.#plain.format(expected.length)
			return { text: this.line('fact.listed', { ...values, count }), gaps }
		}
		return {
			text: this.line(`${frame}.compared`, { ...values, expected: this.#writeExpected(check) }),
			gaps,
		}
	}

	#writeExpected({ field, operator, value: expected }: Check): string {
		if (!isArray(expected)) return this.value(field, expected)
		if (expected.length === 0) return '[]'
		if (operator === 'any' || operator === 'none') {
			return this.#writeList(field, expected, this.#either)
		}
		if (operator !== 'between' && operator !== 'outside') return this.value(field, expected)
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
			unit: authored === undefined ? unit : this.#findValueUnit(authored),
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
		return [
			verdict,
			...this.#baseLines(authored?.base, context.unit),
			...groups,
			...this.#boundsLines(authored?.bounds, context.unit),
			...this.#totalLines(authored, value, gaps),
		]
	}

	// A base, a weight, and a bound print wherever one is authored, so a worksheet's numbers can be
	// followed. A bound states its range alone, because a result does not say whether one applied.
	#baseLines(
		base: number | undefined,
		unit: string | undefined,
		source: AccountSource = {},
	): readonly AccountLine[] {
		if (base === 0 || !isFiniteNumber(base)) return []
		const value = this.#writeNumber(unit, base)
		return [this.#settingLine(this.line('worksheet.base', { value }), unit, source)]
	}

	// The least and the greatest value use no weight.
	#weightLines(
		weight: number | undefined,
		aggregation: Aggregation | undefined,
		source: AccountSource,
	): readonly AccountLine[] {
		if (aggregation === 'minimum' || aggregation === 'maximum') return []
		if (weight === 1 || !isFiniteNumber(weight)) return []
		const value = this.#writeNumber(undefined, weight)
		return [this.#settingLine(this.line('worksheet.weight', { value }), undefined, source)]
	}

	#boundsLines(
		authored: Bounds | undefined,
		unit: string | undefined,
		source: AccountSource = {},
	): readonly AccountLine[] {
		const bounds = this.#writeBounds(authored, unit)
		return bounds === undefined
			? []
			: [this.#settingLine(this.line('worksheet.bounds', { bounds }), unit, source)]
	}

	#writeBounds(bounds: Bounds | undefined, unit: string | undefined): string | undefined {
		const minimum = isFiniteNumber(bounds?.minimum)
			? this.#writeNumber(unit, bounds.minimum)
			: undefined
		const maximum = isFiniteNumber(bounds?.maximum)
			? this.#writeNumber(unit, bounds.maximum)
			: undefined
		if (minimum === undefined) {
			return maximum === undefined ? undefined : this.line('value.maximum', { maximum })
		}
		return maximum === undefined
			? this.line('value.minimum', { minimum })
			: this.line('value.range', { minimum, maximum })
	}

	// An operand the engine defaults prints as the engine takes it.
	#changesLines(
		transforms: readonly Transform[] | undefined,
		source: AccountSource,
	): readonly AccountLine[] {
		if (transforms === undefined || transforms.length === 0) return []
		const changes = transforms
			.map(({ operation, operand }) =>
				this.#fill(findWord(this.#lexicon.transforms, operation) ?? '', {
					operand: this.#writeNumber(undefined, resolveOperand(operation, operand)),
				}),
			)
			.join(this.#lexicon.joins.steps)
		return [this.#settingLine(this.line('worksheet.changes', { changes }), undefined, source)]
	}

	#precisionLines(precision: number | undefined): readonly AccountLine[] {
		if (!isInteger(precision)) return []
		const places = this.#plain.format(precision)
		return [this.#settingLine(this.line('worksheet.precision', { places }), undefined, {})]
	}

	#settingLine(text: string, unit: string | undefined, source: AccountSource): AccountLine {
		return buildAccountLine({
			role: 'step',
			decisive: true,
			text,
			source,
			gaps: collectUnitGaps(unit, this.#units),
		})
	}

	// A guide prints its settings at full detail alone.
	#guideLines(settings: readonly AccountLine[]): readonly AccountLine[] {
		return settings.map((line) => ({ ...line, role: 'condition', decisive: false }))
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
		const cited = renderCitedReasons(line.lines, this.#lexicon, (count) => this.#writeMore(count))
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
		const unit = authored?.aggregation === 'product' ? undefined : context.unit
		const source = { group: group.id }
		const factors = group.factors.map((factor) =>
			this.#factorLine(
				group,
				factor,
				{ ...context, stated: context.stated && (group.applied || !factor.applied), unit },
				context.stated,
			),
		)
		return buildAccountLine({
			role: 'step',
			decisive: stated,
			...this.#writeStep('worksheet.group', named, group, stated, context.unit),
			source,
			lines: stated
				? [
						...this.#baseLines(authored?.base, context.unit, source),
						...factors,
						...this.#boundsLines(authored?.bounds, context.unit, source),
					]
				: factors,
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
			const aggregation = context.groups.get(group.id)?.aggregation
			// The changes account for the number only beside the one they start from.
			const transforms = isFiniteNumber(factor.raw) ? authored?.transforms : undefined
			const settings = context.stated
				? [
						...this.#changesLines(transforms, source),
						...this.#boundsLines(authored?.bounds, context.unit, source),
						...this.#weightLines(authored?.weight, aggregation, source),
					]
				: []
			return buildAccountLine({
				role: 'step',
				decisive: context.stated,
				...step,
				source,
				lines: [...lines, ...settings],
			})
		}
		const name = named.text
		const cited = renderCitedReasons(lines, this.#lexicon, (count) => this.#writeMore(count))
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
		const kind = origin.origin === 'lookup' ? 'union' : 'number'
		if (fault !== undefined) return [this.#faultLine(fault, source, kind)]
		// A factor with no value says where it looked and what it missed, and no number of its own.
		if (!result.applied && origin.origin === 'static') return []
		const missed = !result.applied && result.raw === undefined
		if (missed && (origin.origin === 'lookup' || origin.origin === 'range')) {
			return [
				buildAccountLine({
					role: 'reason',
					decisive: true,
					text: this.line('source.missed', { label: this.label(origin.field) }),
					source,
					gaps: this.#collectLabelGaps(origin.field),
				}),
			]
		}
		return this.#writeSource(factor, context.unit, result).map((entry) =>
			buildAccountLine({ role: 'reason', decisive: true, ...entry, source }),
		)
	}

	// States where a factor's number comes from, and, of one that applied, the number before its
	// changes.
	#writeSource(
		factor: Factor,
		unit: string | undefined,
		result?: FactorResult,
	): readonly AccountText[] {
		const { source } = factor
		const raw = result?.raw
		if (source.origin === 'static') {
			if (!isFiniteNumber(source.value)) return []
			const kept = matchesChangedFactor(factor) ? undefined : unit
			const value = this.#writeNumber(kept, source.value)
			const gaps = collectUnitGaps(kept, this.#units)
			return [{ text: this.line('source.static', { value }), gaps }]
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
		// A result does not say whether an entry or the fallback gave a value that both hold.
		const fallback = raw !== undefined && raw === factor.fallback
		const either = fallback && entries.includes(raw)
		const missed: FrameName = either ? 'source.either' : 'source.fallback'
		const frame: FrameName = fallback ? missed : `source.${source.origin}`
		const chosen = { text: this.line(frame, { label }), gaps }
		const authored = (factor.transforms ?? []).length > 0
		const kept = raw === result?.value && !authored
		if (result?.applied !== true || kept || !isFiniteNumber(raw)) return [chosen]
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
				return definition.equations.map((equation) => this.#equationGuide(equation))
			case 'inferential': {
				const keyed = matchesSubjectKeys(definition, this.#glossary)
				return definition.inferences
					.filter((inference) => inference.enabled !== false)
					.map((inference) => this.#inferenceGuide(inference, definition.strategy, keyed))
			}
		}
	}

	#definitionGuide(definition: Definition): readonly AccountLine[] {
		if (definition.reasoning === 'symbolic') {
			return this.#guideLines(this.#precisionLines(definition.precision))
		}
		if (definition.reasoning !== 'quantitative') return []
		const unit = this.#findValueUnit(definition)
		return [
			this.#aggregationLine(definition),
			...this.#guideLines([
				...this.#baseLines(definition.base, unit),
				...this.#boundsLines(definition.bounds, unit),
				...this.#precisionLines(definition.precision),
			]),
		]
	}

	// A part of a product is no amount, so its number prints plain.
	#findValueUnit(definition: QuantitativeDefinition): string | undefined {
		return definition.aggregation === 'product'
			? undefined
			: findWord(this.#glossary.values, definition.id)
	}

	#equationGuide(equation: Equation): AccountLine {
		const source = { equation: equation.id }
		return this.#partLine(this.#writeName('equation', equation), source, equation.description, [
			...this.#equationLines(equation, 'condition'),
			buildAccountLine({
				role: 'condition',
				decisive: true,
				text: this.line('equation.target', { label: this.label(equation.target) }),
				source,
				gaps: this.#collectLabelGaps(equation.target),
			}),
		])
	}

	// A forward run skips an inference with no premises, so it concludes nothing there.
	#inferenceGuide(inference: Inference, strategy: ChainStrategy, keyed: boolean): AccountLine {
		const source = { inference: inference.id }
		const conclusion = this.#writeStatement(inference.conclusion, keyed)
		const premises = inference.premises.map((premise) => this.#writeStatement(premise, keyed))
		const rule = this.line('inference.rule', {
			conclusion: conclusion.text,
			premises: this.#every.format(premises.map((premise) => premise.text)),
		})
		const confidence = this.#writeConfidence(inference.confidence)
		const stated = premises.length > 0 || strategy === 'backward'
		return this.#partLine(this.#writeName('inference', inference), source, inference.description, [
			...(stated
				? [
						buildAccountLine({
							role: 'condition',
							decisive: true,
							text: premises.length === 0 ? conclusion.text : rule,
							source,
							gaps: [...conclusion.gaps, ...premises.flatMap((premise) => premise.gaps)],
						}),
					]
				: []),
			...(confidence === undefined
				? []
				: [
						buildAccountLine({
							role: 'condition',
							decisive: true,
							text: this.line('inference.confidence', { confidence }),
							source,
						}),
					]),
		])
	}

	// A part's line names it once, so the condition nested beneath leaves the name out.
	#partLine(
		named: AccountText,
		source: AccountSource,
		description: string | undefined,
		lines: readonly AccountLine[],
		written?: AccountText,
	): AccountLine {
		const name = named.text
		const condition = written?.text
		return buildAccountLine({
			role: 'condition',
			decisive: true,
			...named,
			...(condition === undefined
				? {}
				: { summary: this.line('rule.condition', { name, condition }) }),
			gaps: [...named.gaps, ...(written?.gaps ?? [])],
			source,
			lines: [
				...this.#descriptionLines(description),
				...lines,
				...(written === undefined
					? []
					: [
							buildAccountLine({
								role: 'condition',
								decisive: true,
								text: this.line('condition.when', { condition: written.text }),
								source,
								gaps: written.gaps,
							}),
						]),
			],
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
			const named = this.#writeName('rule', rule)
			const condition = this.#writePremises(rule.premises, concluders)
			return this.#partLine(named, { rule: rule.id }, rule.description, [], condition)
		})
	}

	#groupGuide(group: FactorGroup, definition: QuantitativeDefinition): AccountLine {
		const source = { group: group.id }
		const total = this.#findValueUnit(definition)
		const unit = group.aggregation === 'product' ? undefined : total
		const strict = this.#settingLine(this.line('worksheet.strict', {}), undefined, source)
		const settings = [
			...this.#baseLines(group.base, total, source),
			...this.#boundsLines(group.bounds, total, source),
			...(group.strict === true ? [strict] : []),
		]
		const factors = group.factors
			.filter((factor) => factor.enabled !== false)
			.map((factor) => this.#factorGuide(factor, group, unit))
		return this.#partLine(this.#writeName('group', group), source, group.description, [
			this.#aggregationLine(group),
			...this.#guideLines(settings),
			...factors,
		])
	}

	#factorGuide(factor: Factor, group: FactorGroup, unit: string | undefined): AccountLine {
		const source = { group: group.id, factor: factor.id }
		const named = this.#writeName('factor', factor)
		const origin = this.#writeSource(factor, unit).map((entry) =>
			buildAccountLine({
				role: 'condition',
				decisive: true,
				...entry,
				source,
				lines: this.#guideLines(this.#tableLines(factor, unit, source)),
			}),
		)
		const required = this.#settingLine(this.line('worksheet.required', {}), undefined, source)
		const settings = [
			...this.#changesLines(factor.transforms, source),
			...this.#boundsLines(factor.bounds, unit, source),
			...this.#weightLines(factor.weight, group.aggregation, source),
			...(factor.required === true ? [required] : []),
		]
		const checks = (factor.checks ?? []).map((check): Expression => ({ form: 'atom', check }))
		const gate = this.#writePremises(checks, new Map())
		const lines = [...origin, ...this.#guideLines(settings)]
		return this.#partLine(named, source, factor.description, lines, gate)
	}

	// Every entry of a lookup or band of a range, in the order the engine reads them, and the fallback
	// both can take. Their numbers stand before the factor's changes.
	#tableLines(
		factor: Factor,
		unit: string | undefined,
		source: AccountSource,
	): readonly AccountLine[] {
		const { source: table, fallback } = factor
		if (table.origin === 'static' || table.origin === 'field') return []
		const kept = matchesChangedFactor(factor) ? undefined : unit
		const entries =
			table.origin === 'range'
				? table.ranges.map((range) => this.#bandLine(range, table.field, kept, source))
				: Object.entries(table.table).map(([key, entry]) =>
						this.#settingLine(
							this.line('source.entry', {
								key: this.#writeScalar(undefined, key),
								value: this.#writeNumber(kept, entry),
							}),
							kept,
							source,
						),
					)
		if (!isFiniteNumber(fallback)) return entries
		const value = this.#writeNumber(kept, fallback)
		return [...entries, this.#settingLine(this.line('worksheet.fallback', { value }), kept, source)]
	}

	#bandLine(
		band: FactorRange,
		field: FieldPath,
		unit: string | undefined,
		source: AccountSource,
	): AccountLine {
		const bounds = this.#writeBounds(
			band.bounds,
			findWord(this.#glossary.units, formatField(field)),
		)
		const gaps = collectFieldGaps(field, true, this.#glossary, this.#units)
		return buildAccountLine({
			role: 'step',
			decisive: true,
			text: this.line('source.band', {
				range: bounds ?? this.line('value.any', {}),
				value: this.#writeNumber(unit, band.value),
			}),
			source,
			gaps: [
				...(bounds === undefined ? [] : gaps.filter((gap) => gap.word !== 'label')),
				...collectUnitGaps(unit, this.#units),
			],
		})
	}

	// A tree too deep to walk has no condition to print.
	#writePremises(
		premises: readonly Expression[],
		concluders: ReadonlyMap<string, readonly Rule[]>,
	): AccountText | undefined {
		if (premises.length === 0) return undefined
		const every: Expression = { form: 'compound', operator: 'and', operands: premises }
		const written = attempt(() => this.#writeCondition(every, false, concluders))
		return isSuccess(written) ? written.value : undefined
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
		if (operator === 'implies') return this.#writeImplication(operands, true, inner, concluders)
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
		return this.#writeGroup(this.line('condition.xor', slots), gaps, inner)
	}

	// An implication reads as its equivalent, the failing words of its first operand or its second;
	// one that fails, as its first operand and the failing words of its second.
	#writeImplication(
		operands: readonly Expression[],
		holds: boolean,
		inner: boolean,
		concluders: ReadonlyMap<string, readonly Rule[]>,
	): AccountText {
		const [first, second] = operands
		if (first === undefined || second === undefined || operands.length !== 2) {
			return { text: this.#lexicon.missing, gaps: [] }
		}
		const parts = holds
			? [
					this.#writeNegation([first], true, concluders),
					this.#writeCondition(second, true, concluders),
				]
			: [
					this.#writeCondition(first, true, concluders),
					this.#writeNegation([second], true, concluders),
				]
		const list = holds ? this.#either : this.#every
		const gaps = parts.flatMap((part) => part.gaps)
		return this.#writeGroup(list.format(parts.map((part) => part.text)), gaps, inner)
	}

	#writeGroup(condition: string, gaps: readonly GlossaryGap[], inner: boolean): AccountText {
		return { text: inner ? this.line('condition.group', { condition }) : condition, gaps }
	}

	// Under `not`, a check takes its failing words, a second `not` cancels the first, and an
	// implication reads as what makes it fail.
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
		if (sole.operator === 'implies') {
			return this.#writeImplication(sole.operands, false, inner, concluders)
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
			const written = this.#writeCheck(check, holds, 'condition', {})
			// A list's own joining text would read as the condition's.
			const listed = (operator === 'any' || operator === 'none') && isArray(expected)
			return this.#writeGroup(written.text, written.gaps, inner && listed && expected.length > 1)
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
