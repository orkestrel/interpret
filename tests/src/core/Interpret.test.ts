import type {
	ClarifierInterface,
	ExtractorInterface,
	FormatterInterface,
	GeneratorInterface,
	InterpretEventMap,
	NormalizerInterface,
} from '@src/core'
import {
	arrayShape,
	isRecord,
	isString,
	numberShape,
	objectShape,
	optionalShape,
	parseJSON,
	rawShape,
	seededRandom,
	stringShape,
} from '@orkestrel/contract'
import {
	createConstant,
	createEquation,
	createOperation,
	createReason,
	createSymbolicDefinition,
	createSymbolicReasoner,
	createVariable,
} from '@orkestrel/reason'
import {
	createNarrator,
	createInterpret,
	createExtractor,
	createRecipeContract,
	digestValue,
	Interpret,
	Extractor,
	interpretationContract,
	InterpretContext,
	isInterpretError,
	isRecipe,
	projectInterpretation,
} from '@src/core'
import { captureError, createRecorders, invokeUnchecked } from '@orkestrel/test'
import { describe, expect, it } from 'vitest'
import {
	buildInsuranceRecipe,
	LOAN_HISTORIES,
	WAIT_READINGS,
	UNSTATED_UNITS,
	UNBOUND_LINK_READINGS,
	NUMBER_LINK_READINGS,
	REFUSAL_READINGS,
	REVIEWER_LOAN_READINGS,
	buildInterpretRecipe,
	createCorpusExtractor,
	asRecord,
	createWeakInterpretExtractor,
	dropRecipeShapes,
	UNCOMPILABLE_SHAPE,
	createInterpretStageFailures,
} from '../../setup.js'

// The `Interpret` orchestrator — registry, synchronous
// `[normalize, extract, clarify, format, generate]` pipeline,
// explicit NO_RECIPE / LOW_CONFIDENCE gates, visible stage-throw failures,
// reverse passthroughs, emitter, and DESTROYED teardown.

describe('Interpret', () => {
	it('asks for conflicting microscope hours with the stated candidates', () => {
		const interpret = createInterpret({
			extractor: createExtractor({
				actions: { reserve: 'calculate' },
				domains: { arithmetic: ['laboratory'] },
			}),
			recipes: [
				buildInterpretRecipe({
					mappings: [{ entity: 'hours', aliases: [], field: 'hours' }],
					shape: objectShape({ hours: numberShape() }),
				}),
			],
		})
		const result = interpret.interpret(
			"Reserve the laboratory microscope for 97 hours. I've completed 38 hours of training on it, a supervisor will be present for 16 hours",
		)
		interpret.destroy()
		expect(result.subject).toBeUndefined()
		expect(result.ambiguities).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ field: 'hours', candidates: ['97', '38', '16'] }),
			]),
		)
	})
	it('asks for conflicting hours separated by normalized newlines', () => {
		const interpret = createInterpret({
			extractor: createExtractor({
				actions: { reserve: 'calculate' },
				domains: { arithmetic: ['lab'] },
			}),
			recipes: [
				buildInterpretRecipe({
					mappings: [{ entity: 'hours', aliases: [], field: 'hours' }],
					shape: objectShape({ hours: numberShape() }),
				}),
			],
		})
		const result = interpret.interpret('reserve lab\n97 hours\n38 hours\n16 hours')
		interpret.destroy()
		expect(result.subject).toBeUndefined()
		expect(result.ambiguities).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ field: 'hours', candidates: ['97', '38', '16'] }),
			]),
		)
	})
	it.each(REFUSAL_READINGS)(
		'records the first refusal in $text',
		({ text, names, items, collection }) => {
			const interpret = new Interpret({
				extractor: new Extractor({
					actions: Object.fromEntries(names.map((name) => [name, 'calculate'])),
					domains: { arithmetic: names },
				}),
				recipes: [
					buildInterpretRecipe({
						mappings: names.map((entity) => ({ entity, aliases: [], field: entity })),
						shape: objectShape(
							Object.fromEntries(
								names.map((name) => [
									name,
									collection === true ? arrayShape(numberShape()) : numberShape(),
								]),
							),
						),
						computations: [],
					}),
				],
			})
			const result = interpret.interpret(text)
			expect(result.refusals).toEqual(items.length === 0 ? undefined : { items, omitted: 0 })
			const projected = projectInterpretation(result)
			expect(interpretationContract.is(projected)).toBe(true)
			expect(interpretationContract.is(parseJSON(JSON.stringify(projected)))).toBe(true)
			expect(result.failures).toEqual([])
			for (const item of result.refusals?.items ?? [])
				expect(item.start).toBeLessThanOrEqual(item.end)
			interpret.destroy()
		},
	)
	it.each(REVIEWER_LOAN_READINGS)('keeps the reviewer refusal for $text', ({ text, field }) => {
		const interpret = new Interpret({
			extractor: createExtractor({ actions: { loan: 'apply' }, domains: { lending: ['loan'] } }),
			recipes: [
				buildInterpretRecipe({
					domain: 'lending',
					intents: ['apply'],
					computations: [],
					mappings: ['amount', 'income', 'years', 'collateral'].map((entity) => ({
						entity,
						aliases: [],
						field: entity,
					})),
					shape: objectShape({
						amount: numberShape(),
						income: numberShape(),
						years: numberShape(),
						collateral: optionalShape(numberShape()),
					}),
				}),
			],
		})
		const result = interpret.interpret(text)
		expect(result.failures).toEqual([])
		expect(result.subject).toBeUndefined()
		expect(result.ambiguities.map((ambiguity) => ambiguity.field)).toContain(field)
		expect(result.entities.find((entity) => entity.name === field)).toBeUndefined()
		interpret.destroy()
	})
	it.each(['and', 'with'])('holds both amounts across the %s link', (link) => {
		const interpret = new Interpret({
			extractor: createCorpusExtractor(),
			recipes: [
				buildInterpretRecipe({
					mappings: [
						{ entity: 'amount', aliases: [], field: 'amount' },
						{ entity: 'income', aliases: [], field: 'income' },
					],
					shape: objectShape({ amount: numberShape(), income: numberShape() }),
					computations: [],
				}),
			],
		})
		const result = interpret.interpret(`calculate arithmetic amount 50000 ${link} income 120000`)
		expect(result.subject).toEqual({ amount: 50000, income: 120000 })
		expect(result.ambiguities).toEqual([])
		interpret.destroy()
	})
	it.each([...UNSTATED_UNITS, ...UNBOUND_LINK_READINGS, ...NUMBER_LINK_READINGS])(
		'asks and holds no value for $text',
		({ entity, text }) => {
			const interpret = new Interpret({
				extractor: createCorpusExtractor(),
				recipes: [
					buildInterpretRecipe({
						mappings: [{ entity, aliases: [], field: 'value' }],
						shape: objectShape({ value: numberShape() }),
						computations: [],
					}),
				],
			})
			const result = interpret.interpret(`calculate arithmetic ${text}`)
			expect(result.subject).toBeUndefined()
			expect(result.entities).toEqual([])
			expect(result.ambiguities.map((ambiguity) => ambiguity.field)).toContain('value')
			interpret.destroy()
		},
	)
	it('refuses oversized text at normalization with a coded failure and no subject', () => {
		const interpret = new Interpret()
		const result = interpret.interpret(' '.repeat(65_537))
		expect(result.subject).toBeUndefined()
		expect(result.failures.map((failure) => failure.code)).toEqual(['TEXT_LIMIT'])
		expect(result.stages[0]?.failed).toBe(true)
		interpret.destroy()
	})
	it.each(WAIT_READINGS)('reads the wait cue in $text', ({ text, entity, value }) => {
		const interpret = new Interpret({
			recipes: [
				buildInterpretRecipe({
					mappings: [{ entity, aliases: [], field: 'value' }],
					shape: objectShape({ value: numberShape() }),
				}),
			],
			extractor: createCorpusExtractor(),
		})
		const result = interpret.interpret(`calculate arithmetic ${text}`)
		expect(result.subject?.value).toBe(value)
		expect(result.entities.map((found) => found.value)).toEqual(value === undefined ? [] : [value])
		expect(result.ambiguities.length > 0).toBe(value === undefined)
		interpret.destroy()
	})
	it.each(LOAN_HISTORIES)(
		'reuses a loan interpreter with history $history',
		({ history, subject, questions, carried }) => {
			const interpret = new Interpret({
				...(history === undefined ? {} : { history }),
				extractor: createExtractor({ actions: { apply: 'apply' }, domains: { lending: ['loan'] } }),
				recipes: [
					buildInterpretRecipe({
						domain: 'lending',
						intents: ['apply'],
						computations: [],
						mappings: [
							{ entity: 'amount', aliases: [], field: 'amount' },
							{ entity: 'income', aliases: [], field: 'income' },
							{ entity: 'years', aliases: [], field: 'years' },
							{ entity: 'collateral', aliases: [], field: 'collateral' },
						],
						shape: objectShape({
							amount: numberShape(),
							income: numberShape(),
							years: numberShape(),
							collateral: optionalShape(numberShape()),
						}),
					}),
				],
			})
			expect(
				interpret.interpret(
					'apply for a loan: amount 500000, income 120000, years 5, collateral 50000',
				).subject,
			).toEqual({ amount: 500000, income: 120000, years: 5, collateral: 50000 })
			const second = interpret.interpret('apply for a loan: amount 50000, income 120000')
			expect(second.ambiguities.map((ambiguity) => ambiguity.field)).toEqual(questions)
			expect(second.subject).toEqual(subject)
			expect(Object.hasOwn(second, 'subject')).toBe(subject !== undefined)
			expect(
				second.entities
					.filter((entity) => entity.provenance.category === 'carried')
					.map((entity) => entity.name),
			).toEqual(carried)
			interpret.destroy()
		},
	)
	it('asks instead of claiming pages through a fuzzy age alias', () => {
		const interpret = new Interpret({
			recipes: [
				buildInterpretRecipe({
					mappings: [{ entity: 'pages', aliases: ['page'], field: 'value' }],
					shape: objectShape({ value: numberShape() }),
				}),
			],
			extractor: createCorpusExtractor(),
		})
		const result = interpret.interpret('calculate arithmetic at age 6')
		expect(result.recipe).toBe('recipe-1')
		expect(result.subject).toBeUndefined()
		expect(result.entities).toEqual([])
		expect(result.ambiguities).not.toEqual([])
		const exact = interpret.interpret('calculate arithmetic at page 6')
		expect(exact.subject).toEqual({ value: 6 })
		expect(exact.ambiguities).toEqual([])
		interpret.destroy()
	})

	it('requires an exact alias before collecting an array', () => {
		const interpret = new Interpret({
			recipes: [
				buildInterpretRecipe({
					mappings: [{ entity: 'reading', aliases: ['value'], field: 'value' }],
					shape: objectShape({ value: arrayShape(numberShape()) }),
				}),
			],
			extractor: createCorpusExtractor(),
		})
		const result = interpret.interpret('calculate arithmetic valu 42')
		expect(result.subject).toBeUndefined()
		expect(result.entities).toEqual([])
		expect(result.ambiguities).not.toEqual([])
		interpret.destroy()
	})

	it.each(['value 25 now', 'Sorry to ask, value 25 now'])(
		'asks over a trailing now, while punctuation keeps it an ordinary statement: %s',
		(text) => {
			const interpret = new Interpret({
				recipes: [buildInterpretRecipe({ shape: objectShape({ value: numberShape() }) })],
				extractor: createCorpusExtractor(),
			})
			const result = interpret.interpret(`calculate arithmetic ${text}`)
			expect(result.subject).toBeUndefined()
			expect(result.entities).toEqual([])
			expect(result.ambiguities.map((ambiguity) => ambiguity.field)).toContain('value')
			const separated = interpret.interpret(
				`calculate arithmetic ${text.replace('25 now', '25, now')}`,
			)
			expect(separated.subject).toEqual({ value: 25 })
			expect(separated.ambiguities).toEqual([])
			interpret.destroy()
		},
	)

	it.each(['value 73, hang on, 71', 'value 73, used to be 71'])(
		'asks on the explicit correction: %s',
		(text) => {
			const interpret = new Interpret({
				recipes: [buildInterpretRecipe({ shape: objectShape({ value: numberShape() }) })],
				extractor: createCorpusExtractor(),
			})
			const result = interpret.interpret(`calculate arithmetic ${text}`)
			expect(result.subject).toBeUndefined()
			expect(result.entities).toEqual([])
			expect(result.ambiguities).not.toEqual([])
			interpret.destroy()
		},
	)

	it.each([
		{ text: 'There are 73 panels — sorry, 71.', entity: 'panels' },
		{ text: "The panels were going to be 460 watts, and now they're 590.", entity: 'watts' },
	])('asks about the superseded $entity without substituting its rival', ({ text, entity }) => {
		const interpret = new Interpret({
			recipes: [
				buildInterpretRecipe({
					mappings: [{ entity, aliases: [], field: 'value' }],
					shape: objectShape({ value: numberShape() }),
				}),
			],
			extractor: createCorpusExtractor(),
		})
		const result = interpret.interpret(`calculate arithmetic ${text}`)
		expect(result.recipe).toBe('recipe-1')
		expect(result.subject).toBeUndefined()
		expect(result.entities).toEqual([])
		expect(result.ambiguities).not.toEqual([])
		expect(result.failures).toEqual([])
		interpret.destroy()
	})

	it('asks instead of collecting superseded array values', () => {
		const interpret = new Interpret({
			recipes: [buildInterpretRecipe({ shape: objectShape({ value: arrayShape(numberShape()) }) })],
			extractor: createCorpusExtractor(),
		})
		const result = interpret.interpret('calculate arithmetic value 73, sorry, 71')
		expect(result.subject).toBeUndefined()
		expect(result.entities).toEqual([])
		expect(result.ambiguities).not.toEqual([])
		interpret.destroy()
	})

	it('asks rather than collecting an empty array from unreadable input', () => {
		const interpret = new Interpret({
			recipes: [buildInterpretRecipe({ shape: objectShape({ value: arrayShape(numberShape()) }) })],
			extractor: createCorpusExtractor(),
		})
		const result = interpret.interpret('calculate arithmetic value 1.2M')
		expect(result.subject).toBeUndefined()
		expect(result.ambiguities).not.toEqual([])
		interpret.destroy()
	})

	it('asks on an unclaimed number but retains a default beside a phone', () => {
		const interpret = new Interpret({
			recipes: [
				buildInterpretRecipe({
					shape: objectShape({ value: optionalShape(numberShape(), { default: 10 }) }),
				}),
			],
			extractor: createCorpusExtractor(),
		})
		const asked = interpret.interpret('calculate arithmetic 42')
		expect(asked.subject).toBeUndefined()
		expect(asked.ambiguities[0]?.candidates).toEqual(['42'])
		const phone = interpret.interpret('calculate arithmetic call me at 5551234')
		expect(phone.subject).toEqual({ value: 10 })
		expect(phone.ambiguities).toEqual([])
		const undeclared = interpret.interpret('calculate arithmetic call 555-0142')
		expect(undeclared.subject).toBeUndefined()
		expect(undeclared.ambiguities[0]?.candidates).toEqual(['555-0142'])
		interpret.destroy()
	})

	it('requires an anchor before collecting an array mapping', () => {
		const interpret = new Interpret({
			recipes: [buildInterpretRecipe({ shape: objectShape({ value: arrayShape(numberShape()) }) })],
			extractor: createCorpusExtractor(),
		})
		const result = interpret.interpret('calculate arithmetic 42')
		expect(result.subject).toBeUndefined()
		expect(result.ambiguities).not.toEqual([])
		expect(result.failures).toEqual([])
		interpret.destroy()
	})

	it('refuses a negated anchored value', () => {
		const interpret = new Interpret({
			recipes: [buildInterpretRecipe({ shape: objectShape({ value: numberShape() }) })],
			extractor: createCorpusExtractor(),
		})
		const result = interpret.interpret('calculate arithmetic value is not 20')
		expect(result.subject).toBeUndefined()
		expect(result.ambiguities).not.toEqual([])
		expect(result.failures).toEqual([])
		interpret.destroy()
	})

	it('refuses an intervening population phrase', () => {
		const interpret = new Interpret({
			recipes: [buildInterpretRecipe({ shape: objectShape({ value: numberShape() }) })],
			extractor: createCorpusExtractor(),
		})
		const result = interpret.interpret('calculate arithmetic value for 20 people')
		expect(result.subject).toBeUndefined()
		expect(result.ambiguities).not.toEqual([])
		expect(result.failures).toEqual([])
		interpret.destroy()
	})

	it('refuses an intervening unknown fee phrase', () => {
		const interpret = new Interpret({
			recipes: [buildInterpretRecipe({ shape: objectShape({ value: numberShape() }) })],
			extractor: createCorpusExtractor(),
		})
		const result = interpret.interpret('calculate arithmetic value unknown fee 20')
		expect(result.subject).toBeUndefined()
		expect(result.ambiguities).not.toEqual([])
		expect(result.failures).toEqual([])
		interpret.destroy()
	})

	it('assigns the exact shorthand value instead of its digit fragment', () => {
		const interpret = new Interpret({
			recipes: [buildInterpretRecipe({ shape: objectShape({ value: numberShape() }) })],
			extractor: createCorpusExtractor(),
		})
		const result = interpret.interpret('calculate arithmetic value 50k')
		expect(result.subject).toEqual({ value: 50000 })
		expect(result.ambiguities).toEqual([])
		expect(result.failures).toEqual([])
		interpret.destroy()
	})

	it('assigns the exact monetary scale instead of its digit fragment', () => {
		const interpret = new Interpret({
			recipes: [buildInterpretRecipe({ shape: objectShape({ value: numberShape() }) })],
			extractor: createCorpusExtractor(),
		})
		const result = interpret.interpret('calculate arithmetic value $1.2M')
		expect(result.subject).toEqual({ value: 1200000 })
		expect(result.ambiguities).toEqual([])
		expect(result.failures).toEqual([])
		interpret.destroy()
	})

	it('asks instead of assigning a range fragment', () => {
		const interpret = new Interpret({
			recipes: [buildInterpretRecipe({ shape: objectShape({ value: numberShape() }) })],
			extractor: createCorpusExtractor(),
		})
		const result = interpret.interpret('calculate arithmetic value 3-4')
		expect(result.subject).toBeUndefined()
		expect(result.ambiguities).not.toEqual([])
		expect(result.failures).toEqual([])
		interpret.destroy()
	})

	it('asks instead of assigning an unreadable shorthand value', () => {
		const interpret = new Interpret({
			recipes: [buildInterpretRecipe({ shape: objectShape({ value: numberShape() }) })],
			extractor: createCorpusExtractor(),
		})
		const result = interpret.interpret('calculate arithmetic value 1.2M')
		expect(result.subject).toBeUndefined()
		expect(result.ambiguities).not.toEqual([])
		expect(result.failures).toEqual([])
		interpret.destroy()
	})

	describe('registry', () => {
		it('adds, looks up, lists, and removes recipes as plain data', () => {
			const interpret = new Interpret()
			const recipe = buildInterpretRecipe()
			interpret.add(recipe)
			expect(interpret.recipe('recipe-1')).toEqual(recipe)
			expect(interpret.recipes()).toEqual([recipe])
			expect(interpret.remove('recipe-1')).toBe(true)
			expect(interpret.recipe('recipe-1')).toBeUndefined()
			interpret.destroy()
		})

		it('removes a listed batch all-or-nothing, and every recipe with no argument', () => {
			const interpret = new Interpret()
			interpret.add(buildInterpretRecipe())
			interpret.add(buildInsuranceRecipe())
			expect(interpret.remove(['recipe-1', 'absent'])).toBe(false)
			expect(interpret.recipes()).toHaveLength(2)
			expect(interpret.remove(['recipe-1', 'insurance-auto'])).toBe(true)
			expect(interpret.recipes()).toEqual([])
			interpret.add(buildInterpretRecipe())
			expect(interpret.remove()).toBeUndefined()
			expect(interpret.recipes()).toEqual([])
			interpret.destroy()
		})

		it('emits add with the recipe id', () => {
			const interpret = new Interpret()
			const events = createRecorders<InterpretEventMap, 'add'>(interpret.emitter, ['add'])
			interpret.add(buildInterpretRecipe())
			expect(events.add.calls).toEqual([['recipe-1']])
			interpret.destroy()
		})
	})

	describe('pipeline', () => {
		it('runs the normalize/extract/clarify/format/generate stages in order and produces a complete result', () => {
			const interpret = new Interpret({
				recipes: [buildInsuranceRecipe()],
				extractor: createCorpusExtractor(),
			})
			const result = interpret.interpret('calculate insurance age 25')
			expect(result.stages.map((stage) => stage.stage)).toEqual([
				'normalize',
				'extract',
				'clarify',
				'format',
				'generate',
			])
			expect(result.stages.every((stage) => !stage.failed)).toBe(true)
			expect(result.ambiguities).toEqual([])
			expect(result.failures).toEqual([])
			expect(result.subject).toMatchObject({ age: 25, accidents: 0, coverage: 'standard' })
			expect(result.text).toBe('calculate insurance age 25')
			expect(result.digest).toBe(
				digestValue({
					text: 'calculate insurance age 25',
					recipeId: 'insurance-auto',
					version: 1,
					subject: result.subject,
					definition: result.definition,
				}),
			)
			interpret.destroy()
		})

		it('stores no completeness flag, so a reader derives it from ambiguities and failures', () => {
			const interpret = new Interpret({
				recipes: [buildInsuranceRecipe()],
				extractor: createCorpusExtractor(),
			})
			const resolved = interpret.interpret('calculate insurance age 25')
			const unresolved = interpret.interpret('what is the meaning of life')

			expect(Object.hasOwn(resolved, 'complete')).toBe(false)
			expect(Object.hasOwn(unresolved, 'complete')).toBe(false)
			expect(resolved.ambiguities).toEqual([])
			expect(resolved.failures).toEqual([])
			expect(unresolved.failures).not.toEqual([])
			interpret.destroy()
		})

		it('records structured, non-blob per-stage input/output snapshots that chain across stages', () => {
			const interpret = new Interpret({
				recipes: [buildInsuranceRecipe()],
				extractor: createCorpusExtractor(),
			})
			const result = interpret.interpret('calculate insurance age 25')
			const normalize = result.stages[0]
			const extract = result.stages[1]
			expect(typeof normalize?.output).not.toBe('string')
			expect(normalize?.output).toEqual({ text: 'calculate insurance age 25', changes: [] })
			const normalizeOutput = normalize?.output
			if (!isRecord(normalizeOutput) || !isString(normalizeOutput.text)) {
				throw new Error('expected a NormalizeResult output')
			}
			expect(extract?.input).toBe(normalizeOutput.text)
			interpret.destroy()
		})

		it('emits interpret once and error zero on the happy path', () => {
			const interpret = new Interpret({
				recipes: [buildInsuranceRecipe()],
				extractor: createCorpusExtractor(),
			})
			const events = createRecorders<InterpretEventMap, 'interpret' | 'error'>(interpret.emitter, [
				'interpret',
				'error',
			])
			interpret.interpret('calculate insurance age 25')
			expect(events.interpret.count).toBe(1)
			expect(events.error.count).toBe(0)
			interpret.destroy()
		})
	})

	describe('NO_RECIPE gate', () => {
		it('yields an explicit incomplete result with a field:intent ambiguity, never a fallback recipe', () => {
			const interpret = new Interpret({
				recipes: [buildInsuranceRecipe()],
				extractor: createCorpusExtractor(),
			})
			const result = interpret.interpret('what is the meaning of life')
			expect(result.ambiguities).not.toEqual([])
			expect(result.subject).toBeUndefined()
			expect(result.definition).toBeUndefined()
			expect(result.entities).toEqual([])
			expect(result.confidence).toBe(0)
			expect(result.ambiguities[0]?.field).toBe('intent')
			expect(result.ambiguities[0]?.required).toBe(true)
			expect(result.ambiguities[0]?.candidates).toEqual(['insurance'])
			expect(result.failures[0]?.code).toBe('NO_RECIPE')
			expect(result.failures[0]?.message).toBe('No added recipe matched the classified intent')
			expect(result.digest).toBe(
				digestValue({
					text: 'what is the meaning of life',
					recipeId: undefined,
					version: undefined,
					subject: undefined,
					definition: undefined,
				}),
			)
			expect(result.stages).toHaveLength(5)
			interpret.destroy()
		})

		it('renders the gate question through the lexicon, so a caller rewords it', () => {
			const interpret = new Interpret({
				recipes: [buildInsuranceRecipe()],
				extractor: createCorpusExtractor(),
				narrator: { lexicon: { templates: { 'ambiguity.intent': 'Which domain?' } } },
			})
			const result = interpret.interpret('what is the meaning of life')
			expect(result.ambiguities[0]?.question).toBe('Which domain?')
			interpret.destroy()
		})

		it('fires NO_RECIPE even against a non-empty registry (no recipes[0] fallback)', () => {
			const interpret = new Interpret({
				recipes: [buildInsuranceRecipe()],
				extractor: createCorpusExtractor(),
			})
			const result = interpret.interpret('compute statistics 42')
			expect(result.ambiguities).not.toEqual([])
			expect(result.failures[0]?.code).toBe('NO_RECIPE')
			interpret.destroy()
		})
	})

	describe('LOW_CONFIDENCE gate', () => {
		it('honors the configured floor: a matched recipe with sub-floor intent is incomplete, entities still assigned', () => {
			const weakExtractor: ExtractorInterface = createWeakInterpretExtractor()
			const interpret = new Interpret({
				recipes: [buildInsuranceRecipe()],
				extractor: weakExtractor,
			})
			const result = interpret.interpret('calculate insurance age 25')
			expect(result.ambiguities).not.toEqual([])
			expect(result.subject).toBeUndefined()
			expect(result.failures[0]?.code).toBe('LOW_CONFIDENCE')
			expect(result.ambiguities[0]?.field).toBe('intent')
			expect(result.entities.map((entity) => entity.name)).toContain('age')
			interpret.destroy()
		})
	})

	describe('stage failures', () => {
		it('marks a throwing stage on its record AND on failures, emits error, and stays visible-incomplete', () => {
			const throwingNormalizer: NormalizerInterface = createInterpretStageFailures().normalizer
			const interpret = new Interpret({
				recipes: [buildInsuranceRecipe()],
				extractor: createCorpusExtractor(),
				normalizer: throwingNormalizer,
			})
			const events = createRecorders<InterpretEventMap, 'interpret' | 'error'>(interpret.emitter, [
				'interpret',
				'error',
			])
			const result = interpret.interpret('calculate insurance age 25')
			expect(result.stages[0]?.failed).toBe(true)
			expect(result.stages[0]?.error).toBe('boom')
			expect(result.stages).toHaveLength(5)
			expect(result.failures.map((failure) => failure.code)).toEqual(['NORMALIZE_FAILED'])
			expect(events.error.count).toBe(1)
			expect(events.interpret.count).toBe(1)
			interpret.destroy()
		})

		it('marks EXTRACT_FAILED on a throwing extractor', () => {
			const throwingExtractor: ExtractorInterface = createInterpretStageFailures().extractor
			const interpret = new Interpret({
				recipes: [buildInsuranceRecipe()],
				extractor: throwingExtractor,
			})
			const result = interpret.interpret('calculate insurance age 25')
			expect(result.stages[1]?.failed).toBe(true)
			expect(result.stages[1]?.error).toBe('extract boom')
			expect(result.stages).toHaveLength(5)
			expect(result.failures.map((failure) => failure.code)).toEqual(['EXTRACT_FAILED'])
			interpret.destroy()
		})

		it('marks CLARIFY_FAILED on a throwing clarifier', () => {
			const throwingClarifier: ClarifierInterface = createInterpretStageFailures().clarifier
			const interpret = new Interpret({
				recipes: [buildInsuranceRecipe()],
				extractor: createCorpusExtractor(),
				clarifier: throwingClarifier,
			})
			const result = interpret.interpret('calculate insurance age 25')
			expect(result.stages[2]?.failed).toBe(true)
			expect(result.stages[2]?.error).toBe('clarify boom')
			expect(result.stages).toHaveLength(5)
			expect(result.failures.map((failure) => failure.code)).toEqual(['CLARIFY_FAILED'])
			interpret.destroy()
		})

		it('marks FORMAT_FAILED on a throwing formatter', () => {
			const throwingFormatter: FormatterInterface = createInterpretStageFailures().formatter
			const interpret = new Interpret({
				recipes: [buildInsuranceRecipe()],
				extractor: createCorpusExtractor(),
				formatter: throwingFormatter,
			})
			const result = interpret.interpret('calculate insurance age 25')
			expect(result.stages[3]?.failed).toBe(true)
			expect(result.stages[3]?.error).toBe('format boom')
			expect(result.stages).toHaveLength(5)
			expect(result.failures.map((failure) => failure.code)).toEqual(['FORMAT_FAILED'])
			interpret.destroy()
		})

		it('marks GENERATE_FAILED on a throwing generator', () => {
			const throwingGenerator: GeneratorInterface = createInterpretStageFailures().generator
			const interpret = new Interpret({
				recipes: [buildInsuranceRecipe()],
				extractor: createCorpusExtractor(),
				generator: throwingGenerator,
			})
			const result = interpret.interpret('calculate insurance age 25')
			expect(result.stages[4]?.failed).toBe(true)
			expect(result.stages[4]?.error).toBe('generate boom')
			expect(result.stages).toHaveLength(5)
			expect(result.failures.map((failure) => failure.code)).toEqual(['GENERATE_FAILED'])
			interpret.destroy()
		})
	})

	describe('reverse direction', () => {
		it('describe delegates to its owned narrator', () => {
			const interpret = new Interpret()
			const definition = buildInterpretRecipe().definition
			expect(interpret.describe(definition)).toBe(createNarrator().describe(definition))
			interpret.destroy()
		})

		it('narrate delegates to its owned narrator', () => {
			const interpret = new Interpret()
			const reason = createReason({ reasoners: [createSymbolicReasoner()] })
			const result = reason.reason(
				{},
				createSymbolicDefinition('r', 'R', [
					createEquation('e1', createVariable('x'), createConstant(5), 'x'),
				]),
			)
			expect(interpret.narrate(result)).toBe(createNarrator().narrate(result))
			reason.destroy()
			interpret.destroy()
		})

		it('honors a lexicon override supplied through the narrator option group', () => {
			const interpret = new Interpret({
				narrator: {
					lexicon: { templates: { 'definition.quantitative': '{{name}} has {{count}} group(s)' } },
				},
			})
			const definition = buildInterpretRecipe().definition
			expect(interpret.describe(definition)).toBe('Arithmetic has 1 group(s)')
			interpret.destroy()
		})
	})

	describe('teardown', () => {
		it('emits destroy once and throws DESTROYED afterwards, keeping the emitter getter alive', () => {
			const interpret = new Interpret()
			const events = createRecorders<InterpretEventMap, 'destroy'>(interpret.emitter, ['destroy'])
			interpret.destroy()
			interpret.destroy()
			expect(events.destroy.count).toBe(1)
			expect(interpret.emitter).toBeDefined()
			const error = captureError(() => interpret.interpret('x'))
			expect(isInterpretError(error) && error.code === 'DESTROYED').toBe(true)
		})

		it('leaves a caller-supplied context alive, and a second orchestrator keeps using it', () => {
			const context = new InterpretContext({ session: 'shared', history: 16 })
			const first = new Interpret({ context })
			const second = new Interpret({ context })
			first.destroy()
			expect(context.session).toBe('shared')
			expect(context.previous()).toEqual([])
			second.interpret('calculate arithmetic 42')
			expect(context.previous()).toHaveLength(1)
			second.destroy()
			expect(context.session).toBe('shared')
			context.destroy()
			const error = captureError(() => context.previous())
			expect(isInterpretError(error) && error.code === 'DESTROYED').toBe(true)
		})

		// The teardown of a context the orchestrator constructed itself has no
		// public observer: `Interpret` publishes no context accessor, so nothing
		// outside can read that context's state or subscribe to its emitter. The
		// supplied-context case above is the half a caller can drive, and it is the
		// half that matters — a shared context outliving one orchestrator.
	})
})

describe("Interpret — the recipe's shape", () => {
	const shape = objectShape({
		age: numberShape({ description: 'How old are you?' }),
		term: optionalShape(numberShape(), { default: 12 }),
	})
	const recipe = buildInsuranceRecipe({
		mappings: [{ entity: 'age', aliases: [], field: 'age' }],
		computations: [],
		shape,
	})

	it('omits the subject while a required ambiguity is open, and keeps the definition', () => {
		const interpret = new Interpret({ recipes: [recipe], extractor: createCorpusExtractor() })
		const result = interpret.interpret('calculate insurance')
		expect(Object.hasOwn(result, 'subject')).toBe(false)
		expect(result.definition).toEqual(recipe.definition)
		expect(result.ambiguities[0]?.question).toBe('How old are you?')
		expect(result.ambiguities[0]?.fault).toEqual({
			reason: 'missing',
			path: ['age'],
			expected: 'number',
		})
		expect(result.digest).toBe(
			digestValue({
				text: 'calculate insurance',
				recipeId: recipe.id,
				version: 1,
				subject: undefined,
				definition: recipe.definition,
			}),
		)
		interpret.destroy()
	})

	it('records no subject for an open turn, and the next turn carries what it read', () => {
		const context = new InterpretContext({ history: 16 })
		const interpret = new Interpret({
			recipes: [
				buildInsuranceRecipe({
					mappings: [
						{ entity: 'age', aliases: [], field: 'age' },
						{ entity: 'score', aliases: [], field: 'score' },
					],
					computations: [],
					shape: objectShape({ age: numberShape(), score: numberShape() }),
				}),
			],
			extractor: createCorpusExtractor(),
			context,
		})
		const first = interpret.interpret('calculate insurance age 30')
		expect(Object.hasOwn(first, 'subject')).toBe(false)
		expect(context.subjects.count).toBe(0)
		const second = interpret.interpret('calculate insurance score 700')
		expect(second.subject).toEqual({ age: 30, score: 700 })
		expect(second.ambiguities).toEqual([])
		expect(context.subjects.count).toBe(1)
		interpret.destroy()
		context.destroy()
	})

	it('reports what the door filled and repaired', () => {
		const interpret = new Interpret({ recipes: [recipe], extractor: createCorpusExtractor() })
		const result = interpret.interpret('calculate insurance age 30')
		expect(result.subject).toEqual({ age: 30, term: 12 })
		expect(result.defaulted).toEqual([['term']])
		expect(result.repairs).toEqual([])
		expect(result.mappings.map((mapping) => mapping.provenance.category)).toEqual([
			'extracted',
			'default',
		])
		interpret.destroy()

		const repairing = new Interpret({
			recipes: [
				buildInsuranceRecipe({
					mappings: [{ entity: 'code', aliases: [], field: 'code' }],
					computations: [],
					shape: objectShape({ code: stringShape() }),
				}),
			],
			extractor: createCorpusExtractor(),
		})
		const repaired = repairing.interpret('calculate insurance code 42')
		expect(repaired.subject).toEqual({ code: '42' })
		expect(repaired.repairs.map((fault) => fault.path)).toEqual([['code']])
		expect(repaired.entities[0]?.value).toBe('42')
		repairing.destroy()
	})

	it('a value the shape refuses leaves no subject', () => {
		const interpret = new Interpret({
			recipes: [
				buildInsuranceRecipe({
					mappings: [{ entity: 'age', aliases: [], field: 'age' }],
					computations: [],
					shape: objectShape({ age: numberShape({ max: 120 }) }),
				}),
			],
			extractor: createCorpusExtractor(),
		})
		const result = interpret.interpret('calculate insurance age 900')
		expect(Object.hasOwn(result, 'subject')).toBe(false)
		expect(result.ambiguities[0]?.fault?.reason).toBe('constraint')
		interpret.destroy()
	})

	it('a computed field is trusted no more than the least of what it read', () => {
		const interpret = new Interpret({
			history: 16,
			recipes: [
				buildInsuranceRecipe({
					mappings: [{ entity: 'age', aliases: [], field: 'age' }],
					computations: [
						{
							field: 'double',
							expression: createOperation('multiply', createVariable('age'), createConstant(2)),
						},
					],
					shape: objectShape({ age: numberShape(), double: numberShape() }),
				}),
			],
			extractor: createCorpusExtractor(),
		})
		interpret.interpret('calculate insurance age 30')
		const carried = interpret.interpret('calculate insurance')
		expect(carried.entities.find((entity) => entity.name === 'age')?.confidence).toBe(0.7)
		expect(carried.entities.find((entity) => entity.name === 'double')?.confidence).toBe(0.7)
		interpret.destroy()
	})

	it.each<[string, Record<string, unknown>, string]>([
		[
			'a mapped field it does not declare',
			{ mappings: [{ entity: 'x', aliases: [], field: 'x' }], computations: [] },
			'Field "x" is mapped, and the shape does not declare it',
		],
		[
			'a computed field it does not declare',
			{ mappings: [], computations: [{ field: 'y', expression: createConstant(1) }] },
			'Field "y" is computed, and the shape does not declare it',
		],
	])('add refuses %s', (_name, overrides, message) => {
		const interpret = new Interpret()
		const bad = { ...recipe, ...overrides }
		const error = captureError(() => invokeUnchecked<unknown>(interpret, interpret.add, [bad]))
		expect(isInterpretError(error) ? error.code : undefined).toBe('DEFINITION')
		expect(isInterpretError(error) ? error.message : '').toContain(message)
		expect(interpret.recipes()).toEqual([])
		interpret.destroy()
	})

	it('add and the recipes option refuse what is no recipe', () => {
		const interpret = new Interpret()
		const error = captureError(() =>
			invokeUnchecked<unknown>(interpret, interpret.add, [{ id: 'r' }]),
		)
		expect(isInterpretError(error) ? error.code : undefined).toBe('DEFINITION')
		interpret.destroy()
		const refused = captureError(
			() =>
				new Interpret({
					recipes: [
						{
							...recipe,
							shape: objectShape({ a: optionalShape(numberShape()) }),
							mappings: [{ entity: 'b', aliases: [], field: 'b' }],
						},
					],
				}),
		)
		expect(isInterpretError(refused) ? refused.code : undefined).toBe('DEFINITION')
	})

	it("add refuses a default on a required key, through the shape's own scan", () => {
		const interpret = new Interpret()
		const bad = {
			...recipe,
			shape: rawShape({
				type: 'object',
				properties: { a: { type: 'number', default: 3 } },
				required: ['a'],
			}),
		}
		expect(isRecipe(bad)).toBe(true)
		expect(captureError(() => interpret.add(bad))).toBeDefined()
		interpret.destroy()
	})
})

describe('Interpret — a result crossing a boundary', () => {
	it("an interpretation's projection passes its contract, complete or not", () => {
		const interpret = new Interpret({
			recipes: [
				buildInsuranceRecipe({
					mappings: [{ entity: 'age', aliases: [], field: 'age' }],
					computations: [],
					shape: objectShape({
						age: numberShape(),
						term: optionalShape(numberShape(), { default: 12 }),
					}),
				}),
			],
			extractor: createCorpusExtractor(),
		})
		const complete = interpret.interpret('calculate insurance age 30')
		expect(complete.subject).toBeDefined()
		expect(interpretationContract.audit(projectInterpretation(complete))).toEqual([])
		const open = interpret.interpret('calculate insurance')
		expect(interpretationContract.audit(projectInterpretation(open))).toEqual([])
		const unmatched = interpret.interpret('nothing here')
		expect(interpretationContract.audit(projectInterpretation(unmatched))).toEqual([])
		interpret.destroy()
	})

	it('a recipe the contract admits is one the guard admits', () => {
		const contract = createRecipeContract()
		const recipe = buildInsuranceRecipe()
		expect(contract.is(recipe)).toBe(true)
		expect(isRecipe(recipe)).toBe(true)
		const { shape, ...shapeless } = recipe
		expect(shape.category).toBe('object')
		expect(contract.is(shapeless)).toBe(false)
		expect(isRecipe(shapeless)).toBe(false)
	})
})

describe('Interpret — which recipe was chosen', () => {
	it('names the recipe and its version on the result, whatever the definition is called', () => {
		const recipe = buildInsuranceRecipe({ id: 'chosen' })
		const interpret = new Interpret({ recipes: [recipe], extractor: createCorpusExtractor() })
		const result = interpret.interpret('calculate insurance age 25')
		expect(result.recipe).toBe('chosen')
		expect(result.version).toBe(1)
		expect(result.definition?.id).toBe('insurance-auto')
		interpret.destroy()
	})

	it('names none when nothing matched, and asks instead', () => {
		const interpret = new Interpret({
			recipes: [buildInsuranceRecipe()],
			extractor: createCorpusExtractor(),
		})
		const result = interpret.interpret('calculate something for me')
		expect(Object.hasOwn(result, 'recipe')).toBe(false)
		expect(result.failures[0]?.code).toBe('NO_RECIPE')
		expect(result.ambiguities[0]?.field).toBe('intent')
		interpret.destroy()
	})

	it('a tie between recipes asks, and never takes the first added', () => {
		const interpret = new Interpret({
			recipes: [buildInsuranceRecipe({ id: 'one' }), buildInsuranceRecipe({ id: 'two' })],
			extractor: createCorpusExtractor(),
		})
		const result = interpret.interpret('calculate insurance age 25')
		expect(Object.hasOwn(result, 'recipe')).toBe(false)
		expect(Object.hasOwn(result, 'definition')).toBe(false)
		expect(result.failures[0]?.code).toBe('NO_RECIPE')
		interpret.destroy()
	})
})

describe('Interpret — a number no anchor claimed', () => {
	const recipe = buildInsuranceRecipe({
		mappings: [
			{ entity: 'age', aliases: [], field: 'age' },
			{ entity: 'accidents', aliases: [], field: 'accidents' },
		],
		computations: [],
		shape: objectShape({
			age: numberShape(),
			accidents: optionalShape(numberShape(), { default: 0 }),
		}),
	})

	it('fills nothing by position, and offers the number as a candidate', () => {
		const interpret = new Interpret({ recipes: [recipe], extractor: createCorpusExtractor() })
		const result = interpret.interpret('calculate insurance 25')
		expect(Object.hasOwn(result, 'subject')).toBe(false)
		expect(result.ambiguities.map((ambiguity) => ambiguity.candidates)).toEqual([['25'], ['25']])
		interpret.destroy()
	})

	it('keeps a default from standing while a leftover number could be its value', () => {
		const interpret = new Interpret({ recipes: [recipe], extractor: createCorpusExtractor() })
		const result = interpret.interpret('calculate insurance age 25, 3 of them')
		expect(Object.hasOwn(result, 'subject')).toBe(false)
		expect(result.ambiguities).toEqual([
			{
				field: 'age',
				question: 'What is your age?',
				candidates: ['3'],
				required: true,
				fault: { reason: 'missing', path: ['age'], expected: 'number' },
			},
			{
				field: 'accidents',
				question: 'What is your accidents?',
				candidates: ['3'],
				required: true,
			},
		])
		interpret.destroy()
	})

	it('lets a default stand when nothing is left over', () => {
		const interpret = new Interpret({ recipes: [recipe], extractor: createCorpusExtractor() })
		expect(interpret.interpret('calculate insurance age 25').subject).toEqual({
			age: 25,
			accidents: 0,
		})
		interpret.destroy()
	})
})

describe('Interpret — what a refusal leaves behind', () => {
	const recipe = buildInsuranceRecipe({
		mappings: [
			{ entity: 'age', aliases: [], field: 'age' },
			{ entity: 'score', aliases: [], field: 'score' },
		],
		computations: [],
		shape: objectShape({ age: numberShape(), score: numberShape() }),
	})

	it('builds nothing while a question is open, so no stage or mapping holds it', () => {
		const interpret = new Interpret({ recipes: [recipe], extractor: createCorpusExtractor() })
		const result = interpret.interpret('calculate insurance age 30')
		expect(Object.hasOwn(result, 'subject')).toBe(false)
		expect(result.mappings).toEqual([])
		expect(result.confidence).toBe(0)
		expect(result.stages.map((stage) => stage.stage)).toEqual([
			'normalize',
			'extract',
			'clarify',
			'format',
			'generate',
		])
		expect(result.stages[4]?.output).toBeUndefined()
		expect(JSON.stringify(projectInterpretation(result))).not.toContain('"subject"')
		expect(result.entities[0]?.value).toBe(30)
		interpret.destroy()
	})

	it('a generator that would throw is never reached while a question is open', () => {
		const stages = createInterpretStageFailures()
		const interpret = new Interpret({
			recipes: [recipe],
			extractor: createCorpusExtractor(),
			generator: stages.generator,
		})
		const result = interpret.interpret('calculate insurance age 30')
		expect(result.failures).toEqual([])
		interpret.destroy()
	})
})

describe('Interpret — a number that belongs to no quantity', () => {
	const recipe = buildInsuranceRecipe({
		mappings: [
			{ entity: 'age', aliases: [], field: 'age' },
			{ entity: 'accidents', aliases: [], field: 'accidents' },
		],
		computations: [],
		shape: objectShape({
			age: numberShape(),
			accidents: optionalShape(numberShape(), { default: 0 }),
		}),
	})

	it('lets a default stand beside a year or a phone number', () => {
		const interpret = new Interpret({ recipes: [recipe], extractor: createCorpusExtractor() })
		const dated = interpret.interpret('calculate insurance age 25, in 2019')
		expect(dated.subject).toEqual({ age: 25, accidents: 0 })
		const called = interpret.interpret('calculate insurance age 25, call me at 5551234')
		expect(called.subject).toEqual({ age: 25, accidents: 0 })
		expect(interpret.interpret('calculate insurance age 25, call 555-0142').subject).toBeUndefined()
		interpret.destroy()
	})

	it('offers no foreign number as a candidate', () => {
		const interpret = new Interpret({ recipes: [recipe], extractor: createCorpusExtractor() })
		const result = interpret.interpret('calculate insurance in 2019')
		expect(result.ambiguities.flatMap((ambiguity) => ambiguity.candidates)).toEqual([])
		interpret.destroy()
	})

	it('still asks over a number that could be a quantity', () => {
		const interpret = new Interpret({ recipes: [recipe], extractor: createCorpusExtractor() })
		const result = interpret.interpret('calculate insurance age 25, 3 of them')
		expect(result.ambiguities[0]?.candidates).toEqual(['3'])
		interpret.destroy()
	})

	it('lets an anchor claim a number the reader would call foreign', () => {
		const interpret = new Interpret({ recipes: [recipe], extractor: createCorpusExtractor() })
		expect(interpret.interpret('calculate insurance age 25').subject?.age).toBe(25)
		interpret.destroy()
	})
})

describe('Interpret — a recipe that cannot work refuses when added', () => {
	it.each<[string, Partial<Parameters<typeof buildInsuranceRecipe>[0]>, string]>([
		[
			'a required field nothing fills',
			{ mappings: [], computations: [], shape: objectShape({ age: numberShape() }) },
			'Field "age" is required',
		],
		[
			'a computation reading nothing',
			{
				mappings: [],
				computations: [{ field: 'total', expression: createVariable('typo') }],
				shape: objectShape({ total: optionalShape(numberShape()) }),
			},
			'reads "typo"',
		],
		[
			'a shape that does not compile',
			{
				mappings: [],
				computations: [],
				shape: UNCOMPILABLE_SHAPE,
			},
			'Shape does not compile',
		],
	])('%s', (_name, overrides, message) => {
		const interpret = new Interpret()
		const error = captureError(() => interpret.add(buildInsuranceRecipe(overrides)))
		expect(isInterpretError(error) ? error.code : undefined).toBe('DEFINITION')
		expect(isInterpretError(error) ? error.message : '').toContain(message)
		interpret.destroy()
	})
})

describe('Interpret — boundaries of what crosses', () => {
	it('a result with a fault, repairs, and a failed stage passes its contract', () => {
		const stages = createInterpretStageFailures()
		const interpret = new Interpret({
			recipes: [
				buildInsuranceRecipe({
					mappings: [
						{ entity: 'age', aliases: [], field: 'age' },
						{ entity: 'code', aliases: [], field: 'code' },
					],
					computations: [],
					shape: objectShape({ age: numberShape({ max: 120 }), code: stringShape() }),
				}),
			],
			extractor: createCorpusExtractor(),
		})
		const asked = interpret.interpret('calculate insurance age 900, code 7')
		expect(asked.ambiguities[0]?.fault).toBeDefined()
		expect(interpretationContract.audit(projectInterpretation(asked))).toEqual([])
		const repaired = interpret.interpret('calculate insurance age 40, code 7')
		expect(repaired.repairs).not.toEqual([])
		expect(interpretationContract.audit(projectInterpretation(repaired))).toEqual([])
		interpret.destroy()
		const failing = new Interpret({
			recipes: [buildInsuranceRecipe()],
			extractor: createCorpusExtractor(),
			clarifier: stages.clarifier,
		})
		const failed = failing.interpret('calculate insurance age 25')
		expect(failed.failures).not.toEqual([])
		expect(interpretationContract.audit(projectInterpretation(failed))).toEqual([])
		failing.destroy()
	})

	it('what the recipe contract admits the guard admits, setting a nested shape aside', () => {
		const contract = createRecipeContract()
		for (const seed of Array.from({ length: 40 }, (_, index) => index + 1)) {
			const generated = contract.generate(seededRandom(seed))
			expect(contract.is(generated)).toBe(true)
			const shapeless = asRecord(dropRecipeShapes(generated))
			expect(isRecipe({ ...shapeless, shape: objectShape({}) })).toBe(true)
		}
	})

	it('refuses a malformed nested shape in both contract and guard', () => {
		const contract = createRecipeContract()
		const recipe = asRecord(dropRecipeShapes(contract.generate(seededRandom(1))))
		for (const shape of [42, null, {}, { type: 'nonsense' }]) {
			expect(contract.is({ ...recipe, shape })).toBe(false)
			expect(isRecipe({ ...recipe, shape })).toBe(false)
		}
	})
})
