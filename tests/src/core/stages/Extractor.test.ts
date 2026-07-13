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
		expect(result.complete).toBe(true)
	})

	it('produces NO entities — extraction never assigns numbers to a template', () => {
		const extractor = new Extractor()
		const result = extractor.extract('age is 25, income was $50,000')
		expect(result.numbers).toEqual([25, 50000])
		expect(Object.keys(result)).not.toContain('entities')
	})

	it('never auto-classifies from an unregistered vocabulary (empty defaults)', () => {
		const extractor = new Extractor()
		const result = extractor.extract('calculate my rate at 85')
		expect(result.intent).toEqual({ action: '', domain: '', confidence: 0 })
	})

	it('complete requires BOTH numbers present and a positive-confidence intent', () => {
		const extractor = new Extractor({ actions: { calculate: 'compute' } })
		expect(extractor.extract('calculate please').complete).toBe(false) // no numbers
		expect(extractor.extract('85').complete).toBe(false) // no intent confidence
		expect(extractor.extract('calculate 85').complete).toBe(true)
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
