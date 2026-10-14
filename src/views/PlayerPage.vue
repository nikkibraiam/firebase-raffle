<template>
  <div class="page">
    <!-- Loading -->
    <div v-if="loading" class="center-screen">
      <div class="spinner"></div>
      <p>Cargando tu participación...</p>
    </div>

    <!-- Invalid token -->
    <div v-else-if="!participant" class="center-screen">
      <div class="error-icon">⛔</div>
      <h2>Link inválido</h2>
      <p>Este link no existe o ya fue usado. Contacta al organizador.</p>
    </div>

    <!-- Player view -->
    <template v-else>
      <header class="header">
        <div class="header-content">
          <span class="moto-icon">🎰</span>
          <div>
            <h1>La Ruleta</h1>
            <p class="header-sub">Hola, <strong>{{ participant.name }}</strong> 👋</p>
          </div>
        </div>
      </header>

      <!-- My numbers status -->
      <div class="my-numbers-bar">
        <div class="my-number-chip" v-for="(num, i) in participant.numbers" :key="i" :class="getChipClass(num, i)">
          <span class="chip-label">Número {{ i + 1 }}</span>
          <span class="chip-number">{{ participant.played > i ? num : '?' }}</span>
          <span class="chip-status">
            {{ participant.played > i ? (isWinner(num) ? '🏆 GANASTE' : 'Revelado') : 'Sin revelar' }}
          </span>
        </div>
      </div>

      <!-- Play button -->
      <!-- Offline banner -->
      <div v-if="!isOnline" class="offline-banner">
        ⚠️ Sin conexión — reconéctate para jugar
      </div>

      <div v-if="errorMsg" class="offline-banner">
        ⚠️ {{ errorMsg }}
      </div>

      <div class="play-section">
        <div v-if="pendingPlays > 0" class="play-info">
          <p>Tienes <strong>{{ pendingPlays }}</strong> número{{ pendingPlays > 1 ? 's' : '' }} por revelar</p>
          <div class="play-buttons">
            <button
              class="btn-play"
              :disabled="animating || !isOnline"
              @click="playNext"
            >
              {{ animating ? '✨ Sorteando...' : '🎰 Jugar' }}
            </button>
            <button
              v-if="pendingPlays > 1"
              class="btn-play-all"
              :disabled="animating || !isOnline"
              @click="playAll"
            >
              {{ animating ? '✨ Sorteando todos...' : '⚡ Jugar todos' }}
            </button>
          </div>
        </div>
        <div v-else class="all-played">
          <p>✅ Ya revelaste todos tus números</p>
          <router-link to="/" class="btn-ghost-link">Ver grilla completa</router-link>
        </div>
      </div>

      <!-- Grid with animation -->
      <div class="grid-container" id="grid-section">
        <div class="grid">
          <div
            v-for="n in 1000"
            :key="n"
            class="cell"
            :class="getGridCellClass(n)"
            :id="`cell-${n}`"
          >
            {{ n }}
          </div>
        </div>
      </div>

      <!-- Win celebration -->
      <div v-if="showWin" class="win-overlay">
        <div class="win-card">
          <div class="confetti-emoji">🎉🏆🎉</div>
          <h2>¡GANASTE!</h2>
          <p class="win-number">Número <strong>{{ winNumber }}</strong></p>
          <p class="win-prize">$100.000</p>
          <p class="win-msg">El organizador se pondrá en contacto contigo pronto.</p>
          <button class="btn-primary" @click="showWin = false">¡Genial!</button>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { db, functions } from '../firebase'
import { collection, onSnapshot } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'

const getTicketFn = httpsCallable(functions, 'getTicket')
const revealFn = httpsCallable(functions, 'reveal')

const route = useRoute()
const token = computed(() => route.query.token)

const loading = ref(true)
// { name, played, numbers: (number | null)[] } — pending numbers stay on the
// server until revealed, so they are null here.
const participant = ref(null)
const myWinners = ref(new Set())
const gridState = ref({})
const animating = ref(false)
const showWin = ref(false)
const winNumber = ref(null)
const currentAnimCell = ref(null)
const errorMsg = ref('')

const isOnline = ref(navigator.onLine)

window.addEventListener('online',  () => { isOnline.value = true })
window.addEventListener('offline', () => { isOnline.value = false })

const pendingPlays = computed(() => {
  if (!participant.value) return 0
  return participant.value.numbers.length - (participant.value.played || 0)
})

function applyTicket(ticket) {
  const numbers = Array.from({ length: ticket.total }, (_, i) => ticket.revealed[i]?.number ?? null)
  participant.value = { name: ticket.name, played: ticket.played, numbers }
  myWinners.value = new Set(ticket.revealed.filter(r => r.winner).map(r => r.number))
}

function isWinner(n) {
  return myWinners.value.has(n)
}

function getChipClass(num, index) {
  if (index >= (participant.value?.played || 0)) return 'chip-pending'
  if (isWinner(num)) return 'chip-win'
  return 'chip-done'
}

function getGridCellClass(n) {
  if (currentAnimCell.value === n) return 'cell-active'
  const myPlayed = participant.value?.numbers?.slice(0, participant.value?.played || 0) || []
  if (myPlayed.includes(n)) return isWinner(n) ? 'cell-winner' : 'cell-mine-revealed'
  const state = gridState.value[n]
  if (!state) return 'cell-available'
  if (state === 'winner') return 'cell-winner'
  if (state === 'revealed') return 'cell-revealed'
  return 'cell-sold'
}

function describeError(error) {
  if (error?.code === 'functions/failed-precondition') return 'Ya revelaste todos tus números.'
  if (error?.code === 'functions/not-found') return 'Este link no existe. Contacta al organizador.'
  return 'No se pudo revelar. Revisa tu conexión e inténtalo de nuevo.'
}

// The server picks and records the result first; the animation only plays it
// back. If the animation is interrupted, the reveal is already saved.
async function playAll() {
  if (animating.value || pendingPlays.value === 0) return
  animating.value = true
  errorMsg.value = ''

  let winningNumbers = []

  try {
    const { data } = await revealFn({ token: token.value, all: true })
    const pendingNumbers = data.revealed.map(r => r.number)
    winningNumbers = data.revealed.filter(r => r.winner).map(r => r.number)

    // Lock scroll, position grid in view
    document.body.style.overflow = 'hidden'
    document.getElementById('grid-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    await sleep(200)

    // Phase 1 — 2.5s of random cells
    const animDuration = 2500
    const animStart = Date.now()
    while (Date.now() - animStart < animDuration) {
      currentAnimCell.value = pendingNumbers.length ? Math.floor(Math.random() * 1000) + 1 : null
      await sleep(50)
    }

    // Phase 2 — show the final numbers
    currentAnimCell.value = null
    await sleep(300)
    applyTicket(data.ticket)
  } catch (error) {
    console.error('Error en playAll:', error)
    errorMsg.value = describeError(error)
    currentAnimCell.value = null
  } finally {
    if (winningNumbers.length > 0) {
      winNumber.value = winningNumbers[0]
      showWin.value = true
    }
    animating.value = false
    document.body.style.overflow = ''
  }
}

async function playNext() {
  if (animating.value || pendingPlays.value === 0) return
  animating.value = true
  errorMsg.value = ''

  let result = null

  try {
    const { data } = await revealFn({ token: token.value })
    result = data
    const { number: targetNumber } = data.revealed[0]

    // Lock scroll, position grid in view — 200ms
    document.body.style.overflow = 'hidden'
    document.getElementById('grid-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    await sleep(200)

    // Phase 1 — fast (1.0s): 20 random jumps across the board
    for (let i = 0; i < 20; i++) {
      currentAnimCell.value = Math.floor(Math.random() * 1000) + 1
      await sleep(50)
    }

    // Phase 2 — suspense (1.2s): converge on the target, slower each step
    const offsets = [60, 40, 25, 12, 5, 2]
    const delays  = [80, 120, 170, 230, 290, 310]
    for (let i = 0; i < offsets.length; i++) {
      const sign = Math.random() > 0.5 ? 1 : -1
      currentAnimCell.value = Math.max(1, Math.min(1000, targetNumber + sign * offsets[i]))
      await sleep(delays[i])
    }

    // Phase 3 — landing (0.6s): final number, scrolled into view
    currentAnimCell.value = targetNumber
    scrollToCell(targetNumber)
    await sleep(600)
  } catch (error) {
    console.error('Error en playNext:', error)
    errorMsg.value = describeError(error)
  } finally {
    currentAnimCell.value = null
    document.body.style.overflow = ''
    if (result) {
      applyTicket(result.ticket)
      const [{ number, winner }] = result.revealed
      if (winner) {
        winNumber.value = number
        showWin.value = true
      }
    }
    animating.value = false
  }
}

function scrollToCell(n) {
  const el = document.getElementById(`cell-${n}`)
  if (el) el.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' })
}

// requestAnimationFrame instead of setTimeout: browsers throttle timers in
// background tabs.
function sleep(ms) {
  return new Promise(resolve => {
    const start = Date.now()
    const tick = () => {
      if (Date.now() - start >= ms) resolve()
      else requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
}

let unsubGrid

function handleRotation() {
  document.body.style.overflow = ''
  currentAnimCell.value = null
}

onMounted(async () => {
  window.addEventListener('orientationchange', handleRotation)
  window.addEventListener('resize', handleRotation)

  if (!token.value) { loading.value = false; return }

  try {
    const { data } = await getTicketFn({ token: token.value })
    applyTicket(data)
  } catch (error) {
    // not-found / invalid-argument → "Link inválido" screen
    console.error('Error cargando ticket:', error)
  }
  loading.value = false
  if (!participant.value) return

  unsubGrid = onSnapshot(collection(db, 'grid'), snap => {
    const state = {}
    snap.forEach(d => { state[Number(d.id)] = d.data().status })
    gridState.value = state
  })
})

onUnmounted(() => {
  unsubGrid?.()
  document.body.style.overflow = ''
  window.removeEventListener('orientationchange', handleRotation)
  window.removeEventListener('resize', handleRotation)
})
</script>

<style scoped>
.page { min-height: 100vh; background: var(--color-bg); }

.center-screen {
  min-height: 100vh;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 16px; text-align: center; padding: 20px;
}
.spinner {
  width: 40px; height: 40px;
  border: 3px solid var(--color-border);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.error-icon { font-size: 48px; }

.header {
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  padding: 16px 20px;
}
.header-content { display: flex; align-items: center; gap: 12px; }
.moto-icon { font-size: 32px; }
h1 { font-size: 20px; font-weight: 800; color: var(--color-primary); }
.header-sub { font-size: 13px; color: var(--color-text-muted); }

/* My numbers */
.my-numbers-bar {
  display: flex; gap: 10px; padding: 16px 20px;
  overflow-x: auto; scrollbar-width: none;
  background: var(--color-surface-2);
}
.my-numbers-bar::-webkit-scrollbar { display: none; }
.my-number-chip {
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  padding: 12px 16px; border-radius: 12px;
  min-width: 100px; flex-shrink: 0;
  border: 1px solid var(--color-border);
}
.chip-label { font-size: 10px; color: var(--color-text-muted); text-transform: uppercase; }
.chip-number { font-size: 22px; font-weight: 800; }
.chip-status { font-size: 11px; }
.chip-pending { background: var(--color-surface); }
.chip-pending .chip-number { color: var(--color-text-muted); }
.chip-done { background: rgba(239,68,68,0.1); border-color: var(--color-red); }
.chip-done .chip-number { color: var(--color-red); }
.chip-win { background: rgba(16,185,129,0.15); border-color: var(--color-green); }
.chip-win .chip-number { color: var(--color-green); }
.chip-win .chip-status { color: var(--color-green); font-weight: 700; }

/* Play section */
.play-section {
  display: flex; flex-direction: column; align-items: center;
  gap: 12px; padding: 24px 20px;
  position: relative;
  z-index: 1;
}
.offline-banner {
  background: rgba(239,68,68,0.12);
  border: 1px solid var(--color-red);
  color: var(--color-red);
  text-align: center;
  padding: 10px 16px;
  font-size: 13px;
  font-weight: 600;
}
.play-info { display: flex; flex-direction: column; align-items: center; gap: 14px; }
.play-info p { color: var(--color-text-muted); font-size: 15px; }
.play-buttons { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; }
.btn-play {
  background: linear-gradient(135deg, var(--color-primary), var(--color-primary-dark));
  color: #000; font-weight: 800;
  padding: 16px 40px; border-radius: 14px;
  font-size: 18px; letter-spacing: 0.5px;
  transition: all 0.2s;
  box-shadow: 0 4px 20px rgba(245,158,11,0.3);
}
.btn-play:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 6px 28px rgba(245,158,11,0.45); }
.btn-play:disabled { opacity: 0.7; cursor: not-allowed; }
.btn-play-all {
  background: rgba(16,185,129,0.2);
  border: 2px solid var(--color-green);
  color: var(--color-green); font-weight: 700;
  padding: 14px 32px; border-radius: 14px;
  font-size: 16px; letter-spacing: 0.5px;
  transition: all 0.2s;
}
.btn-play-all:hover:not(:disabled) {
  background: rgba(16,185,129,0.3);
  transform: translateY(-2px);
}
.btn-play-all:disabled { opacity: 0.5; cursor: not-allowed; }
.all-played { text-align: center; display: flex; flex-direction: column; gap: 12px; }
.btn-ghost-link {
  padding: 10px 20px; border: 1px solid var(--color-border);
  border-radius: 8px; color: var(--color-text-muted); font-size: 13px;
}

/* Grid */
.grid-container { padding: 0 8px 40px; max-width: 1200px; margin: 0 auto; }
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(22px, 1fr));
  gap: 2px;
}
.cell {
  height: 10px;
  display: flex; align-items: center; justify-content: center;
  font-size: 6.5px; font-weight: 600;
  border-radius: 2px;
  transition: all 0.15s ease;
  border: 1px solid transparent;
}
.cell-available { background: var(--color-surface); color: var(--color-text-muted); border-color: var(--color-border); }
.cell-winner { background: rgba(16,185,129,0.15); color: var(--color-green); border-color: var(--color-green); box-shadow: 0 0 8px rgba(16,185,129,0.3); }
.cell-revealed { background: rgba(239,68,68,0.15); color: var(--color-red); border-color: var(--color-red); }
.cell-sold { background: var(--color-surface); color: var(--color-text-muted); border-color: var(--color-border); }
.cell-mine-revealed { background: rgba(239,68,68,0.25); color: var(--color-red); border-color: var(--color-red); border-width: 2px; }
.cell-active {
  background: var(--color-primary);
  color: #000; font-weight: 800;
  border-color: var(--color-primary);
  transform: scale(1.3);
  z-index: 2;
  box-shadow: 0 0 16px rgba(245,158,11,0.6);
}

/* Win overlay */
.win-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.85);
  display: flex; align-items: center; justify-content: center;
  z-index: 100; padding: 20px;
}
.win-card {
  background: var(--color-surface);
  border: 2px solid var(--color-green);
  border-radius: 20px; padding: 40px 32px;
  max-width: 360px; width: 100%;
  text-align: center;
  display: flex; flex-direction: column; align-items: center; gap: 12px;
  animation: popIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}
@keyframes popIn { from { transform: scale(0.5); opacity: 0; } to { transform: scale(1); opacity: 1; } }
.confetti-emoji { font-size: 40px; }
.win-card h2 { font-size: 32px; font-weight: 900; color: var(--color-green); }
.win-number { font-size: 15px; color: var(--color-text-muted); }
.win-prize { font-size: 36px; font-weight: 900; color: var(--color-primary); }
.win-msg { font-size: 13px; color: var(--color-text-muted); }
.btn-primary {
  background: var(--color-green); color: #000;
  font-weight: 700; padding: 12px 28px;
  border-radius: 10px; font-size: 15px;
}
</style>
