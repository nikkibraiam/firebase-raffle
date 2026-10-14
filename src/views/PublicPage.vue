<template>
  <div class="page">
    <!-- Header -->
    <header class="header">
      <div class="header-content">
        <div class="header-title">
          <span class="moto-icon">🎰</span>
          <div>
            <h1>La Ruleta</h1>
            <p class="header-sub">Gira y gana 🎰</p>
          </div>
          <button class="btn-header-action" @click="showInstructions = true" title="¿Cómo participar?">
            💳 ¿Cómo participar?
          </button>
        </div>
      </div>
    </header>

    <!-- Prizes bar — compact -->
    <div class="prizes-bar">
      <div class="prize-chip premios100">
        <span class="prize-name">4 premios</span>
        <span class="prize-amount">$100k c/u</span>
        <span class="prize-tag">{{ winnersRevealed }}/4 entregados</span>
      </div>
      <div class="prize-chip early">
        <span class="prize-name">100 ventas</span>
        <span class="prize-amount">$50k</span>
        <span class="prize-tag">{{ soldCount >= 100 ? '✅ Sorteado' : `Faltan ${100 - soldCount}` }}</span>
      </div>
      <div class="prize-chip top">
        <span class="prize-name">Top comprador</span>
        <span class="prize-amount">$100k</span>
        <span class="prize-tag">Al cierre</span>
      </div>
      <div class="prize-chip mayor">
        <span class="prize-name">Premio mayor</span>
        <span class="prize-amount">$500k</span>
        <span class="prize-tag">{{ closingDate }}</span>
      </div>
    </div>

    <!-- Grid -->
    <div class="grid-container">
      <div class="grid">
        <div
          v-for="n in 1000"
          :key="n"
          class="cell"
          :class="getCellClass(n)"
          @click="onCellClick(n)"
        >
          {{ n }}
        </div>
      </div>
    </div>

    <!-- Cell info modal -->
    <div v-if="selectedCell" class="modal-overlay" @click.self="selectedCell = null">
      <div class="modal modal-cell">
        <div class="cell-modal-icon">{{ selectedCell.status === 'winner' ? '🏆' : '🎰' }}</div>
        <h2>Número {{ selectedCell.number }}</h2>
        <p class="cell-modal-name">{{ selectedCell.name }}</p>
        <p class="cell-modal-sub">
          {{ selectedCell.status === 'winner' ? '¡Este número es ganador!' : 'Ya fue revelado' }}
        </p>
        <button class="btn-primary" @click="selectedCell = null">Cerrar</button>
      </div>
    </div>

    <!-- Floating buttons -->
    <div class="fab-group">
      <button class="fab" @click="showRanking = true" title="Ver competidores">🏆</button>
      <button class="fab" @click="showInstructions = true" title="¿Cómo funciona?">❓</button>
    </div>

    <!-- Instructions modal -->
    <div v-if="showInstructions" class="modal-overlay" @click.self="showInstructions = false">
      <div class="modal">
        <h2>¿Cómo funciona?</h2>
        <ol class="instructions-list">
          <li>Cada número cuesta <span class="price-tag">{{ formatPrice(config.numberPrice || 5000) }}</span></li>
          <li>Decide cuántos números quieres comprar.</li>
          <li>
            Realiza tu pago:
            <div class="payment-methods">
              <div class="payment-row" v-for="p in payments" :key="p.label">
                <div class="payment-info">
                  <span class="payment-label">{{ p.label }}</span>
                  <span class="payment-value">{{ p.value }}</span>
                  <span class="payment-name" v-if="p.name">{{ p.name }}</span>
                </div>
                <button v-if="p.copyable" class="btn-copy-inline" @click="copyPayment(p)">
                  {{ copiedKey === p.label ? '✅ Copiado' : '📋' }}
                </button>
              </div>
            </div>
          </li>
          <li>
            Envía el comprobante por WhatsApp:
            <a class="whatsapp-link" :href="whatsappLink" target="_blank" rel="noopener">
              💬 Abrir WhatsApp {{ organizer.whatsappDisplay }}
            </a>
          </li>
          <li>Recibirás un link — úsalo para revelar tu grupo de números.</li>
          <li>Si un número coincide con uno <span class="green-text">verde</span>, ganaste <strong>$100.000</strong>.</li>
          <li>El premio mayor de <strong>$500.000</strong> se sortea el <strong>{{ closingDate }}</strong>.</li>
        </ol>
        <div class="prize-detail">
          <p>💚 Los <strong>4 números verdes</strong> en la grilla son los ganadores de $100k</p>
          <p>🏆 Premio al que más compre: <strong>$100.000</strong></p>
          <p>🎁 Compra 4 en un pago → te regalamos <strong>1 de cortesía</strong></p>
          <p>⚡ Entre los primeros 100 compradores: sorteo de <strong>$50.000</strong></p>
        </div>
        <button class="btn-primary" @click="showInstructions = false">Entendido</button>
      </div>
    </div>

    <!-- Ranking modal -->
    <div v-if="showRanking" class="modal-overlay" @click.self="showRanking = false">
      <div class="modal modal-ranking">
        <h2>🏆 Tabla de competidores</h2>
        <div class="ranking-list">
          <div v-for="(p, i) in allBuyers" :key="p.id" class="ranking-item">
            <span class="rank-pos">
              {{ i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}` }}
            </span>
            <span class="rank-name">{{ p.name }} <span class="rank-phone">···{{ p.phoneSuffix }}</span></span>
            <span class="rank-count">{{ p.total }} núm.</span>
          </div>
          <div v-if="!allBuyers.length" class="empty-ranking">
            Aún no hay compradores. ¡Sé el primero!
          </div>
        </div>
        <button class="btn-primary" @click="showRanking = false">Cerrar</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { db } from '../firebase'
import { collection, onSnapshot, doc } from 'firebase/firestore'
import { organizer, whatsappLink } from '../organizer'

const showInstructions = ref(false)
const showRanking = ref(false)
const copiedKey = ref('')

const payments = organizer.payments

function copyPayment(p) {
  const raw = p.value.replace(/\s/g, '')
  navigator.clipboard.writeText(raw)
  copiedKey.value = p.label
  setTimeout(() => { copiedKey.value = '' }, 2000)
}
const gridState = ref({})       // number → { status, ownerId? }
const participants = ref([])    // public ranking: { id, name, phoneSuffix, total, createdAt }
const config = ref({ closingDate: '', winnersRevealed: 0 })
const selectedCell = ref(null)  // { number, name, status }

const ownerNames = computed(() => {
  const map = {}
  participants.value.forEach(p => { map[p.id] = p.name })
  return map
})

const closingDate = computed(() => config.value.closingDate || 'Al cierre')
const soldCount = computed(() =>
  Object.values(gridState.value).filter(c => c.status === 'sold' || c.status === 'revealed').length
)
const winnersRevealed = computed(() => config.value.winnersRevealed || 0)

const prizes = computed(() => {
  const ranges = [
    { label: '0–249', min: 0, max: 249 },
    { label: '250–499', min: 250, max: 499 },
    { label: '500–749', min: 500, max: 749 },
    { label: '750–999', min: 750, max: 999 },
  ]
  return ranges.map((r, i) => ({
    ...r,
    claimed: i < winnersRevealed.value,
  }))
})

const allBuyers = computed(() => {
  return [...participants.value]
    .sort((a, b) => {
      if (b.total !== a.total) return b.total - a.total
      return new Date(a.createdAt) - new Date(b.createdAt)
    })
})

function formatPrice(amount) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(amount)
}

function getCellClass(n) {
  const cell = gridState.value[n]
  if (!cell) return 'cell-available'
  if (cell.status === 'winner') return 'cell-winner'
  if (cell.status === 'revealed') return 'cell-revealed'
  return 'cell-sold'
}

function onCellClick(n) {
  const cell = gridState.value[n]
  if (!cell || (cell.status !== 'revealed' && cell.status !== 'winner')) return
  // Unrevealed winning numbers have no owner yet, whether sold or not.
  const name = cell.ownerId ? ownerNames.value[cell.ownerId] || 'Participante' : 'Aún sin revelar'
  selectedCell.value = { number: n, name, status: cell.status }
}

let unsubGrid, unsubParticipants, unsubConfig

onMounted(() => {
  unsubGrid = onSnapshot(collection(db, 'grid'), snap => {
    const state = {}
    snap.forEach(d => { state[Number(d.id)] = d.data() })
    gridState.value = state
  })

  unsubParticipants = onSnapshot(collection(db, 'publicParticipants'), snap => {
    participants.value = snap.docs.map(d => ({ id: d.id, ...d.data() }))
  })

  unsubConfig = onSnapshot(doc(db, 'config', 'campaign'), snap => {
    if (snap.exists()) config.value = snap.data()
  })
})

onUnmounted(() => {
  unsubGrid?.()
  unsubParticipants?.()
  unsubConfig?.()
})
</script>

<style scoped>
.page { min-height: 100vh; background: var(--color-bg); }

/* Header */
.header {
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  padding: 12px 16px;
}
.header-content { max-width: 1200px; margin: 0 auto; }
.header-title {
  display: flex;
  align-items: center;
  gap: 10px;
  justify-content: space-between;
  width: 100%;
}
.moto-icon { font-size: 28px; }
h1 { font-size: 20px; font-weight: 800; color: var(--color-primary); line-height: 1.2; }
.header-sub { font-size: 11px; color: var(--color-text-muted); }

.btn-header-action {
  background: rgba(245, 158, 11, 0.15);
  border: 1px solid var(--color-primary);
  color: var(--color-primary);
  padding: 6px 14px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 700;
  transition: all 0.2s;
  white-space: nowrap;
  flex-shrink: 0;
}
.btn-header-action:hover {
  background: rgba(245, 158, 11, 0.25);
  border-color: var(--color-primary-dark);
}

/* Prizes bar */
.prizes-bar {
  display: flex;
  gap: 6px;
  padding: 8px 12px;
  overflow-x: auto;
  scrollbar-width: none;
  background: var(--color-surface-2);
  border-bottom: 1px solid var(--color-border);
}
.prizes-bar::-webkit-scrollbar { display: none; }

.prize-chip {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  padding: 6px 10px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  min-width: 72px;
  flex-shrink: 0;
}
.prize-chip.premios100 { border-color: var(--color-green); }
.prize-chip.early { border-color: #6366f1; }
.prize-chip.top { border-color: var(--color-primary); }
.prize-chip.mayor { border-color: var(--color-winner); background: rgba(251,191,36,0.07); }

.prize-name { font-size: 10px; color: var(--color-text-muted); white-space: nowrap; }
.prize-amount { font-size: 14px; font-weight: 800; color: var(--color-primary); }
.prize-chip.mayor .prize-amount { color: var(--color-winner); }
.prize-tag { font-size: 9px; color: var(--color-text-muted); white-space: nowrap; }
.claimed-tag { color: var(--color-green); }

/* Grid */
.grid-container {
  padding: 10px 8px 100px;
  max-width: 1200px;
  margin: 0 auto;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(22px, 1fr));
  gap: 2px;
}
.cell {
  height: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 8px;
  font-weight: 600;
  border-radius: 2px;
  transition: all 0.3s ease;
  border: 1px solid transparent;
}
.cell-available {
  background: var(--color-surface);
  color: var(--color-text-muted);
  border-color: var(--color-border);
}
.cell-winner {
  background: rgba(16,185,129,0.15);
  color: var(--color-green);
  border-color: var(--color-green);
  box-shadow: 0 0 6px rgba(16,185,129,0.3);
  animation: pulse-green 2s infinite;
}
.cell-revealed {
  background: rgba(239,68,68,0.15);
  color: var(--color-red);
  border-color: var(--color-red);
}
.cell-sold {
  background: var(--color-surface);
  color: var(--color-text-muted);
  border-color: var(--color-border);
}
.cell-revealed, .cell-winner { cursor: pointer; }
.cell-revealed:hover { filter: brightness(1.3); }
.cell-winner:hover { filter: brightness(1.25); }
@keyframes pulse-green {
  0%, 100% { box-shadow: 0 0 5px rgba(16,185,129,0.3); }
  50% { box-shadow: 0 0 12px rgba(16,185,129,0.65); }
}

/* Floating buttons */
.fab-group {
  position: fixed;
  bottom: 24px;
  right: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  z-index: 50;
}
.fab {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  font-size: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 16px rgba(0,0,0,0.4);
  transition: all 0.2s;
}
.fab:hover {
  background: var(--color-primary);
  border-color: var(--color-primary);
  transform: scale(1.1);
}

/* Modal */
.modal-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.75);
  display: flex; align-items: center; justify-content: center;
  z-index: 100; padding: 16px;
}
.modal {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 16px;
  padding: 24px;
  max-width: 440px;
  width: 100%;
  max-height: 85vh;
  overflow-y: auto;
  display: flex; flex-direction: column; gap: 14px;
}
.modal-ranking {
  max-height: 80vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}
.modal h2 { font-size: 18px; color: var(--color-primary); font-weight: 800; }
.ranking-sub { font-size: 11px; color: var(--color-text-muted); margin-top: -8px; }

/* Instructions */
.instructions-list {
  padding-left: 18px;
  display: flex; flex-direction: column; gap: 8px;
  font-size: 13px; line-height: 1.5; color: var(--color-text-muted);
}
.price-tag {
  background: rgba(245,158,11,0.15);
  border: 1px solid var(--color-primary);
  color: var(--color-primary);
  padding: 2px 8px;
  border-radius: 6px;
  font-weight: 700;
  font-family: monospace;
}
.green-text { color: var(--color-green); font-weight: 600; }
.payment-methods {
  margin-top: 8px;
  display: flex; flex-direction: column; gap: 6px;
}
.payment-row {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  background: var(--color-surface-2);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 8px 10px;
}
.payment-info { display: flex; flex-direction: column; gap: 1px; }
.payment-label { font-size: 10px; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.4px; }
.payment-value { font-size: 14px; font-weight: 700; color: var(--color-text); font-family: monospace; }
.payment-name { font-size: 10px; color: var(--color-text-muted); }
.btn-copy-inline {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  color: var(--color-text);
  padding: 6px 10px; border-radius: 6px;
  font-size: 13px; flex-shrink: 0;
  transition: all 0.2s;
}
.btn-copy-inline:hover { border-color: var(--color-primary); }
.whatsapp-link {
  display: inline-flex; align-items: center; gap: 6px;
  margin-top: 6px;
  background: #25d366;
  color: #000; font-weight: 700;
  padding: 8px 14px; border-radius: 8px;
  font-size: 13px; text-decoration: none;
  transition: opacity 0.2s;
}
.whatsapp-link:hover { opacity: 0.85; }
.prize-detail {
  display: flex; flex-direction: column; gap: 6px;
  font-size: 12px; color: var(--color-text-muted);
  background: var(--color-surface-2);
  border-radius: 10px; padding: 12px;
}

/* Ranking */
.ranking-list {
  flex: 1;
  overflow-y: auto;
  display: flex; flex-direction: column; gap: 6px;
  min-height: 0;
  padding-right: 4px;
}
.ranking-list::-webkit-scrollbar { width: 4px; }
.ranking-list::-webkit-scrollbar-thumb { background: var(--color-border); border-radius: 2px; }

.ranking-item {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 12px;
  background: var(--color-surface-2);
  border-radius: 8px;
  flex-shrink: 0;
}
.rank-pos { font-size: 16px; min-width: 30px; }
.rank-name { flex: 1; font-size: 13px; }
.rank-phone { color: var(--color-text-muted); font-size: 11px; }
.rank-count { font-weight: 700; color: var(--color-primary); font-size: 13px; white-space: nowrap; }
.empty-ranking { text-align: center; color: var(--color-text-muted); padding: 24px 0; font-size: 13px; }

.btn-primary {
  background: var(--color-primary); color: #000;
  font-weight: 700; padding: 11px 24px;
  border-radius: 10px; font-size: 14px;
  align-self: center; flex-shrink: 0;
  transition: background 0.2s;
}
.btn-primary:hover { background: var(--color-primary-dark); }

/* Cell info modal */
.modal-cell {
  text-align: center;
  align-items: center;
  max-width: 300px;
}
.cell-modal-icon { font-size: 40px; }
.modal-cell h2 { font-size: 28px; font-weight: 900; }
.cell-modal-name {
  font-size: 20px; font-weight: 700;
  color: var(--color-text);
}
.cell-modal-sub { font-size: 13px; color: var(--color-text-muted); }
</style>
