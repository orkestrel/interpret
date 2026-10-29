import type { FieldPath } from '@orkestrel/contract'
import type { Subject, SymbolicExpression } from '@orkestrel/reason'
import type { Intent, NarratorInterface, Template } from './types.js'
import { isArray, isFiniteNumber, isRecord } from '@orkestrel/contract'
import { applyOperation } from '@orkestrel/reason'
import { BigramCounter } from './BigramCounter.js'
import { CONFIDENCE_EXACT, NUMBER_PATTERN, UNSAFE_FIELD_SEGMENTS } from './constants.js'

// The interprets pure-leaf inventory — every function here is
// a referentially-transparent computation with no instance state, exported
// and independently unit-testable. Stateful orchestration (the fixed
// pipeline, entity assignment sequencing, template registration) lives on the
// `Interpret` orchestrator and its stage classes, never here.

// === Regex safety

/**
 * Escapes every regex metacharacter in `text` so it matches literally when
 * compiled into a `RegExp`.
 *
 * @param text - The literal text to escape
 * @returns `text` with every regex metacharacter backslash-escaped
 *
 * @example
 * ```ts
 * import { escapeRegExp } from '@orkestrel/interpret'
 *
 * escapeRegExp('a.b*c') // 'a\\.b\\*c'
 * new RegExp(escapeRegExp('a.b*c')).test('a.b*c') // true
 * ```
 */
export function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// === Field paths — safe copy-on-write writes

/**
 * Writes a value at a (possibly nested) field path on a subject, copy-on-write.
 *
 * @remarks
 * Never mutates `subject` — every level a `field` array descends through is
 * freshly copied, so the input and every intermediate record stay untouched.
 * Prototype-pollution-safe: a `field` containing `__proto__`,
 * `prototype`, or `constructor` at any segment (checked against
 * `UNSAFE_FIELD_SEGMENTS`) is refused as a no-op, returning `subject`
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
 * case-insensitive; each key is regex-escaped through the core-root
 * `escapeRegExp` before compiling, so a caller-supplied phrase containing
 * regex metacharacters is matched literally. Multiple keys apply in
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
 * the caller's business, supplied through a `Template`.
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

// === Intent classification

/**
 * Classifies the action + domain intent of a text against caller-supplied
 * vocabularies.
 *
 * @remarks
 * `actions` maps a token to an action name — the first matching token in
 * `text` (left to right) wins, at `CONFIDENCE_EXACT`. `domains` maps a domain
 * name to its keyword list — the domain with the most matching tokens wins
 * (ties keep the earliest-declared domain), also at `CONFIDENCE_EXACT`. An
 * unmatched axis is left `undefined` rather than an empty string, so an
 * unclassified intent is visibly absent. Combined confidence (pinned): the
 * action and the domain both fire → their average; exactly one fires → its
 * value times `0.5`; neither → `0`. There is no built-in worldview and no
 * auto-classification from an added template's own `domain` name — a caller
 * must list a template's domain among `domains` for it to classify. No
 * `floor` parameter: the confidence floor gate lives at the orchestrator's
 * `matchTemplate` step, never inside classification itself.
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

	const action = Iterator.from(tokens)
		.map((token) => actions[token])
		.find((mapped) => mapped !== undefined)
	const actionConfidence = action === undefined ? 0 : CONFIDENCE_EXACT
	const selected = Object.entries(domains).reduce<{
		readonly domain: string | undefined
		readonly matches: number
	}>(
		(best, [name, keywords]) => {
			const lowerKeywords = keywords.map((keyword) => keyword.toLowerCase())
			const matches = tokens.reduce(
				(count, token) => count + Number(lowerKeywords.includes(token)),
				0,
			)
			return matches > best.matches ? { domain: name, matches } : best
		},
		{ domain: undefined, matches: 0 },
	)
	const domain = selected.domain
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

// === Fuzzy matching

/**
 * Measures bigram (Dice coefficient) string similarity, case-insensitive.
 *
 * @param a - The first string
 * @param b - The second string
 * @returns A score in `[0, 1]` — `1` for an exact (case-insensitive) match,
 * `0` when either string is shorter than 2 characters and they are not equal
 *
 * @example
 * ```ts
 * import { scoreSimilarity } from '@orkestrel/interpret'
 *
 * scoreSimilarity('rate', 'rate')  // 1
 * scoreSimilarity('rate', 'value') // 0 — no shared bigrams
 * ```
 */
export function scoreSimilarity(a: string, b: string): number {
	const left = a.toLowerCase()
	const right = b.toLowerCase()
	if (left === right) return 1
	if (left.length < 2 || right.length < 2) return 0

	const matches = new BigramCounter(left).match(right)
	return (2 * matches) / (left.length - 1 + (right.length - 1))
}

/**
 * Returns the best `scoreSimilarity` a token achieves against a list of aliases,
 * gated by a threshold.
 *
 * @param token - The token to score
 * @param aliases - The alias phrases to score against
 * @param threshold - The minimum score to report (an explicit no-match below it)
 * @returns The best score when it meets `threshold`, else `0`
 *
 * @example
 * ```ts
 * import { matchAlias } from '@orkestrel/interpret'
 *
 * matchAlias('valu', ['value', 'amount'], 0.6) // ~0.86 — fuzzy hit on 'value'
 * matchAlias('xyz', ['value', 'amount'], 0.6)  // 0 — no alias clears the threshold
 * ```
 */
export function matchAlias(token: string, aliases: readonly string[], threshold: number): number {
	const best = Iterator.from(aliases).reduce(
		(score, alias) => Math.max(score, scoreSimilarity(token, alias)),
		0,
	)
	return best >= threshold ? best : 0
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

// === Template matching

/**
 * Scores how well a classified intent matches one template's domain + action.
 *
 * @remarks
 * An absent axis scores `0` for that half — an unclassified intent matches no
 * template on the axis it never carried.
 *
 * @param intent - The classified intent
 * @param template - The candidate template
 * @returns A score in `[0, 1]` — the mean of the domain match (`1`/`0`) and
 * the action match (`1`/`0`, `template.intents` containing `intent.action`)
 *
 * @example
 * ```ts
 * import { scoreTemplate } from '@orkestrel/interpret'
 *
 * scoreTemplate(
 * 	{ action: 'compute', domain: 'rating', confidence: 1 },
 * 	{ id: 't1', name: 'T', domain: 'rating', intents: ['compute'], mappings: [], defaults: [], computations: [], definition: { reasoning: 'symbolic', id: 't1', name: 'T', equations: [], variables: {} } },
 * ) // 1
 * ```
 */
export function scoreTemplate(intent: Intent, template: Template): number {
	const domain = intent.domain
	const action = intent.action
	const domainScore =
		domain !== undefined && template.domain.toLowerCase() === domain.toLowerCase() ? 1 : 0
	const actionScore =
		action !== undefined &&
		template.intents.some((candidate) => candidate.toLowerCase() === action.toLowerCase())
			? 1
			: 0
	return (domainScore + actionScore) / 2
}

/**
 * Finds the best-scoring added template for a classified intent, gated by a
 * confidence floor.
 *
 * @remarks
 * Explicit no-match, never an arbitrary fallback template: an empty registry,
 * and a best score strictly below `floor`, each return `undefined`.
 *
 * @param intent - The classified intent
 * @param templates - The added templates to score
 * @param floor - The minimum score a match must clear
 * @returns The best-scoring template, or `undefined` on no qualifying match
 *
 * @example
 * ```ts
 * import { matchTemplate } from '@orkestrel/interpret'
 *
 * matchTemplate({ confidence: 0 }, [], 0.3) // undefined — empty registry
 * ```
 */
export function matchTemplate(
	intent: Intent,
	templates: readonly Template[],
	floor: number,
): Template | undefined {
	const best = Iterator.from(templates).reduce<{
		readonly template: Template | undefined
		readonly score: number
	}>(
		(current, template) => {
			const score = scoreTemplate(intent, template)
			return score > current.score ? { template, score } : current
		},
		{ template: undefined, score: -1 },
	)
	return best.template !== undefined && best.score >= floor ? best.template : undefined
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
 * `right` operand on a binary operation defaults to `0` — matching
 * `SymbolicReasoner`'s internal `#evaluate` — and is always passed as an
 * explicit numeric operand, so the same tree evaluates identically here and
 * inside the engine. Each arithmetic step delegates to the reasons
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
	if (expression.form === 'variable') return bindings[expression.name]

	const left = resolveExpression(expression.left, bindings)
	if (left === undefined) return undefined

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
