import type { FieldPath } from '@orkestrel/contract'
import type { Subject, SymbolicExpression } from '@orkestrel/reason'
import type { Entity, EntityMapping, Intent, NarratorInterface, Template } from './types.js'
import { isFiniteNumber, isRecord, parseJSONAs, resolveField } from '@orkestrel/contract'
import { applyOperation } from '@orkestrel/reason'
import {
	CONFIDENCE_ALIAS,
	CONFIDENCE_COLLECT,
	CONFIDENCE_EXACT,
	CONFIDENCE_POSITIONAL,
	NUMBER_PATTERN,
	UNSAFE_FIELD_SEGMENTS,
} from './constants.js'
import { isTemplate } from './validators.js'

// The interprets pure-leaf inventory (AGENTS §5/§7) — every function here is
// a referentially-transparent computation with no instance state, exported
// and independently unit-testable. Stateful orchestration (the five-stage
// pipeline, entity assignment sequencing, template registration) lives on the
// `Interpret` orchestrator and its stage classes, never here.

// === Regex safety

/**
 * Escape every regex metacharacter in `text` so it matches literally when
 * compiled into a `RegExp`.
 *
 * @param text - The literal text to escape
 * @returns `text` with every regex metacharacter backslash-escaped
 *
 * @example
 * ```ts
 * import { escapeRegExp } from '@src/core'
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
 * Copy-on-write write a value at a (possibly nested) field path on a subject.
 *
 * @remarks
 * Never mutates `subject` — every level a `field` array descends through is
 * freshly copied, so the input and every intermediate record stay untouched
 * (AGENTS §11). Prototype-pollution-safe: a `field` containing `__proto__`,
 * `prototype`, or `constructor` at ANY segment (checked against
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
 * import { setField } from '@src/core'
 *
 * setField({ age: 25 }, 'age', 30)               // { age: 30 }
 * setField({}, ['address', 'city'], 'Reno')      // { address: { city: 'Reno' } }
 * setField({}, ['__proto__', 'polluted'], true)  // {} — refused, unchanged
 * ```
 */
/**
 * Derive the sibling field path for a computed aggregate of `field` — the
 * suffix is appended to `field`'s OWN last segment, so the aggregate nests
 * beside the source field rather than flattening past it.
 *
 * @remarks
 * For an array {@link FieldPath} (e.g. `['address', 'amounts']`) with suffix
 * `'Sum'` the result is `['address', 'amountsSum']` — nested beside
 * `address.amounts`. For a plain string field the result stays a flat string
 * (`'amounts'` → `'amountsSum'`), matching the existing single-key behavior.
 *
 * @param field - The source field path
 * @param suffix - The aggregate suffix (`'Sum'`, `'Count'`, `'Average'`, `'Minimum'`, `'Maximum'`)
 * @returns The sibling field path for the aggregate
 *
 * @example
 * ```ts
 * import { deriveAggregateField } from '@src/core'
 *
 * deriveAggregateField(['address', 'amounts'], 'Sum') // ['address', 'amountsSum']
 * deriveAggregateField('amounts', 'Sum')               // 'amountsSum'
 * ```
 */
export function deriveAggregateField(field: FieldPath, suffix: string): FieldPath {
	if (Array.isArray(field)) {
		const last = field[field.length - 1]
		return [...field.slice(0, -1), `${last}${suffix}`]
	}
	return `${field}${suffix}`
}

export function setField(subject: Subject, field: FieldPath, value: unknown): Subject {
	const path = Array.isArray(field) ? field : [field]
	if (path.length === 0) return subject
	if (path.some((segment) => UNSAFE_FIELD_SEGMENTS.includes(segment))) return subject
	const [key, ...rest] = path
	if (key === undefined) return subject
	if (rest.length === 0) return { ...subject, [key]: value }
	const child = subject[key]
	const nested = isRecord(child) ? child : {}
	return { ...subject, [key]: setField(nested, rest, value) }
}

// === Message interpolation

/**
 * Interpolate `{{dotted.path}}` tokens in a message template against a record.
 *
 * @remarks
 * Each token is split on `.` into a {@link FieldPath} array and resolved with
 * the contracts `resolveField` (a plain string field is ONE key, never
 * dot-split — the split here is the token-to-path bridge). A finite number
 * renders with `en-US` thousand grouping (`5010` → `5,010`); any other
 * resolved value String-coerces. An UNRESOLVED path (the resolved value is
 * `undefined`) renders as the empty string — the deterministic "nothing to
 * show" rule.
 *
 * @param template - The message template carrying `{{dotted.path}}` tokens
 * @param record - The record tokens resolve against
 * @returns The template with every token replaced
 *
 * @example
 * ```ts
 * import { interpolateMessage } from '@src/core'
 *
 * interpolateMessage('Limit is {{limit}}', { limit: 5010 }) // 'Limit is 5,010'
 * interpolateMessage('Missing {{gone}}', {})                // 'Missing '
 * ```
 */
export function interpolateMessage(
	template: string,
	record: Readonly<Record<string, unknown>>,
): string {
	return template.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_match, path: string) => {
		const value = resolveField(record, path.split('.'))
		if (value === undefined) return ''
		if (isFiniteNumber(value)) return value.toLocaleString('en-US')
		return String(value)
	})
}

// === Normalization

/**
 * Replace every whole-word occurrence of a map's keys with their values.
 *
 * @remarks
 * Word-boundary safe (`in` never matches inside `information`) and
 * case-insensitive; each key is regex-escaped via the core-root
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
 * import { applyReplacements } from '@src/core'
 *
 * applyReplacements("can't stop", { "can't": 'cannot' }) // 'cannot stop'
 * applyReplacements('information', { in: 'IN' })          // 'information' — word-boundary safe
 * ```
 */
export function applyReplacements(text: string, map: Readonly<Record<string, string>>): string {
	let result = text
	for (const [from, to] of Object.entries(map)) {
		const pattern = new RegExp(`\\b${escapeRegExp(from)}\\b`, 'gi')
		result = result.replace(pattern, to)
	}
	return result
}

/**
 * Collapse every run of whitespace to a single space and trim the ends.
 *
 * @param text - The text to collapse
 * @returns The collapsed text
 *
 * @example
 * ```ts
 * import { collapseWhitespace } from '@src/core'
 *
 * collapseWhitespace('  a   b\t c ') // 'a b c'
 * ```
 */
export function collapseWhitespace(text: string): string {
	return text.replace(/\s+/g, ' ').trim()
}

// === Tokenization (internal plumbing shared by extraction & classification)

/**
 * Split text into lowercase tokens, stripping punctuation outside a small
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
 * import { tokenize } from '@src/core'
 *
 * tokenize('The rate is 85%.') // ['the', 'rate', 'is', '85%']
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
 * Mine every numeric literal from text — optional leading `$`, thousands
 * commas, an optional decimal fraction, an optional trailing `%`.
 *
 * @remarks
 * Numbers-only: this is the module's entire extraction contract (AGENTS
 * §21 mechanism-never-policy) — no date, text-entity, or negation parsing.
 *
 * @param text - The text to scan
 * @returns Every extracted number, in left-to-right order
 *
 * @example
 * ```ts
 * import { extractNumbers } from '@src/core'
 *
 * extractNumbers('income was $50,000, age 25') // [50000, 25]
 * ```
 */
export function extractNumbers(text: string): readonly number[] {
	const pattern = new RegExp(NUMBER_PATTERN.source, NUMBER_PATTERN.flags)
	const numbers: number[] = []
	let match = pattern.exec(text)
	while (match !== null) {
		const raw = match[1]
		if (raw !== undefined) {
			const value = Number(raw.replace(/,/g, ''))
			if (Number.isFinite(value)) numbers.push(value)
		}
		match = pattern.exec(text)
	}
	return numbers
}

/**
 * Assign already-extracted numbers to a matched template's entity mappings.
 *
 * @remarks
 * Strategy, in order: (1) a SINGLE mapping collects every number (an array
 * when more than one, a scalar otherwise) at `CONFIDENCE_COLLECT`. Otherwise,
 * per mapping, the rightmost token in the text that equals the entity name
 * (`CONFIDENCE_EXACT`), an alias exactly (`CONFIDENCE_ALIAS`), or an alias
 * fuzzily (via `matchAlias`, confidence = its returned score) becomes a
 * keyword anchor; anchors sort left-to-right and each claims its nearest
 * unused number by text position. (3) Any mapping still unfilled claims the
 * next unused number positionally, at `CONFIDENCE_POSITIONAL`. Every entity
 * carries provenance `category: 'extracted'` with `detail` naming the
 * strategy that filled it (`'collect' | 'keyword' | 'alias' | 'positional'`).
 * Runs ONLY after a template has matched (an orchestrator-owned step, never
 * inside `Extractor`, which stays template-agnostic).
 *
 * @param numbers - The numbers already extracted from `text` via `extractNumbers`
 * @param mappings - The matched template's entity mappings
 * @param text - The same text `numbers` was extracted from (for keyword proximity)
 * @param similarity - The fuzzy alias-match score threshold (0..1)
 * @returns The assigned entities, one per filled mapping
 *
 * @example
 * ```ts
 * import { assignEntities } from '@src/core'
 *
 * const mappings = [
 * 	{ entity: 'age', aliases: ['years old'], field: 'age' },
 * 	{ entity: 'score', aliases: ['credit score'], field: 'score' },
 * ]
 * assignEntities([25, 720], mappings, '25 year old with score 720', 0.8)
 * // [{ name: 'age', value: 25, ... }, { name: 'score', value: 720, ... }]
 * ```
 */
export function assignEntities(
	numbers: readonly number[],
	mappings: readonly EntityMapping[],
	text: string,
	similarity: number,
): readonly Entity[] {
	if (mappings.length === 0 || numbers.length === 0) return []

	if (mappings.length === 1) {
		const mapping = mappings[0]
		if (mapping === undefined) return []
		return [
			{
				name: mapping.entity,
				value: numbers.length === 1 ? numbers[0] : numbers,
				provenance: { category: 'extracted', detail: 'collect' },
				confidence: CONFIDENCE_COLLECT,
			},
		]
	}

	const tokens = tokenize(text)
	const lowerText = text.toLowerCase()

	const positions: number[] = []
	const positionPattern = new RegExp(NUMBER_PATTERN.source, NUMBER_PATTERN.flags)
	let positionMatch = positionPattern.exec(text)
	while (positionMatch !== null) {
		positions.push(positionMatch.index)
		positionMatch = positionPattern.exec(text)
	}

	const keywordMatches: {
		mapping: EntityMapping
		position: number
		confidence: number
		detail: 'keyword' | 'alias'
	}[] = []

	for (const mapping of mappings) {
		let matchedPosition = -1
		let matchedConfidence = 0
		let matchedDetail: 'keyword' | 'alias' = 'keyword'
		const entityToken = mapping.entity.toLowerCase()

		for (const token of tokens) {
			const tokenPosition = lowerText.indexOf(token)
			if (token === entityToken) {
				if (tokenPosition > matchedPosition) {
					matchedPosition = tokenPosition
					matchedConfidence = CONFIDENCE_EXACT
					matchedDetail = 'keyword'
				}
				continue
			}
			const aliasExact = mapping.aliases.some((alias) => alias.toLowerCase() === token)
			if (aliasExact) {
				if (tokenPosition > matchedPosition) {
					matchedPosition = tokenPosition
					matchedConfidence = CONFIDENCE_ALIAS
					matchedDetail = 'alias'
				}
				continue
			}
			const fuzzy = matchAlias(token, mapping.aliases, similarity)
			if (fuzzy > 0 && tokenPosition > matchedPosition) {
				matchedPosition = tokenPosition
				matchedConfidence = fuzzy
				matchedDetail = 'alias'
			}
		}

		if (matchedPosition >= 0) {
			keywordMatches.push({
				mapping,
				position: matchedPosition,
				confidence: matchedConfidence,
				detail: matchedDetail,
			})
		}
	}

	keywordMatches.sort((a, b) => a.position - b.position)

	const used = new Set<number>()
	const filled = new Set<string>()
	const entities: Entity[] = []

	for (const match of keywordMatches) {
		let bestIndex = -1
		let bestDistance = Number.POSITIVE_INFINITY
		for (let index = 0; index < numbers.length; index += 1) {
			if (used.has(index)) continue
			const position = positions[index]
			if (position === undefined) continue
			const distance = Math.abs(position - match.position)
			if (distance < bestDistance) {
				bestDistance = distance
				bestIndex = index
			}
		}
		if (bestIndex >= 0) {
			const value = numbers[bestIndex]
			if (value !== undefined) {
				used.add(bestIndex)
				filled.add(match.mapping.entity)
				entities.push({
					name: match.mapping.entity,
					value,
					provenance: { category: 'extracted', detail: match.detail },
					confidence: match.confidence,
				})
			}
		}
	}

	let numberIndex = 0
	for (const mapping of mappings) {
		if (filled.has(mapping.entity)) continue
		while (numberIndex < numbers.length && used.has(numberIndex)) numberIndex += 1
		if (numberIndex >= numbers.length) break
		const value = numbers[numberIndex]
		if (value !== undefined) {
			used.add(numberIndex)
			filled.add(mapping.entity)
			entities.push({
				name: mapping.entity,
				value,
				provenance: { category: 'extracted', detail: 'positional' },
				confidence: CONFIDENCE_POSITIONAL,
			})
		}
		numberIndex += 1
	}

	return entities
}

// === Intent classification

/**
 * Classify the action + domain intent of a text against caller-supplied
 * vocabularies.
 *
 * @remarks
 * `actions` maps a token to an action name — the first matching token in
 * `text` (left to right) wins, at `CONFIDENCE_EXACT`. `domains` maps a domain
 * name to its keyword list — the domain with the most matching tokens wins
 * (ties keep the earliest-declared domain), also at `CONFIDENCE_EXACT`.
 * Combined confidence (PINNED): both fire → their average; exactly one fires
 * → its value times `0.5`; neither → `0`. There is no built-in worldview and
 * no auto-classification from a registered template's own `domain` name — a
 * caller MUST list a template's domain among `domains` for it to classify.
 * No `floor` parameter: the confidence floor gate lives at the orchestrator's
 * `matchTemplate` step, never inside classification itself.
 *
 * @param text - The (normalized) text to classify
 * @param actions - The caller's token → action-name vocabulary
 * @param domains - The caller's domain-name → keyword-list vocabulary
 * @returns The classified intent
 *
 * @example
 * ```ts
 * import { classifyIntent } from '@src/core'
 *
 * classifyIntent('calculate my rate', { calculate: 'compute' }, { rating: ['rate'] })
 * // { action: 'compute', domain: 'rating', confidence: 1 }
 * classifyIntent('hello', {}, {}) // { action: '', domain: '', confidence: 0 }
 * ```
 */
export function classifyIntent(
	text: string,
	actions: Readonly<Record<string, string>>,
	domains: Readonly<Record<string, readonly string[]>>,
): Intent {
	const tokens = tokenize(text)

	let action = ''
	let actionConfidence = 0
	for (const token of tokens) {
		const mapped = actions[token]
		if (mapped !== undefined) {
			action = mapped
			actionConfidence = CONFIDENCE_EXACT
			break
		}
	}

	let domain = ''
	let domainConfidence = 0
	let bestMatches = 0
	for (const [name, keywords] of Object.entries(domains)) {
		const lowerKeywords = keywords.map((keyword) => keyword.toLowerCase())
		let matches = 0
		for (const token of tokens) {
			if (lowerKeywords.includes(token)) matches += 1
		}
		if (matches > bestMatches) {
			bestMatches = matches
			domain = name
			domainConfidence = CONFIDENCE_EXACT
		}
	}

	const confidence =
		actionConfidence > 0 && domainConfidence > 0
			? (actionConfidence + domainConfidence) / 2
			: Math.max(actionConfidence, domainConfidence) * 0.5

	return { action, domain, confidence }
}

// === Fuzzy matching

/**
 * Bigram (Dice coefficient) string similarity, case-insensitive.
 *
 * @param a - The first string
 * @param b - The second string
 * @returns A score in `[0, 1]` — `1` for an exact (case-insensitive) match,
 * `0` when either string is shorter than 2 characters and they are not equal
 *
 * @example
 * ```ts
 * import { scoreSimilarity } from '@src/core'
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

	const bigrams = new Map<string, number>()
	for (let index = 0; index < left.length - 1; index += 1) {
		const bigram = left.slice(index, index + 2)
		bigrams.set(bigram, (bigrams.get(bigram) ?? 0) + 1)
	}

	let matches = 0
	for (let index = 0; index < right.length - 1; index += 1) {
		const bigram = right.slice(index, index + 2)
		const count = bigrams.get(bigram)
		if (count !== undefined && count > 0) {
			bigrams.set(bigram, count - 1)
			matches += 1
		}
	}

	return (2 * matches) / (left.length - 1 + (right.length - 1))
}

/**
 * The best `scoreSimilarity` a token achieves against a list of aliases,
 * gated by a threshold.
 *
 * @param token - The token to score
 * @param aliases - The alias phrases to score against
 * @param threshold - The minimum score to report (an explicit no-match below it)
 * @returns The best score when it meets `threshold`, else `0`
 *
 * @example
 * ```ts
 * import { matchAlias } from '@src/core'
 *
 * matchAlias('valu', ['value', 'amount'], 0.6) // ~0.86 — fuzzy hit on 'value'
 * matchAlias('xyz', ['value', 'amount'], 0.6)  // 0 — no alias clears the threshold
 * ```
 */
export function matchAlias(token: string, aliases: readonly string[], threshold: number): number {
	let best = 0
	for (const alias of aliases) {
		const score = scoreSimilarity(token, alias)
		if (score > best) best = score
	}
	return best >= threshold ? best : 0
}

// === Digest

/**
 * Render a value into a canonical, key-order-stable string — the pre-image
 * of `digestValue`.
 *
 * @remarks
 * Ported from the app's `raters` digest machinery (`app/core/raters/helpers.ts`)
 * — record keys sort before serialization so a re-ordered object canonicalizes
 * identically; arrays keep position order (position is meaningful).
 * Cycle-safe and total (AGENTS §14): `visited` tracks the object ancestors
 * along the CURRENT recursion path (not a global "seen" set, so the same
 * object reachable twice via non-cyclic sibling branches still canonicalizes
 * normally); revisiting an ancestor renders that node as the literal string
 * `'[cycle]'` instead of recursing — deterministic, never throws, never
 * overflows the call stack.
 *
 * @param value - The value to canonicalize
 * @param visited - The object ancestors along the current recursion path (internal; omit at the call site)
 * @returns The canonical string form
 *
 * @example
 * ```ts
 * import { canonicalize } from '@src/core'
 *
 * canonicalize({ b: 1, a: 2 }) === canonicalize({ a: 2, b: 1 }) // true
 * ```
 */
export function canonicalize(value: unknown, visited: ReadonlySet<object> = new Set()): string {
	if (Array.isArray(value)) {
		if (visited.has(value)) return JSON.stringify('[cycle]')
		const nextVisited = new Set(visited)
		nextVisited.add(value)
		return `[${value.map((entry) => canonicalize(entry, nextVisited)).join(',')}]`
	}
	if (isRecord(value)) {
		if (visited.has(value)) return JSON.stringify('[cycle]')
		const nextVisited = new Set(visited)
		nextVisited.add(value)
		const keys = Object.keys(value).sort()
		return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalize(value[key], nextVisited)}`).join(',')}}`
	}
	return JSON.stringify(value) ?? 'null'
}

/**
 * Compute a canonical structural digest of a pure-JSON value — a key-order-
 * stable FNV-1a hash rendered as an 8-hex-digit string.
 *
 * @remarks
 * Pure ECMAScript, no host crypto (AGENTS §17.7) — the same algorithm as the
 * app's `digest`, ported into core so `Interpretation.digest` and the
 * versioned managers can hash without leaving strict core.
 *
 * @param value - The value to digest
 * @returns The 8-character hex digest
 *
 * @example
 * ```ts
 * import { digestValue } from '@src/core'
 *
 * digestValue({ a: 1 }) === digestValue({ a: 1 }) // true — deterministic
 * ```
 */
export function digestValue(value: unknown): string {
	const canonical = canonicalize(value)
	let hash = 0x811c9dc5
	for (let index = 0; index < canonical.length; index += 1) {
		hash ^= canonical.charCodeAt(index)
		hash = Math.imul(hash, 0x01000193)
	}
	return (hash >>> 0).toString(16).padStart(8, '0')
}

// === Template matching

/**
 * Score how well a classified intent matches one template's domain + action.
 *
 * @param intent - The classified intent
 * @param template - The candidate template
 * @returns A score in `[0, 1]` — the mean of the domain match (`1`/`0`) and
 * the action match (`1`/`0`, `template.intents` containing `intent.action`)
 *
 * @example
 * ```ts
 * import { scoreTemplate } from '@src/core'
 *
 * scoreTemplate(
 * 	{ action: 'compute', domain: 'rating', confidence: 1 },
 * 	{ id: 't1', name: 'T', domain: 'rating', intents: ['compute'], mappings: [], defaults: [], computations: [], definition: { reasoning: 'symbolic', id: 't1', name: 'T', equations: [], variables: {} } },
 * ) // 1
 * ```
 */
export function scoreTemplate(intent: Intent, template: Template): number {
	const domainScore = template.domain.toLowerCase() === intent.domain.toLowerCase() ? 1 : 0
	const actionScore = template.intents.some(
		(candidate) => candidate.toLowerCase() === intent.action.toLowerCase(),
	)
		? 1
		: 0
	return (domainScore + actionScore) / 2
}

/**
 * Find the best-scoring registered template for a classified intent, gated
 * by a confidence floor.
 *
 * @remarks
 * Explicit no-match (AGENTS-flagged scsr defect 2 — never an arbitrary
 * `templates[0]` fallback): an empty registry, or a best score strictly below
 * `floor`, both return `undefined`.
 *
 * @param intent - The classified intent
 * @param templates - The registered templates to score
 * @param floor - The minimum score a match must clear
 * @returns The best-scoring template, or `undefined` on no qualifying match
 *
 * @example
 * ```ts
 * import { matchTemplate } from '@src/core'
 *
 * matchTemplate({ action: '', domain: '', confidence: 0 }, [], 0.3) // undefined — empty registry
 * ```
 */
export function matchTemplate(
	intent: Intent,
	templates: readonly Template[],
	floor: number,
): Template | undefined {
	let best: Template | undefined
	let bestScore = -1
	for (const template of templates) {
		const score = scoreTemplate(intent, template)
		if (score > bestScore) {
			bestScore = score
			best = template
		}
	}
	return best !== undefined && bestScore >= floor ? best : undefined
}

// === Computed fields

/**
 * Collect every variable name referenced by a symbolic expression tree, in
 * first-occurrence order.
 *
 * @param expression - The expression tree to scan
 * @returns The referenced variable names, deduplicated
 *
 * @example
 * ```ts
 * import { constant, operation, variable } from '@orkestrel/reason'
 * import { variablesOf } from '@src/core'
 *
 * variablesOf(operation('divide', variable('deductible'), constant(12))) // ['deductible']
 * ```
 */
export function variablesOf(expression: SymbolicExpression): readonly string[] {
	const names: string[] = []
	const seen = new Set<string>()

	function collect(node: SymbolicExpression): void {
		if (node.form === 'variable') {
			if (!seen.has(node.name)) {
				seen.add(node.name)
				names.push(node.name)
			}
			return
		}
		if (node.form === 'operation') {
			collect(node.left)
			if (node.right !== undefined) collect(node.right)
		}
	}

	collect(expression)
	return names
}

/**
 * Evaluate a symbolic expression tree against resolved bindings.
 *
 * @remarks
 * THE critical leaf (design-pinned, engine-parity semantics): an absent
 * `right` operand on a binary operation defaults to `0` — matching
 * `SymbolicReasoner`'s internal `#evaluate` — and is always passed as an
 * EXPLICIT numeric operand, so the same tree evaluates identically here and
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
 * import { constant, operation, variable } from '@orkestrel/reason'
 * import { resolveExpression } from '@src/core'
 *
 * resolveExpression(operation('divide', variable('deductible'), constant(12)), { deductible: 6000 }) // 500
 * resolveExpression(operation('divide', constant(1), constant(0)), {}) // undefined — NaN gap
 * resolveExpression(variable('missing'), {}) // undefined — unresolved input
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
 * Render a one-line, display-neutral description of a reasons `Subject`,
 * through an injected `Narrator`.
 *
 * @remarks
 * Complements — never duplicates — the raters `describe*` family (which
 * describes RATERS artifacts); this describes REASONS artifacts. Every field
 * renders via `narrator.label` + `narrator.value` (looked up under the
 * `'units'` phrase table, falling back to `'plain'`) — the wording is fully
 * lexicon-driven (AGENTS §21 mechanism-never-policy); `Definition` /
 * `ReasonResult` narration lives on `Narrator#describe` / `Narrator#narrate`
 * directly.
 *
 * @param subject - The subject to describe
 * @param narrator - The lexicon-driven renderer to render field labels/values/lines through
 * @returns A one-line description, the lexicon's `'subject.empty'` line when empty
 *
 * @example
 * ```ts
 * import { createNarrator, describeSubject } from '@src/core'
 *
 * describeSubject({ age: 25, income: 50000 }, createNarrator()) // 'with age: 25, income: 50000'
 * ```
 */
export function describeSubject(subject: Subject, narrator: NarratorInterface): string {
	const keys = Object.keys(subject).sort()
	if (keys.length === 0) return narrator.line('subject.empty', {})
	const parts = keys.map((key) => {
		const unit = narrator.phrase('units', key, 'plain')
		return `${narrator.label(key)}: ${narrator.value(unit, subject[key])}`
	})
	return narrator.line('subject.fields', { fields: parts.join(', ') })
}

// === JSON intake

/**
 * Parse a JSON string into a `Template`, or `undefined` on invalid JSON or a
 * shape that fails `isTemplate`.
 *
 * @remarks
 * The module's sole JSON boundary (design §4) — an `Interpretation` and the
 * versioned records are produced internally, never deserialized from
 * untrusted JSON; replay re-runs `interpret`, it does not deserialize a
 * stored result.
 *
 * @param value - The JSON text to parse
 * @returns The parsed template, or `undefined`
 *
 * @example
 * ```ts
 * import { parseTemplate } from '@src/core'
 *
 * parseTemplate('not json') // undefined
 * ```
 */
export function parseTemplate(value: string): Template | undefined {
	return parseJSONAs(value, isTemplate)
}
