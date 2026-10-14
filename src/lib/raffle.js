// Pure raffle logic shared by the admin panel, the seed script and the tests.
// No Firebase imports here: everything is plain data in, plain data out.

export const GRID_SIZE = 1000
export const WINNER_COUNT = 4

// Each prize activates at one exact sale inside its quarter of the board.
const ACTIVATION_RANGES = [
  [10, 249],
  [250, 499],
  [500, 749],
  [750, 999],
]

export function randomInt(min, max, rng = Math.random) {
  return Math.floor(rng() * (max - min + 1)) + min
}

/** Buy 4, get 1 free. */
export function courtesyFor(quantity) {
  return Math.floor(quantity / 4)
}

/** Draws the winning numbers and the sale at which each one is handed out. */
export function newCampaign(rng = Math.random) {
  const winners = new Set()
  while (winners.size < WINNER_COUNT) winners.add(randomInt(1, GRID_SIZE, rng))
  return {
    winnerNumbers: [...winners],
    activationPoints: ACTIVATION_RANGES.map(([min, max]) => randomInt(min, max, rng)),
  }
}

/**
 * Picks `count` numbers for a new purchase.
 *
 * `takenNumbers` are the non-winning numbers already sold and `assignedWinners`
 * the winning numbers already handed out; together they are the sales so far.
 * A winner whose activation point falls inside this purchase is placed at the
 * exact position of that sale; the rest are random free numbers. Winning
 * numbers never enter the random pool, so each one is handed out exactly once.
 */
export function assignNumbers({
  count,
  takenNumbers = [],
  winnerNumbers = [],
  activationPoints = [],
  assignedWinners = [],
  rng = Math.random,
}) {
  if (!Number.isInteger(count) || count < 1) throw new Error('count must be a positive integer')

  const taken = new Set(takenNumbers)
  const assigned = new Set(assignedWinners)
  const winnerSet = new Set(winnerNumbers)
  const soldSoFar = taken.size + assigned.size

  const result = new Array(count)
  const winnersAssigned = []

  winnerNumbers.forEach((winner, i) => {
    const point = activationPoints[i]
    if (point === undefined || assigned.has(winner)) return
    if (soldSoFar < point && point <= soldSoFar + count) {
      result[point - soldSoFar - 1] = winner
      winnersAssigned.push(winner)
    }
  })

  const pool = []
  for (let n = 1; n <= GRID_SIZE; n++) {
    if (!taken.has(n) && !winnerSet.has(n)) pool.push(n)
  }
  const emptySlots = count - winnersAssigned.length
  if (pool.length < emptySlots) throw new Error('Not enough numbers left on the board')

  for (let i = 0; i < count; i++) {
    if (result[i] === undefined) {
      result[i] = pool.splice(randomInt(0, pool.length - 1, rng), 1)[0]
    }
  }

  return { numbers: result, winnersAssigned }
}

/**
 * Documents to write for a new purchase. The caller writes them atomically
 * (client batch in the admin panel, Admin SDK batch in the seed script).
 */
export function buildPurchase({ token, publicId, phone, name, quantity, paymentMethod, numbers, winnerNumbers, now }) {
  const winnerSet = new Set(winnerNumbers)
  return {
    user: { name, phone, updatedAt: now },
    participant: {
      publicId,
      userId: phone,
      name,
      phone,
      paymentMethod,
      quantity,
      courtesy: courtesyFor(quantity),
      numbers,
      played: 0,
      playedAt: [],
      createdAt: now,
    },
    // Only what the public ranking needs: no phone, no token, no numbers.
    publicParticipant: {
      name,
      phoneSuffix: String(phone).slice(-3),
      total: numbers.length,
      createdAt: now,
    },
    // Winning numbers keep their public 'winner' cell; ownership is never
    // published before the owner reveals it.
    gridSold: numbers.filter(n => !winnerSet.has(n)),
  }
}
