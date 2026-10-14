// Callable functions for players. Players never write to Firestore directly:
// they present their ticket token and the server decides what happens.

import { initializeApp } from 'firebase-admin/app'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'

initializeApp()
const db = getFirestore()

const TOKEN_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function readToken(data) {
  const token = data?.token
  if (typeof token !== 'string' || !TOKEN_RE.test(token)) {
    throw new HttpsError('invalid-argument', 'Invalid ticket token.')
  }
  return token
}

function winnerSet(snapshot) {
  return new Set(snapshot.exists ? snapshot.data().winnerNumbers || [] : [])
}

// What the player may see: name and the numbers already revealed. Pending
// numbers stay on the server until revealed.
function ticketView(participant, winners) {
  const played = participant.played || 0
  return {
    name: participant.name,
    total: participant.numbers.length,
    played,
    revealed: participant.numbers.slice(0, played).map(number => ({ number, winner: winners.has(number) })),
  }
}

export const getTicket = onCall(async request => {
  const token = readToken(request.data)
  const [ticket, winners] = await Promise.all([
    db.doc(`participants/${token}`).get(),
    db.doc('config/winners').get(),
  ])
  if (!ticket.exists) throw new HttpsError('not-found', 'Ticket not found.')
  return ticketView(ticket.data(), winnerSet(winners))
})

/**
 * Reveals the next pending number of a ticket (or all of them with
 * `{ all: true }`). Runs in a transaction so concurrent calls for the same
 * ticket cannot reveal a number twice or skip one.
 */
export const reveal = onCall(async request => {
  const token = readToken(request.data)
  const revealAll = request.data?.all === true

  return db.runTransaction(async tx => {
    const ticketRef = db.doc(`participants/${token}`)
    const [ticket, winnersDoc] = await Promise.all([tx.get(ticketRef), tx.get(db.doc('config/winners'))])
    if (!ticket.exists) throw new HttpsError('not-found', 'Ticket not found.')

    const participant = ticket.data()
    const winners = winnerSet(winnersDoc)
    const played = participant.played || 0
    const pending = participant.numbers.slice(played)
    if (pending.length === 0) throw new HttpsError('failed-precondition', 'All numbers are already revealed.')

    const now = new Date().toISOString()
    const batch = revealAll ? pending : pending.slice(0, 1)
    const revealed = batch.map(number => ({ number, winner: winners.has(number) }))

    for (const { number, winner } of revealed) {
      tx.set(db.doc(`grid/${number}`), {
        status: winner ? 'winner' : 'revealed',
        ownerId: participant.publicId,
        revealedAt: now,
      })
    }
    tx.update(ticketRef, {
      played: played + batch.length,
      playedAt: FieldValue.arrayUnion(...batch.map(number => ({ number, timestamp: now }))),
    })

    const won = revealed.filter(r => r.winner)
    if (won.length > 0) {
      tx.set(
        db.doc('config/campaign'),
        {
          winnersRevealed: FieldValue.increment(won.length),
          winners: FieldValue.arrayUnion(
            ...won.map(({ number }) => ({ number, name: participant.name, publicId: participant.publicId, revealedAt: now })),
          ),
        },
        { merge: true },
      )
    }

    return { revealed, ticket: ticketView({ ...participant, played: played + batch.length }, winners) }
  })
})
