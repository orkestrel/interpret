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
	TemplateManagerInterface,
	TemplateManagerOptions,
} from './types.js'
import { Interpret } from './Interpret.js'
import { Narrator } from './Narrator.js'
import { InterpretContext } from './InterpretContext.js'
import { TemplateManager } from './managers/TemplateManager.js'
import { SubjectManager } from './managers/SubjectManager.js'
import { DefinitionManager } from './managers/DefinitionManager.js'
import { Clarifier } from './stages/Clarifier.js'
import { Extractor } from './stages/Extractor.js'
import { Formatter } from './stages/Formatter.js'
import { Generator } from './stages/Generator.js'
import { Normalizer } from './stages/Normalizer.js'

/**
 * Creates an interpretation orchestrator.
 *
 * @remarks
 * `interpret()` is genuinely synchronous and runs the fixed
 * pipeline `[normalize, extract, clarify, format, generate]`. Every stage
 * slot (`normalizer` / `extractor` / `clarifier` / `formatter` / `generator`)
 * is bring-your-own — a supplied implementation is used as-is, else the
 * built-in stage is constructed with its own defaults, so a caller who wants
 * a configured stage constructs that stage and supplies the instance.
 * `InterpretOptions` carries no per-stage option record; `floor` is the one
 * value threaded into a built-in stage, reaching the `Clarifier`.
 *
 * @param options - Optional templates, context, stage implementations, the
 *   `similarity` / `floor` axes, and emitter hooks
 * @returns A working {@link InterpretInterface}
 *
 * @example
 * ```ts
 * import { createFactorGroup, createFieldFactor, createQuantitativeDefinition } from '@orkestrel/reason'
 * import { createExtractor, createInterpret } from '@src/core'
 *
 * const interpret = createInterpret({
 * 	extractor: createExtractor({ actions: { calculate: 'calculate' }, domains: { arithmetic: ['arithmetic'] } }),
 * 	templates: [
 * 		{
 * 			id: 't1',
 * 			name: 'Arithmetic',
 * 			domain: 'arithmetic',
 * 			intents: ['calculate'],
 * 			mappings: [{ entity: 'value', aliases: [], field: 'value' }],
 * 			defaults: [],
 * 			computations: [],
 * 			definition: createQuantitativeDefinition('t1', 'Arithmetic', [
 * 				createFactorGroup('total', 'sum', [createFieldFactor('value', 'value')]),
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
 * Creates a text normalizer.
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
 * Creates a template-agnostic intent classifier and number extractor.
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
 * Creates a clarifier — carry-over, defaults, and computed-field resolution
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
 * Creates a prompt formatter.
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
 * Creates a subject/definition generator.
 *
 * @returns A stateless {@link GeneratorInterface}
 *
 * @example
 * ```ts
 * import { createGenerator } from '@src/core'
 *
 * const generator = createGenerator()
 * ```
 */
export function createGenerator(): GeneratorInterface {
	return new Generator()
}

/**
 * Creates a template registry.
 *
 * @param options - Optional initial seed collection
 * @returns A working {@link TemplateManagerInterface}
 *
 * @example
 * ```ts
 * import { createFactorGroup, createFieldFactor, createQuantitativeDefinition } from '@orkestrel/reason'
 * import { createTemplateManager } from '@src/core'
 *
 * const templates = createTemplateManager({
 * 	templates: [{
 * 		id: 't1', name: 'Arithmetic', domain: 'arithmetic', intents: ['calculate'],
 * 		mappings: [{ entity: 'value', aliases: [], field: 'value' }], defaults: [], computations: [],
 * 		definition: createQuantitativeDefinition('t1', 'Arithmetic', [createFactorGroup('total', 'sum', [createFieldFactor('value', 'value')])]),
 * 	}],
 * })
 * templates.count // 1
 * ```
 */
export function createTemplateManager(options?: TemplateManagerOptions): TemplateManagerInterface {
	return new TemplateManager(options)
}

/**
 * Creates a subject registry.
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
 * subjects.count // 1
 * ```
 */
export function createSubjectManager(options?: SubjectManagerOptions): SubjectManagerInterface {
	return new SubjectManager(options)
}

/**
 * Creates a definition registry.
 *
 * @param options - Optional initial seed collection
 * @returns A working {@link DefinitionManagerInterface}
 *
 * @example
 * ```ts
 * import { createFactorGroup, createFieldFactor, createQuantitativeDefinition } from '@orkestrel/reason'
 * import { createDefinitionManager } from '@src/core'
 *
 * const definitions = createDefinitionManager({
 * 	definitions: [createQuantitativeDefinition('d1', 'D1', [createFactorGroup('total', 'sum', [createFieldFactor('value', 'value')])])],
 * })
 * definitions.count // 1
 * ```
 */
export function createDefinitionManager(
	options?: DefinitionManagerOptions,
): DefinitionManagerInterface {
	return new DefinitionManager(options)
}

/**
 * Creates a cross-turn interpretation context.
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
 * Creates a lexicon-driven reverse-direction rendering engine.
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
