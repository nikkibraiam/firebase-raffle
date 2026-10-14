// Runs against the Firestore emulator: npm test
import { readFileSync } from 'node:fs'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing'
import { collection, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'

const TOKEN = '11111111-1111-4111-8111-111111111111'
let env

beforeAll(async () => {
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':')
  env = await initializeTestEnvironment({
    projectId: 'demo-rifas',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host, port: Number(port) },
  })
})

afterAll(() => env?.cleanup())

beforeEach(async () => {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore()
    await setDoc(doc(db, 'grid/5'), { status: 'sold' })
    await setDoc(doc(db, 'grid/11'), { status: 'winner' })
    await setDoc(doc(db, 'publicParticipants/p1'), { name: 'Ana Demo', phoneSuffix: '001', total: 5 })
    await setDoc(doc(db, `participants/${TOKEN}`), { publicId: 'p1', phone: '3000000001', numbers: [5, 11], played: 0 })
    await setDoc(doc(db, 'users/3000000001'), { name: 'Ana Demo', phone: '3000000001' })
    await setDoc(doc(db, 'config/campaign'), { winnersRevealed: 0 })
    await setDoc(doc(db, 'config/winners'), { winnerNumbers: [11], activationPoints: [7], assignedWinners: [] })
  })
})

const anon = () => env.unauthenticatedContext().firestore()
// Signed in, but without the admin claim (e.g. someone who self-registered).
const user = () => env.authenticatedContext('random-user').firestore()
const admin = () => env.authenticatedContext('admin-user', { admin: true }).firestore()

describe('public data', () => {
  it('anyone can read the board, the ranking and the campaign', async () => {
    await assertSucceeds(getDocs(collection(anon(), 'grid')))
    await assertSucceeds(getDocs(collection(anon(), 'publicParticipants')))
    await assertSucceeds(getDoc(doc(anon(), 'config/campaign')))
  })

  it('nobody but an admin can write it', async () => {
    for (const db of [anon(), user()]) {
      await assertFails(setDoc(doc(db, 'grid/6'), { status: 'sold' }))
      await assertFails(updateDoc(doc(db, 'grid/5'), { status: 'revealed' }))
      await assertFails(setDoc(doc(db, 'publicParticipants/x'), { name: 'Spam' }))
      await assertFails(updateDoc(doc(db, 'config/campaign'), { winnersRevealed: 4 }))
    }
  })
})

describe('private data', () => {
  it('tickets cannot be listed or read without admin, even knowing the token', async () => {
    for (const db of [anon(), user()]) {
      await assertFails(getDocs(collection(db, 'participants')))
      await assertFails(getDoc(doc(db, `participants/${TOKEN}`)))
      await assertFails(updateDoc(doc(db, `participants/${TOKEN}`), { played: 2 }))
    }
  })

  it('phone book and winners config are admin-only', async () => {
    for (const db of [anon(), user()]) {
      await assertFails(getDoc(doc(db, 'users/3000000001')))
      await assertFails(getDocs(collection(db, 'users')))
      await assertFails(getDoc(doc(db, 'config/winners')))
    }
  })
})

describe('admin', () => {
  it('can manage every collection', async () => {
    const db = admin()
    await assertSucceeds(getDocs(collection(db, 'participants')))
    await assertSucceeds(getDoc(doc(db, 'config/winners')))
    await assertSucceeds(setDoc(doc(db, 'grid/6'), { status: 'sold' }))
    await assertSucceeds(setDoc(doc(db, 'users/3000000002'), { name: 'Bruno Ejemplo' }))
  })

  it('cannot downgrade a winning cell', async () => {
    await assertFails(updateDoc(doc(admin(), 'grid/11'), { status: 'sold' }))
    await assertSucceeds(updateDoc(doc(admin(), 'grid/11'), { status: 'winner', ownerId: 'p1' }))
  })
})
