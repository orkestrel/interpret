import type { ContractShape, FieldPath, JSONValue } from '@orkestrel/contract'
import type { Subject, SubjectAdmission, SymbolicExpression } from '@orkestrel/reason'
import type {
	AnchorCandidate,
	AnchorRefusalHandler,
	Entity,
	EntityMapping,
	Intent,
	Interpretation,
	NarratorInterface,
	Recipe,
	ReadNumber,
	ShapeDefault,
	TextSpan,
} from './types.js'
import {
	attempt,
	createContract,
	escapeRegExp,
	isArray,
	isError,
	isFiniteNumber,
	isRecord,
	resolveField,
} from '@orkestrel/contract'
import {
	applyOperation,
	findFieldShape,
	formatField,
	projectValue,
	scanShape,
	scanSymbolicExpression,
} from '@orkestrel/reason'
import { UNSAFE_FIELD_SEGMENTS } from '@orkestrel/template'
import {
	CLAUSE_BREAK_PATTERN,
	CONFIDENCE_DEFAULT,
	CONFIDENCE_EXACT,
	NUMBER_PATTERN,
} from './constants.js'
import { InterpretError } from './errors.js'
import { isRecipe } from './validators.js'

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
		tokens.flatMap((token) => (Object.hasOwn(actions, token) ? [actions[token]] : [])),
	)
	const [action] = named.size === 1 ? named : []
	const actionConfidence = action === undefined ? 0 : CONFIDENCE_EXACT
	const domainsNamed = Object.entries(domains).filter(([, keywords]) => {
		const lowerKeywords = keywords.map((keyword) => keyword.toLowerCase())
		return tokens.some((token) => lowerKeywords.includes(token))
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
 * Renders a one-line, display-neutral description of a reasons `Subject`,
 * through an injected `Narrator`.
 *
 * @remarks
 * Complements — never duplicates — the raters `describe*` family (which
 * describes raters artifacts); this describes reasons artifacts. Every field
 * renders through `narrator.label` + `narrator.value` (looked up under the
 * `'units'` phrase table, falling back to `'plain'`) — the wording is fully
 * lexicon-driven, mechanism rather than policy; `Definition` /
 * `ReasonResult` narration lives on `Narrator#describe` / `Narrator#narrate`
 * directly.
 *
 * @param subject - The subject to describe
 * @param narrator - The lexicon-driven renderer to render field labels/values/lines through
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
	const keys = Object.keys(subject).sort()
	if (keys.length === 0) return narrator.line('subject.empty', {})
	const parts = keys.map((key) => {
		const unit = narrator.phrase('units', key, 'plain')
		return `${narrator.label(key)}: ${narrator.value(unit, subject[key])}`
	})
	return narrator.line('subject.fields', { fields: parts.join(', ') })
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
