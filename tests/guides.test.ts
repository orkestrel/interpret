// The consumer-side guides-parity drop-in: runs `@orkestrel/guide`'s checks against
// this repo's own `guides/README.md` manifest. The constants that follow are this
// package's own, as is the executed section that closes the file.

import type { Recipe } from '@src/core'
import { GuideCommand } from '@orkestrel/guide/server'
import { readInventory } from '@orkestrel/test/server'
import { createVitest } from 'vitest/node'

/** Every fence language this package's guides are allowed to use. */
const FENCE_LANGUAGES = Object.freeze(['ts'])
/** The fence language whose blocks count as worked examples. */
const EXAMPLE_LANGUAGE = 'ts'
/** The package identity that binds its manifest, module map, and README pitch. */
const PACKAGE_NAME = '@orkestrel/interpret'
/** The one guide this package sources, whose tagline the README pitch equals. */
const GUIDE_SPEC = 'guides/interpret.md'
/** Each import specifier this package's own guides may resolve against. */
const MODULES = Object.freeze({ [PACKAGE_NAME]: 'src/core', '@src/core': 'src/core' })
/**
 * Declarations deliberately kept out of the barrel, as `computeSymbolKey` strings.
 *
 * A class that one-class-per-file evicted from its single consumer cannot become a
 * local, so it stays exported without being public. Naming it here is what makes that
 * intentional rather than forgotten — and the assertion that follows it fails when a name
 * here stops being stranded, so the list cannot rot.
 */
const INTERNAL: readonly string[] = Object.freeze([
	'class NumberReader',
	'class ReaderToken',
	'class EntityCompiler',
])

await new GuideCommand({
	root: new URL('../', import.meta.url),
	patterns: ['src/**/*.ts', 'tests/**/*.ts', 'guides/*.md', '*.md', 'package.json'],
	modules: MODULES,
	languages: FENCE_LANGUAGES,
	language: EXAMPLE_LANGUAGE,
	reader: readInventory,
	runner: createVitest,
}).execute(async ({ files, report, rows }) => {
	const { arrayShape, integerShape, isRecord, numberShape, objectShape, optionalShape, parseJSON } =
		await import('@orkestrel/contract')
	const {
		computeSymbolKey,
		createSourceManager,
		extractFenceImports,
		findMissing,
		findMissingSymbols,
		isExternalLink,
		resolveLink,
	} = await import('@orkestrel/guide')
	const { createProgram } = await import('@orkestrel/program')
	const {
		createAtom,
		createEquation,
		createFact,
		createFactorGroup,
		createFieldFactor,
		createDeduction,
		createDeductiveDefinition,
		createDeductiveReasoner,
		createLogicalDefinition,
		createLogicalReasoner,
		createLookupFactor,
		createOperation,
		createQuantitativeDefinition,
		createQuantitativeReasoner,
		createRangeFactor,
		createRule,
		createStaticFactor,
		createSubjectDoor,
		createSymbolicDefinition,
		createSymbolicReasoner,
		createVariable,
		REASON_REFUSAL_CAUSES,
	} = await import('@orkestrel/reason')
	const {
		applyReplacements,
		assignEntities,
		collectRefusalGaps,
		collectRefusedParts,
		compileEntities,
		scanNumbers,
		canonicalize,
		canonicalizeNode,
		CONFIDENCE_ALIAS,
		CONFIDENCE_CARRIED,
		CONFIDENCE_COLLECT,
		CONFIDENCE_COMPUTED,
		CONFIDENCE_DEFAULT,
		CONFIDENCE_EXACT,
		CONFIDENCE_PROPOSED,
		accountContract,
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
		createRecipeManager,
		DEFAULT_CONTRACTIONS,
		DEFAULT_INTERPRET_FLOOR,
		DEFAULT_INTERPRET_HISTORY,
		INTERPRET_TEXT_LIMIT,
		DEFAULT_LEXICON,
		digestValue,
		extractNumbers,
		FamilyNarrator,
		findGoalRule,
		findRefusedValue,
		FRAME_SLOTS,
		InterpretError,
		isAccount,
		isAmbiguity,
		isComputedField,
		isEntity,
		isEntityMapping,
		isFamilyNotice,
		isFamilyQualification,
		isFamilyRatingResult,
		isFieldMapping,
		isIntent,
		isInterpretation,
		isInterpretError,
		isProvenance,
		isStageFailure,
		isStageRecord,
		isRecipe,
		matchesNestedRefusal,
		matchRecipe,
		mergeGlossary,
		projectAccount,
		projectInterpretation,
		NUMBER_PATTERN,
		parseRecipe,
		RecordManager,
		refusalToSource,
		renderAccount,
		renderRefusal,
		renderSubject,
		resolveExpression,
		scoreRecipe,
		setField,
		tokenize,
		variablesOf,
	} = await import('@src/core')
	const { captureError, invokeUnchecked, requireValue } = await import('@orkestrel/test')
	const { describe, expect, it } = await import('vitest')
	const own = requireValue(
		rows.find((row) => row.entry.spec === GUIDE_SPEC),
		`Missing manifest row: ${GUIDE_SPEC}`,
	)
	const manifest = parseJSON(requireValue(files['package.json'], 'Missing inventory: package.json'))
	if (!isRecord(manifest)) throw new Error('Invalid package manifest: package.json')
	const sources = createSourceManager({ files, modules: MODULES })

	it('executes the number reading fence', () => {
		expect(scanNumbers('$75k at 6%').map((number) => number.value)).toEqual([75000, 6])
		expect(scanNumbers('three hundred thousand dollars')[0]?.money).toBe(true)
		expect(scanNumbers('twelve fifty')[0]?.unreadable).toBe('spoken')
		expect(scanNumbers('12 to 18')[0]?.unreadable).toBe('range')
		expect(scanNumbers('call 555-0142')[0]?.unreadable).toBe('undeclared')
		expect(scanNumbers('in 2019')[0]?.foreign).toBe('year')
		expect(scanNumbers('about 40 hours')[0]?.hedged).toBe(true)
		expect(scanNumbers('about 40 hours')[0]?.unit).toBe('hour')
	})

	it('executes the normalized refusal example', () => {
		const text = createNormalizer().normalize('years 3 months').text
		const result = compileEntities(
			scanNumbers(text),
			[{ entity: 'years', aliases: [], field: 'years' }],
			text,
			objectShape({ years: numberShape() }),
		)
		expect(result.entities).toEqual([])
		expect(result.refusals?.items[0]?.reason).toBe('following-word')
		expect(result.refusals?.items[0]?.start).toBe(6)
		const range = '1 – 3 years'
		const refused = compileEntities(
			scanNumbers(range),
			[{ entity: 'years', aliases: [], field: 'years' }],
			range,
			objectShape({ years: numberShape() }),
		)
		expect(refused.entities).toEqual([])
		expect(refused.refusals?.items[1]?.reason).toBe('preceding-word')
		expect(refused.refusals?.items[1]?.word).toBe('"–"')
	})
	it('manifest lists at least one guide', () => {
		expect(report.input).toEqual([])
		expect(rows.length).toBeGreaterThan(0)
		expect(own.entry.spec).toBe(GUIDE_SPEC)
	})

	// The example half of the equality case is silent over an empty population: with no
	// title on both sides `findDrift` compares no pair and the case passes on the summaries
	// alone. This pins the population this repository's own guide contributes, so removing
	// every `@example` title reddens the suite instead of quietly retiring half the gate.
	// The failure names both title sets, because a pin reporting only its own emptiness
	// leaves the reader to work out which side dropped the title.
	it('pairs at least one example title across the guide and the source', () => {
		expect(report.examples.titles.filter((finding) => finding.spec === GUIDE_SPEC)).toEqual([])
	})

	// The README's pitch and the guide's tagline are one text, each read as the blockquote
	// under its file's H1. The native report owns their comparison. The manifest assertion
	// binds that report to this package rather than allowing an unrelated package identity.
	it('opens the README with the guide tagline', () => {
		expect(manifest.name).toBe(PACKAGE_NAME)
		expect(report.pitch).toEqual([])
	})

	for (const { entry, guide, source } of rows) {
		describe(`${entry.concept}`, () => {
			it('uses only listed fence languages', () => {
				expect(report.fences.filter((finding) => finding.spec === entry.spec)).toEqual([])
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
				const members = source.methods(group.interface).map((method) => method.name)
				const documented = group.methods.map((method) => method.name)
				const entity = group.interface.replace(/Interface$/, '')
				describe(`${group.interface}`, () => {
					it('documents at least one method', () => {
						expect(group.methods.length).toBeGreaterThan(0)
					})
					it('documents every interface method', () => {
						expect(findMissing(members, documented)).toEqual([])
					})
					it('documents no phantom method', () => {
						expect(findMissing(documented, members)).toEqual([])
					})
					it(`${entity} exposes no undocumented method`, () => {
						const extra =
							entity === group.interface
								? []
								: findMissing(
										source.methods(entity).map((method) => method.name),
										documented,
									)
						expect(extra).toEqual([])
					})
				})
			}

			it('keeps behavioral interfaces and implementing classes in parity', () => {
				expect(report.methods.filter((finding) => finding.spec === entry.spec)).toEqual([])
			})

			// The equality gate: a `Summary` cell against its export's description paragraph, a
			// titled fence against the `@example` of that title. `findDrift` owns the comparison
			// and names both sides; converge the two sides through the native entry, never by
			// weakening this assertion. `findDrift` pairs an example only where a title is
			// present on both sides, so an untitled `@example` block is outside this case. Each
			// collected line is the spec, the key, and each side's text or `absent` — the same
			// worklist the native entry prints, so a failure here is read the way that command's
			// output is.
			it('keeps every compared summary and example equal to its source', () => {
				expect(report.drift.filter((finding) => finding.spec === entry.spec)).toEqual([])
			})

			it('documents an example for every Surface function', () => {
				expect(report.examples.functions.filter((finding) => finding.spec === entry.spec)).toEqual(
					[],
				)
			})

			it('documents an example for every method', () => {
				expect(report.examples.methods.filter((finding) => finding.spec === entry.spec)).toEqual([])
			})

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

	/** The record shape the `RecordManagerInterface` fence declares for its `RecordManager` instance. */
	interface NoteRecord {
		readonly id: string
		readonly note: string
		readonly version: number
		readonly hash: string
	}

	/** The arithmetic recipe the Surface, Factories, and `InterpretInterface` fences all add. */
	const ARITHMETIC: Recipe = Object.freeze({
		id: 't1',
		name: 'Arithmetic',
		domain: 'arithmetic',
		intents: ['calculate'],
		mappings: [{ entity: 'value', aliases: [], field: 'value' }],
		shape: objectShape({ value: numberShape() }),
		computations: [],
		definition: createQuantitativeDefinition('t1', 'Arithmetic', [
			createFactorGroup('total', 'sum', [createFieldFactor('value', 'value')]),
		]),
	})

	// The EXECUTED half. Every preceding check reads a name — from the guide text or
	// from the barrel — and a name that resolves proves nothing about the sentence
	// beside it, so a fence whose comment claims a value the code contradicts passes
	// all of them. The cases here run the flagship fences and assert the values their
	// comments claim. Change a fence, change the transcription beside it.
	describe('flagship fences', () => {
		it('Surface: interprets text against an added recipe', () => {
			const interpret = createInterpret({
				extractor: createExtractor({
					actions: { calculate: 'calculate' },
					domains: { arithmetic: ['arithmetic'] },
				}),
				recipes: [ARITHMETIC],
			})
			const result = interpret.interpret('calculate arithmetic value 42')

			expect(result.subject).toEqual({ value: 42 })
			expect(result.ambiguities).toEqual([])
			expect(result.failures).toEqual([])
			interpret.destroy()
		})

		it('Continue and build on earlier work: an answer, a withdrawal, and the next turn', () => {
			const interpret = createInterpret({
				extractor: createExtractor({ actions: { book: 'book' }, domains: { hire: ['workshop'] } }),
				recipes: [
					{
						id: 'hire',
						name: 'Workshop hire',
						domain: 'hire',
						intents: ['book'],
						mappings: [
							{ entity: 'guests', aliases: [], field: 'guests' },
							{ entity: 'hours', aliases: [], field: 'hours' },
						],
						computations: [],
						definition: createLogicalDefinition('hire', 'Workshop hire', []),
						shape: objectShape({
							guests: numberShape({ description: 'How many guests?' }),
							hours: optionalShape(numberShape(), { default: 2 }),
						}),
					},
				],
			})

			const asked = interpret.interpret('book workshop hours 4')
			expect(asked.ambiguities[0]?.question).toBe('How many guests?')

			const answered = interpret.amend(asked, { entities: [{ name: 'guests', value: 8 }] })
			expect(answered.subject).toEqual({ hours: 4, guests: 8 })
			expect(answered.entities[1]?.provenance).toEqual({ category: 'proposed' })

			const withdrawn = interpret.amend(answered, { removed: ['hours'] })
			expect(withdrawn.ambiguities[0]?.candidates).toEqual(['4'])
			expect(withdrawn.subject).toBeUndefined()

			const next = interpret.interpret('book workshop hours 6', { previous: answered })
			expect(next.subject).toEqual({ hours: 6, guests: 8 })
			expect(next.entities[1]?.provenance).toEqual({ category: 'carried', detail: 'proposed' })

			// The rules the section states beside the fence.
			const stored: unknown = JSON.parse(JSON.stringify(projectInterpretation(answered)))
			expect(isInterpretation(stored) && interpret.amend(stored, {})).toEqual(answered)
			const unstated = {
				...asked,
				entities: [
					...asked.entities,
					{ name: 'guests', value: 9, provenance: { category: 'extracted' }, confidence: 1 },
				],
			} as const
			expect(interpret.amend(unstated, {}).entities.map((entity) => entity.name)).toEqual(['hours'])
			const other = interpret.amend(answered, { entities: [{ name: 'colour', value: 'red' }] })
			expect(other.ambiguities.map((ambiguity) => ambiguity.field)).toEqual([['colour']])
			const kept = interpret.amend(withdrawn, { entities: [{ name: 'guests', value: 9 }] })
			expect(kept.entities.map((entity) => entity.name)).toEqual(['guests', 'hours'])
			expect(kept.entities[1]?.provenance).toEqual({ category: 'default' })
			expect(interpret.amend(answered, { removed: ['colour'] })).toEqual(answered)
			const replaced = interpret.amend(answered, { entities: [{ name: 'hours', value: 6 }] })
			expect(replaced.subject).toEqual({ guests: 8, hours: 6 })
			const later = interpret.interpret('book workshop', { previous: next })
			expect(later.entities.map((entity) => entity.provenance)).toEqual([
				{ category: 'carried', detail: 'proposed' },
				{ category: 'carried' },
			])
			const stated = interpret.interpret('book workshop guests 12', { previous: answered })
			expect(stated.subject).toEqual({ guests: 12, hours: 4 })
			const doubted = interpret.interpret('book workshop 5', { previous: answered })
			expect(doubted.ambiguities.map((ambiguity) => ambiguity.candidates)).toEqual([['5'], ['5']])
			const refused = interpret.interpret('book workshop', { previous: other })
			expect(refused.ambiguities.map((ambiguity) => ambiguity.field)).toEqual([['colour']])
			expect(interpret.amend(refused, { removed: ['colour'] }).ambiguities).toEqual([])
			expect(
				[
					captureError(() => invokeUnchecked(interpret, interpret.amend, [{}, {}])),
					captureError(() =>
						invokeUnchecked(interpret, interpret.interpret, ['book workshop', { previous: {} }]),
					),
					captureError(() => interpret.amend({ ...answered, version: 2 }, {})),
					captureError(() => interpret.amend(interpret.interpret('hello'), {})),
					captureError(() => interpret.amend(answered, { removed: ['hours', 'hours'] })),
					captureError(() =>
						invokeUnchecked(interpret, interpret.amend, [
							answered,
							{ entities: [{ name: 'hours', value: 1, provenance: { category: 'extracted' } }] },
						]),
					),
				].map((error) => (isInterpretError(error) ? error.code : error)),
			).toEqual([
				'INTERPRETATION',
				'INTERPRETATION',
				'VERSION',
				'VERSION',
				'AMENDMENT',
				'AMENDMENT',
			])
			interpret.destroy()
		})

		it('Continue and build on earlier work: a glossary merged, and an account sent', () => {
			const glossary = mergeGlossary(
				{ labels: { guests: 'guests', hours: 'hours' } },
				{ labels: { guests: 'party size' }, units: { hours: 'count' } },
			)
			expect(glossary).toEqual({
				labels: { guests: 'party size', hours: 'hours' },
				units: { hours: 'count' },
			})

			const definition = createLogicalDefinition('hire', 'Workshop hire', [
				createRule('small', [createAtom('guests', 'to', 12)], createAtom('open', 'equals', true), {
					name: 'A small party',
				}),
			])
			const result = createLogicalReasoner().reason({ guests: 8 }, definition)
			const account = createNarrator({ glossary }).narrate(definition, result)
			const received: unknown = JSON.parse(JSON.stringify(projectAccount(account)))
			expect(accountContract.is(received)).toBe(true)
			expect(isAccount(received) && renderAccount(received, { detail: 'line' })).toBe(
				'Workshop hire holds, because party size is 8, which is at most 12',
			)
		})

		it('Write a result for a person: the berth account at each detail, refused, and its guide', () => {
			const narrator = createNarrator({
				glossary: {
					labels: { membership: 'membership', length: 'boat length', fee: 'nightly fee' },
					units: { length: 'meter', fee: 'money' },
					formats: {
						meter: { style: 'unit', unit: 'meter' },
						money: { style: 'currency', currency: 'USD' },
					},
				},
			})
			const definition = createLogicalDefinition('berth', 'Berth request', [
				createRule(
					'known',
					[createAtom('membership', 'any', ['sailor', 'captain'])],
					createAtom('known', 'equals', true),
					{ name: 'Known member' },
				),
				createRule('size', [createAtom('length', 'to', 12)], createAtom('fits', 'equals', true), {
					name: 'Boat size',
				}),
				createRule(
					'grant',
					[
						createAtom('known', 'equals', true),
						createAtom('fits', 'equals', true),
						createAtom('fee', 'to', 40),
					],
					createAtom('granted', 'equals', true),
					{ name: 'Grant' },
				),
			])
			expect(narrator.audit([definition])).toEqual([])

			const reasoner = createLogicalReasoner()
			const granted = reasoner.reason({ membership: 'sailor', length: 9, fee: 35 }, definition)
			const account = narrator.narrate(definition, granted)
			expect(renderAccount(account, { detail: 'line' })).toBe(
				'Berth request holds, because Known member applies (membership is sailor, which is one of sailor or captain); Boat size applies (boat length is 9 m, which is at most 12 m); and nightly fee is $35.00, which is at most $40.00',
			)
			const reasons = [
				'Berth request holds',
				'  Known member applies',
				'    membership is sailor, which is one of sailor or captain',
				'  Boat size applies',
				'    boat length is 9 m, which is at most 12 m',
				'  nightly fee is $35.00, which is at most $40.00',
			]
			expect(renderAccount(account).split('\n')).toEqual(reasons)
			expect(renderAccount(account, { detail: 'full' }).split('\n')).toEqual([
				...reasons,
				'Rules of Berth request that apply: 3 of 3',
				'Known member applies',
				'Boat size applies',
				'Grant applies',
			])

			const refused = narrator.narrate(
				definition,
				reasoner.reason({ membership: 'sailor', fee: 35 }, definition),
			)
			expect(refused.success).toBe(false)
			expect(renderAccount(refused, { detail: 'line' })).toBe(
				'Berth request cannot be decided, because Boat size cannot be decided (boat length is not known, and must be a number)',
			)
			const causes = [
				'Berth request cannot be decided',
				'  Boat size cannot be decided',
				'    boat length is not known, and must be a number',
			]
			expect(renderAccount(refused).split('\n')).toEqual(causes)
			expect(renderAccount(refused, { detail: 'full' }).split('\n')).toEqual([
				...causes,
				'Known member applies',
				'  membership is sailor, which is one of sailor or captain',
				'Boat size cannot be decided',
				'Grant cannot be decided',
			])

			expect(renderAccount(narrator.describe(definition)).split('\n')).toEqual([
				'Berth request',
				'Known member',
				'  applies when membership is one of sailor or captain',
				'Boat size',
				'  applies when boat length is at most 12 m',
				'Grant',
				'  applies when Known member applies, Boat size applies, and nightly fee is at most $40.00',
			])
		})

		it('Write a result for a person: the stay worksheet, priced and refused', () => {
			const narrator = createNarrator({
				glossary: {
					labels: { fee: 'nightly fee', power: 'shore power' },
					units: { fee: 'money' },
					values: { stay: 'money' },
					formats: { money: { style: 'currency', currency: 'USD' } },
				},
			})
			const definition = createQuantitativeDefinition('stay', 'Stay price', [
				createFactorGroup(
					'nights',
					'sum',
					[
						createFieldFactor('fee', 'fee', { name: 'Berth' }),
						createStaticFactor('power', 5, {
							name: 'Shore power',
							checks: [{ field: 'power', operator: 'equals', value: true }],
						}),
					],
					{ name: 'Per night' },
				),
			])
			expect(narrator.audit([definition])).toEqual([])

			const reasoner = createQuantitativeReasoner()
			const priced = reasoner.reason({ fee: 35, power: false }, definition)
			expect(
				renderAccount(narrator.narrate(definition, priced), { detail: 'full' }).split('\n'),
			).toEqual([
				'Stay price: $35.00',
				'Per night: $35.00',
				'  Berth: $35.00',
				'    nightly fee is $35.00',
				'  Shore power did not apply',
				'    shore power is false',
				'Total: $35.00',
			])
			const refused = reasoner.reason({ power: true }, definition)
			expect(renderAccount(narrator.narrate(definition, refused)).split('\n')).toEqual([
				'Stay price gave no answer',
				'  Berth found no value to use',
				'    nightly fee is not known, and must be a number',
			])
		})

		it('Write a result for a person: the glossary keys and the shipped formats it names', () => {
			const narrator = createNarrator({
				glossary: {
					labels: { 'mooring.depth': 'mooring depth' },
					units: { year: 'plain', boats: 'count', share: 'percent' },
				},
			})
			expect(narrator.label(['mooring', 'depth'])).toBe('mooring depth')
			expect(narrator.value('year', 2026)).toBe('2026')
			expect(narrator.value('boats', 1250)).toBe('1,250')
			expect(narrator.value('share', 0.5)).toBe('50%')
			const unnamed = createLogicalDefinition('berth', 'berth', [
				createRule('size', [createAtom('length', 'to', 12)], createAtom('fits', 'equals', true)),
			])
			expect(narrator.audit([unnamed])).toEqual([
				{ word: 'name', part: 'definition', id: 'berth' },
				{ word: 'name', part: 'rule', id: 'size' },
				{ word: 'label', field: 'length' },
				{ word: 'unit', field: 'length' },
			])
		})

		it('Reword it: one wording, one frame, a locale, and a word in the wrong place', () => {
			const glossary = { labels: { length: 'boat length' }, units: { length: 'plain' } }
			const definition = createLogicalDefinition('berth', 'Berth request', [
				createRule('size', [createAtom('length', 'to', 12)], createAtom('fits', 'equals', true), {
					name: 'Boat size',
				}),
			])
			const result = createLogicalReasoner().reason({ length: 15 }, definition)

			const shipped = createNarrator({ glossary })
			expect(renderAccount(shipped.narrate(definition, result), { detail: 'line' })).toBe(
				'Berth request does not hold, because boat length is 15, which is more than 12',
			)
			const compared = createNarrator({
				glossary,
				lexicon: { comparisons: { to: { fails: 'is over' } } },
			})
			expect(renderAccount(compared.narrate(definition, result), { detail: 'line' })).toBe(
				'Berth request does not hold, because boat length is 15, which is over 12',
			)
			expect(compared.phrase('comparisons', 'to')).toBe('is at most')
			const framed = createNarrator({
				glossary,
				lexicon: { frames: { 'rule.because': '{{name}} {{verdict}}: {{reasons}}' } },
			})
			expect(renderAccount(framed.narrate(definition, result), { detail: 'line' })).toBe(
				'Berth request does not hold: boat length is 15, which is more than 12',
			)
			const german = createNarrator({ glossary, locale: 'de-DE' })
			expect(german.value('crew', ['Ada', 'Grace'])).toBe('Ada und Grace')

			const misplaced = captureError(() =>
				createNarrator({ glossary: { labels: {}, phrases: { comparisons: { to: 'fits' } } } }),
			)
			expect(isInterpretError(misplaced) && [misplaced.code, misplaced.context]).toEqual([
				'GLOSSARY',
				{ findings: ['phrases.comparisons is a table of the lexicon'] },
			])
			// A complete override is a lexicon of its own, and every word of it prints.
			const worded = createNarrator({ lexicon: DEFAULT_LEXICON, locale: 'de-DE' })
			expect(worded.phrase('verdicts', 'met')).toBe('holds')
		})

		it('What an account promises: the refusals, the goal, and the limits it names', () => {
			const narrator = createNarrator()
			const known = createRule(
				'known',
				[createAtom('membership', 'any', ['a', 'b', 'c', 'd', 'sailor'])],
				createAtom('tier', 'equals', 'gold'),
				{ name: 'Known' },
			)
			const size = createRule(
				'size',
				[createAtom('length', 'to', 12)],
				createAtom('fits', 'equals', true),
				{ name: 'Size' },
			)
			const read = createRule(
				'read',
				[createAtom('tier', 'above', 5)],
				createAtom('high', 'equals', true),
				{ name: 'Read' },
			)
			const reasoner = createLogicalReasoner()
			const subject = { membership: 'sailor', length: 9 }

			// Without a goal, the rules are counted, and only a fact counts a list.
			const gates = createLogicalDefinition('gates', 'Gates', [known, size])
			expect(findGoalRule(gates)).toBe(undefined)
			expect(renderAccount(narrator.narrate(gates, reasoner.reason(subject, gates)))).toBe(
				[
					'Rules of Gates that apply: 2 of 2',
					'Known applies',
					'  membership is sailor, which is one of the 5 listed',
					'Size applies',
					'  length is 9, which is at most 12',
				].join('\n'),
			)
			expect(narrator.describe(gates).lines[1]?.summary).toBe(
				'Known applies when membership is one of a, b, c, d, or sailor',
			)

			// A logical result that holds a refusal states its causes and its faults alone, and no rule.
			const unread = createLogicalDefinition('unread', 'Unread', [known, read, size])
			const refused = reasoner.reason({ membership: 'sailor' }, unread)
			expect(refused.refusals.length).toBe(1)
			expect(
				renderAccount(narrator.narrate(unread, refused), { detail: 'full' }).split('\n'),
			).toEqual([
				'Unread gave no answer',
				'  Read compares what a rule decides in a way that cannot be answered (tier: gold)',
				'  length is not known, and must be a number',
			])

			// A lookup's line names the value read, and a gate that passed prints no check.
			const priced = createQuantitativeDefinition('rate', 'Rate', [
				createFactorGroup('rates', 'sum', [
					createLookupFactor(
						'tier',
						'membership',
						{ sailor: 3 },
						{ checks: [{ field: 'length', operator: 'to', value: 12 }] },
					),
				]),
			])
			const worksheet = narrator.narrate(
				priced,
				createQuantitativeReasoner().reason(subject, priced),
			)
			expect(renderAccount(worksheet, { detail: 'full' })).toBe(
				'Rate: 3\nrates: 3\n  tier: 3\n    looked up by membership: membership is sailor\nTotal: 3',
			)
		})

		it('What an account promises: one line, verbatim text, plain data, and ownership', () => {
			const narrator = createNarrator({ glossary: { labels: { length: 'Boat LENGTH' } } })
			const list = ['sailor', 'captain']
			const definition = createLogicalDefinition('berth', 'Berth\nREQUEST', [
				createRule('size', [createAtom('kind', 'any', list)], createAtom('fits', 'equals', true), {
					name: 'Boat\nsize',
				}),
			])
			const result = createLogicalReasoner().reason({ kind: 'sailor' }, definition)
			const account = narrator.narrate(definition, result)
			expect(account.name).toBe('Berth\nREQUEST')
			expect(account.lines[0]?.text).toBe('Berth REQUEST holds')
			expect(account.lines[0]?.gaps).toEqual([{ word: 'label', field: 'kind' }])
			expect(account.lines[0]?.lines[0]?.gaps).toEqual([{ word: 'label', field: 'kind' }])
			expect(narrator.audit([definition])).toEqual([{ word: 'label', field: 'kind' }])
			expect(narrator.label('length')).toBe('Boat LENGTH')
			expect(narrator.label('a\nb')).toBe('a\nb')
			expect(narrator.value('kind', 'a\nb')).toBe('a\nb')
			expect(narrator.value('kind', ' ')).toBe('" "')
			expect(narrator.phrase('table', 'key', 'a\nb')).toBe('a\nb')
			expect(narrator.line('rule.settled', { name: 'a\nb', verdict: 'holds' })).toBe('a\nb holds')

			list.push('later')
			expect(account.lines[0]?.lines[0]?.source.check?.value).toEqual(['sailor', 'captain'])
			const thrower = createLogicalDefinition('berth', 'Berth', [])
			Object.defineProperty(thrower, 'rules', {
				get: () => {
					throw new Error('unreadable')
				},
			})
			const thrown = captureError(() => narrator.narrate(thrower, result))
			expect(thrown instanceof Error && thrown.message).toBe('unreadable')
		})

		it('Migration: the reverse direction writes accounts', () => {
			const narrator = createNarrator({
				lexicon: { frames: { 'subject.empty': 'nothing given' } },
				glossary: {
					labels: { fee: 'nightly fee' },
					units: { fee: 'money' },
					templates: { greeting: 'Welcome, {{name}}' },
				},
				formatters: { money: (value) => `$${value.toFixed(2)}` },
			})
			expect(narrator.value('fee', 35)).toBe('$35.00')
			expect(narrator.line('greeting', { name: 'Ada' })).toBe('Welcome, Ada')
			expect(renderSubject({}, narrator)).toBe('nothing given')
			expect(
				renderSubject(
					{ berth: null, crew: ['Ada', 'Grace'], fee: 35, note: ' ', tide: undefined },
					narrator,
				),
			).toBe('with berth: none, crew: Ada and Grace, nightly fee: $35.00, note: " "')

			for (const key of ['labels', 'phrases', 'templates']) {
				const lexicon = Object.fromEntries([[key, {}]])
				const refused = captureError(() => createNarrator({ lexicon }))
				expect(isInterpretError(refused) && refused.code).toBe('LEXICON')
			}
			for (const id of ['subject.fields', 'prompt.base', 'ambiguity.entity']) {
				expect(Object.hasOwn(FRAME_SLOTS, id)).toBe(true)
			}
			for (const id of [
				'definition.quantitative',
				'definition.logical',
				'definition.symbolic',
				'definition.inferential',
				'result.quantitative',
				'result.quantitative.failed',
				'result.logical',
				'result.symbolic',
				'result.inferential',
			]) {
				expect(Object.hasOwn(FRAME_SLOTS, id)).toBe(false)
			}
			const asked: unknown[] = []
			const counted = createNarrator({
				glossary: { labels: {}, units: { fee: 'money', berth: 'money' } },
				formatters: {
					money: (value) => {
						asked.push(value)
						return 'two\nlines'
					},
				},
			})
			expect(counted.value('fee', 35)).toBe('35')
			expect(counted.value('berth', 'A4')).toBe('A4')
			expect(asked).toEqual([35])
		})

		it('Constants: every pinned default and lexicon line', () => {
			expect(DEFAULT_INTERPRET_FLOOR).toBe(0.3)
			expect(DEFAULT_INTERPRET_HISTORY).toBe(0)
			expect(INTERPRET_TEXT_LIMIT).toBe(65_536)
			expect(CONFIDENCE_EXACT).toBe(1)
			expect(CONFIDENCE_ALIAS).toBe(0.9)
			expect(CONFIDENCE_COLLECT).toBe(0.9)
			expect(CONFIDENCE_CARRIED).toBe(0.7)
			expect(CONFIDENCE_PROPOSED).toBe(1)
			expect(CONFIDENCE_DEFAULT).toBe(1)
			expect(CONFIDENCE_COMPUTED).toBe(0.9)
			expect(typeof NUMBER_PATTERN.source).toBe('string')
			expect(DEFAULT_CONTRACTIONS["can't"]).toBe('cannot')
			expect(DEFAULT_LEXICON.frames['subject.empty']).toBe('with no fields')
			expect(DEFAULT_LEXICON.frames['prompt.base']).toBe('{{verb}} {{name}}')
			expect(DEFAULT_LEXICON.frames['ambiguity.entity']).toBe('What is your {{entity}}?')
			expect(DEFAULT_LEXICON.comparisons.from).toEqual({
				holds: 'is at least',
				fails: 'is less than',
			})
			expect(FRAME_SLOTS['rule.settled']).toEqual(['name', 'verdict'])
		})

		it('Errors: a caught InterpretError narrows to its code', () => {
			const caught = captureError(() => {
				throw new InterpretError('DESTROYED', 'Interpret has been destroyed')
			})

			expect(isInterpretError(caught)).toBe(true)
			expect(isInterpretError(caught) ? caught.code : undefined).toBe('DESTROYED')
		})

		it('Write a number: the guide at each detail, and the worksheet with its changes', () => {
			const narrator = createNarrator({
				glossary: {
					labels: { pier: 'pier', length: 'boat length', insured: 'insurance on file' },
					units: { length: 'meter' },
					values: { mooring: 'money' },
					formats: {
						meter: { style: 'unit', unit: 'meter' },
						money: { style: 'currency', currency: 'USD' },
					},
				},
			})
			const definition = createQuantitativeDefinition(
				'mooring',
				'Mooring price',
				[
					createFactorGroup(
						'nights',
						'sum',
						[
							createLookupFactor(
								'pier',
								'pier',
								{ north: 30, south: 24 },
								{ name: 'Pier rate', fallback: 20 },
							),
							createRangeFactor(
								'length',
								'length',
								[
									{ bounds: { maximum: 8 }, value: 10 },
									{ bounds: { maximum: 15 }, value: 18 },
								],
								{
									name: 'Length charge',
									transforms: [{ operation: 'percentage', operand: 90 }],
									bounds: { minimum: 10, maximum: 30 },
								},
							),
							createStaticFactor('key', 5, {
								name: 'Key deposit',
								required: true,
								checks: [{ field: 'insured', operator: 'equals', value: true }],
							}),
						],
						{ name: 'Per night' },
					),
				],
				{ precision: 2 },
			)
			expect(narrator.audit([definition])).toEqual([])
			expect(renderAccount(narrator.describe(definition)).split('\n')).toEqual([
				'Mooring price',
				'  Total of the values that apply',
				'Per night',
				'  Total of the values that apply',
				'  Pier rate',
				'    looked up by pier',
				'  Length charge',
				'    set by the first range boat length falls in',
				'  Key deposit',
				'    fixed at $5.00',
				'    applies when insurance on file is true',
			])
			expect(renderAccount(narrator.describe(definition), { detail: 'full' }).split('\n')).toEqual([
				'Mooring price',
				'  Total of the values that apply',
				'  decimal places: 2',
				'Per night',
				'  Total of the values that apply',
				'  Pier rate',
				'    looked up by pier',
				'      north: $30.00',
				'      south: $24.00',
				'      fallback: $20.00',
				'  Length charge',
				'    set by the first range boat length falls in',
				'      at most 8 m: 10',
				'      at most 15 m: 18',
				'    changes: 90% of it',
				'    bounds: $10.00 to $30.00',
				'  Key deposit',
				'    fixed at $5.00',
				'    must apply',
				'    applies when insurance on file is true',
			])
			const result = createQuantitativeReasoner().reason(
				{ pier: 'east', length: 9, insured: true },
				definition,
			)
			expect(renderAccount(narrator.narrate(definition, result)).split('\n')).toEqual([
				'Mooring price: $41.20',
				'Per night: $41.20',
				'  Pier rate: $20.00',
				'    its fallback, because no entry matches pier: pier is east',
				'  Length charge: $16.20',
				'    set by the first range boat length falls in: boat length is 9 m',
				'    before its changes: 18',
				'    changes: 90% of it',
				'    bounds: $10.00 to $30.00',
				'  Key deposit: $5.00',
				'    fixed at $5.00',
				'Total: $41.20',
			])
			const refused = createQuantitativeReasoner().reason(
				{ pier: 'north', length: 22, insured: false },
				definition,
			)
			expect(renderAccount(narrator.narrate(definition, refused)).split('\n')).toEqual([
				'Mooring price gave no answer',
				'  Per night: Length charge has no entry for the value it read (boat length: 22 m)',
				'  Per night: Key deposit had to apply and did not',
				'    insurance on file is false',
			])
		})

		it('Write equations: the guide and the solution with its equation', () => {
			const narrator = createNarrator({
				glossary: {
					labels: {
						range: 'cruising time',
						tank: 'fuel on board',
						reserve: 'fuel kept back',
						burn: 'hourly burn',
					},
					units: { range: 'hour' },
					formats: { hour: { style: 'unit', unit: 'hour', unitDisplay: 'long' } },
				},
			})
			const definition = createSymbolicDefinition('fuel', 'Fuel plan', [
				createEquation(
					'range',
					createVariable('range'),
					createOperation(
						'divide',
						createOperation('subtract', createVariable('tank'), createVariable('reserve')),
						createVariable('burn'),
					),
					'range',
					{ name: 'Time under way' },
				),
			])
			expect(renderAccount(narrator.describe(definition)).split('\n')).toEqual([
				'Fuel plan',
				'Time under way',
				'  cruising time = (fuel on board - fuel kept back) ÷ hourly burn',
				'  solves for cruising time',
			])
			const result = createSymbolicReasoner().reason({ tank: 90, reserve: 10, burn: 8 }, definition)
			expect(renderAccount(narrator.narrate(definition, result)).split('\n')).toEqual([
				'cruising time is 10 hours',
				'  cruising time = (fuel on board - fuel kept back) ÷ hourly burn',
			])
			expect(narrator.audit([definition])).toEqual([])
		})

		it('Write facts: a predicate’s sentence, its fallback with its gap, and a backward run', () => {
			const deductions = [
				createDeduction(
					'change',
					[createFact('first', 'sails', ['?x', '?y']), createFact('second', 'sails', ['?y', '?z'])],
					createFact('reached', 'reaches', ['?x', '?z']),
					{ name: 'One change', confidence: 0.9 },
				),
			]
			const facts = [
				createFact('a', 'sails', ['Oban', 'Mull']),
				createFact('b', 'sails', ['Mull', 'Iona']),
			]
			const definition = createDeductiveDefinition('ferries', 'Ferry links', facts, deductions)
			const reasoner = createDeductiveReasoner()
			const result = reasoner.reason({}, definition)
			const worded = createNarrator({
				glossary: {
					labels: {},
					predicates: { sails: '{{1}} has a ferry to {{2}}', reaches: '{{1}} reaches {{2}}' },
				},
			})
			expect(renderAccount(worded.describe(definition)).split('\n')).toEqual([
				'Ferry links',
				'One change',
				'  ?x reaches ?z, when ?x has a ferry to ?y and ?y has a ferry to ?z',
				'  confidence: 90%',
			])
			expect(renderAccount(worded.narrate(definition, result)).split('\n')).toEqual([
				'Facts derived: 1',
				'Oban reaches Iona (confidence 90%)',
			])
			expect(renderAccount(worded.narrate(definition, result), { detail: 'line' })).toBe(
				'Facts derived: 1 (Oban reaches Iona (confidence 90%))',
			)
			const bare = createNarrator()
			expect(renderAccount(bare.narrate(definition, result)).split('\n')).toEqual([
				'Facts derived: 1',
				'reaches(Oban, Iona) (confidence 90%)',
			])
			expect(bare.audit([definition])).toEqual([
				{ word: 'predicate', id: 'sails' },
				{ word: 'predicate', id: 'reaches' },
			])

			const backward = createDeductiveDefinition('ferries', 'Ferry links', facts, deductions, {
				strategy: 'backward',
			})
			const proved = worded.narrate(backward, reasoner.reason({}, backward))
			expect(renderAccount(proved).split('\n')).toEqual([
				'Oban reaches Iona (confidence 90%)',
				'  Oban reaches Iona (confidence 90%), through One change',
			])
			const unproved = createDeductiveDefinition('ferries', 'Ferry links', [], deductions, {
				strategy: 'backward',
			})
			expect(renderAccount(worded.narrate(unproved, reasoner.reason({}, unproved)))).toBe(
				'Facts derived: 0',
			)
			const named = createDeductiveDefinition(
				'ferries',
				'Ferry links',
				[createFact('a', 'sails', ['?x', 'Mull']), createFact('b', 'sails', ['Mull', 'Iona'])],
				deductions,
			)
			expect(renderAccount(worded.narrate(named, reasoner.reason({}, named)))).toBe(
				'Facts derived: 1\n?x reaches Iona (confidence 90%)',
			)
		})

		it('Write a program: the account, the guide, and the qualification alone', () => {
			const program = createProgram({
				id: 'stay',
				name: 'Harbor stay',
				qualification: {
					id: 'entry',
					name: 'Entry check',
					passes: [
						createLogicalDefinition('gates', 'Gates', [
							createRule(
								'late',
								[createAtom('arrival', 'above', 20)],
								createAtom('late', 'equals', true),
								{ name: 'Late arrival' },
							),
						]),
					],
					rulings: [
						{
							id: 'late',
							pass: 'gates',
							rule: 'late',
							effect: 'restriction',
							scope: 'power',
							message: 'Shore power is off after 20:00.',
						},
					],
				},
				rating: {
					id: 'prices',
					name: 'Prices',
					lines: [
						{
							id: 'berth',
							name: 'Berth',
							rate: createQuantitativeDefinition('berthRate', 'Berth rate', [
								createFactorGroup(
									'fees',
									'sum',
									[createFieldFactor('fee', 'fee', { name: 'Night' })],
									{
										name: 'Fees',
									},
								),
							]),
						},
						{
							id: 'power',
							name: 'Shore power',
							rate: createQuantitativeDefinition('powerRate', 'Power rate', [
								createFactorGroup(
									'fees',
									'sum',
									[createStaticFactor('flat', 5, { name: 'Flat fee' })],
									{
										name: 'Fees',
									},
								),
							]),
						},
					],
				},
				notices: [{ id: 'office', message: 'The harbor office closes at 18:00.' }],
				authority: createLogicalDefinition('authority', 'Harbor authority', [
					createRule(
						'large',
						[
							createAtom(['outcome', 'rated'], 'equals', true),
							createAtom(['outcome', 'total'], 'above', 200),
						],
						createAtom('held', 'equals', true),
						{ name: 'Large total', description: 'A large total needs the harbor master.' },
					),
				]),
			})
			const narrator = createNarrator({
				glossary: {
					labels: {
						arrival: 'arrival hour',
						fee: 'nightly fee',
						'outcome.rated': 'stay rated',
						'outcome.total': 'stay total',
					},
					units: { arrival: 'plain', fee: 'money', 'outcome.total': 'money' },
					values: { prices: 'money', berthRate: 'money', powerRate: 'money' },
					formats: { money: { style: 'currency', currency: 'USD' } },
				},
			})
			expect(narrator.audit([program.definition])).toEqual([])

			const result = program.execute({ arrival: 21, fee: 35 })
			const account = narrator.narrate(program.definition, result)
			expect(renderAccount(account, { detail: 'line' })).toBe(
				'Harbor stay: eligible with conditions, because Shore power: Shore power is off after 20:00.',
			)
			expect(renderAccount(account).split('\n')).toEqual([
				'Harbor stay: eligible with conditions',
				'Decision: approved',
				'Notice: The harbor office closes at 18:00.',
				'Entry check: eligible',
				'  Shore power: not eligible',
				'    Restriction: Shore power is off after 20:00.',
				'      arrival hour is 21, which is more than 20',
				'Prices: $35.00',
				'  Berth: $35.00',
				'    Fees: $35.00',
				'      Night: $35.00',
				'        nightly fee is $35.00',
				'    Total: $35.00',
			])
			expect(renderAccount(narrator.describe(program.definition)).split('\n')).toEqual([
				'Harbor stay',
				'Notice: The harbor office closes at 18:00.',
				'Harbor authority',
				'  Large total',
				'    applies when stay rated is true and stay total is more than $200.00',
				'Entry check',
				'  Shore power: Restriction: Late arrival',
				'    applies when arrival hour is more than 20',
				'Prices',
				'  Berth',
				'    Total of the values that apply',
				'    Fees',
				'      Total of the values that apply',
				'      Night',
				'        taken from nightly fee',
				'  Shore power',
				'    Total of the values that apply',
				'    Fees',
				'      Total of the values that apply',
				'      Flat fee',
				'        fixed at $5.00',
			])

			const { qualification } = program.definition
			const alone = narrator.narrate(qualification, result.qualification)
			expect(renderAccount(alone).split('\n')).toEqual([
				'Entry check: eligible',
				'power: not eligible',
				'  Restriction: Shore power is off after 20:00.',
				'    arrival hour is 21, which is more than 20',
			])
			expect(narrator.audit([qualification])).toEqual([
				{ word: 'name', part: 'scope', id: 'power' },
			])

			// A finding that isn't met prints its rule's name, and only at `full`.
			const early = narrator.narrate(
				qualification,
				program.execute({ arrival: 9, fee: 35 }).qualification,
			)
			expect(renderAccount(early)).toBe('Entry check: eligible')
			expect(renderAccount(early, { detail: 'full' }).split('\n')).toEqual([
				'Entry check: eligible',
				'power: Restriction: Late arrival does not apply',
				'  arrival hour is 9, which is not more than 20',
			])
			program.destroy()
		})

		it('Say why a value was not taken: a fault, a refused number, and neither', () => {
			const narrator = createNarrator({
				glossary: {
					labels: { fee: 'nightly fee', length: 'boat length', nights: 'nights' },
					units: { fee: 'money', length: 'plain', nights: 'plain' },
					formats: { money: { style: 'currency', currency: 'USD' } },
				},
			})
			const shape = objectShape({
				fee: numberShape({ max: 40 }),
				length: numberShape(),
				nights: integerShape(),
			})
			const { faults } = createSubjectDoor().admit({ fee: 55, length: 'long' }, shape)
			expect(faults.map((fault) => narrator.explain(fault))).toEqual([
				'nightly fee must be at most $40.00, and $55.00 is not',
				'boat length must be a number, and "long" is not',
				'nights is not known, and must be a whole number',
			])
			const text = 'nights 2 to 3'
			const mappings = [{ entity: 'nights', aliases: [], field: 'nights' }]
			const { refusals } = compileEntities(scanNumbers(text), mappings, text, shape)
			expect(refusals?.items.map((refusal) => narrator.explain(refusal))).toEqual([
				'"2" was not taken, because it is part of a range or a choice (considered for nights)',
				'"3" was not taken, because it could not be tied to a value',
			])
			const definition = createLogicalDefinition('berth', 'Berth request', [
				createRule(
					'long',
					[createAtom('nights', 'above', 7)],
					createAtom('length', 'equals', 'long'),
					{ name: 'Long stay' },
				),
				createRule(
					'deep',
					[createAtom('length', 'above', 12)],
					createAtom('deep', 'equals', true),
					{
						name: 'Deep berth',
					},
				),
			])
			const run = createLogicalReasoner().reason({ nights: 9 }, definition)
			expect(run.refusals.map((refusal) => narrator.explain(refusal))).toEqual([
				'deep compares what a rule decides in a way that cannot be answered (boat length: long)',
			])
			expect(narrator.narrate(definition, run).lines[0]?.summary).toBe(
				'Berth request gave no answer, because Deep berth compares what a rule decides in a way that cannot be answered (boat length: long)',
			)
			expect(Object.keys(DEFAULT_LEXICON.causes).toSorted()).toEqual(
				[...REASON_REFUSAL_CAUSES].toSorted(),
			)
			expect(narrator.explain({ cause: 'thrown', message: 'no tide' })).toBe(
				'the run failed while it ran ("no tide")',
			)
			expect(invokeUnchecked<string>(narrator, narrator.explain, [{}])).toBe('not known')
		})

		it('Reword it: one word of each kind', () => {
			const narrator = createNarrator({
				glossary: {
					labels: {
						length: 'boat length',
						fee: 'nightly fee',
						speed: 'speed',
						distance: 'miles',
						hours: 'hour',
					},
					units: { length: 'plain', fee: 'plain' },
				},
				lexicon: {
					comparisons: { to: { holds: 'is within the limit of' } },
					operations: { divide: '{{left}} per {{right}}' },
					expected: { number: 'a figure' },
					statuses: { referral: 'waiting for the harbor master' },
					joins: { reasons: ', ', last: ', and ' },
				},
			})
			const berth = createLogicalDefinition('berth', 'Berth request', [
				createRule(
					'grant',
					[createAtom('length', 'to', 12), createAtom('fee', 'to', 40)],
					createAtom('granted', 'equals', true),
					{ name: 'Grant' },
				),
			])
			const result = createLogicalReasoner().reason({ length: 9, fee: 35 }, berth)
			expect(renderAccount(narrator.narrate(berth, result), { detail: 'line' })).toBe(
				'Berth request holds, because boat length is 9, which is within the limit of 12, and nightly fee is 35, which is within the limit of 40',
			)
			expect(narrator.phrase('comparisons', 'from')).toBe('is at least')
			const speed = createEquation(
				'speed',
				createVariable('speed'),
				createOperation('divide', createVariable('distance'), createVariable('hours')),
				'speed',
				{ name: 'Speed' },
			)
			expect(
				renderAccount(narrator.describe(createSymbolicDefinition('trip', 'Trip', [speed]))).split(
					'\n',
				),
			).toEqual(['Trip', 'Speed', '  speed = miles per hour', '  solves for speed'])
			expect(narrator.explain({ reason: 'missing', path: 'length', expected: 'number' })).toBe(
				'boat length is not known, and must be a figure',
			)
			expect(narrator.phrase('statuses', 'referral')).toBe('waiting for the harbor master')
		})

		it('Reword it: another language, and the English a missing word falls back to', () => {
			const german = createNarrator({
				glossary: { labels: { length: 'Bootslänge' }, units: { length: 'plain' } },
				lexicon: {
					comparisons: { to: { holds: 'ist höchstens', fails: 'ist mehr als' } },
					frames: { 'fact.compared': '{{label}} ist {{actual}} und {{comparison}} {{expected}}' },
				},
				locale: 'de-DE',
			})
			const definition = createLogicalDefinition('berth', 'Liegeplatz', [
				createRule('size', [createAtom('length', 'to', 12)], createAtom('fits', 'equals', true), {
					name: 'Größe',
				}),
			])
			const result = createLogicalReasoner().reason({ length: 12.5 }, definition)
			expect(renderAccount(german.narrate(definition, result), { detail: 'line' })).toBe(
				'Liegeplatz does not hold, because Bootslänge ist 12,5 und ist mehr als 12',
			)
		})

		it('What an account promises: a qualification, a rating, and a program', () => {
			const narrator = createNarrator()
			const sized = createQuantitativeDefinition('size', 'Size', [
				createFactorGroup('sizes', 'sum', [
					createLookupFactor('pier', 'pier', { north: 1 }, { name: 'Pier' }),
				]),
			])
			const gates = createLogicalDefinition('gates', 'Gates', [
				createRule(
					'late',
					[createAtom('arrival', 'above', 20)],
					createAtom('late', 'equals', true),
					{
						name: 'Late arrival',
						description: 'After {{arrival}}.',
					},
				),
			])
			const rulings = [
				{
					id: 'late',
					pass: 'gates',
					rule: 'late',
					effect: 'restriction' as const,
					message: 'Closed at {{arrival}}.',
				},
			]
			const rating = {
				id: 'prices',
				name: 'Prices',
				lines: [
					{
						id: 'berth',
						name: 'Berth',
						rate: createQuantitativeDefinition('rate', 'Rate', [
							createFactorGroup('fees', 'sum', [
								createLookupFactor(
									'pier',
									'pier',
									{ north: 10 },
									{
										name: 'Pier',
										fallback: 5,
										transforms: [{ operation: 'multiply', operand: 2 }],
									},
								),
							]),
						]),
					},
					{
						id: 'power',
						name: 'Power',
						rate: createQuantitativeDefinition('flat', 'Flat', [
							createFactorGroup('fees', 'sum', [
								createLookupFactor('socket', 'socket', { one: 5 }, { name: 'Socket' }),
							]),
						]),
					},
				],
			}

			// A refusal leaves no answer, and none of the program over it, and each cause prints once.
			const missed = createProgram({
				id: 'stay',
				name: 'Stay',
				qualification: { id: 'entry', name: 'Entry', passes: [sized, gates], rulings },
			})
			const unanswered = missed.execute({ pier: 'south', arrival: 21 })
			expect(unanswered.qualification.refusals.map(({ cause }) => cause)).toEqual(['source'])
			expect(
				renderAccount(narrator.narrate(missed.definition, unanswered), {
					detail: 'full',
				}).split('\n'),
			).toEqual([
				'Stay gave no answer',
				'Entry gave no answer',
				'  Size, sizes: Pier has no entry for the value it read (pier: south)',
			])

			// A refusal of the authority takes its limit and not its status.
			const limited = createProgram({
				id: 'stay',
				name: 'Stay',
				qualification: { id: 'entry', name: 'Entry', passes: [gates], rulings },
				rating,
				authority: createLogicalDefinition('authority', 'Authority', [
					createRule(
						'turned',
						[createAtom(['outcome', 'status'], 'equals', 'ineligible')],
						createAtom('turned', 'equals', true),
						{ name: 'Turned away', description: 'The stay was turned away.' },
					),
					createRule(
						'large',
						[createAtom(['outcome', 'total'], 'above', 200)],
						createAtom('large', 'equals', true),
						{ name: 'Large total' },
					),
				]),
			})
			const denied = limited.execute({ pier: 'north', socket: 'one', arrival: 21 })
			expect(denied.determinations.length).toBe(1)
			expect(denied.refusals.map(({ cause, path }) => [cause, path])).toEqual([
				['unread', ['authority']],
			])
			expect(renderAccount(narrator.narrate(limited.definition, denied)).split('\n')).toEqual([
				'Stay: not eligible',
				'  Authority: Large total could not read a value that the run itself supplies (outcome.total)',
				'Entry: not eligible',
				'  Restriction: Closed at 21.',
				'    arrival is 21, which is more than 20',
			])

			// A line states an amount only where its result holds one, and no text an engine words prints.
			const priced = limited.execute({ pier: 'north', socket: 'two', arrival: 9 })
			const account = narrator.narrate(limited.definition, priced)
			expect(renderAccount(account).split('\n')).toEqual([
				'Stay: not fully rated',
				'  Authority: Large total could not read a value that the run itself supplies (outcome.total)',
				'Entry: eligible',
				'Prices gave no answer',
				'  Berth: 20',
				'    fees: 20',
				'      Pier: 20',
				'        looked up by pier: pier is north',
				'        before its changes: 10',
				'        changes: times 2',
				'    Total: 20',
				'  Power gave no answer',
				'    fees: Socket has no entry for the value it read (socket: two)',
			])
			const reworded = {
				...priced,
				trace: ['another text'],
			}
			expect(narrator.narrate(limited.definition, reworded)).toEqual(account)

			const guide = renderAccount(narrator.describe(limited.definition), { detail: 'full' })
			expect(guide).toContain('Restriction: Late arrival')
			expect(guide).not.toContain('{{')
			missed.destroy()
			limited.destroy()
		})

		it('What an account promises: what it can’t say of an input, a reader, a format, and a bound', () => {
			const narrator = createNarrator({
				glossary: {
					labels: { net: 'net + gross' },
					units: { fee: 'money' },
					formats: { money: { style: 'currency', currency: 'USD' } },
				},
			})
			const tripled = createSymbolicDefinition('sum', 'Sum', [
				createEquation(
					'total',
					createVariable('total'),
					createOperation('multiply', createVariable('net'), createVariable('net')),
					'total',
					{ name: 'Total' },
				),
			])
			expect(
				renderAccount(
					narrator.narrate(tripled, createSymbolicReasoner().reason({ net: 7 }, tripled)),
				),
			).toBe('total is 49\n  total = net + gross × net + gross')

			const shared = createQuantitativeDefinition('quote', 'Quote', [
				createFactorGroup('parts', 'sum', [
					createFieldFactor('field', 'tier', { name: 'Field' }),
					createLookupFactor('lookup', 'tier', { a: 1 }, { name: 'Lookup' }),
				]),
			])
			expect(
				renderAccount(
					narrator.narrate(shared, createQuantitativeReasoner().reason({}, shared)),
				).split('\n'),
			).toEqual([
				'Quote gave no answer',
				'  Field found no value to use',
				'    tier is not known, and must be a number',
				'  Lookup found no value to use',
				'    tier is not known',
			])
			expect(narrator.value('fee', 15.125)).toBe('$15.13')

			const bounded = createLogicalDefinition(
				'loan',
				'Loan',
				[
					createRule(
						'any',
						[createAtom('size', 'equals', 'small')],
						createAtom('a', 'equals', true),
					),
				],
				{ shape: objectShape({ size: numberShape({ max: 5 }) }) },
			)
			const refused = narrator.narrate(
				bounded,
				createLogicalReasoner().reason({ size: 9 }, bounded),
			)
			expect(refused.lines[0]?.lines[0]?.gaps).toContainEqual({ word: 'unit', field: ['size'] })
			expect(narrator.audit([bounded]).map((gap) => gap.word)).not.toContain('unit')
		})

		it('Migration: the glossary refuses a phrase table under each lexicon name', () => {
			for (const table of Object.keys(DEFAULT_LEXICON)) {
				const phrases = Object.fromEntries([[table, { word: 'words' }]])
				const refused = captureError(() => createNarrator({ glossary: { labels: {}, phrases } }))
				expect(isInterpretError(refused) && refused.code).toBe('GLOSSARY')
			}
		})

		it('README: the program reads as the fence prints it', () => {
			const program = createProgram({
				id: 'stay',
				name: 'Harbor stay',
				qualification: {
					id: 'entry',
					name: 'Entry check',
					passes: [
						createLogicalDefinition('gates', 'Gates', [
							createRule(
								'long',
								[createAtom('length', 'above', 12)],
								createAtom('long', 'equals', true),
								{ name: 'Long boat' },
							),
						]),
					],
					rulings: [
						{
							id: 'long',
							pass: 'gates',
							rule: 'long',
							effect: 'referral',
							message: 'The harbor master sees a long boat in.',
						},
					],
				},
			})
			const narrator = createNarrator({
				glossary: {
					labels: { length: 'boat length' },
					units: { length: 'meter' },
					formats: { meter: { style: 'unit', unit: 'meter' } },
				},
			})
			const account = narrator.narrate(program.definition, program.execute({ length: 15 }))
			expect(renderAccount(account).split('\n')).toEqual([
				'Harbor stay: referred for review',
				'Entry check: referred for review',
				'  Referral: The harbor master sees a long boat in.',
				'    boat length is 15 m, which is more than 12 m',
			])
			program.destroy()
		})

		it('FamilyNarratorInterface: the audit, the guide, and the refusal read as the fence prints them', () => {
			const glossary = {
				labels: { fee: 'nightly fee' },
				values: { stay: 'money', berth: 'money' },
				formats: { money: { style: 'currency', currency: 'USD' } },
			} as const
			const family = new FamilyNarrator(createNarrator({ glossary }), {
				glossary,
				units: new Set(['money']),
			})
			const rating = {
				id: 'stay',
				name: 'Stay price',
				lines: [
					{
						id: 'mooring',
						name: 'Mooring',
						rate: createQuantitativeDefinition('berth', 'Berth rate', [
							createFactorGroup(
								'fees',
								'sum',
								[createStaticFactor('fee', 35, { name: 'Night fee' })],
								{ name: 'Fees' },
							),
						]),
					},
				],
			}
			expect(family.audit([rating])).toEqual([])
			expect(renderAccount(family.describe(rating)).split('\n')).toEqual([
				'Stay price',
				'Mooring',
				'  Total of the values that apply',
				'  Fees',
				'    Total of the values that apply',
				'    Night fee',
				'      fixed at $35.00',
			])
			const refused = {
				lines: [],
				success: false,
				refusals: [],
				faults: [{ reason: 'missing', path: 'fee', expected: 'number' }] as const,
			}
			expect(renderAccount(family.narrate(rating, refused), { detail: 'line' })).toBe(
				'Stay price gave no answer, because nightly fee is not known, and must be a number',
			)
		})

		it('Validators: the family guards answer as the fence says', () => {
			expect(
				isFamilyNotice({ id: 'close', message: 'The workshop closes at 18:00.', metadata: 1 }),
			).toBe(true)
			expect(isFamilyQualification({ id: 'booking', name: 'Booking', passes: [] })).toBe(true)
			expect(
				isFamilyRatingResult({ lines: [], total: null, success: true, refusals: [], faults: [] }),
			).toBe(true)
			expect(isFamilyRatingResult({ lines: [], success: true, faults: [] })).toBe(false)
		})

		it('Validators: every guard accepts the record the fence hands it', () => {
			expect(isEntityMapping({ entity: 'age', aliases: ['years old'], field: 'age' })).toBe(true)
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
				isRecipe({
					id: 't1',
					name: 'Arithmetic',
					domain: 'arithmetic',
					intents: ['calculate'],
					mappings: [],
					shape: objectShape({}),
					computations: [],
					definition: createQuantitativeDefinition('t1', 'Arithmetic', [
						createFactorGroup('total', 'sum', [createFieldFactor('value', 'value')]),
					]),
				}),
			).toBe(true)
			expect(isProvenance({ category: 'extracted', detail: 'alias', metadata: true })).toBe(true)
			expect(isIntent({ action: 'calculate', domain: 'arithmetic', confidence: 1 })).toBe(true)
			expect(
				isEntity({
					name: 'value',
					value: 42,
					provenance: { category: 'extracted' },
					confidence: 1,
				}),
			).toBe(true)
			expect(
				isFieldMapping({ field: 'value', provenance: { category: 'extracted' }, confidence: 1 }),
			).toBe(true)
			expect(
				isAmbiguity({
					field: 'value',
					question: 'Which value?',
					candidates: ['42'],
					required: true,
				}),
			).toBe(true)
			expect(
				isStageRecord({ stage: 'normalize', input: 'raw', output: 'clean', failed: false }),
			).toBe(true)
			expect(isStageFailure({ stage: 'format', code: 'FORMAT_FAILED', message: 'failed' })).toBe(
				true,
			)

			const guardEngine = createInterpret()
			expect(isInterpretation(guardEngine.interpret('unmatched text'))).toBe(true)
			guardEngine.destroy()
		})

		it('Helpers: the text leaves return the strings the fence prints', () => {
			expect(setField({ age: 25 }, 'age', 30)).toEqual({ age: 30 })
			expect(setField({}, ['address', 'city'], 'Reno')).toEqual({ address: { city: 'Reno' } })
			expect(applyReplacements("can't stop", { "can't": 'cannot' })).toBe('cannot stop')
			expect(collapseWhitespace('  a   b\t c ')).toBe('a b c')
			expect(tokenize('The rate is 85%.')).toEqual(['the', 'rate', 'is', '85%.'])
		})

		it('Helpers: the extraction and matching leaves return the fence values', () => {
			expect(extractNumbers('income was $50,000, age 25')).toEqual([50000, 25])

			const assigned = assignEntities(
				scanNumbers('age 25 with score 720'),
				[
					{ entity: 'age', aliases: ['years old'], field: 'age' },
					{ entity: 'score', aliases: ['credit score'], field: 'score' },
				],
				'age 25 with score 720',
				objectShape({ age: numberShape(), score: numberShape() }),
			)
			expect(assigned.find((entity) => entity.name === 'age')?.value).toBe(25)
			expect(assigned.find((entity) => entity.name === 'score')?.value).toBe(720)
		})

		it('Helpers: the refusal leaves return the fence values', () => {
			const definition = createQuantitativeDefinition('stay', 'Stay price', [
				createFactorGroup('nights', 'sum', [], { name: 'Per night' }),
			])
			const refusal = { cause: 'source', group: 'nights', field: 'pier', actual: 'east' } as const
			const parts = collectRefusedParts(refusal, definition)
			expect(parts).toEqual([{ part: 'group', id: 'nights', name: 'Per night' }])
			expect(findRefusedValue(refusal)).toBe('east')
			expect(refusalToSource(refusal).group).toBe('nights')
			expect(collectRefusalGaps(refusal, { labels: {} }, new Set())).toEqual([
				{ word: 'label', field: 'pier' },
			])
			expect(
				renderRefusal(
					refusal,
					parts.map((part) => part.name),
					createNarrator(),
					new Intl.NumberFormat('en-US'),
				),
			).toBe('Per night has no entry for the value it read (pier: east)')
			expect(matchesNestedRefusal({ ...refusal, path: ['rating'] }, 'rating', [refusal])).toBe(true)
		})

		it('Helpers: the digest, recipe, and reverse leaves return the fence values', () => {
			expect(canonicalize({ b: 1, a: 2 }) === canonicalize({ a: 2, b: 1 })).toBe(true)
			expect(canonicalizeNode({ b: 1, a: 2 }, new Set())).toBe('{"a":2,"b":1}')
			expect(digestValue({ a: 1 }) === digestValue({ a: 1 })).toBe(true)
			expect(matchRecipe({ confidence: 0 }, [], 0.3)).toBeUndefined()
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
				scoreRecipe(
					{ action: 'compute', domain: 'rating', confidence: 1 },
					{
						id: 't1',
						name: 'T',
						domain: 'rating',
						intents: ['compute'],
						mappings: [],
						shape: objectShape({}),
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

		it('Parsers: an off-shape recipe coerces to undefined', () => {
			expect(parseRecipe('not json')).toBeUndefined()
		})

		it('Factories: each factory wires a working entity with the fence tally', () => {
			expect(createNormalizer().normalize("it's  cold")).toEqual({
				text: 'it is cold',
				changes: [{ from: "it's", to: 'it is' }],
			})

			const recipes = createRecipeManager({ recipes: [ARITHMETIC] })
			expect(recipes.count).toBe(1)
			recipes.destroy()

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
			const recipe: Recipe = {
				id: 't1',
				name: 'Arithmetic',
				domain: 'arithmetic',
				intents: ['calculate'],
				mappings: [{ entity: 'value', aliases: [], field: 'value' }],
				shape: objectShape({ value: numberShape() }),
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
				clarifier.clarify([], recipe, undefined, {
					action: 'calculate',
					domain: 'arithmetic',
					confidence: 1,
				}),
			).toEqual({
				entities: [],
				ambiguities: [
					{
						field: 'value',
						question: 'What is your value?',
						candidates: [],
						required: true,
						fault: { reason: 'missing', path: ['value'], expected: 'number' },
					},
				],
				repairs: [],
				defaulted: [],
			})
		})

		it('ClarifierInterface: a declared aggregate over a known-length array lands its total', () => {
			const clarifier = createClarifier({ floor: 0.3 })
			const recipe: Recipe = {
				id: 't2',
				name: 'Total',
				domain: 'arithmetic',
				intents: ['calculate'],
				mappings: [{ entity: 'value', aliases: [], field: 'value' }],
				shape: objectShape({ value: arrayShape(numberShape()), total: numberShape() }),
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
				recipe,
				undefined,
				{ action: 'calculate', domain: 'arithmetic', confidence: 1 },
			)
			const total = result.entities.find((entity) => entity.name === 'total')

			expect(total?.value).toBe(5)
			expect(total?.confidence).toBe(CONFIDENCE_COMPUTED)
			expect(result.ambiguities).toEqual([])
		})

		it('FormatterInterface: format renders the verb and the recipe name', () => {
			const formatter = createFormatter({ verbs: { calculate: 'Calculate' } })
			const recipe: Recipe = {
				id: 't1',
				name: 'Arithmetic',
				domain: 'arithmetic',
				intents: ['calculate'],
				mappings: [],
				shape: objectShape({}),
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
					recipe,
					[],
					[],
				),
			).toEqual({ prompt: 'Calculate Arithmetic' })
		})

		it('GeneratorInterface: generate builds the subject and the mean confidence', () => {
			const generator = createGenerator()
			const recipe: Recipe = {
				id: 't1',
				name: 'Arithmetic',
				domain: 'arithmetic',
				intents: ['calculate'],
				mappings: [{ entity: 'value', aliases: [], field: 'value' }],
				shape: objectShape({ value: numberShape() }),
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
				recipe,
			)

			expect(result.subject).toEqual({ value: 42 })
			expect(result.confidence).toBe(0.9)
		})

		it('NarratorInterface: each primitive and each account returns its documented rendering', () => {
			const narrator = createNarrator({
				glossary: {
					labels: { age: 'Age', cost: 'Cost' },
					units: { age: 'plain', cost: 'money' },
					formats: { money: { style: 'currency', currency: 'USD' } },
				},
			})

			expect(narrator.phrase('comparisons', 'from')).toBe('is at least')
			expect(narrator.label('cost')).toBe('Cost')
			expect(narrator.value('cost', 1250)).toBe('$1,250.00')
			expect(narrator.line('subject.empty', {})).toBe('with no fields')

			const definition = createLogicalDefinition('loan', 'Loan', [
				createRule('adult', [createAtom('age', 'from', 18)], createAtom('adult', 'equals', true), {
					name: 'Adult applicant',
				}),
				createRule(
					'approve',
					[createAtom('adult', 'equals', true), createAtom('cost', 'to', 1250)],
					createAtom('approved', 'equals', true),
					{ name: 'Approval' },
				),
			])
			const result = createLogicalReasoner().reason({ age: 30, cost: 900 }, definition)
			expect(renderAccount(narrator.narrate(definition, result), { detail: 'line' })).toBe(
				'Loan holds, because Adult applicant applies (Age is 30, which is at least 18); and Cost is $900.00, which is at most $1,250.00',
			)
			expect(renderAccount(narrator.describe(definition)).split('\n')).toEqual([
				'Loan',
				'Adult applicant',
				'  applies when Age is at least 18',
				'Approval',
				'  applies when Adult applicant applies and Cost is at most $1,250.00',
			])
			expect(narrator.audit([definition])).toEqual([])
			expect(
				narrator.explain({
					reason: 'type',
					path: 'cost',
					expected: 'number',
					received: '"plenty"',
				}),
			).toBe('Cost must be a number, and "plenty" is not')
			expect(narrator.explain({ text: '"40"', start: 6, end: 8, reason: 'unanchored' })).toBe(
				'"40" was not taken, because it could not be tied to a value',
			)
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

		it('RecipeManagerInterface: the registry stamps, holds, and removes one recipe', () => {
			const recipes = createRecipeManager()
			const record = recipes.add(ARITHMETIC)

			expect(record.version).toBe(1)
			expect(recipes.count).toBe(1)
			expect(recipes.has('t1')).toBe(true)
			expect(recipes.recipe('t1')).toEqual(record)
			expect(recipes.recipes()).toEqual([record])
			expect(recipes.remove('t1')).toBe(true)
			recipes.destroy()
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
				repairs: [],
				defaulted: [],
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
			const result = interpret.interpret('calculate arithmetic value 42')

			expect(result.subject).toEqual({ value: 42 })
			expect(interpret.recipe('t1')).toEqual(ARITHMETIC)
			expect(interpret.recipes()).toEqual([ARITHMETIC])
			expect(interpret.describe(ARITHMETIC.definition).name).toBe('Arithmetic')
			const answer = createQuantitativeReasoner().reason({ value: 42 }, ARITHMETIC.definition)
			expect(
				renderAccount(interpret.narrate(ARITHMETIC.definition, answer), { detail: 'line' }),
			).toBe('Arithmetic: 42')
			expect(interpret.remove('t1')).toBe(true)
			interpret.destroy()
		})
	})
})
