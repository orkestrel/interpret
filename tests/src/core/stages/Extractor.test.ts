import { Extractor } from '@src/core'
import { describe, expect, it } from 'vitest'

// The `Extractor` stage — template-agnostic: intent classification + raw
// number mining only, never entity assignment (design §2/§8, ledger 17).

describe('Extractor', () => {
	it('extracts raw numbers and classifies intent from caller vocabulary', () => {
		const extractor = new Extractor({
			actions: { calculate: 'compute' },
			domains: { rating: ['rate'] },
		})
		const result = extractor.extract('calculate my rate at 85')
		expect(result.numbers).toEqual([85])
		expect(result.intent).toEqual({ action: 'compute', domain: 'rating', confidence: 1 })
	})

	it('produces NO entities — extraction never assigns numbers to a template', () => {
		const extractor = new Extractor()
		const result = extractor.extract('age is 25, income was $50,000')
		expect(result.numbers).toEqual([25, 50000])
		expect(Object.keys(result)).not.toContain('entities')
	})

	it('never auto-classifies from a vocabulary the caller never supplied', () => {
		const extractor = new Extractor()
		const result = extractor.extract('calculate my rate at 85')
		expect(result.intent).toEqual({ confidence: 0 })
	})

	it('reports numbers and intent confidence separately, storing no completeness of its own', () => {
		const extractor = new Extractor({ actions: { calculate: 'compute' } })
		const unnumbered = extractor.extract('calculate please')
		const unclassified = extractor.extract('85')
		const both = extractor.extract('calculate 85')

		expect(unnumbered.numbers).toEqual([])
		expect(unnumbered.intent.confidence).toBeGreaterThan(0)
		expect(unclassified.numbers).toEqual([85])
		expect(unclassified.intent.confidence).toBe(0)
		expect(both.numbers).toEqual([85])
		expect(both.intent.confidence).toBeGreaterThan(0)
		expect(Object.hasOwn(both, 'complete')).toBe(false)
	})

	it('is deterministic across repeated calls', () => {
		const extractor = new Extractor({
			actions: { calculate: 'compute' },
			domains: { rating: ['rate'] },
		})
		const text = 'calculate my rate at 85'
		expect(extractor.extract(text)).toEqual(extractor.extract(text))
	})
})
