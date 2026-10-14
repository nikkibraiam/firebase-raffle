import { describe, expect, it } from 'vitest'
import { assignNumbers, buildPurchase, courtesyFor, GRID_SIZE, newCampaign } from '../src/lib/raffle.js'

// Deterministic RNG so failures are reproducible.
function seeded(seed = 42) {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) % 2 ** 31
    return s / 2 ** 31
  }
}

describe('courtesyFor', () => {
  it('gives one free number per four bought', () => {
    expect([1, 3, 4, 7, 8, 12].map(courtesyFor)).toEqual([0, 0, 1, 1, 2, 3])
  })
})

describe('newCampaign', () => {
  it('draws 4 distinct winners and one activation point per quarter', () => {
    const { winnerNumbers, activationPoints } = newCampaign(seeded())
    expect(new Set(winnerNumbers).size).toBe(4)
    for (const n of winnerNumbers) {
      expect(n).toBeGreaterThanOrEqual(1)
      expect(n).toBeLessThanOrEqual(GRID_SIZE)
    }
    expect(activationPoints[0]).toBeGreaterThanOrEqual(10)
    expect(activationPoints[0]).toBeLessThanOrEqual(249)
    expect(activationPoints[3]).toBeGreaterThanOrEqual(750)
  })
})

describe('assignNumbers', () => {
  const campaign = { winnerNumbers: [11, 22, 33, 44], activationPoints: [5, 300, 600, 900] }

  it('places a winner at the exact sale where it activates', () => {
    const { numbers, winnersAssigned } = assignNumbers({ count: 10, ...campaign, rng: seeded() })
    expect(numbers[4]).toBe(11) // sale #5 → position 4
    expect(winnersAssigned).toEqual([11])
  })

  it('never hands out non-activated winners or duplicates', () => {
    const { numbers } = assignNumbers({ count: 50, takenNumbers: [], ...campaign, activationPoints: [999, 999, 999, 999], rng: seeded() })
    expect(new Set(numbers).size).toBe(50)
    numbers.forEach(n => expect(campaign.winnerNumbers).not.toContain(n))
  })

  it('does not reuse taken numbers', () => {
    const taken = Array.from({ length: 901 }, (_, i) => i + 100) // 100..1000
    const { numbers } = assignNumbers({ count: 20, takenNumbers: taken, ...campaign, activationPoints: [999, 999, 999, 999], rng: seeded() })
    numbers.forEach(n => expect(n).toBeLessThan(100))
  })

  it('hands out each winner exactly once, even when its sale is the last of a purchase', () => {
    // Regression: winners used to be left out of the sold count, so the next
    // purchase saw the same activation window again and re-assigned the winner.
    const first = assignNumbers({ count: 5, ...campaign, rng: seeded(1) })
    expect(first.numbers[4]).toBe(11)

    const second = assignNumbers({
      count: 5,
      takenNumbers: first.numbers.filter(n => n !== 11),
      assignedWinners: first.winnersAssigned,
      ...campaign,
      rng: seeded(2),
    })
    expect(second.numbers).not.toContain(11)
    expect(second.winnersAssigned).toEqual([])
  })

  it('fails loudly when the board is full', () => {
    const taken = Array.from({ length: GRID_SIZE }, (_, i) => i + 1)
    expect(() => assignNumbers({ count: 1, takenNumbers: taken })).toThrow(/Not enough numbers/)
  })
})

describe('buildPurchase', () => {
  it('keeps phone and numbers out of the public document', () => {
    const docs = buildPurchase({
      token: 't', publicId: 'p', phone: '3000000001', name: 'Ana Demo', quantity: 4,
      paymentMethod: 'nequi', numbers: [1, 2, 11, 3, 4], winnerNumbers: [11], now: '2026-01-01T00:00:00.000Z',
    })
    expect(docs.publicParticipant).toEqual({ name: 'Ana Demo', phoneSuffix: '001', total: 5, createdAt: '2026-01-01T00:00:00.000Z' })
    expect(docs.participant).toMatchObject({ publicId: 'p', courtesy: 1, played: 0 })
    expect(docs.gridSold).toEqual([1, 2, 3, 4]) // winner cell keeps its public 'winner' status
  })
})
