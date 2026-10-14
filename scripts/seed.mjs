// Loads a demo campaign into the local emulators: an admin account, a
// campaign with its winning numbers, fictitious buyers and a few reveals.
//
//   npm run emulators   # terminal 1
//   npm run seed        # terminal 2
//
// Refuses to run against anything but the emulators.

import { randomUUID } from 'node:crypto'
import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { assignNumbers, buildPurchase, courtesyFor, newCampaign } from '../src/lib/raffle.js'

process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080'
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099'
const projectId = process.env.GCLOUD_PROJECT || 'demo-rifas'
if (!projectId.startsWith('demo-')) {
  throw new Error(`Refusing to seed project "${projectId}": only demo-* projects (emulators) are allowed.`)
}

const ADMIN = { email: 'admin@demo.test', password: 'demo-admin-123' }

// Fictitious buyers: names are made up, phone numbers are obviously fake.
const BUYERS = [
  { name: 'Ana Demo', phone: '3000000001', quantity: 8, paymentMethod: 'nequi', reveal: 'all' },
  { name: 'Bruno Ejemplo', phone: '3000000002', quantity: 4, paymentMethod: 'bancolombia', reveal: 2 },
  { name: 'Carla Prueba', phone: '3000000003', quantity: 12, paymentMethod: 'daviplata', reveal: 0 },
  { name: 'Diego Muestra', phone: '3000000004', quantity: 2, paymentMethod: 'nequi', reveal: 'all' },
  { name: 'Elena Ficticia', phone: '3000000005', quantity: 6, paymentMethod: 'llave_breb', reveal: 1 },
]

initializeApp({ projectId })
const db = getFirestore()
const auth = getAuth()

async function seedAdmin() {
  const user = await auth.getUserByEmail(ADMIN.email).catch(() => auth.createUser(ADMIN))
  await auth.setCustomUserClaims(user.uid, { admin: true })
}

async function seedCampaign() {
  const now = () => new Date().toISOString()
  // Early activation points so the demo hands out a winner within 50 sales.
  const campaign = newCampaign()
  campaign.activationPoints[0] = 7

  await db.doc('config/campaign').set({
    winnersRevealed: 0,
    winners: [],
    closingDate: '31 de diciembre de 2026',
    numberPrice: 5000,
    createdAt: now(),
  })
  await db.doc('config/winners').set({ ...campaign, assignedWinners: [] })
  for (const n of campaign.winnerNumbers) await db.doc(`grid/${n}`).set({ status: 'winner' })

  const taken = []
  const assignedWinners = []
  const links = []

  for (const buyer of BUYERS) {
    const { numbers, winnersAssigned } = assignNumbers({
      count: buyer.quantity + courtesyFor(buyer.quantity),
      takenNumbers: taken,
      winnerNumbers: campaign.winnerNumbers,
      activationPoints: campaign.activationPoints,
      assignedWinners,
    })
    const token = randomUUID()
    const publicId = randomUUID()
    const docs = buildPurchase({
      token, publicId, numbers, now: now(),
      winnerNumbers: campaign.winnerNumbers,
      name: buyer.name, phone: buyer.phone, quantity: buyer.quantity, paymentMethod: buyer.paymentMethod,
    })

    const batch = db.batch()
    batch.set(db.doc(`users/${buyer.phone}`), docs.user, { merge: true })
    batch.set(db.doc(`participants/${token}`), docs.participant)
    batch.set(db.doc(`publicParticipants/${publicId}`), docs.publicParticipant)
    docs.gridSold.forEach(n => batch.set(db.doc(`grid/${n}`), { status: 'sold' }))
    if (winnersAssigned.length) {
      batch.update(db.doc('config/winners'), { assignedWinners: FieldValue.arrayUnion(...winnersAssigned) })
    }
    await batch.commit()

    taken.push(...docs.gridSold)
    assignedWinners.push(...winnersAssigned)
    await simulateReveals(token, publicId, buyer, numbers, new Set(campaign.winnerNumbers))
    links.push({ buyer: buyer.name, numbers: numbers.length, link: `http://localhost:5173/jugar?token=${token}` })
  }
  return links
}

// Mirrors what the `reveal` function writes, so the board has some history.
async function simulateReveals(token, publicId, buyer, numbers, winners) {
  const count = buyer.reveal === 'all' ? numbers.length : buyer.reveal
  if (!count) return
  const now = new Date().toISOString()
  const revealed = numbers.slice(0, count)
  const batch = db.batch()
  for (const n of revealed) {
    batch.set(db.doc(`grid/${n}`), { status: winners.has(n) ? 'winner' : 'revealed', ownerId: publicId, revealedAt: now })
  }
  batch.update(db.doc(`participants/${token}`), {
    played: count,
    playedAt: revealed.map(number => ({ number, timestamp: now })),
  })
  const won = revealed.filter(n => winners.has(n))
  if (won.length) {
    batch.update(db.doc('config/campaign'), {
      winnersRevealed: FieldValue.increment(won.length),
      winners: FieldValue.arrayUnion(...won.map(number => ({ number, name: buyer.name, publicId, revealedAt: now }))),
    })
  }
  await batch.commit()
}

await seedAdmin()
const links = await seedCampaign()

console.log(`\nDemo data loaded into project "${projectId}".`)
console.log(`Admin panel: http://localhost:5173/admin  (${ADMIN.email} / ${ADMIN.password})`)
console.log('Player links:')
console.table(links)
process.exit(0)
