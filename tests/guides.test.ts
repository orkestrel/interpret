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
	const { arrayShape, isRecord, numberShape, objectShape, parseJSON } =
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
	const {
		createAtom,
		createFactorGroup,
		createFieldFactor,
		createLogicalDefinition,
		createLogicalReasoner,
		createLookupFactor,
		createQuantitativeDefinition,
		createQuantitativeReasoner,
		createRule,
		createStaticFactor,
	} = await import('@orkestrel/reason')
	const {
		applyReplacements,
		assignEntities,
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
		FRAME_SLOTS,
		InterpretError,
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
		matchRecipe,
		NUMBER_PATTERN,
		parseRecipe,
		RecordManager,
		renderAccount,
		renderSubject,
		resolveExpression,
		scoreRecipe,
		setField,
		tokenize,
		variablesOf,
	} = await import('@src/core')
	const { captureError, requireValue } = await import('@orkestrel/test')
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

			// A cause only `errors` words is no text of the account, and its faults still are.
			const unread = createLogicalDefinition('unread', 'Unread', [known, read, size])
			const refused = reasoner.reason({ membership: 'sailor' }, unread)
			expect(refused.errors.length).toBeGreaterThan(refused.faults.length)
			expect(renderAccount(narrator.narrate(unread, refused), { detail: 'full' })).toBe(
				'Unread gave no answer\n  length is not known, and must be a number',
			)

			// A lookup's line names its field and not the value read, and a gate that passed prints no check.
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
				'Rate: 3\nrates: 3\n  tier: 3\n    looked up by membership\nTotal: 3',
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

		it('Write a qualification: the account and the guide read as the fence prints them', () => {
			const narrator = createNarrator({
				glossary: {
					labels: { noise: 'noise level' },
					units: { noise: 'plain' },
					scopes: { hall: 'Main hall' },
				},
			})
			const qualification = {
				id: 'booking',
				name: 'Booking',
				passes: [
					createLogicalDefinition('gates', 'Gates', [
						createRule(
							'loud',
							[createAtom('noise', 'above', 40)],
							createAtom('loud', 'equals', true),
							{ name: 'Loud activity' },
						),
					]),
				],
				rulings: [{ id: 'loud', pass: 'gates', rule: 'loud', effect: 'referral', scope: 'hall' }],
			}
			const result = {
				id: 'booking',
				name: 'Booking',
				eligibility: 'eligible',
				scopes: { hall: 'referral' },
				findings: [
					{
						id: 'loud',
						pass: 'gates',
						rule: 'loud',
						effect: 'referral',
						scope: 'hall',
						state: 'met' as const,
						message: 'A person reviews a loud booking.',
						premises: [{ field: 'noise', actual: 55, state: 'met' as const }],
					},
				],
				derivations: [],
				success: true,
				errors: [],
				faults: [],
			}
			expect(renderAccount(narrator.narrate(qualification, result)).split('\n')).toEqual([
				'Booking: eligible',
				'Main hall: referred for review',
				'  Referral: A person reviews a loud booking.',
				'    noise level is 55, which is more than 40',
			])
			expect(renderAccount(narrator.describe(qualification)).split('\n')).toEqual([
				'Booking',
				'Main hall: Referral: Loud activity',
				'  applies when noise level is more than 40',
			])
			expect(narrator.audit([qualification])).toEqual([])
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
			expect(isFamilyRatingResult({ lines: [], success: true })).toBe(false)
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
