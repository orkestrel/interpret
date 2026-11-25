import type { ContractShape, FieldPath, JSONValue } from '@orkestrel/contract'
import type {
	Check,
	CheckResult,
	CheckState,
	Definition,
	Expression,
	LogicalDefinition,
	LogicalOperator,
	Rule,
	RuleResult,
	Subject,
	SubjectAdmission,
	SymbolicExpression,
} from '@orkestrel/reason'
import type {
	Account,
	AccountDetail,
	AccountLine,
	AccountLineInput,
	AccountOptions,
	AccountSource,
	AnchorCandidate,
	AnchorRefusalHandler,
	Entity,
	EntityMapping,
	ExpressionResult,
	FrameName,
	Glossary,
	GlossaryGap,
	Intent,
	Interpretation,
	Lexicon,
	LexiconInput,
	NarratorFormatter,
	NarratorInterface,
	NarratorOptions,
	Recipe,
	ReadNumber,
	RuleReason,
	ShapeDefault,
	TextSpan,
} from './types.js'
import {
	attempt,
	cloneJSONRecord,
	cloneJSONValue,
	createContract,
	errorToMessage,
	escapeRegExp,
	isArray,
	isError,
	isFiniteNumber,
	isFunction,
	isNonNegativeInteger,
	isNumber,
	isObject,
	isRecord,
	isString,
	isSuccess,
	preview,
	renderPath,
	resolveField,
} from '@orkestrel/contract'
import {
	applyOperation,
	collectConcluders,
	collectVariables,
	combineStates,
	COMPARISONS,
	extractAtoms,
	extractConclusions,
	findFieldShape,
	formatField,
	isComparison,
	projectValue,
	readClosedState,
	scanShape,
	scanSymbolicExpression,
	settleComparison,
} from '@orkestrel/reason'
import { DEFAULT_LOCALE, FILL_PATTERN, UNSAFE_FIELD_SEGMENTS } from '@orkestrel/template'
import {
	CLAUSE_BREAK_PATTERN,
	CONFIDENCE_DEFAULT,
	CONFIDENCE_EXACT,
	DEFAULT_LEXICON,
	FRAME_SLOTS,
	NUMBER_PATTERN,
	TEXT_BREAK_PATTERN,
} from './constants.js'
import { InterpretError } from './errors.js'
import { isFrameName, isGlossary, isLexiconInput, isRecipe } from './validators.js'

// The interprets pure-leaf inventory — every function here is
// a referentially-transparent computation with no instance state, exported
// and independently unit-testable. Stateful orchestration (the fixed
// pipeline, entity assignment sequencing, recipe registration) lives on the
// `Interpret` orchestrator and its stage classes, never here.

// === Field paths — safe copy-on-write writes

/**
 * Writes a value at a (possibly nested) field path on a subject, copy-on-write.
 *
 * @remarks
 * Never mutates `subject` — every level a `field` array descends through is
 * freshly copied, so the input and every intermediate record stay untouched.
 * Prototype-pollution-safe: a `field` containing `__proto__`,
 * `prototype`, or `constructor` at any segment (checked against
 * `@orkestrel/template`'s `UNSAFE_FIELD_SEGMENTS`) is refused as a no-op, returning `subject`
 * unchanged. A non-record value already sitting at an intermediate segment is
 * replaced by a fresh record rather than descended into.
 *
 * @param subject - The subject to derive from
 * @param field - The (possibly nested) field path to write
 * @param value - The value to write
 * @returns A fresh subject with `value` written at `field`, or `subject`
 * unchanged when `field` carries an unsafe segment
 *
 * @example
 * ```ts
 * import { setField } from '@orkestrel/interpret'
 *
 * setField({ age: 25 }, 'age', 30)               // { age: 30 }
 * setField({}, ['address', 'city'], 'Reno')      // { address: { city: 'Reno' } }
 * setField({}, ['__proto__', 'polluted'], true)  // {} — refused, unchanged
 * ```
 */
export function setField(subject: Subject, field: FieldPath, value: unknown): Subject {
	const path = isArray(field) ? field : [field]
	if (path.length === 0) return subject
	if (path.some((segment) => UNSAFE_FIELD_SEGMENTS.includes(segment))) return subject
	const [key, ...rest] = path
	if (key === undefined) return subject
	if (rest.length === 0) return { ...subject, [key]: value }
	const child = subject[key]
	const nested = isRecord(child) ? child : {}
	return { ...subject, [key]: setField(nested, rest, value) }
}

// === Normalization

/**
 * Replaces every whole-word occurrence of a map's keys with their values.
 *
 * @remarks
 * Word-boundary safe (`in` never matches inside `information`) and
 * case-insensitive; each key is regex-escaped through `escapeRegExp` from
 * `@orkestrel/contract` before compiling, so a caller-supplied phrase
 * containing regex metacharacters is matched literally. Multiple keys apply in
 * `Object.entries` order — the `Normalizer` stage sequences its three maps
 * (contractions, abbreviations, corrections) with three separate calls.
 *
 * @param text - The text to substitute within
 * @param map - The `{ from: to }` substitution map
 * @returns `text` with every whole-word match replaced
 *
 * @example
 * ```ts
 * import { applyReplacements } from '@orkestrel/interpret'
 *
 * applyReplacements("can't stop", { "can't": 'cannot' }) // 'cannot stop'
 * applyReplacements('information', { in: 'IN' })          // 'information' — word-boundary safe
 * ```
 */
export function applyReplacements(text: string, map: Readonly<Record<string, string>>): string {
	return Object.entries(map).reduce((result, [from, to]) => {
		const pattern = new RegExp(`\\b${escapeRegExp(from)}\\b`, 'gi')
		return result.replace(pattern, to)
	}, text)
}

/**
 * Collapses every run of whitespace to a single space and trims the ends.
 *
 * @param text - The text to collapse
 * @returns The collapsed text
 *
 * @example
 * ```ts
 * import { collapseWhitespace } from '@orkestrel/interpret'
 *
 * collapseWhitespace('  a   b\t c ') // 'a b c'
 * ```
 */
export function collapseWhitespace(text: string): string {
	return text.replace(/\s+/g, ' ').trim()
}

// === Tokenization (internal plumbing shared by extraction & classification)

/**
 * Splits text into lowercase tokens, stripping punctuation outside a small
 * numeric/currency-safe allowlist.
 *
 * @remarks
 * Shared by `classifyIntent` and `assignEntities` — pure ECMAScript
 * (no locale-aware `Intl` segmentation), so multi-byte / astral text tokenizes
 * on ASCII word boundaries only.
 *
 * @param text - The text to tokenize
 * @returns The lowercase tokens, punctuation-stripped, empty tokens dropped
 *
 * @example
 * ```ts
 * import { tokenize } from '@orkestrel/interpret'
 *
 * tokenize('The rate is 85%.') // ['the', 'rate', 'is', '85%.']
 * ```
 */
export function tokenize(text: string): readonly string[] {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9\s./%$'-]/g, ' ')
		.split(/\s+/)
		.filter((token) => token.length > 0)
}

// === Extraction

/**
 * Mines every numeric literal from text — optional leading `$`, thousands
 * commas, an optional decimal fraction, an optional trailing `%`.
 *
 * @remarks
 * Numbers-only: this is the module's entire extraction contract — no date,
 * text-entity, or negation parsing. Mining a domain's own entity vocabulary is
 * the caller's business, supplied through a `Recipe`.
 *
 * @param text - The text to scan
 * @returns Every extracted number, in left-to-right order
 *
 * @example
 * ```ts
 * import { extractNumbers } from '@orkestrel/interpret'
 *
 * extractNumbers('income was $50,000, age 25') // [50000, 25]
 * ```
 */
export function extractNumbers(text: string): readonly number[] {
	const pattern = new RegExp(NUMBER_PATTERN.source, NUMBER_PATTERN.flags)
	return Iterator.from(text.matchAll(pattern))
		.flatMap((match) => {
			const raw = match[1]
			if (raw === undefined) return []
			const value = Number(raw.replace(/,/g, ''))
			return isFiniteNumber(value) ? [value] : []
		})
		.toArray()
}

/**
 * Finds the nearest directly linked number in an unnegated clause, refusing ties.
 *
 * @remarks
 * Closeness is the gap between the two spans, so a number before an anchor and one after it are
 * measured alike. Only whitespace, `is`, `of`, `at`, `to`, `=`, and `:` may link the spans.
 * Articles also link when the number follows the anchor. Negation in the clause, other
 * intervening text, and ties leave the field to ask. A colon immediately after the anchor
 * permits only a number following it, never a backward claim.
 *
 * @param text - The text
 * @param anchor - Where the anchor sits
 * @param numbers - Where each number sits
 * @param refused - Optional observer of the existing negation and equal-distance refusal decisions
 * @returns The index into `numbers` of the number claimed and how far it sits, or `undefined`
 *
 * @example
 * ```ts
 * import { findAnchoredNumber } from '@orkestrel/interpret'
 *
 * const five = { start: 5, end: 6 }
 * findAnchoredNumber('rate 5, term 7', { start: 0, end: 4 }, [five, { start: 13, end: 14 }]) // { index: 0, gap: 1 }
 * findAnchoredNumber('5 rate 7', { start: 2, end: 6 }, [{ start: 0, end: 1 }, { start: 7, end: 8 }]) // undefined, a tie
 * findAnchoredNumber('rate, term 7', { start: 0, end: 4 }, [{ start: 11, end: 12 }]) // undefined, another clause
 * findAnchoredNumber('401k', { start: 0, end: 4 }, [{ start: 0, end: 3 }]) // undefined, inside the anchor
 * ```
 */
export function findAnchoredNumber(
	text: string,
	anchor: TextSpan,
	numbers: readonly TextSpan[],
	refused?: AnchorRefusalHandler,
): { readonly index: number; readonly gap: number } | undefined {
	const breaks = [
		...text.matchAll(new RegExp(CLAUSE_BREAK_PATTERN.source, CLAUSE_BREAK_PATTERN.flags)),
	]
	const start = breaks.reduce(
		(at, found) => (found.index < anchor.start ? found.index + found[0].length : at),
		0,
	)
	const end = breaks.find((found) => found.index >= anchor.end)?.index ?? text.length
	if (/\b(?:not|no|never|neither|nor|cannot)\b|n['’]t\b/i.test(text.slice(start, end))) {
		if (refused !== undefined) {
			for (const [index, number] of numbers.entries()) {
				if (number.start >= start && number.start < end) refused(index, 'negation')
			}
		}
		return undefined
	}
	const gaps = findLinkedNumbers(text, anchor, numbers, { start, end })
	const [nearest, next] = gaps
	if (nearest === undefined) return undefined
	if (next?.gap === nearest.gap) {
		if (refused !== undefined) {
			for (const candidate of gaps) {
				if (candidate.gap === nearest.gap) refused(candidate.index, 'anchor-tie')
			}
		}
		return undefined
	}
	return nearest
}

/**
 * Finds the first span whose selected edge is at or beyond a position.
 *
 * @remarks
 * Spans must be ordered by the selected edge. The optional bounds delimit the search.
 *
 * @example
 * ```ts
 * import { findSpanOffset } from '@orkestrel/interpret'
 * findSpanOffset([{ start: 2, end: 3 }], 2) // 0
 * ```
 */
export function findSpanOffset(
	spans: readonly TextSpan[],
	position: number,
	edge: 'start' | 'end' = 'start',
	lower = 0,
	upper = spans.length,
): number {
	if (lower >= upper) return lower
	const middle = Math.floor((lower + upper) / 2)
	const span = spans[middle]
	return span !== undefined && span[edge] < position
		? findSpanOffset(spans, position, edge, middle + 1, upper)
		: findSpanOffset(spans, position, edge, lower, middle)
}

/**
 * Finds directly linked numeric spans ordered by distance within a supplied clause.
 *
 * @remarks
 * Clause negation and nearest-distance ties are decided by the caller.
 *
 * @example
 * ```ts
 * import { findLinkedNumbers } from '@orkestrel/interpret'
 * findLinkedNumbers('hours 5', { start: 0, end: 5 }, [{ start: 6, end: 7 }], { start: 0, end: 7 })
 * // [{ index: 0, gap: 1 }]
 * ```
 */
export function findLinkedNumbers(
	text: string,
	anchor: TextSpan,
	numbers: readonly TextSpan[],
	clause: TextSpan,
): readonly AnchorCandidate[] {
	return [...numbers.entries()]
		.filter(([, number]) => number.start >= clause.start && number.start < clause.end)
		.filter(([, number]) => text[anchor.end] !== ':' || number.start >= anchor.end)
		.filter(([, number]) => number.end <= anchor.start || number.start >= anchor.end)
		.filter(([, number]) =>
			/^(?:\s|=|:|\b(?:is|of|at|to|a|an|the)\b)*$/i.test(
				text.slice(Math.min(anchor.end, number.end), Math.max(anchor.start, number.start)),
			),
		)
		.filter(
			([, number]) =>
				number.start >= anchor.end ||
				!/\b(?:a|an|the)\b/i.test(text.slice(number.end, anchor.start)),
		)
		.map(([index, number]) => ({
			index,
			gap: Math.max(number.start - anchor.end, anchor.start - number.end, 0),
		}))
		.sort((left, right) => left.gap - right.gap)
}

// === Intent classification

/**
 * Classifies the action + domain intent of a text against caller-supplied
 * vocabularies.
 *
 * @remarks
 * `actions` maps a token to an action name — the one action the text's tokens
 * name wins, at `CONFIDENCE_EXACT`, and two different actions name none. `domains` maps a domain
 * name to its keyword list — the one domain the text's tokens name wins, also at
 * `CONFIDENCE_EXACT`, and two domains name neither. An
 * unmatched axis is left `undefined` rather than an empty string, so an
 * unclassified intent is visibly absent. Combined confidence (pinned): the
 * action and the domain both fire → their average; exactly one fires → its
 * value times `0.5`; neither → `0`. There is no built-in worldview and no
 * auto-classification from an added recipe's own `domain` name — a caller
 * must list a recipe's domain among `domains` for it to classify. No
 * `floor` parameter: the confidence floor gate lives at the orchestrator's
 * `matchRecipe` step, never inside classification itself.
 *
 * @param text - The (normalized) text to classify
 * @param actions - The caller's token → action-name vocabulary
 * @param domains - The caller's domain-name → keyword-list vocabulary
 * @returns The classified intent, each unmatched axis absent
 *
 * @example
 * ```ts
 * import { classifyIntent } from '@orkestrel/interpret'
 *
 * classifyIntent('calculate my rate', { calculate: 'compute' }, { rating: ['rate'] })
 * // { action: 'compute', domain: 'rating', confidence: 1 }
 * classifyIntent('hello', {}, {}) // { confidence: 0 } — neither axis matched
 * ```
 */
export function classifyIntent(
	text: string,
	actions: Readonly<Record<string, string>>,
	domains: Readonly<Record<string, readonly string[]>>,
): Intent {
	const tokens = tokenize(text)

	// Two words naming two things name neither, so a tie on either axis leaves that axis out.
	const named = new Set(
		tokens.flatMap((token) =>
			[token, token.replace(/\.+$/u, '')].flatMap((word) =>
				Object.hasOwn(actions, word) ? [actions[word]] : [],
			),
		),
	)
	const [action] = named.size === 1 ? named : []
	const actionConfidence = action === undefined ? 0 : CONFIDENCE_EXACT
	const domainsNamed = Object.entries(domains).filter(([, keywords]) => {
		const lowerKeywords = keywords.map((keyword) => keyword.toLowerCase())
		return tokens.some(
			(token) =>
				lowerKeywords.includes(token) || lowerKeywords.includes(token.replace(/\.+$/u, '')),
		)
	})
	const domain = domainsNamed.length === 1 ? domainsNamed[0]?.[0] : undefined
	const domainConfidence = domain === undefined ? 0 : CONFIDENCE_EXACT

	const confidence =
		actionConfidence > 0 && domainConfidence > 0
			? (actionConfidence + domainConfidence) / 2
			: Math.max(actionConfidence, domainConfidence) * 0.5

	return {
		...(action === undefined ? {} : { action }),
		...(domain === undefined ? {} : { domain }),
		confidence,
	}
}

// === Digest

/**
 * Renders one node of a value into its canonical, key-order-stable string,
 * against the object ancestors already on the recursion path.
 *
 * @remarks
 * The recursive leaf behind {@link canonicalize} and {@link digestValue}, and
 * the one place `ancestors` is a real parameter rather than a seeded default.
 * Record keys sort before serialization, so a re-ordered object canonicalizes
 * identically; arrays keep position order, because position is meaningful.
 * `ancestors` tracks the objects along the current recursion path rather than
 * a global "seen" set, so the same object reachable twice through non-cyclic
 * sibling branches still canonicalizes normally; a node already on the path
 * renders as the literal string `'[cycle]'` instead of recursing —
 * deterministic, never throws, never overflows the call stack. Seeding
 * `ancestors` with a node makes that node render as `'[cycle]'`, so a caller
 * digesting a whole value passes an empty set.
 *
 * @param value - The value to canonicalize
 * @param ancestors - The objects already on the current recursion path
 * @returns The canonical string form of `value`
 *
 * @example
 * ```ts
 * import { canonicalizeNode } from '@orkestrel/interpret'
 *
 * canonicalizeNode({ b: 1, a: 2 }, new Set()) // '{"a":2,"b":1}'
 * const cyclic = { name: 'root' }
 * canonicalizeNode(cyclic, new Set([cyclic])) // '"[cycle]"'
 * ```
 */
export function canonicalizeNode(value: unknown, ancestors: ReadonlySet<object>): string {
	if (isArray(value)) {
		if (ancestors.has(value)) return JSON.stringify('[cycle]')
		const nested = new Set(ancestors)
		nested.add(value)
		return `[${value.map((entry) => canonicalizeNode(entry, nested)).join(',')}]`
	}
	if (isRecord(value)) {
		if (ancestors.has(value)) return JSON.stringify('[cycle]')
		const nested = new Set(ancestors)
		nested.add(value)
		const keys = Object.keys(value).sort()
		return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalizeNode(value[key], nested)}`).join(',')}}`
	}
	if (typeof value === 'bigint') return JSON.stringify(`${String(value)}n`)
	return JSON.stringify(value) ?? 'null'
}

/**
 * Renders a value into a canonical, key-order-stable string — the pre-image
 * of `digestValue`.
 *
 * @remarks
 * The public entry point: it starts {@link canonicalizeNode} from an empty
 * ancestor path, so the whole value canonicalizes and only a genuine cycle
 * renders as `'[cycle]'`. Total and cycle-safe — it never throws and never
 * overflows the call stack.
 *
 * @param value - The value to canonicalize
 * @returns The canonical string form
 *
 * @example
 * ```ts
 * import { canonicalize } from '@orkestrel/interpret'
 *
 * canonicalize({ b: 1, a: 2 }) === canonicalize({ a: 2, b: 1 }) // true
 * ```
 */
export function canonicalize(value: unknown): string {
	return canonicalizeNode(value, new Set())
}

/**
 * Computes a canonical structural digest of a pure-JSON value — a
 * key-order-stable FNV-1a hash rendered as an 8-hex-digit string.
 *
 * @remarks
 * Pure ECMAScript, no host crypto — the same algorithm as the
 * app's `digest`, ported into core so `Interpretation.digest` and the
 * versioned managers can hash without leaving strict core.
 *
 * @param value - The value to digest
 * @returns The 8-character hex digest
 *
 * @example
 * ```ts
 * import { digestValue } from '@orkestrel/interpret'
 *
 * digestValue({ a: 1 }) === digestValue({ a: 1 }) // true — deterministic
 * ```
 */
export function digestValue(value: unknown): string {
	const canonical = canonicalizeNode(value, new Set())
	const hash = Array.prototype.keys
		.call(canonical)
		.reduce(
			(current, index) => Math.imul(current ^ canonical.charCodeAt(index), 0x01000193),
			0x811c9dc5,
		)
	return (hash >>> 0).toString(16).padStart(8, '0')
}

// === Recipe matching

/**
 * Scores how well a classified intent matches one recipe's domain + action.
 *
 * @remarks
 * An absent axis scores `0` for that half — an unclassified intent matches no
 * recipe on the axis it never carried.
 *
 * @param intent - The classified intent
 * @param recipe - The candidate recipe
 * @returns A score in `[0, 1]` — the mean of the domain match (`1`/`0`) and
 * the action match (`1`/`0`, `recipe.intents` containing `intent.action`)
 *
 * @example
 * ```ts
 * import { objectShape } from '@orkestrel/contract'
 * import { scoreRecipe } from '@orkestrel/interpret'
 *
 * scoreRecipe(
 * 	{ action: 'compute', domain: 'rating', confidence: 1 },
 * 	{ id: 't1', name: 'T', domain: 'rating', intents: ['compute'], mappings: [], shape: objectShape({}), computations: [], definition: { reasoning: 'symbolic', id: 't1', name: 'T', equations: [], variables: {} } },
 * ) // 1
 * ```
 */
export function scoreRecipe(intent: Intent, recipe: Recipe): number {
	const domain = intent.domain
	const action = intent.action
	const domainScore =
		domain !== undefined && recipe.domain.toLowerCase() === domain.toLowerCase() ? 1 : 0
	const actionScore =
		action !== undefined &&
		recipe.intents.some((candidate) => candidate.toLowerCase() === action.toLowerCase())
			? 1
			: 0
	return (domainScore + actionScore) / 2
}

/**
 * Finds the best-scoring added recipe for a classified intent, gated by a
 * confidence floor.
 *
 * @remarks
 * Explicit no-match, never an arbitrary fallback recipe: an empty registry, an intent with no
 * domain, no recipe holding that domain, a tie for the best score, and a best score strictly
 * below `floor` each return `undefined`, because a wrong recipe is the worst path: everything after it can look clean.
 *
 * @param intent - The classified intent
 * @param recipes - The added recipes to score
 * @param floor - The minimum score a match must clear
 * @returns The best-scoring recipe, or `undefined` on no qualifying match
 *
 * @example
 * ```ts
 * import { matchRecipe } from '@orkestrel/interpret'
 *
 * matchRecipe({ confidence: 0 }, [], 0.3) // undefined — empty registry
 * ```
 */
export function matchRecipe(
	intent: Intent,
	recipes: readonly Recipe[],
	floor: number,
): Recipe | undefined {
	// An action alone names no recipe, however few answer it today, and a domain names only its own.
	const { domain } = intent
	if (domain === undefined) return undefined
	const scored = recipes
		.filter((recipe) => recipe.domain.toLowerCase() === domain.toLowerCase())
		.map((recipe) => ({ recipe, score: scoreRecipe(intent, recipe) }))
	const best = Math.max(-1, ...scored.map((entry) => entry.score))
	const leaders = scored.filter((entry) => entry.score === best)
	return leaders.length === 1 && best >= floor ? leaders[0]?.recipe : undefined
}

// === Computed fields

/**
 * Collects every variable name referenced by a symbolic expression tree, in
 * first-occurrence order.
 *
 * @param expression - The expression tree to scan
 * @returns The referenced variable names, deduplicated
 *
 * @example
 * ```ts
 * import { createConstant, createOperation, createVariable } from '@orkestrel/reason'
 * import { variablesOf } from '@orkestrel/interpret'
 *
 * variablesOf(createOperation('divide', createVariable('deductible'), createConstant(12))) // ['deductible']
 * ```
 */
export function variablesOf(expression: SymbolicExpression): readonly string[] {
	const names: string[] = []
	const seen = new Set<string>()
	const pending = [expression]
	while (pending.length > 0) {
		const node = pending.pop()
		if (node === undefined) continue
		if (node.form === 'variable') {
			if (!seen.has(node.name)) {
				seen.add(node.name)
				names.push(node.name)
			}
			continue
		}
		if (node.form === 'operation') {
			if (node.right !== undefined) pending.push(node.right)
			pending.push(node.left)
		}
	}
	return names
}

/**
 * Evaluates a symbolic expression tree against resolved bindings.
 *
 * @remarks
 * The critical leaf (design-pinned, engine-parity semantics): an absent
 * `right` operand on a binary operation has no answer, as the engine refuses it, and a
 * unary operation takes `0`, which it ignores. So a tree evaluates here only where it
 * evaluates inside the engine. Each arithmetic step delegates to the reasons
 * `applyOperation` pure function, mapping the node's `.operator` field onto
 * its `operator` parameter. An unresolved input variable, or a non-finite
 * result (`NaN` from a divide-by-zero, or an overflowing `±Infinity`),
 * becomes a gap — `undefined`, never landing on a subject.
 *
 * @param expression - The expression tree to evaluate
 * @param bindings - The resolved variable bindings
 * @returns The evaluated number, or `undefined` on an unresolved input or a
 * non-finite result
 *
 * @example
 * ```ts
 * import { createConstant, createOperation, createVariable } from '@orkestrel/reason'
 * import { resolveExpression } from '@orkestrel/interpret'
 *
 * resolveExpression(createOperation('divide', createVariable('deductible'), createConstant(12)), { deductible: 6000 }) // 500
 * resolveExpression(createOperation('divide', createConstant(1), createConstant(0)), {}) // undefined — NaN gap
 * resolveExpression(createVariable('missing'), {}) // undefined — unresolved input
 * ```
 */
export function resolveExpression(
	expression: SymbolicExpression,
	bindings: Readonly<Record<string, number>>,
): number | undefined {
	if (expression.form === 'constant') return expression.value
	if (expression.form === 'variable') {
		return Object.hasOwn(bindings, expression.name) ? bindings[expression.name] : undefined
	}

	const left = resolveExpression(expression.left, bindings)
	if (left === undefined) return undefined

	// An absent right side has an answer only on a unary operation, as the engine's own scan says.
	if (expression.right === undefined && scanSymbolicExpression(expression).length > 0) {
		return undefined
	}
	const right = expression.right === undefined ? 0 : resolveExpression(expression.right, bindings)
	if (right === undefined) return undefined

	const result = applyOperation(expression.operator, left, right)
	return isFiniteNumber(result) ? result : undefined
}

// === Reverse direction — structure to prose

/**
 * Renders a one-line description of a reasons `Subject` through an injected `Narrator`.
 *
 * @remarks
 * Each field renders through `narrator.label` and `narrator.value`, in key order. A field
 * holding `undefined` is absent and is omitted.
 *
 * @param subject - The subject to describe
 * @param narrator - The renderer of labels, values, and lines
 * @returns A one-line description, the lexicon's `'subject.empty'` line when empty
 *
 * @example
 * ```ts
 * import { createNarrator, renderSubject } from '@orkestrel/interpret'
 *
 * renderSubject({ age: 25, income: 50000 }, createNarrator()) // 'with age: 25, income: 50000'
 * ```
 */
export function renderSubject(subject: Subject, narrator: NarratorInterface): string {
	const keys = Object.keys(subject)
		.filter((key) => subject[key] !== undefined)
		.sort()
	if (keys.length === 0) return narrator.line('subject.empty', {})
	const parts = keys.map((key) => `${narrator.label(key)}: ${narrator.value(key, subject[key])}`)
	return normalizeLine(narrator.line('subject.fields', { fields: parts.join(', ') }))
}

// === The words: general and domain

/**
 * Finds a word under its own key of a table.
 *
 * @param words - The table to read, or `undefined` for none
 * @param key - The key to read
 * @returns The word, or `undefined` when the table holds no such own key
 *
 * @example
 * ```ts
 * import { findWord } from '@orkestrel/interpret'
 *
 * findWord({ cost: 'Cost' }, 'cost') // 'Cost'
 * findWord({ cost: 'Cost' }, 'toString') // undefined
 * ```
 */
export function findWord(
	words: Readonly<Record<string, string>> | undefined,
	key: string,
): string | undefined {
	return words !== undefined && Object.hasOwn(words, key) ? words[key] : undefined
}

/**
 * Scans one word of a lexicon or a glossary.
 *
 * @param path - The word's place, for the finding
 * @param value - The word to scan
 * @returns One finding when the word is no text, is blank, or holds a line break
 *
 * @example
 * ```ts
 * import { scanWord } from '@orkestrel/interpret'
 *
 * scanWord('labels.cost', 'Cost') // []
 * scanWord('labels.cost', ' ') // ['labels.cost is empty']
 * ```
 */
export function scanWord(path: string, value: unknown): readonly string[] {
	if (!isString(value)) return [`${path} is not text`]
	if (value.trim() === '') return [`${path} is empty`]
	return TEXT_BREAK_PATTERN.test(value) ? [`${path} holds a line break`] : []
}

/**
 * Scans a table of words.
 *
 * @param path - The table's path, for the findings
 * @param value - The table to scan
 * @param keys - The keys the table may hold; any key when absent
 * @returns One finding per unknown key and per malformed word
 *
 * @example
 * ```ts
 * import { scanWords } from '@orkestrel/interpret'
 *
 * scanWords(['rules'], { met: 'holds' }, ['met', 'unmet', 'unread']) // []
 * scanWords(['rules'], { meet: 'holds' }, ['met', 'unmet', 'unread'])
 * // ['rules.meet is not one of met, unmet, unread']
 * ```
 */
export function scanWords(
	path: readonly string[],
	value: unknown,
	keys?: readonly string[],
): readonly string[] {
	if (!isRecord(value)) return [`${renderPath(path)} is not a table of words`]
	return Object.entries(value).flatMap(([key, word]) => {
		const place = renderPath([...path, key])
		return keys === undefined || keys.includes(key)
			? scanWord(place, word)
			: [`${place} is not one of ${keys.join(', ')}`]
	})
}

/**
 * Scans a frame for slots its id does not offer.
 *
 * @param id - The frame's id
 * @param frame - The frame's template
 * @returns One finding per slot `FRAME_SLOTS` does not list for the id
 *
 * @example
 * ```ts
 * import { scanFrame } from '@orkestrel/interpret'
 *
 * scanFrame('rule.settled', '{{name}} {{verdict}}') // []
 * scanFrame('result.refused', '{{name}}: {{value}}')
 * // ['frames."result.refused" names the slot "value", and it offers name']
 * ```
 */
export function scanFrame(id: FrameName, frame: string): readonly string[] {
	const slots = FRAME_SLOTS[id]
	const path = renderPath(['frames', id])
	const offered = slots.join(', ') || 'none'
	return [...frame.matchAll(new RegExp(FILL_PATTERN.source, FILL_PATTERN.flags))].flatMap(
		([, token]) => {
			const slot = token?.trim()
			return slot === undefined || slots.includes(slot)
				? []
				: [`${path} names the slot ${preview(slot)}, and it offers ${offered}`]
		},
	)
}

/**
 * Scans an override of the general words.
 *
 * @remarks
 * Every word stands on its own: a table, a word, or a frame the lexicon does not hold is a
 * finding, as a blank word, a word with a line break, a frame naming a slot it does not offer,
 * and a limit that is no whole number it can keep are. Nothing the input holds throws.
 *
 * @param input - The override to scan
 * @returns One string per finding, empty when the override stands
 *
 * @example
 * ```ts
 * import { scanLexicon } from '@orkestrel/interpret'
 *
 * scanLexicon({ comparisons: { from: { fails: 'is below' } } }) // []
 * scanLexicon({ missing: '' }) // ['missing is empty']
 * ```
 */
export function scanLexicon(input: unknown): readonly string[] {
	const owned = attempt(() => cloneJSONRecord(input))
	if (!isSuccess(owned)) return [`The lexicon is not plain data: ${errorToMessage(owned.error)}`]
	return Object.entries(owned.value).flatMap(([table, words]) => {
		switch (table) {
			case 'comparisons':
				return isRecord(words)
					? Object.entries(words).flatMap(([comparison, phrase]) =>
							isComparison(comparison)
								? scanWords(['comparisons', comparison], phrase, ['holds', 'fails'])
								: [
										`${renderPath(['comparisons', comparison])} is not one of ${COMPARISONS.join(', ')}`,
									],
						)
					: ['comparisons is not a table of words']
			case 'checks':
			case 'rules':
			case 'verdicts':
			case 'aggregations':
			case 'faults':
			case 'values':
			case 'joins':
				return scanWords([table], words, Object.keys(DEFAULT_LEXICON[table]))
			case 'frames':
				return [
					...scanWords(['frames'], words, Object.keys(FRAME_SLOTS)),
					...Object.entries(isRecord(words) ? words : {}).flatMap(([id, frame]) =>
						isFrameName(id) && isString(frame) ? scanFrame(id, frame) : [],
					),
				]
			case 'limits':
				return isRecord(words)
					? Object.entries(words).flatMap(([limit, value]) => {
							const place = renderPath(['limits', limit])
							if (limit !== 'list' && limit !== 'reasons') {
								return [`${place} is not one of list, reasons`]
							}
							const least = limit === 'list' ? 0 : 1
							return isNonNegativeInteger(value) && value >= least
								? []
								: [`${place} is not a whole number from ${String(least)}`]
						})
					: ['limits is not a table of limits']
			case 'missing':
				return scanWord('missing', words)
			default:
				return [`${renderPath([table])} is not one of ${Object.keys(DEFAULT_LEXICON).join(', ')}`]
		}
	})
}

/**
 * Scans a glossary of domain words.
 *
 * @remarks
 * A table the glossary does not hold, a blank word, a word with a line break, a format the host
 * refuses, and a phrase table or template under a name the lexicon owns are findings. A unit
 * with no format is none: it is a {@link GlossaryGap}. Nothing the input holds throws.
 *
 * @param input - The glossary to scan
 * @returns One string per finding, empty when the glossary stands
 *
 * @example
 * ```ts
 * import { scanGlossary } from '@orkestrel/interpret'
 *
 * scanGlossary({ labels: { cost: 'Cost' } }) // []
 * scanGlossary({ labels: {}, templates: { 'rule.settled': '{{name}}' } })
 * // ['templates."rule.settled" is a frame of the lexicon']
 * ```
 */
export function scanGlossary(input: unknown): readonly string[] {
	const owned = attempt(() => cloneJSONRecord(input))
	if (!isSuccess(owned)) return [`The glossary is not plain data: ${errorToMessage(owned.error)}`]
	const glossary = owned.value
	const tables = Object.entries(glossary).flatMap(([table, words]) => {
		switch (table) {
			case 'labels':
			case 'units':
			case 'values':
				return scanWords([table], words)
			case 'formats':
				return isRecord(words)
					? Object.entries(words).flatMap(([unit, format]) => {
							const read = attempt((): unknown =>
								Reflect.construct(Intl.NumberFormat, [DEFAULT_LOCALE, format]),
							)
							return isRecord(format) && isSuccess(read)
								? []
								: [`${renderPath(['formats', unit])} is not a number format the host reads`]
						})
					: ['formats is not a table of formats']
			case 'phrases':
				return isRecord(words)
					? Object.entries(words).flatMap(([name, phrases]) => [
							...(Object.hasOwn(DEFAULT_LEXICON, name)
								? [`${renderPath(['phrases', name])} is a table of the lexicon`]
								: []),
							...scanWords(['phrases', name], phrases),
						])
					: ['phrases is not a table of phrase tables']
			case 'templates':
				return [
					...scanWords(['templates'], words),
					...Object.keys(isRecord(words) ? words : {}).flatMap((id) =>
						isFrameName(id) ? [`${renderPath(['templates', id])} is a frame of the lexicon`] : [],
					),
				]
			default:
				return [
					`${renderPath([table])} is not one of labels, units, values, formats, phrases, templates`,
				]
		}
	})
	return Object.hasOwn(glossary, 'labels') ? tables : ['labels is missing', ...tables]
}

/**
 * Merges an override over a lexicon, word by word.
 *
 * @param base - The lexicon that supplies every word the override leaves out
 * @param input - The words to override, each on its own
 * @returns A fresh, frozen, complete lexicon
 *
 * @example
 * ```ts
 * import { DEFAULT_LEXICON, mergeLexicon } from '@orkestrel/interpret'
 *
 * const lexicon = mergeLexicon(DEFAULT_LEXICON, { comparisons: { from: { fails: 'is below' } } })
 * lexicon.comparisons.from // { holds: 'is at least', fails: 'is below' }
 * ```
 */
export function mergeLexicon(base: Lexicon, input: LexiconInput): Lexicon {
	const from = base.comparisons
	const over = input.comparisons
	return Object.freeze({
		comparisons: Object.freeze({
			equals: Object.freeze({ ...from.equals, ...over?.equals }),
			not: Object.freeze({ ...from.not, ...over?.not }),
			above: Object.freeze({ ...from.above, ...over?.above }),
			below: Object.freeze({ ...from.below, ...over?.below }),
			from: Object.freeze({ ...from.from, ...over?.from }),
			to: Object.freeze({ ...from.to, ...over?.to }),
			any: Object.freeze({ ...from.any, ...over?.any }),
			none: Object.freeze({ ...from.none, ...over?.none }),
			between: Object.freeze({ ...from.between, ...over?.between }),
			outside: Object.freeze({ ...from.outside, ...over?.outside }),
		}),
		checks: Object.freeze({ ...base.checks, ...input.checks }),
		rules: Object.freeze({ ...base.rules, ...input.rules }),
		verdicts: Object.freeze({ ...base.verdicts, ...input.verdicts }),
		aggregations: Object.freeze({ ...base.aggregations, ...input.aggregations }),
		faults: Object.freeze({ ...base.faults, ...input.faults }),
		values: Object.freeze({ ...base.values, ...input.values }),
		joins: Object.freeze({ ...base.joins, ...input.joins }),
		frames: Object.freeze({ ...base.frames, ...input.frames }),
		limits: Object.freeze({ ...base.limits, ...input.limits }),
		missing: input.missing ?? base.missing,
	})
}

/**
 * Resolves the general words from an override and the shipped words.
 *
 * @param input - The override; none when absent
 * @returns The complete lexicon, which owns its words
 * @throws {@link InterpretError} `'LEXICON'` when {@link scanLexicon} finds anything
 *
 * @example
 * ```ts
 * import { resolveLexicon } from '@orkestrel/interpret'
 *
 * resolveLexicon({ missing: 'is unknown' }).missing // 'is unknown'
 * resolveLexicon({ missing: '' }) // throws InterpretError('LEXICON')
 * ```
 */
export function resolveLexicon(input?: LexiconInput): Lexicon {
	const owned = attempt(() => cloneJSONValue(input ?? {}))
	const read: unknown = isSuccess(owned) ? owned.value : input
	if (isSuccess(owned) && isLexiconInput(read)) return mergeLexicon(DEFAULT_LEXICON, read)
	const findings = scanLexicon(read)
	throw new InterpretError('LEXICON', `Lexicon is malformed: ${findings.join(', ')}`, { findings })
}

/**
 * Resolves the domain's words from a glossary.
 *
 * @param input - The glossary; one with no word when absent
 * @returns The glossary, which owns its words
 * @throws {@link InterpretError} `'GLOSSARY'` when {@link scanGlossary} finds anything
 *
 * @example
 * ```ts
 * import { resolveGlossary } from '@orkestrel/interpret'
 *
 * resolveGlossary({ labels: { cost: 'Cost' } }).labels.cost // 'Cost'
 * resolveGlossary({ labels: { cost: '' } }) // throws InterpretError('GLOSSARY')
 * ```
 */
export function resolveGlossary(input?: Glossary): Glossary {
	const owned = attempt(() => cloneJSONValue(input ?? { labels: {} }))
	const read: unknown = isSuccess(owned) ? owned.value : input
	if (isSuccess(owned) && isGlossary(read)) return read
	const findings = scanGlossary(read)
	throw new InterpretError('GLOSSARY', `Glossary is malformed: ${findings.join(', ')}`, {
		findings,
	})
}

/**
 * Resolves the locale numbers and lists print in.
 *
 * @param locale - The language tag. Default: `'en-US'`
 * @returns The language tag
 * @throws {@link InterpretError} `'LEXICON'` when the host does not read the tag
 *
 * @example
 * ```ts
 * import { resolveLocale } from '@orkestrel/interpret'
 *
 * resolveLocale() // 'en-US'
 * resolveLocale('not a tag') // throws InterpretError('LEXICON')
 * ```
 */
export function resolveLocale(locale: string = DEFAULT_LOCALE): string {
	const read = attempt(() => Intl.getCanonicalLocales(locale))
	if (isSuccess(read) && read.value.length === 1) return locale
	const finding = `The locale ${preview(locale)} is not a language tag`
	throw new InterpretError('LEXICON', finding, { findings: [finding] })
}

/**
 * Resolves the number formatters a narrator calls, by unit.
 *
 * @param input - The formatters; none when absent. A member that is no function is left out
 * @returns The formatters, which a later change to the input leaves as they are
 * @throws {@link InterpretError} `'GLOSSARY'` when the input or a member cannot be read
 *
 * @example
 * ```ts
 * import { resolveFormatters } from '@orkestrel/interpret'
 *
 * resolveFormatters({ acre: (value) => `${String(value)} ac` }).get('acre')?.(5) // '5 ac'
 * ```
 */
export function resolveFormatters(
	input?: NarratorOptions['formatters'],
): ReadonlyMap<string, NarratorFormatter> {
	const read = attempt(
		() => new Map(Object.entries(input ?? {}).filter(([, formatter]) => isFunction(formatter))),
	)
	if (isSuccess(read)) return read.value
	const finding = 'formatters cannot be read'
	throw new InterpretError('GLOSSARY', `Narrator options are malformed: ${finding}`, {
		findings: [finding],
	})
}

/**
 * Reads one option of a narrator.
 *
 * @param options - The options; none when absent
 * @param key - The option to read
 * @returns The option as it stands, or `undefined` when it is absent
 * @throws {@link InterpretError} when the option cannot be read: `'LEXICON'` for `lexicon` and
 * `locale`, `'GLOSSARY'` for `glossary` and `formatters`
 *
 * @example
 * ```ts
 * import { readNarratorOption } from '@orkestrel/interpret'
 *
 * readNarratorOption({ locale: 'de-DE' }, 'locale') // 'de-DE'
 * ```
 */
export function readNarratorOption<K extends keyof NarratorOptions>(
	options: NarratorOptions | undefined,
	key: K,
): NarratorOptions[K] | undefined {
	const read = attempt(() => options?.[key])
	if (isSuccess(read)) return read.value
	const code = key === 'lexicon' || key === 'locale' ? 'LEXICON' : 'GLOSSARY'
	const finding = `${key} cannot be read`
	throw new InterpretError(code, `Narrator options are malformed: ${finding}`, {
		findings: [finding],
	})
}

// === The evidence an account owns: copies of a run's data

/**
 * Clones a field's path.
 *
 * @param field - The path
 * @returns The path, its segments in a fresh list
 *
 * @example
 * ```ts
 * import { cloneFieldPath } from '@orkestrel/interpret'
 *
 * cloneFieldPath(['seat', 'cost']) // ['seat', 'cost']
 * ```
 */
export function cloneFieldPath(field: FieldPath): FieldPath {
	return isString(field) ? field : [...field]
}

/**
 * Clones a value a check compared, so that no write to the copy reaches it.
 *
 * @remarks
 * A subject can hold anything, so a value the host cannot clone is projected to JSON, and one with
 * no JSON form is `undefined`.
 *
 * @param value - The value
 * @returns The value itself when it is a primitive, and otherwise its copy
 *
 * @example
 * ```ts
 * import { cloneEvidence } from '@orkestrel/interpret'
 *
 * cloneEvidence(['a', 'b']) // ['a', 'b']
 * cloneEvidence(Math.max) // undefined
 * ```
 */
export function cloneEvidence(value: unknown): unknown {
	if (!isObject(value) && !isFunction(value)) return value
	const copy = attempt((): unknown => structuredClone(value))
	return isSuccess(copy) ? copy.value : projectValue(value)
}

/**
 * Clones the data a line was written from.
 *
 * @param source - The data
 * @returns A copy that shares no object with it
 *
 * @example
 * ```ts
 * import { cloneAccountSource } from '@orkestrel/interpret'
 *
 * cloneAccountSource({ rule: 'adult', check: { field: 'kind', operator: 'any', value: ['a'] } })
 * // { rule: 'adult', check: { field: 'kind', operator: 'any', value: ['a'] } }
 * ```
 */
export function cloneAccountSource(source: AccountSource): AccountSource {
	const { check, result, fault } = source
	return {
		...source,
		...(check === undefined
			? {}
			: {
					check: {
						...check,
						field: cloneFieldPath(check.field),
						value: cloneEvidence(check.value),
					},
				}),
		...(result === undefined
			? {}
			: {
					result: {
						...result,
						field: cloneFieldPath(result.field),
						actual: cloneEvidence(result.actual),
					},
				}),
		...(fault === undefined ? {} : { fault: structuredClone(fault) }),
	}
}

/**
 * Clones a gap.
 *
 * @param gap - The gap
 * @returns A copy that shares no object with it
 *
 * @example
 * ```ts
 * import { cloneGlossaryGap } from '@orkestrel/interpret'
 *
 * cloneGlossaryGap({ word: 'label', field: ['seat', 'cost'] })
 * // { word: 'label', field: ['seat', 'cost'] }
 * ```
 */
export function cloneGlossaryGap(gap: GlossaryGap): GlossaryGap {
	return { ...gap, ...(gap.field === undefined ? {} : { field: cloneFieldPath(gap.field) }) }
}

// === The gaps: domain words a definition needs

/**
 * Determines whether a check compares its field as a number, so a number of that field prints.
 *
 * @param check - The check to read
 * @returns True if the comparison orders numbers or an expected value is one; false otherwise
 *
 * @example
 * ```ts
 * import { matchesNumericCheck } from '@orkestrel/interpret'
 *
 * matchesNumericCheck({ field: 'cost', operator: 'to', value: 1250 }) // true
 * matchesNumericCheck({ field: 'member', operator: 'equals', value: 'gold' }) // false
 * ```
 */
export function matchesNumericCheck(check: Check): boolean {
	switch (check.operator) {
		case 'equals':
		case 'not':
			return isNumber(check.value)
		case 'any':
		case 'none':
			return isArray(check.value) && check.value.some((entry) => isNumber(entry))
		default:
			return true
	}
}

/**
 * Collects the gaps of one field's words.
 *
 * @param field - The field the words are for
 * @param numeric - If `true`, the field's numbers print and need a unit; if `false`, only a unit
 * the glossary names needs its format
 * @param glossary - The domain words supplied
 * @param formats - The units that have a format
 * @returns The field's gaps
 *
 * @example
 * ```ts
 * import { collectFieldGaps } from '@orkestrel/interpret'
 *
 * collectFieldGaps('cost', true, { labels: { cost: 'Cost' } }, new Set())
 * // [{ word: 'unit', field: 'cost' }]
 * ```
 */
export function collectFieldGaps(
	field: FieldPath,
	numeric: boolean,
	glossary: Glossary,
	formats: ReadonlySet<string>,
): readonly GlossaryGap[] {
	const key = formatField(field)
	const unit = findWord(glossary.units, key)
	const label: readonly GlossaryGap[] =
		findWord(glossary.labels, key) === undefined ? [{ word: 'label', field }] : []
	if (unit !== undefined) return [...label, ...collectUnitGaps(unit, formats)]
	return numeric ? [...label, { word: 'unit', field }] : label
}

/**
 * Collects the gap of one unit's format.
 *
 * @param unit - The unit a glossary names; none when absent
 * @param formats - The units that have a format
 * @returns One gap when the unit has no format
 *
 * @example
 * ```ts
 * import { collectUnitGaps } from '@orkestrel/interpret'
 *
 * collectUnitGaps('money', new Set()) // [{ word: 'format', unit: 'money' }]
 * ```
 */
export function collectUnitGaps(
	unit: string | undefined,
	formats: ReadonlySet<string>,
): readonly GlossaryGap[] {
	return unit === undefined || formats.has(unit) ? [] : [{ word: 'format', unit }]
}

/**
 * Collects the gap of one part's name.
 *
 * @param part - What the part is
 * @param named - The part's id and name
 * @returns One gap when the name is the id or is blank
 *
 * @example
 * ```ts
 * import { collectNameGaps } from '@orkestrel/interpret'
 *
 * collectNameGaps('rule', { id: 'adult', name: 'adult' })
 * // [{ word: 'name', part: 'rule', id: 'adult' }]
 * ```
 */
export function collectNameGaps(
	part: NonNullable<GlossaryGap['part']>,
	named: { readonly id: string; readonly name: string },
): readonly GlossaryGap[] {
	return named.name === named.id || named.name.trim() === ''
		? [{ word: 'name', part, id: named.id }]
		: []
}

/**
 * Filters gaps to one of each, in first-seen order.
 *
 * @param gaps - The gaps, repeats allowed
 * @returns Each gap once
 *
 * @example
 * ```ts
 * import { filterUniqueGaps } from '@orkestrel/interpret'
 *
 * filterUniqueGaps([{ word: 'unit', field: 'a' }, { word: 'unit', field: ['a'] }])
 * // [{ word: 'unit', field: 'a' }]
 * ```
 */
export function filterUniqueGaps(gaps: readonly GlossaryGap[]): readonly GlossaryGap[] {
	const keys = gaps.map((gap) =>
		canonicalize({ ...gap, field: gap.field === undefined ? undefined : formatField(gap.field) }),
	)
	const first = new Map([...keys.entries()].toReversed().map(([index, key]) => [key, index]))
	return gaps.filter((_gap, index) => first.get(keys[index] ?? '') === index)
}

/**
 * Collects every domain word some definitions need and the supplied words lack.
 *
 * @remarks
 * A disabled part needs no word, and a key an enabled rule concludes needs no label, because
 * the concluding rule's name prints in its place. A definition's value needs no unit, and a unit
 * the glossary names for it needs a format.
 *
 * @param definitions - The definitions to read
 * @param glossary - The domain words supplied
 * @param formats - The units that have a format
 * @returns Each gap once
 *
 * @example
 * ```ts
 * import { createAtom, createLogicalDefinition, createRule } from '@orkestrel/reason'
 * import { collectGaps } from '@orkestrel/interpret'
 *
 * const rule = createRule('adult', [createAtom('age', 'from', 18)], createAtom('adult', 'equals', true), {
 * 	name: 'Adult applicant',
 * })
 * const definition = createLogicalDefinition('loan', 'Loan', [rule])
 * collectGaps([definition], { labels: { age: 'Age' } }, new Set())
 * // [{ word: 'unit', field: 'age' }]
 * ```
 */
export function collectGaps(
	definitions: readonly Definition[],
	glossary: Glossary,
	formats: ReadonlySet<string>,
): readonly GlossaryGap[] {
	return filterUniqueGaps(
		definitions.flatMap((definition): readonly GlossaryGap[] => {
			const name = collectNameGaps('definition', definition)
			switch (definition.reasoning) {
				case 'logical': {
					const rules = definition.rules.filter((rule) => rule.enabled !== false)
					const concluders = collectConcluders(rules)
					return [
						...name,
						...rules.flatMap((rule) => collectNameGaps('rule', rule)),
						...rules
							.flatMap((rule) => rule.premises.flatMap((premise) => extractAtoms(premise)))
							.filter(({ check }) => findConditionRules(check, concluders).length === 0)
							.flatMap(({ check }) =>
								collectFieldGaps(check.field, matchesNumericCheck(check), glossary, formats),
							),
					]
				}
				case 'quantitative': {
					const groups = definition.groups.filter((group) => group.enabled !== false)
					const factors = groups.flatMap((group) =>
						group.factors.filter((factor) => factor.enabled !== false),
					)
					return [
						...name,
						...groups.flatMap((group) => collectNameGaps('group', group)),
						...factors.flatMap((factor) => collectNameGaps('factor', factor)),
						...factors.flatMap(({ source }) =>
							source.origin === 'static'
								? []
								: collectFieldGaps(source.field, source.origin === 'field', glossary, formats),
						),
						...factors
							.flatMap((factor) => factor.checks ?? [])
							.flatMap((check) =>
								collectFieldGaps(check.field, matchesNumericCheck(check), glossary, formats),
							),
						...collectUnitGaps(findWord(glossary.values, definition.id), formats),
					]
				}
				case 'symbolic': {
					const targets = definition.equations.map((equation) => equation.target)
					const inputs = definition.equations
						.flatMap(({ left, right }) => [...collectVariables(left), ...collectVariables(right)])
						.filter((variable) => !Object.hasOwn(definition.variables, variable))
					return [
						...name,
						...definition.equations.flatMap((equation) => collectNameGaps('equation', equation)),
						...[...targets, ...inputs].flatMap((field) =>
							collectFieldGaps(field, false, glossary, formats),
						),
					]
				}
				case 'inferential':
					return [
						...name,
						...definition.inferences
							.filter((inference) => inference.enabled !== false)
							.flatMap((inference) => collectNameGaps('inference', inference)),
					]
			}
		}),
	).map((gap) => cloneGlossaryGap(gap))
}

// === The reasons: the checks that fix a rule's state

/**
 * Finds the operands that decide a connective's state.
 *
 * @remarks
 * While the operands named keep their states, no change to any other moves a settled connective.
 * The first unmet operand fixes an `and` and the first met one an `or`; without one, every
 * operand does. An unmet first operand or a met second one fixes an `implies`. An unread
 * connective names its unread operands alone: settling all of them, whichever way, settles it.
 *
 * @param operator - The connective
 * @param states - The operands' states, in order
 * @returns The deciding operands' positions, in order
 *
 * @example
 * ```ts
 * import { findDecidingOperands } from '@orkestrel/interpret'
 *
 * findDecidingOperands('and', ['met', 'unmet', 'unmet']) // [1]
 * findDecidingOperands('or', ['unmet', 'unmet']) // [0, 1]
 * ```
 */
export function findDecidingOperands(
	operator: LogicalOperator,
	states: readonly CheckState[],
): readonly number[] {
	const every = states.map((_state, index) => index)
	if (combineStates(operator, states) === 'unread') {
		return every.filter((index) => states[index] === 'unread')
	}
	switch (operator) {
		case 'and':
			return states.includes('unmet') ? [states.indexOf('unmet')] : every
		case 'or':
			return states.includes('met') ? [states.indexOf('met')] : every
		case 'implies':
			if (states[0] === 'unmet') return [0]
			return states[1] === 'met' ? [1] : every
		case 'xor':
		case 'not':
			return every
	}
}

/**
 * Finds the rule a logical definition's verdict is the outcome of.
 *
 * @remarks
 * A definition has a goal when it has one enabled rule, or when its last enabled rule reads a
 * key another enabled rule concludes. Otherwise its rules are independent, and the last one
 * decides nothing about the others.
 *
 * @param definition - The definition to read
 * @returns The goal rule, or `undefined` when the definition has none
 *
 * @example
 * ```ts
 * import { createAtom, createLogicalDefinition, createRule } from '@orkestrel/reason'
 * import { findGoalRule } from '@orkestrel/interpret'
 *
 * const adult = createRule('adult', [createAtom('age', 'from', 18)], createAtom('adult', 'equals', true))
 * const local = createRule('local', [createAtom('city', 'equals', 'Rome')], createAtom('local', 'equals', true))
 * const open = createRule('open', [createAtom('adult', 'equals', true)], createAtom('open', 'equals', true))
 * findGoalRule(createLogicalDefinition('d', 'D', [adult, open])) // open
 * findGoalRule(createLogicalDefinition('d', 'D', [adult, local])) // undefined
 * ```
 */
export function findGoalRule(definition: LogicalDefinition): Rule | undefined {
	const rules = definition.rules.filter((rule) => rule.enabled !== false)
	const last = rules.at(-1)
	if (last === undefined || rules.length === 1) return last
	const concluders = collectConcluders(rules)
	const reads = last.premises
		.flatMap((premise) => extractAtoms(premise))
		.flatMap((atom) => concluders.get(formatField(atom.check.field)) ?? [])
	return reads.some((rule) => rule !== last) ? last : undefined
}

/**
 * Finds the expression an `and` or an `or` over one operand stands for.
 *
 * @param expression - The expression to read
 * @returns The innermost expression that is no such connective
 *
 * @example
 * ```ts
 * import { createAtom, createCompound } from '@orkestrel/reason'
 * import { findSoleExpression } from '@orkestrel/interpret'
 *
 * const atom = createAtom('a', 'equals', 1)
 * findSoleExpression(createCompound('and', [createCompound('or', [atom])])) // atom
 * ```
 */
export function findSoleExpression(expression: Expression): Expression {
	if (expression.form === 'atom') return expression
	const [sole, ...rest] = expression.operands
	return sole !== undefined &&
		rest.length === 0 &&
		(expression.operator === 'and' || expression.operator === 'or')
		? findSoleExpression(sole)
		: expression
}

/**
 * Finds the rules a check on a conclusion key is a condition of.
 *
 * @remarks
 * A comparison that a key no rule concluded leaves unmet holds when one of these rules applies:
 * those whose concluded value meets it. One that such a key meets, `not` and `none`, holds when
 * none of these rules applies: those whose concluded value does not meet it.
 *
 * @param check - The check to read
 * @param concluders - The enabled rules concluding each key
 * @returns The rules, in authored order; empty when no rule's value bears on the check
 *
 * @example
 * ```ts
 * import { collectConcluders, createAtom, createRule } from '@orkestrel/reason'
 * import { findConditionRules } from '@orkestrel/interpret'
 *
 * const rule = createRule('adult', [createAtom('age', 'from', 18)], createAtom('adult', 'equals', true))
 * const check = { field: 'adult', operator: 'equals', value: true } as const
 * findConditionRules(check, collectConcluders([rule])) // [rule]
 * ```
 */
export function findConditionRules(
	check: Check,
	concluders: ReadonlyMap<string, readonly Rule[]>,
): readonly Rule[] {
	const key = formatField(check.field)
	const bearing = readClosedState(check.operator) === 'met' ? 'unmet' : 'met'
	return (concluders.get(key) ?? []).filter((rule) => {
		const settled = attempt(() =>
			settleComparison(extractConclusions(rule.conclusion)[key], check.operator, check.value),
		)
		return isSuccess(settled) && settled.value === bearing
	})
}

/**
 * Settles one expression against the checks its atoms read, in extraction order.
 *
 * @param expression - The expression to settle
 * @param checks - Every check, in the order `extractAtoms` gives the atoms
 * @param start - The position of the expression's first check. Default: `0`
 * @returns The state, the checks that fix it, and the position after its last check
 *
 * @example
 * ```ts
 * import { createAtom, createCompound } from '@orkestrel/reason'
 * import { settleExpression } from '@orkestrel/interpret'
 *
 * const expression = createCompound('or', [createAtom('a', 'equals', 1), createAtom('b', 'equals', 1)])
 * const settled = settleExpression(expression, [
 * 	{ field: 'a', state: 'unmet', actual: 2 },
 * 	{ field: 'b', state: 'met', actual: 1 },
 * ])
 * settled.state // 'met'
 * settled.reasons.map((reason) => reason.check.field) // ['b']
 * ```
 */
export function settleExpression(
	expression: Expression,
	checks: readonly CheckResult[],
	start = 0,
): ExpressionResult {
	if (expression.form === 'atom') {
		const result = checks[start]
		return result === undefined
			? { state: 'unread', reasons: [], end: start + 1 }
			: { state: result.state, reasons: [{ check: expression.check, result }], end: start + 1 }
	}
	const operands = settleOperands(expression.operands, checks, start)
	const states = operands.map((operand) => operand.state)
	return {
		state: combineStates(expression.operator, states),
		reasons: findDecidingOperands(expression.operator, states).flatMap(
			(index) => operands[index]?.reasons ?? [],
		),
		end: operands.at(-1)?.end ?? start,
	}
}

/**
 * Settles expressions in order, each reading the checks after the one before it.
 *
 * @param operands - The expressions, in authored order
 * @param checks - Every check, in the order `extractAtoms` gives the atoms
 * @param start - The position of the first expression's first check. Default: `0`
 * @returns One result per expression
 *
 * @example
 * ```ts
 * import { createAtom } from '@orkestrel/reason'
 * import { settleOperands } from '@orkestrel/interpret'
 *
 * settleOperands([createAtom('a', 'equals', 1), createAtom('b', 'equals', 1)], [
 * 	{ field: 'a', state: 'unmet', actual: 2 },
 * 	{ field: 'b', state: 'met', actual: 1 },
 * ]).map((operand) => operand.state) // ['unmet', 'met']
 * ```
 */
export function settleOperands(
	operands: readonly Expression[],
	checks: readonly CheckResult[],
	start = 0,
): readonly ExpressionResult[] {
	const settled: ExpressionResult[] = []
	for (const operand of operands) {
		settled.push(settleExpression(operand, checks, settled.at(-1)?.end ?? start))
	}
	return settled
}

/**
 * Collects a rule's reasons: the checks that fix the state its result holds.
 *
 * @remarks
 * The rule's atoms pair with the result's checks in extraction order, and each premise is
 * settled again with `combineStates`. A result that does not pair, or whose states differ from
 * the settled ones, has no reason this rule can state. A check cited twice is collected once.
 *
 * @param rule - The rule
 * @param result - The rule's result
 * @returns The reasons, in authored order; empty when the result does not answer the rule
 *
 * @example
 * ```ts
 * import { createAtom, createRule } from '@orkestrel/reason'
 * import { collectReasons } from '@orkestrel/interpret'
 *
 * const rule = createRule('adult', [createAtom('age', 'from', 18)], createAtom('adult', 'equals', true))
 * collectReasons(rule, {
 * 	id: 'adult',
 * 	state: 'met',
 * 	premises: ['met'],
 * 	checks: [{ field: 'age', state: 'met', actual: 30 }],
 * }).length // 1
 * ```
 */
export function collectReasons(rule: Rule, result: RuleResult): readonly RuleReason[] {
	const read = attempt(() => {
		const atoms = rule.premises.flatMap((premise) => extractAtoms(premise))
		const fields = result.checks.map((check) => formatField(check.field))
		const paired =
			atoms.length === fields.length &&
			atoms.every((atom, index) => formatField(atom.check.field) === fields[index])
		if (!paired) return []
		const premises = settleOperands(rule.premises, result.checks)
		const states = premises.map((premise) => premise.state)
		const agreed =
			states.length === result.premises.length &&
			states.every((state, index) => state === result.premises[index]) &&
			combineStates('and', states) === result.state
		if (!agreed) return []
		const reasons = findDecidingOperands('and', states).flatMap(
			(index) => premises[index]?.reasons ?? [],
		)
		const keys = reasons.map((reason) => canonicalize(reason.check))
		return reasons.filter((_reason, index) => keys.indexOf(keys[index] ?? '') === index)
	})
	return isSuccess(read) ? read.value : []
}

// === The account's text

/**
 * Normalizes text to one line: each run of line breaks becomes one space.
 *
 * @param text - The text to normalize
 * @returns The text on one line
 *
 * @example
 * ```ts
 * import { normalizeLine } from '@orkestrel/interpret'
 *
 * normalizeLine('one\r\ntwo') // 'one two'
 * ```
 */
export function normalizeLine(text: string): string {
	return text.split(TEXT_BREAK_PATTERN).join(' ')
}

/**
 * Builds an account's line: each text on one line, and each gap once.
 *
 * @remarks
 * An absent `summary` is the text, an absent `decisive` is `false`, and an absent collection is
 * empty. The line's `source` and `gaps` are copies.
 *
 * @param input - The line's parts
 * @returns The line
 *
 * @example
 * ```ts
 * import { buildAccountLine } from '@orkestrel/interpret'
 *
 * buildAccountLine({ role: 'step', text: 'a\nb' })
 * // { role: 'step', decisive: false, text: 'a b', summary: 'a b', source: {}, gaps: [], lines: [] }
 * ```
 */
export function buildAccountLine(input: AccountLineInput): AccountLine {
	return {
		role: input.role,
		...(input.state === undefined ? {} : { state: input.state }),
		decisive: input.decisive ?? false,
		text: normalizeLine(input.text),
		summary: normalizeLine(input.summary ?? input.text),
		source: cloneAccountSource(input.source ?? {}),
		gaps: filterUniqueGaps(input.gaps ?? []).map((gap) => cloneGlossaryGap(gap)),
		lines: input.lines ?? [],
	}
}

/**
 * Collects the fields whose faults an account's lines name, their nested lines included.
 *
 * @param lines - The lines to read
 * @returns The display path of each field
 *
 * @example
 * ```ts
 * import { buildAccountLine, collectFaultFields } from '@orkestrel/interpret'
 *
 * const fault = { reason: 'missing', path: 'cost', expected: 'number' } as const
 * collectFaultFields([buildAccountLine({ role: 'reason', text: 'cost', source: { fault } })])
 * // a set holding 'cost'
 * ```
 */
export function collectFaultFields(lines: readonly AccountLine[]): ReadonlySet<string> {
	const pending = [...lines]
	for (const line of pending) pending.push(...line.lines)
	return new Set(
		pending.flatMap(({ source }) =>
			source.fault === undefined ? [] : [formatField(source.fault.path)],
		),
	)
}

/**
 * Renders reasons as one list, joined by a lexicon's words.
 *
 * @param reasons - The reasons, in order
 * @param joins - The words that stand between reasons, and before the last one
 * @returns The reasons as one text
 *
 * @example
 * ```ts
 * import { renderReasons } from '@orkestrel/interpret'
 *
 * renderReasons(['a', 'b', 'c'], { reasons: '; ', last: '; and ' }) // 'a; b; and c'
 * ```
 */
export function renderReasons(reasons: readonly string[], joins: Lexicon['joins']): string {
	const last = reasons.at(-1) ?? ''
	return reasons.length < 2
		? last
		: `${reasons.slice(0, -1).join(joins.reasons)}${joins.last}${last}`
}

/**
 * Renders a part's name, or its id where it has none.
 *
 * @param named - The part's id and name
 * @returns The name as authored, the id where the name is blank, or the quoted id where both are
 *
 * @example
 * ```ts
 * import { renderName } from '@orkestrel/interpret'
 *
 * renderName({ id: 'adult', name: 'Adult applicant' }) // 'Adult applicant'
 * renderName({ id: 'adult', name: '' }) // 'adult'
 * ```
 */
export function renderName(named: { readonly id: string; readonly name: string }): string {
	if (named.name.trim() !== '') return named.name
	return named.id.trim() === '' ? preview(named.id) : named.id
}

/**
 * Collects an account's lines as text at one level of detail, each indented by its depth.
 *
 * @param lines - The lines to render
 * @param detail - How much to render
 * @param depth - The lines' depth, indenting two spaces a level
 * @returns One string per rendered line
 *
 * @example
 * ```ts
 * import { buildAccountLine, collectAccountText } from '@orkestrel/interpret'
 *
 * collectAccountText([buildAccountLine({ role: 'verdict', text: 'Loan holds' })], 'full', 1)
 * // ['  Loan holds']
 * ```
 */
export function collectAccountText(
	lines: readonly AccountLine[],
	detail: AccountDetail,
	depth = 0,
): readonly string[] {
	if (detail === 'line') {
		return lines.filter((line) => line.role === 'verdict').map((line) => line.summary)
	}
	return lines
		.filter((line) => detail === 'full' || line.decisive)
		.flatMap((line) => [
			`${'  '.repeat(depth)}${line.text}`,
			...collectAccountText(line.lines, detail, depth + 1),
		])
}

/**
 * Renders an account as text.
 *
 * @remarks
 * `detail` selects how much renders: `line` the verdict alone, `reasons` the deciding lines
 * too, and `full` every line. Default: `'reasons'`. A nested line indents two spaces a level.
 *
 * @param account - The account to render
 * @param options - Optional `detail`
 * @returns The text, one line per rendered line
 *
 * @example
 * ```ts
 * import { createFactorGroup, createQuantitativeDefinition, createQuantitativeReasoner, createStaticFactor } from '@orkestrel/reason'
 * import { createNarrator, renderAccount } from '@orkestrel/interpret'
 *
 * const definition = createQuantitativeDefinition('risk', 'Risk', [
 * 	createFactorGroup('drivers', 'sum', [createStaticFactor('floor', 10)]),
 * ])
 * const result = createQuantitativeReasoner().reason({}, definition)
 * renderAccount(createNarrator().narrate(definition, result), { detail: 'line' }) // 'Risk: 10'
 * ```
 */
export function renderAccount(account: Account, options?: AccountOptions): string {
	return collectAccountText(account.lines, options?.detail ?? 'reasons').join('\n')
}

// === The recipe's shape

/**
 * Finds the field an entity lands on.
 *
 * @remarks
 * An entity's own `field` wins, then the mapping that names it, then its name as one key.
 *
 * @param entity - The entity
 * @param mappings - The recipe's mappings
 * @returns The field path the entity's value lands on
 *
 * @example
 * ```ts
 * import { findEntityField } from '@orkestrel/interpret'
 *
 * const entity = { name: 'age', value: 25, provenance: { category: 'extracted' }, confidence: 1 }
 * findEntityField(entity, [{ entity: 'age', aliases: [], field: ['person', 'age'] }]) // ['person', 'age']
 * findEntityField(entity, []) // 'age'
 * ```
 */
export function findEntityField(entity: Entity, mappings: readonly EntityMapping[]): FieldPath {
	if (entity.field !== undefined) return entity.field
	const mapping = mappings.find((candidate) => candidate.entity === entity.name)
	return mapping === undefined ? entity.name : mapping.field
}

/**
 * Builds a subject from entities, each on the field it lands on.
 *
 * @param entities - The entities
 * @param mappings - The recipe's mappings
 * @returns The subject
 *
 * @example
 * ```ts
 * import { buildSubject } from '@orkestrel/interpret'
 *
 * const entity = { name: 'age', value: 25, provenance: { category: 'extracted' }, confidence: 1 }
 * buildSubject([entity], []) // { age: 25 }
 * ```
 */
export function buildSubject(
	entities: readonly Entity[],
	mappings: readonly EntityMapping[],
): Subject {
	return entities.reduce<Subject>(
		(subject, entity) => setField(subject, findEntityField(entity, mappings), entity.value),
		{},
	)
}

/**
 * Determines whether a shape's field holds an array, so a mapping onto it collects many.
 *
 * @param shape - The recipe's shape
 * @param field - The field path
 * @returns True if the field's shape is an array, or a nullable array
 *
 * @example
 * ```ts
 * import { arrayShape, numberShape, objectShape } from '@orkestrel/contract'
 * import { matchesArrayField } from '@orkestrel/interpret'
 *
 * const shape = objectShape({ values: arrayShape(numberShape()), age: numberShape() })
 * matchesArrayField(shape, 'values') // true
 * matchesArrayField(shape, 'age')    // false
 * ```
 */
export function matchesArrayField(shape: ContractShape, field: FieldPath): boolean {
	const read = findFieldShape(shape, field).shape
	return read?.category === 'nullable'
		? read.inner.category === 'array'
		: read?.category === 'array'
}

/**
 * Finds the numbers no entity claimed.
 *
 * @remarks
 * Each number claims one entity's value, so a number stated twice and read once leaves one
 * behind. An entity holding an array claims each of its elements. Foreign occurrences are
 * set aside. Unreadable occurrences contribute their text instead of an inferred value.
 *
 * @param numbers - The numbers read from the text
 * @param entities - The entities assigned from them
 * @returns The numbers left over, in the order read
 *
 * @example
 * ```ts
 * import { findUnclaimedNumbers, scanNumbers } from '@orkestrel/interpret'
 *
 * const entity = { name: 'age', value: 25, provenance: { category: 'extracted' }, confidence: 1 }
 * findUnclaimedNumbers(scanNumbers('25 700'), [entity]) // [700]
 * ```
 */
export function findUnclaimedNumbers(
	numbers: readonly ReadNumber[],
	entities: readonly Entity[],
): ReadonlyArray<number | string> {
	const claimed = [
		...entities.flatMap<unknown>((entity) =>
			isArray(entity.value) ? [...entity.value] : [entity.value],
		),
	]
	return numbers.flatMap<number | string>((number) => {
		if (number.foreign !== undefined) return []
		if (number.unreadable !== undefined || number.value === undefined) return [number.raw]
		const at = claimed.indexOf(number.value)
		if (at < 0) return [number.value]
		claimed.splice(at, 1)
		return []
	})
}

/**
 * Finds the description a shape gives a field, which words the question for it.
 *
 * @param shape - The recipe's shape
 * @param field - The field path
 * @returns The field's description, or `undefined` when it has none
 *
 * @example
 * ```ts
 * import { numberShape, objectShape } from '@orkestrel/contract'
 * import { findFieldDescription } from '@orkestrel/interpret'
 *
 * const shape = objectShape({ age: numberShape({ description: 'How old are you?' }) })
 * findFieldDescription(shape, 'age') // 'How old are you?'
 * ```
 */
export function findFieldDescription(shape: ContractShape, field: FieldPath): string | undefined {
	const read = findFieldShape(shape, field).shape
	const leaf = read?.category === 'nullable' ? read.inner : read
	return leaf !== undefined && 'description' in leaf ? leaf.description : undefined
}

/**
 * Collects each default a shape holds, keyed by its field.
 *
 * @remarks
 * A computation may read a defaulted field and the door runs after computations, so given the
 * subject so far this answers what the door would fill: a default sits on an optional property
 * whose key is absent from an object that is present, so one inside an absent optional object
 * never fills. With no subject it answers every default the shape holds. What the door did fill
 * is its own `defaulted`, never this.
 *
 * @param shape - The recipe's shape
 * @param subject - The subject so far, or `undefined` for every default in the shape
 * @param path - The path walked so far
 * @returns Every default, outermost first
 *
 * @example
 * ```ts
 * import { numberShape, objectShape, optionalShape } from '@orkestrel/contract'
 * import { collectShapeDefaults } from '@orkestrel/interpret'
 *
 * const shape = objectShape({ term: optionalShape(numberShape(), { default: 12 }) })
 * collectShapeDefaults(shape, {}) // [{ field: ['term'], value: 12 }]
 * collectShapeDefaults(shape, { term: 24 }) // []
 * ```
 */
export function collectShapeDefaults(
	shape: ContractShape,
	subject?: unknown,
	path: readonly string[] = [],
): readonly ShapeDefault[] {
	if (shape.category === 'nullable' || shape.category === 'optional') {
		return collectShapeDefaults(shape.inner, subject, path)
	}
	if (shape.category !== 'object') return []
	return Object.entries(shape.properties).flatMap(([key, property]) => {
		const field = [...path, key]
		const own = isRecord(subject) && Object.hasOwn(subject, key) ? subject[key] : undefined
		if (property.category === 'optional' && property.default !== undefined && own === undefined) {
			return [{ field, value: property.default }]
		}
		if (subject === undefined) return collectShapeDefaults(property, undefined, field)
		return own === undefined ? [] : collectShapeDefaults(property, own, field)
	})
}

/**
 * Settles entities against what the door admitted.
 *
 * @remarks
 * A repaired value replaces the one read, and each filled default becomes an entity with
 * provenance `default`, so the entities and the subject say the same. A refusal changes nothing.
 *
 * @param entities - The resolved entities
 * @param mappings - The recipe's mappings
 * @param admission - What the door said
 * @returns The entities the subject is built from
 *
 * @example
 * ```ts
 * import { settleEntities } from '@orkestrel/interpret'
 *
 * settleEntities([], [], {
 * 	subject: { term: 12 },
 * 	faults: [],
 * 	repairs: [],
 * 	defaulted: ['term'],
 * 	errors: [],
 * })[0]?.provenance // { category: 'default' }
 * ```
 */
export function settleEntities(
	entities: readonly Entity[],
	mappings: readonly EntityMapping[],
	admission: SubjectAdmission,
): readonly Entity[] {
	const { subject } = admission
	if (subject === undefined) return entities
	const read = entities.map((entity) => {
		const value = resolveField(subject, findEntityField(entity, mappings))
		return value === entity.value ? entity : { ...entity, value }
	})
	const filled = admission.defaulted.map<Entity>((field) => {
		const key = formatField(field)
		const mapping = mappings.find((candidate) => formatField(candidate.field) === key)
		return {
			name: mapping?.entity ?? key,
			...(mapping === undefined ? { field } : {}),
			value: resolveField(subject, field),
			provenance: { category: 'default' },
			confidence: CONFIDENCE_DEFAULT,
		}
	})
	return [...read, ...filled]
}

/**
 * Describes what is wrong with a recipe's shape, against the recipe itself.
 *
 * @remarks
 * The shape must compile and stand, and it must declare every field a mapping or a computation
 * lands on. Every field it requires needs a mapping or a computation, and every variable a
 * computation reads needs a source. Each of these would otherwise reach the user as a question
 * nothing can answer, or fail every turn.
 *
 * @param recipe - The recipe
 * @returns One string per problem, empty when the recipe's shape stands
 *
 * @example
 * ```ts
 * import { numberShape, objectShape } from '@orkestrel/contract'
 * import { createLogicalDefinition } from '@orkestrel/reason'
 * import { scanRecipeShape } from '@orkestrel/interpret'
 *
 * scanRecipeShape({
 * 	id: 'r',
 * 	name: 'R',
 * 	domain: 'd',
 * 	intents: [],
 * 	mappings: [{ entity: 'agee', aliases: [], field: 'agee' }],
 * 	computations: [],
 * 	definition: createLogicalDefinition('r', 'R', []),
 * 	shape: objectShape({ age: numberShape() }),
 * }) // ['Field "agee" is mapped, and the shape does not declare it']
 * ```
 */
export function scanRecipeShape(recipe: Recipe): readonly string[] {
	const { shape } = recipe
	const compiled = attempt(() => createContract(shape))
	const mapped = recipe.mappings
		.filter((mapping) => !findFieldShape(shape, mapping.field).declared)
		.map(
			(mapping) =>
				`Field "${formatField(mapping.field)}" is mapped, and the shape does not declare it`,
		)
	const computed = recipe.computations
		.filter((computation) => !findFieldShape(shape, computation.field).declared)
		.map(
			(computation) =>
				`Field "${formatField(computation.field)}" is computed, and the shape does not declare it`,
		)
	const filled = [...recipe.mappings, ...recipe.computations].map((entry) =>
		formatField(entry.field),
	)
	const unfilled = collectRequiredFields(shape)
		.filter((field) => !matchesFilledField(field, filled))
		.map((field) => `Field "${field}" is required, and no mapping or computation fills it`)
	const known = [...filled, ...collectShapeDefaults(shape).map((entry) => formatField(entry.field))]
	const unbound = recipe.computations.flatMap((computation) =>
		variablesOf(computation.expression)
			.filter((name) => !matchesFilledField(name.replace(/\.\d+$/, ''), known))
			.map(
				(name) =>
					`Computation of "${formatField(computation.field)}" reads "${name}", which nothing fills`,
			),
	)
	return [
		...scanShape(shape),
		...(compiled.success
			? []
			: [
					`Shape does not compile: ${isError(compiled.error) ? compiled.error.message : String(compiled.error)}`,
				]),
		...mapped,
		...computed,
		...unfilled,
		...unbound,
	]
}

/**
 * Lists the fields a shape requires, each as its dot-joined path.
 *
 * @remarks
 * An object's own required keys speak for it. One with none is a field of its own, since the door
 * still needs the key. Anything under an optional key is not required, and neither is a key of an
 * open object.
 *
 * @param shape - The shape
 * @param path - The path walked so far
 * @returns Every required field
 *
 * @example
 * ```ts
 * import { numberShape, objectShape, optionalShape } from '@orkestrel/contract'
 * import { collectRequiredFields } from '@orkestrel/interpret'
 *
 * collectRequiredFields(
 * 	objectShape({ age: numberShape(), term: optionalShape(numberShape()) }),
 * ) // ['age']
 * ```
 */
export function collectRequiredFields(
	shape: ContractShape,
	path: readonly string[] = [],
): readonly string[] {
	if (shape.category === 'nullable') return collectRequiredFields(shape.inner, path)
	if (shape.category !== 'object') return path.length === 0 ? [] : [path.join('.')]
	const inner = Object.entries(shape.properties).flatMap(([key, property]) =>
		property.category === 'optional' ? [] : collectRequiredFields(property, [...path, key]),
	)
	return inner.length > 0 || path.length === 0 ? inner : [path.join('.')]
}

/**
 * Determines whether a field is filled by one of the given fields: itself, one above it, or one
 * inside it.
 *
 * @param field - The dot-joined field
 * @param filled - The dot-joined fields something fills
 * @returns True if the field has a source
 *
 * @example
 * ```ts
 * import { matchesFilledField } from '@orkestrel/interpret'
 *
 * matchesFilledField('terms', ['terms.rate'])  // true
 * matchesFilledField('terms.rate', ['terms'])  // true
 * matchesFilledField('terms', ['term'])        // false
 * ```
 */
export function matchesFilledField(field: string, filled: readonly string[]): boolean {
	return filled.some(
		(other) => other === field || other.startsWith(`${field}.`) || field.startsWith(`${other}.`),
	)
}

/**
 * Asserts a value is a recipe that stands.
 *
 * @param recipe - The value to check
 * @throws {@link InterpretError} `'DEFINITION'` on a malformed recipe or one whose shape does not stand
 *
 * @example
 * ```ts
 * import { assertRecipe } from '@orkestrel/interpret'
 *
 * assertRecipe({ id: 'r' }) // throws InterpretError('DEFINITION')
 * ```
 */
export function assertRecipe(recipe: unknown): asserts recipe is Recipe {
	if (!isRecipe(recipe)) throw new InterpretError('DEFINITION', 'Recipe is malformed')
	const errors = scanRecipeShape(recipe)
	if (errors.length > 0) {
		throw new InterpretError(
			'DEFINITION',
			`Recipe "${recipe.id}" is invalid: ${errors.join(', ')}`,
			{ errors },
		)
	}
}

/**
 * Projects an interpretation to JSON, so it can cross a boundary.
 *
 * @remarks
 * A stage record holds live values and a subject may hold a non-finite number, so what crosses
 * is this projection: non-finite as `null`, `undefined` omitted.
 *
 * @param result - The interpretation
 * @returns Its JSON projection, which `interpretationContract` admits
 *
 * @example
 * ```ts
 * import { createInterpret, interpretationContract, projectInterpretation } from '@orkestrel/interpret'
 *
 * const interpret = createInterpret()
 * interpretationContract.is(projectInterpretation(interpret.interpret('hello'))) // true
 * interpret.destroy()
 * ```
 */
export function projectInterpretation(result: Interpretation): JSONValue | undefined {
	return projectValue(result, new Set(), { left: Number.POSITIVE_INFINITY })
}
