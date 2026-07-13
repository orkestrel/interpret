import type {
	ClarifierInterface,
	ClarifierOptions,
	DefinitionManagerInterface,
	DefinitionManagerOptions,
	ExtractorInterface,
	ExtractorOptions,
	FormatterInterface,
	FormatterOptions,
	GeneratorInterface,
	GeneratorOptions,
	InterpretContextInterface,
	InterpretContextOptions,
	InterpretInterface,
	InterpretOptions,
	NarratorInterface,
	NarratorOptions,
	NormalizerInterface,
	NormalizerOptions,
	SubjectManagerInterface,
	SubjectManagerOptions,
	Template,
	TemplateManagerInterface,
	TemplateManagerOptions,
} from './types.js'
import { InterpretError } from './errors.js'
import { isTemplate } from './validators.js'
import { Interpret } from './Interpret.js'
import { Narrator } from './Narrator.js'
import { InterpretContext } from './managers/InterpretContext.js'
import { TemplateManager } from './managers/TemplateManager.js'
import { SubjectManager } from './managers/SubjectManager.js'
import { DefinitionManager } from './managers/DefinitionManager.js'
import { Clarifier } from './stages/Clarifier.js'
import { Extractor } from './stages/Extractor.js'
import { Formatter } from './stages/Formatter.js'
import { Generator } from './stages/Generator.js'
import { Normalizer } from './stages/Normalizer.js'

/**
 * Create an interpretation orchestrator.
 *
 * @remarks
 * `interpret()` is genuinely synchronous and runs the fixed five-stage
 * pipeline `[normalize, extract, clarify, format, generate]`. Every stage
 * slot (`normalizer` / `extractor` / `clarifier` / `formatter` / `generator`)
 * is bring-your-own — a supplied implementation is used as-is, else the
 * built-in stage is constructed from the matching per-stage options.
 *
 * @param options - Optional templates, context, stage implementations, the
 *   `similarity` / `floor` axes, and emitter hooks
 * @returns A working {@link InterpretInterface}
 *
 * @example
 * ```ts
 * import { factorGroup, fieldFactor, quantitativeDefinition } from '@orkestrel/reason'
 * import { createInterpret } from '@src/core'
 *
 * const interpret = createInterpret({
 * 	extractor: { extract: () => ({ intent: { action: 'calculate', domain: 'arithmetic', confidence: 1 }, numbers: [42], complete: true }) },
 * 	templates: [
 * 		{
 * 			id: 't1',
 * 			name: 'Arithmetic',
 * 			domain: 'arithmetic',
 * 			intents: ['calculate'],
 * 			mappings: [{ entity: 'value', aliases: [], field: 'value' }],
 * 			defaults: [],
 * 			computations: [],
 * 			definition: quantitativeDefinition('t1', 'Arithmetic', [
 * 				factorGroup('total', 'sum', [fieldFactor('value', 'value')]),
 * 			]),
 * 		},
 * 	],
 * })
 * interpret.interpret('calculate arithmetic 42').subject // { value: 42 }
 * ```
 */
export function createInterpret(options?: InterpretOptions): InterpretInterface {
	return new Interpret(options)
}

/**
 * Create a text normalizer.
 *
 * @param options - Optional contraction / abbreviation / correction maps,
 *   merged over the neutral built-in defaults
 * @returns A stateless {@link NormalizerInterface}
 *
 * @example
 * ```ts
 * import { createNormalizer } from '@src/core'
 *
 * createNormalizer().normalize("it's  cold") // { text: 'it is cold', changes: [{ from: "it's", to: 'it is' }] }
 * ```
 */
export function createNormalizer(options?: NormalizerOptions): NormalizerInterface {
	return new Normalizer(options)
}

/**
 * Create a template-agnostic intent classifier and number extractor.
 *
 * @param options - Optional caller `actions` / `domains` vocabularies
 * @returns A stateless {@link ExtractorInterface}
 *
 * @example
 * ```ts
 * import { createExtractor } from '@src/core'
 *
 * const extractor = createExtractor({
 * 	actions: { calculate: 'calculate' },
 * 	domains: { arithmetic: ['arithmetic'] },
 * })
 * extractor.extract('calculate arithmetic 42').numbers // [42]
 * ```
 */
export function createExtractor(options?: ExtractorOptions): ExtractorInterface {
	return new Extractor(options)
}

/**
 * Create a clarifier — carry-over, defaults, and computed-field resolution
 * against an assigned entity set.
 *
 * @param options - Optional confidence `floor` for raised ambiguities
 * @returns A stateless {@link ClarifierInterface}
 *
 * @example
 * ```ts
 * import { createClarifier } from '@src/core'
 *
 * const clarifier = createClarifier({ floor: 0.5 })
 * ```
 */
export function createClarifier(options?: ClarifierOptions): ClarifierInterface {
	return new Clarifier(options)
}

/**
 * Create a prompt formatter.
 *
 * @param options - Optional caller intent-verb phrasing map
 * @returns A stateless {@link FormatterInterface}
 *
 * @example
 * ```ts
 * import { createFormatter } from '@src/core'
 *
 * const formatter = createFormatter({ verbs: { calculate: 'Calculate' } })
 * ```
 */
export function createFormatter(options?: FormatterOptions): FormatterInterface {
	return new Formatter(options)
}

/**
 * Create a subject/definition generator.
 *
 * @param options - Currently an empty extension seam
 * @returns A stateless {@link GeneratorInterface}
 *
 * @example
 * ```ts
 * import { createGenerator } from '@src/core'
 *
 * const generator = createGenerator()
 * ```
 */
export function createGenerator(_options?: GeneratorOptions): GeneratorInterface {
	return new Generator()
}

/**
 * Create a template registry.
 *
 * @param options - Optional initial seed collection
 * @returns A working {@link TemplateManagerInterface}
 *
 * @example
 * ```ts
 * import { factorGroup, fieldFactor, quantitativeDefinition } from '@orkestrel/reason'
 * import { createTemplate, createTemplateManager } from '@src/core'
 *
 * const template = createTemplate({
 * 	id: 't1', name: 'Arithmetic', domain: 'arithmetic', intents: ['calculate'],
 * 	mappings: [{ entity: 'value', aliases: [], field: 'value' }], defaults: [], computations: [],
 * 	definition: quantitativeDefinition('t1', 'Arithmetic', [factorGroup('total', 'sum', [fieldFactor('value', 'value')])]),
 * })
 * const templates = createTemplateManager({ templates: [template] })
 * templates.size // 1
 * ```
 */
export function createTemplateManager(options?: TemplateManagerOptions): TemplateManagerInterface {
	return new TemplateManager(options)
}

/**
 * Create a subject registry.
 *
 * @remarks
 * Mints its own record ids on `add` when none is supplied — a `Subject`
 * carries no `id` field of its own.
 *
 * @param options - Optional initial seed collection
 * @returns A working {@link SubjectManagerInterface}
 *
 * @example
 * ```ts
 * import { createSubjectManager } from '@src/core'
 *
 * const subjects = createSubjectManager({ subjects: [{ value: 1 }] })
 * subjects.size // 1
 * ```
 */
export function createSubjectManager(options?: SubjectManagerOptions): SubjectManagerInterface {
	return new SubjectManager(options)
}

/**
 * Create a definition registry.
 *
 * @param options - Optional initial seed collection
 * @returns A working {@link DefinitionManagerInterface}
 *
 * @example
 * ```ts
 * import { factorGroup, fieldFactor, quantitativeDefinition } from '@orkestrel/reason'
 * import { createDefinitionManager } from '@src/core'
 *
 * const definitions = createDefinitionManager({
 * 	definitions: [quantitativeDefinition('d1', 'D1', [factorGroup('total', 'sum', [fieldFactor('value', 'value')])])],
 * })
 * definitions.size // 1
 * ```
 */
export function createDefinitionManager(
	options?: DefinitionManagerOptions,
): DefinitionManagerInterface {
	return new DefinitionManager(options)
}

/**
 * Create a cross-turn interpretation context.
 *
 * @param options - Optional `session` label and `history` ring-buffer cap
 * @returns A working {@link InterpretContextInterface}
 *
 * @example
 * ```ts
 * import { createInterpretContext } from '@src/core'
 *
 * const context = createInterpretContext({ session: 'turn-1', history: 4 })
 * context.previous() // []
 * ```
 */
export function createInterpretContext(
	options?: InterpretContextOptions,
): InterpretContextInterface {
	return new InterpretContext(options)
}

/**
 * Build and validate one interpretation template from plain data.
 *
 * @remarks
 * The factory/coercer pair for template intake (AGENTS §4.6.1): this throws
 * on malformed data, while `parseTemplate` returns `undefined`. Data failing
 * {@link isTemplate} throws `InterpretError('INVALID_TEMPLATE', …)`.
 *
 * @param data - The candidate template data
 * @returns The same data, now known to satisfy {@link Template}
 * @throws {@link InterpretError} `INVALID_TEMPLATE` when `data` fails validation
 *
 * @example
 * ```ts
 * import { factorGroup, fieldFactor, quantitativeDefinition } from '@orkestrel/reason'
 * import { createTemplate } from '@src/core'
 *
 * const template = createTemplate({
 * 	id: 't1', name: 'Arithmetic', domain: 'arithmetic', intents: ['calculate'],
 * 	mappings: [{ entity: 'value', aliases: [], field: 'value' }], defaults: [], computations: [],
 * 	definition: quantitativeDefinition('t1', 'Arithmetic', [factorGroup('total', 'sum', [fieldFactor('value', 'value')])]),
 * })
 * template.id // 't1'
 * ```
 */
export function createTemplate(data: Template): Template {
	if (!isTemplate(data)) {
		throw new InterpretError('INVALID_TEMPLATE', 'Template data failed validation')
	}
	return data
}

/**
 * Create a lexicon-driven reverse-direction rendering engine.
 *
 * @remarks
 * Stateless — `phrase` / `label` / `line` / `value` are total lookups into a
 * caller `Lexicon` merged over `DEFAULT_LEXICON`, and `describe` / `narrate`
 * compose them over a reasons `Definition` / `ReasonResult`.
 *
 * @param options - Optional `lexicon` and `formatters` map
 * @returns A stateless {@link NarratorInterface}
 *
 * @example
 * ```ts
 * import { createNarrator } from '@src/core'
 *
 * const narrator = createNarrator({ lexicon: { templates: { 'subject.empty': 'nothing here' } } })
 * narrator.line('subject.empty', {}) // 'nothing here'
 * ```
 */
export function createNarrator(options?: NarratorOptions): NarratorInterface {
	return new Narrator(options)
}
