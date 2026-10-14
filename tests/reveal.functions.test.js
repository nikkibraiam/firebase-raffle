// Calls the deployed-to-emulator callables like the browser does: npm test
import { randomUUID } from 'node:crypto'
import { deleteApp, getApps, initializeApp as initAdmin } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { initializeApp } from 'firebase/app'
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const PROJECT = 'demo-rifas'
let db
let reveal
let getTicket
let token

beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080'
  db = getFirestore(initAdmin({ projectId: PROJECT }, 'tests'))

  const functions = getFunctions(initializeApp({ projectId: PROJECT, apiKey: 'demo-api-key' }))
  connectFunctionsEmulator(functions, '127.0.0.1', 5001)
  reveal = httpsCallable(functions, 'reveal')
  getTicket = httpsCallable(functions, 'getTicket')
})

afterAll(() => Promise.all(getApps().map(deleteApp)))

beforeEach(async () => {
  const collections = ['grid', 'participants', 'publicParticipants', 'config']
  for (const name of collections) {
    const snap = await db.collection(name).get()
    await Promise.all(snap.docs.map(d => d.ref.delete()))
  }
  token = randomUUID()
  await db.doc('config/winners').set({ winnerNumbers: [11], activationPoints: [2], assignedWinners: [11] })
  await db.doc('config/campaign').set({ winnersRevealed: 0, winners: [] })
  await db.doc('publicParticipants/p1').set({ name: 'Ana Demo', phoneSuffix: '001', total: 3 })
  await db.doc(`participants/${token}`).set({
    publicId: 'p1', name: 'Ana Demo', phone: '3000000001', numbers: [7, 11, 300], played: 0, playedAt: [],
  })
})

async function errorCode(promise) {
  try {
    await promise
    return 'no-error'
  } catch (e) {
    return e.code
  }
}

describe('getTicket', () => {
  it('returns only what the player may see', async () => {
    const { data } = await getTicket({ token })
    expect(data).toEqual({ name: 'Ana Demo', total: 3, played: 0, revealed: [] })
  })

  it('rejects malformed and unknown tokens', async () => {
    expect(await errorCode(getTicket({ token: 'not-a-token' }))).toBe('functions/invalid-argument')
    expect(await errorCode(getTicket({ token: randomUUID() }))).toBe('functions/not-found')
  })
})

describe('reveal', () => {
  it('reveals the next number and publishes it without the token', async () => {
    const { data } = await reveal({ token })

    expect(data.revealed).toEqual([{ number: 7, winner: false }])
    expect(data.ticket.played).toBe(1)
    const cell = (await db.doc('grid/7').get()).data()
    expect(cell).toMatchObject({ status: 'revealed', ownerId: 'p1' })
    expect(JSON.stringify(cell)).not.toContain(token)
  })

  it('records a winner in the public campaign without the phone number', async () => {
    await reveal({ token })
    const { data } = await reveal({ token })

    expect(data.revealed).toEqual([{ number: 11, winner: true }])
    const campaign = (await db.doc('config/campaign').get()).data()
    expect(campaign.winnersRevealed).toBe(1)
    expect(campaign.winners).toHaveLength(1)
    expect(campaign.winners[0]).toMatchObject({ number: 11, name: 'Ana Demo', publicId: 'p1' })
    expect(campaign.winners[0].phone).toBeUndefined()
  })

  it('reveals everything with all: true and then refuses', async () => {
    const { data } = await reveal({ token, all: true })
    expect(data.revealed.map(r => r.number)).toEqual([7, 11, 300])
    expect(await errorCode(reveal({ token }))).toBe('functions/failed-precondition')
  })

  it('concurrent reveals never reveal the same number twice', async () => {
    const results = await Promise.allSettled(Array.from({ length: 5 }, () => reveal({ token })))
    const revealed = results.filter(r => r.status === 'fulfilled').flatMap(r => r.value.data.revealed.map(x => x.number))

    // Calls may succeed or lose the race, but each number is revealed once,
    // in ticket order, and the ticket counters match what was handed out.
    expect(revealed.length).toBeGreaterThan(0)
    expect([...revealed].sort((a, b) => a - b)).toEqual([7, 11, 300].slice(0, revealed.length))
    const ticket = (await db.doc(`participants/${token}`).get()).data()
    expect(ticket.played).toBe(revealed.length)
    expect(ticket.playedAt).toHaveLength(revealed.length)
  })
})
