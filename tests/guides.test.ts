// The consumer-side guides-parity drop-in: runs `@orkestrel/guide`'s checks against
// this repo's own `guides/README.md` manifest. The four constants below are this
// package's own, and are the only part a sibling package changes.

import type { Template } from '@src/core'
import { describe, expect, it } from 'vitest'
import {
	computeSymbolKey,
	createGuide,
	createSource,
	createSourceManager,
	extractFenceImports,
	findMissing,
	findMissingSymbols,
	findUnexampled,
	findUnlisted,
	isExternalLink,
	parseManifest,
	resolveLink,
} from '@orkestrel/guide'
import {
	createFactorGroup,
	createFieldFactor,
	createQuantitativeDefinition,
} from '@orkestrel/reason'
import {
	applyReplacements,
	assignEntities,
	canonicalize,
	canonicalizeNode,
	CONFIDENCE_ALIAS,
	CONFIDENCE_CARRIED,
	CONFIDENCE_COLLECT,
	CONFIDENCE_COMPUTED,
	CONFIDENCE_DEFAULT,
	CONFIDENCE_EXACT,
	CONFIDENCE_POSITIONAL,
	collapseWhitespace,
	createClarifier,
	createDefinitionManager,
	createExtractor,
	createFormatter,
	createGenerator,
	createInterpret,
	createInterpretContext,
	createNarrator,
	createNormalizer,
	createSubjectManager,
	createTemplateManager,
	DEFAULT_CONTRACTIONS,
	DEFAULT_INTERPRET_FLOOR,
	DEFAULT_INTERPRET_HISTORY,
	DEFAULT_INTERPRET_SIMILARITY,
	DEFAULT_LEXICON,
	digestValue,
	escapeRegExp,
	extractNumbers,
	InterpretError,
	isAmbiguity,
	isComputedField,
	isEntity,
	isEntityMapping,
	isFieldDefault,
	isFieldMapping,
	isIntent,
	isInterpretation,
	isInterpretError,
	isProvenance,
	isStageFailure,
	isStageRecord,
	isTemplate,
	matchAlias,
	matchTemplate,
	NUMBER_PATTERN,
	parseTemplate,
	RecordManager,
	renderSubject,
	resolveExpression,
	scoreSimilarity,
	scoreTemplate,
	setField,
	tokenize,
	UNSAFE_FIELD_SEGMENTS,
	variablesOf,
} from '@src/core'
import { readFileSync } from 'node:fs'
import { captureError, requireValue } from '@orkestrel/test'
import { readInventory } from '@orkestrel/test/server'

/** Every fence language this package's guides are allowed to use. */
const FENCE_LANGUAGES = Object.freeze(['ts'])
/** The fence language whose blocks count as worked examples. */
const EXAMPLE_LANGUAGE = 'ts'
/** Each import specifier this package's own guides may resolve against. */
const MODULES = Object.freeze({ '@orkestrel/interpret': 'src/core', '@src/core': 'src/core' })
/**
 * Declarations deliberately kept out of the barrel, as `computeSymbolKey` strings.
 *
 * A class that one-class-per-file evicted from its single consumer cannot become a
 * local, so it stays exported without being public. Naming it here is what makes that
 * intentional rather than forgotten — and the second assertion below fails when a name
 * here stops being stranded, so the list cannot rot.
 */
const INTERNAL: readonly string[] = Object.freeze([])

/** Root-level files this package's guides link to. `readInventory` walks directories only. */
const ROOT_FILES = Object.freeze(['AGENTS.md'])

const root = new URL('../', import.meta.url)
const files: Record<string, string> = {
	...readInventory(root, ['src', 'guides', 'tests'], { extensions: ['.ts', '.md'] }),
}
for (const name of ROOT_FILES) files[name] = readFileSync(new URL(name, root), 'utf8')
const manifest = parseManifest(
	requireValue(files['guides/README.md'], 'Missing file: guides/README.md'),
	'guides',
)
const sources = createSourceManager({ files, modules: MODULES })

it('manifest lists at least one guide', () => {
	expect(manifest.length).toBeGreaterThan(0)
})

for (const entry of manifest) {
	const guide = createGuide(requireValue(files[entry.spec], `Missing file: ${entry.spec}`))
	const source = createSource({ files, module: entry.source })

	describe(`${entry.concept}`, () => {
		it('uses only listed fence languages', () => {
			expect(findUnlisted(guide.fences(), FENCE_LANGUAGES)).toEqual([])
		})

		it('extracts a non-empty documented surface', () => {
			expect(guide.surface().length).toBeGreaterThan(0)
		})
		it('re-exports every direct declaration that is not named internal', () => {
			const stranded = findMissingSymbols(source.exports(), source.surface())
			expect(stranded.filter((key) => !INTERNAL.includes(key))).toEqual([])
		})
		it('names no symbol internal that the barrel already exports', () => {
			const stranded = findMissingSymbols(source.exports(), source.surface())
			expect(INTERNAL.filter((key) => !stranded.includes(key))).toEqual([])
		})
		it('re-exports only direct declarations', () => {
			expect(findMissingSymbols(source.surface(), source.exports())).toEqual([])
		})
		it('documents every barrel export', () => {
			expect(findMissingSymbols(source.surface(), guide.surface())).toEqual([])
		})
		it('documents only barrel exports', () => {
			expect(findMissingSymbols(guide.surface(), source.surface())).toEqual([])
		})

		it('exposes no hidden module-scope declarations', () => {
			expect(source.hidden().map(computeSymbolKey)).toEqual([])
		})

		for (const group of guide.methods()) {
			const members = source.methods(group.interface)
			const entity = group.interface.replace(/Interface$/, '')
			describe(`${group.interface}`, () => {
				it('documents at least one method', () => {
					expect(group.methods.length).toBeGreaterThan(0)
				})
				it('documents every interface method', () => {
					expect(findMissing(members, group.methods)).toEqual([])
				})
				it('documents no phantom method', () => {
					expect(findMissing(group.methods, members)).toEqual([])
				})
				it(`${entity} exposes no undocumented method`, () => {
					const extra =
						entity === group.interface ? [] : findMissing(source.methods(entity), group.methods)
					expect(extra).toEqual([])
				})
			})
		}

		it('documents an example for every Surface function', () => {
			const fences = guide
				.fences()
				.filter((fence) => fence.language === EXAMPLE_LANGUAGE)
				.map((fence) => fence.code)
			const names = guide
				.surface()
				.filter((symbol) => symbol.kind === 'function')
				.map((symbol) => symbol.name)
			expect(findUnexampled(names, fences, source.examples())).toEqual([])
		})

		for (const group of guide.methods()) {
			const entity = group.interface.replace(/Interface$/, '')
			describe(`${group.interface} examples`, () => {
				it('documents an example for every method', () => {
					const fences = guide
						.fences()
						.filter((fence) => fence.language === EXAMPLE_LANGUAGE)
						.map((fence) => fence.code)
					const examples =
						entity === group.interface
							? source.examples(group.interface)
							: source.examples(group.interface).concat(source.examples(entity))
					expect(findUnexampled(group.methods, fences, examples)).toEqual([])
				})
			})
		}

		it('imports only real exports in every ```ts fence', () => {
			const fences = guide.fences().filter((fence) => fence.language === EXAMPLE_LANGUAGE)
			for (const fence of fences) {
				for (const { specifier, names } of extractFenceImports(fence.code)) {
					const imported = sources.source(specifier)
					if (imported === undefined) continue
					const surface = imported.surface().map((symbol) => symbol.name)
					expect(findMissing(names, surface)).toEqual([])
				}
			}
		})

		it('resolves every relative link', () => {
			const broken = guide
				.links()
				.filter((href) => !isExternalLink(href))
				.map((href) => resolveLink(entry.spec, href))
				.filter((path) => !source.exists(path))
			expect(broken).toEqual([])
		})
		it('links only to test files that exist', () => {
			const missing = guide
				.tests()
				.map((href) => resolveLink(entry.spec, href))
				.filter((path) => !source.exists(path))
			expect(missing).toEqual([])
		})
	})
}

// ── Flagship fence transcriptions ────────────────────────────────────────────
//
// Each case below is one `guides/interpret.md` fence, run against the real barrel and asserting
// the value its comment claims. Parity proves a documented name resolves; only a run proves the
// documented value is the one the code returns. Change a fence, change the case beside it.

/** The record shape the `RecordManagerInterface` fence declares for its `RecordManager` instance. */
interface NoteRecord {
	readonly id: string
	readonly note: string
	readonly version: number
	readonly hash: string
}

/** The arithmetic template the Surface, Factories, and `InterpretInterface` fences all add. */
const ARITHMETIC: Template = Object.freeze({
	id: 't1',
	name: 'Arithmetic',
	domain: 'arithmetic',
	intents: ['calculate'],
	mappings: [{ entity: 'value', aliases: [], field: 'value' }],
	defaults: [],
	computations: [],
	definition: createQuantitativeDefinition('t1', 'Arithmetic', [
		createFactorGroup('total', 'sum', [createFieldFactor('value', 'value')]),
	]),
})

describe('flagship fences', () => {
	it('Surface: interprets text against an added template', () => {
		const interpret = createInterpret({
			extractor: createExtractor({
				actions: { calculate: 'calculate' },
				domains: { arithmetic: ['arithmetic'] },
			}),
			templates: [ARITHMETIC],
		})
		const result = interpret.interpret('calculate arithmetic 42')

		expect(result.subject).toEqual({ value: 42 })
		expect(result.ambiguities).toEqual([])
		expect(result.failures).toEqual([])
		interpret.destroy()
	})

	it('Constants: every pinned default and lexicon line', () => {
		expect(DEFAULT_INTERPRET_SIMILARITY).toBe(0.8)
		expect(DEFAULT_INTERPRET_FLOOR).toBe(0.3)
		expect(DEFAULT_INTERPRET_HISTORY).toBe(16)
		expect(CONFIDENCE_EXACT).toBe(1)
		expect(CONFIDENCE_ALIAS).toBe(0.9)
		expect(CONFIDENCE_COLLECT).toBe(0.9)
		expect(CONFIDENCE_POSITIONAL).toBe(0.7)
		expect(CONFIDENCE_CARRIED).toBe(0.7)
		expect(CONFIDENCE_DEFAULT).toBe(1)
		expect(CONFIDENCE_COMPUTED).toBe(0.9)
		expect(typeof NUMBER_PATTERN.source).toBe('string')
		expect(UNSAFE_FIELD_SEGMENTS).toEqual(['__proto__', 'prototype', 'constructor'])
		expect(DEFAULT_CONTRACTIONS["can't"]).toBe('cannot')
		expect(DEFAULT_LEXICON.templates?.['subject.empty']).toBe('with no fields')
		expect(DEFAULT_LEXICON.templates?.['prompt.base']).toBe('{{verb}} {{name}}')
		expect(DEFAULT_LEXICON.templates?.['ambiguity.entity']).toBe('What is your {{entity}}?')
	})

	it('Errors: a caught InterpretError narrows to its code', () => {
		const caught = captureError(() => {
			throw new InterpretError('DESTROYED', 'Interpret has been destroyed')
		})

		expect(isInterpretError(caught)).toBe(true)
		expect(isInterpretError(caught) ? caught.code : undefined).toBe('DESTROYED')
	})

	it('Validators: every guard accepts the record the fence hands it', () => {
		expect(isEntityMapping({ entity: 'age', aliases: ['years old'], field: 'age' })).toBe(true)
		expect(isFieldDefault({ field: 'term', value: 12 })).toBe(true)
		expect(
			isComputedField({
				field: 'monthly',
				expression: {
					form: 'operation',
					operator: 'divide',
					left: { form: 'variable', name: 'deductible' },
					right: { form: 'constant', value: 12 },
				},
			}),
		).toBe(true)
		expect(
			isTemplate({
				id: 't1',
				name: 'Arithmetic',
				domain: 'arithmetic',
				intents: ['calculate'],
				mappings: [],
				defaults: [],
				computations: [],
				definition: createQuantitativeDefinition('t1', 'Arithmetic', [
					createFactorGroup('total', 'sum', [createFieldFactor('value', 'value')]),
				]),
			}),
		).toBe(true)
		expect(isProvenance({ category: 'extracted', detail: 'alias', metadata: true })).toBe(true)
		expect(isIntent({ action: 'calculate', domain: 'arithmetic', confidence: 1 })).toBe(true)
		expect(
			isEntity({ name: 'value', value: 42, provenance: { category: 'extracted' }, confidence: 1 }),
		).toBe(true)
		expect(
			isFieldMapping({ field: 'value', provenance: { category: 'extracted' }, confidence: 1 }),
		).toBe(true)
		expect(
			isAmbiguity({ field: 'value', question: 'Which value?', candidates: ['42'], required: true }),
		).toBe(true)
		expect(
			isStageRecord({ stage: 'normalize', input: 'raw', output: 'clean', failed: false }),
		).toBe(true)
		expect(isStageFailure({ stage: 'format', code: 'FORMAT_FAILED', message: 'failed' })).toBe(true)

		const guardEngine = createInterpret()
		expect(isInterpretation(guardEngine.interpret('unmatched text'))).toBe(true)
		guardEngine.destroy()
	})

	it('Helpers: the text leaves return the strings the fence prints', () => {
		expect(escapeRegExp('a.b*c')).toBe('a\\.b\\*c')
		expect(setField({ age: 25 }, 'age', 30)).toEqual({ age: 30 })
		expect(setField({}, ['address', 'city'], 'Reno')).toEqual({ address: { city: 'Reno' } })
		expect(applyReplacements("can't stop", { "can't": 'cannot' })).toBe('cannot stop')
		expect(collapseWhitespace('  a   b\t c ')).toBe('a b c')
		expect(tokenize('The rate is 85%.')).toEqual(['the', 'rate', 'is', '85%.'])
	})

	it('Helpers: the extraction and matching leaves return the fence values', () => {
		expect(extractNumbers('income was $50,000, age 25')).toEqual([50000, 25])
		expect(scoreSimilarity('rate', 'rate')).toBe(1)
		expect(matchAlias('valu', ['value', 'amount'], 0.6)).toBeCloseTo(0.86, 2)
		const assigned = assignEntities(
			[25, 720],
			[
				{ entity: 'age', aliases: ['years old'], field: 'age' },
				{ entity: 'score', aliases: ['credit score'], field: 'score' },
			],
			'25 year old with score 720',
			0.8,
		)
		expect(assigned.find((entity) => entity.name === 'age')?.value).toBe(25)
		expect(assigned.find((entity) => entity.name === 'score')?.value).toBe(720)
	})

	it('Helpers: the digest, template, and reverse leaves return the fence values', () => {
		expect(canonicalize({ b: 1, a: 2 }) === canonicalize({ a: 2, b: 1 })).toBe(true)
		expect(canonicalizeNode({ b: 1, a: 2 }, new Set())).toBe('{"a":2,"b":1}')
		expect(digestValue({ a: 1 }) === digestValue({ a: 1 })).toBe(true)
		expect(matchTemplate({ confidence: 0 }, [], 0.3)).toBeUndefined()
		expect(
			variablesOf({
				form: 'operation',
				operator: 'divide',
				left: { form: 'variable', name: 'deductible' },
				right: { form: 'constant', value: 12 },
			}),
		).toEqual(['deductible'])
		expect(
			resolveExpression(
				{
					form: 'operation',
					operator: 'divide',
					left: { form: 'variable', name: 'deductible' },
					right: { form: 'constant', value: 12 },
				},
				{ deductible: 6000 },
			),
		).toBe(500)
		expect(renderSubject({ age: 25, income: 50000 }, createNarrator())).toBe(
			'with age: 25, income: 50000',
		)
		expect(
			scoreTemplate(
				{ action: 'compute', domain: 'rating', confidence: 1 },
				{
					id: 't1',
					name: 'T',
					domain: 'rating',
					intents: ['compute'],
					mappings: [],
					defaults: [],
					computations: [],
					definition: {
						reasoning: 'symbolic',
						id: 't1',
						name: 'T',
						equations: [],
						variables: {},
					},
				},
			),
		).toBe(1)
	})

	it('Parsers: an off-shape template coerces to undefined', () => {
		expect(parseTemplate('not json')).toBeUndefined()
	})

	it('Factories: each factory wires a working entity with the fence tally', () => {
		expect(createNormalizer().normalize("it's  cold")).toEqual({
			text: 'it is cold',
			changes: [{ from: "it's", to: 'it is' }],
		})

		const templates = createTemplateManager({ templates: [ARITHMETIC] })
		expect(templates.count).toBe(1)
		templates.destroy()

		expect(createSubjectManager({ subjects: [{ value: 1 }] }).count).toBe(1)
		expect(
			createDefinitionManager({
				definitions: [
					createQuantitativeDefinition('d1', 'D1', [
						createFactorGroup('total', 'sum', [createFieldFactor('value', 'value')]),
					]),
				],
			}).count,
		).toBe(1)
	})

	it('NormalizerInterface: normalize expands the contraction and records the change', () => {
		const normalizer = createNormalizer({ contractions: { "can't": 'cannot' } })

		expect(normalizer.normalize("can't   stop")).toEqual({
			text: 'cannot stop',
			changes: [{ from: "can't", to: 'cannot' }],
		})
	})

	it('ExtractorInterface: extract classifies the intent and mines the number', () => {
		const extractor = createExtractor({
			actions: { calculate: 'compute' },
			domains: { rating: ['rate'] },
		})

		expect(extractor.extract('calculate my rate at 85')).toEqual({
			intent: { action: 'compute', domain: 'rating', confidence: 1 },
			numbers: [85],
		})
	})

	it('ClarifierInterface: clarify raises the ambiguity the required mapping earns', () => {
		const clarifier = createClarifier({ floor: 0.3 })
		const template: Template = {
			id: 't1',
			name: 'Arithmetic',
			domain: 'arithmetic',
			intents: ['calculate'],
			mappings: [{ entity: 'value', aliases: [], field: 'value', required: true }],
			defaults: [],
			computations: [],
			definition: {
				reasoning: 'symbolic',
				id: 't1',
				name: 'Arithmetic',
				equations: [],
				variables: {},
			},
		}

		expect(
			clarifier.clarify([], template, undefined, {
				action: 'calculate',
				domain: 'arithmetic',
				confidence: 1,
			}),
		).toEqual({
			entities: [],
			ambiguities: [
				{ field: 'value', question: 'What is your value?', candidates: [], required: true },
			],
		})
	})

	it('ClarifierInterface: a declared aggregate over a known-length array lands its total', () => {
		const clarifier = createClarifier({ floor: 0.3 })
		const template: Template = {
			id: 't2',
			name: 'Total',
			domain: 'arithmetic',
			intents: ['calculate'],
			mappings: [{ entity: 'value', aliases: [], field: 'value' }],
			defaults: [],
			computations: [
				{
					field: 'total',
					expression: {
						form: 'operation',
						operator: 'add',
						left: { form: 'variable', name: 'value.0' },
						right: { form: 'variable', name: 'value.1' },
					},
				},
			],
			definition: {
				reasoning: 'symbolic',
				id: 't2',
				name: 'Total',
				equations: [],
				variables: {},
			},
		}
		const result = clarifier.clarify(
			[{ name: 'value', value: [2, 3], provenance: { category: 'extracted' }, confidence: 1 }],
			template,
			undefined,
			{ action: 'calculate', domain: 'arithmetic', confidence: 1 },
		)
		const total = result.entities.find((entity) => entity.name === 'total')

		expect(total?.value).toBe(5)
		expect(total?.confidence).toBe(CONFIDENCE_COMPUTED)
		expect(result.ambiguities).toEqual([])
	})

	it('FormatterInterface: format renders the verb and the template name', () => {
		const formatter = createFormatter({ verbs: { calculate: 'Calculate' } })
		const template: Template = {
			id: 't1',
			name: 'Arithmetic',
			domain: 'arithmetic',
			intents: ['calculate'],
			mappings: [],
			defaults: [],
			computations: [],
			definition: {
				reasoning: 'symbolic',
				id: 't1',
				name: 'Arithmetic',
				equations: [],
				variables: {},
			},
		}

		expect(
			formatter.format(
				{ action: 'calculate', domain: 'arithmetic', confidence: 1 },
				template,
				[],
				[],
			),
		).toEqual({ prompt: 'Calculate Arithmetic' })
	})

	it('GeneratorInterface: generate builds the subject and the mean confidence', () => {
		const generator = createGenerator()
		const template: Template = {
			id: 't1',
			name: 'Arithmetic',
			domain: 'arithmetic',
			intents: ['calculate'],
			mappings: [{ entity: 'value', aliases: [], field: 'value' }],
			defaults: [],
			computations: [],
			definition: {
				reasoning: 'symbolic',
				id: 't1',
				name: 'Arithmetic',
				equations: [],
				variables: {},
			},
		}
		const result = generator.generate(
			[
				{
					name: 'value',
					value: 42,
					provenance: { category: 'extracted', detail: 'collect' },
					confidence: 0.9,
				},
			],
			template,
		)

		expect(result.subject).toEqual({ value: 42 })
		expect(result.confidence).toBe(0.9)
	})

	it('NarratorInterface: each primitive returns its documented rendering', () => {
		const narrator = createNarrator({
			lexicon: { phrases: { comparison: { equals: 'is' } } },
			formatters: { money: (value) => `$${String(value)}` },
		})

		expect(narrator.phrase('comparison', 'equals', 'equals')).toBe('is')
		expect(narrator.label('age')).toBe('age')
		expect(narrator.line('subject.empty', {})).toBe('with no fields')
		expect(narrator.value('money', 5)).toBe('$5')
	})

	it('RecordManagerInterface: the shared engine stamps, holds, and removes one record', () => {
		const notes = new RecordManager<string, NoteRecord>({ entity: 'Note' })
		const note = notes.add('n1', 'first', (stamp, value) => ({
			id: stamp.id,
			note: value,
			version: stamp.version,
			hash: stamp.hash,
		}))

		expect(note.version).toBe(1)
		expect(notes.count).toBe(1)
		expect(notes.has('n1')).toBe(true)
		expect(notes.record('n1')).toEqual(note)
		expect(notes.records()).toEqual([note])
		expect(notes.remove('n1')).toBe(true)
		notes.destroy()
	})

	it('TemplateManagerInterface: the registry stamps, holds, and removes one template', () => {
		const templates = createTemplateManager()
		const record = templates.add(ARITHMETIC)

		expect(record.version).toBe(1)
		expect(templates.count).toBe(1)
		expect(templates.has('t1')).toBe(true)
		expect(templates.template('t1')).toEqual(record)
		expect(templates.templates()).toEqual([record])
		expect(templates.remove('t1')).toBe(true)
		templates.destroy()
	})

	it('SubjectManagerInterface: the registry mints its own record id', () => {
		const subjects = createSubjectManager()
		const first = subjects.add({ age: 25 })

		expect(subjects.count).toBe(1)
		expect(subjects.has(first.id)).toBe(true)
		expect(subjects.subject(first.id)).toEqual(first)
		expect(subjects.subjects()).toEqual([first])
		expect(subjects.remove(first.id)).toBe(true)
		subjects.destroy()
	})

	it('DefinitionManagerInterface: the registry defaults the record id to the definition id', () => {
		const definitions = createDefinitionManager()
		const record = definitions.add(
			createQuantitativeDefinition('d1', 'D1', [
				createFactorGroup('total', 'sum', [createFieldFactor('value', 'value')]),
			]),
		)

		expect(definitions.count).toBe(1)
		expect(definitions.has(record.id)).toBe(true)
		expect(definitions.definition(record.id)).toEqual(record)
		expect(definitions.definitions()).toEqual([record])
		expect(definitions.remove(record.id)).toBe(true)
		definitions.destroy()
	})

	it('InterpretContextInterface: a fresh context buffers nothing', () => {
		const context = createInterpretContext({ session: 'turn-1', history: 4 })

		expect(context.previous()).toEqual([])
		expect(context.entities()).toEqual([])
		context.add({
			text: '42',
			normalized: '42',
			intent: { confidence: 0 },
			entities: [],
			mappings: [],
			ambiguities: [],
			prompt: '',
			stages: [],
			failures: [],
			confidence: 0,
			digest: 'abc',
		})
		expect(context.previous()).toHaveLength(1)
		context.clear()
		expect(context.previous()).toEqual([])
		context.destroy()
	})

	it('InterpretInterface: the orchestrator interprets, looks up, lists, and removes', () => {
		const interpret = createInterpret({
			extractor: createExtractor({
				actions: { calculate: 'calculate' },
				domains: { arithmetic: ['arithmetic'] },
			}),
		})
		interpret.add(ARITHMETIC)
		const result = interpret.interpret('calculate arithmetic 42')

		expect(result.subject).toEqual({ value: 42 })
		expect(interpret.template('t1')).toEqual(ARITHMETIC)
		expect(interpret.templates()).toEqual([ARITHMETIC])
		expect(interpret.remove('t1')).toBe(true)
		interpret.destroy()
	})
})
