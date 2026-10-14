<template>
  <div class="page">
    <!-- Login -->
    <div v-if="!authenticated" class="login-screen">
      <div class="login-card">
        <span class="moto-icon">🏍️</span>
        <h2>Panel Admin</h2>
        <p>La Ruleta</p>
        <div class="input-group">
          <input
            v-model="email"
            type="email"
            placeholder="correo@ejemplo.com"
            @keyup.enter="login"
            autocomplete="username"
          />
        </div>
        <div class="input-group">
          <input
            v-model="password"
            type="password"
            placeholder="Contraseña"
            @keyup.enter="login"
            autocomplete="current-password"
          />
        </div>
        <p v-if="loginError" class="error-msg">{{ loginError }}</p>
        <button class="btn-primary" :disabled="loggingIn" @click="login">
          {{ loggingIn ? 'Entrando...' : 'Entrar' }}
        </button>
      </div>
    </div>

    <!-- Admin panel -->
    <template v-else>
      <header class="header">
        <div class="header-content">
          <h1>🎰 Admin — La Ruleta</h1>
          <div class="header-stats">
            <span>Compras: <strong>{{ participants.length }}</strong></span>
            <span>Números vendidos: <strong>{{ totalNumbersSold }}</strong></span>
            <span>Números revelados: <strong>{{ totalNumbersRevealed }}</strong></span>
            <span>Recaudado: <strong>{{ formatPrice(totalRecaudado) }}</strong></span>
          </div>
          <button class="btn-ghost" @click="logout">Salir</button>
        </div>
      </header>

      <div class="admin-body">
        <!-- Initialize campaign -->
        <section class="card" v-if="!campaignInitialized">
          <h3>⚙️ Inicializar campaña</h3>
          <p class="card-desc">Genera los 4 números ganadores aleatorios y los puntos de activación. Solo se hace una vez.</p>
          <div class="init-preview" v-if="initPreview">
            <p class="preview-label">Números ganadores (visibles en la grilla):</p>
            <div class="winner-nums">
              <span v-for="n in initPreview.winnerNumbers" :key="n" class="winner-badge">{{ n }}</span>
            </div>
            <p class="preview-label" style="margin-top:10px">Puntos de activación (la venta exacta donde cae cada premio):</p>
            <div class="winner-nums">
              <span v-for="(p, i) in initPreview.activationPoints" :key="i" class="activation-badge">
                P{{ i+1 }}: venta #{{ p }}
              </span>
            </div>
          </div>
          <div class="form-actions">
            <button class="btn-ghost" @click="previewInit">Previsualizar</button>
            <button class="btn-primary" :disabled="!initPreview || initializing" @click="initializeCampaign">
              {{ initializing ? 'Guardando...' : 'Confirmar e inicializar' }}
            </button>
          </div>
        </section>

        <section class="card" v-if="campaignInitialized && config.winnerNumbers">
          <h3>✅ Campaña inicializada</h3>
          <p class="card-desc">Cada ganador activa cuando se cruza esa venta:</p>
          <div class="winner-pairs">
            <div
              v-for="(n, i) in config.winnerNumbers"
              :key="n"
              class="winner-pair"
            >
              <span class="winner-badge">{{ n }}</span>
              <span class="pair-arrow">→</span>
              <span class="activation-badge">venta #{{ config.activationPoints?.[i] ?? '?' }}</span>
            </div>
          </div>
        </section>

        <!-- Campaign settings: closing date + price -->
        <section class="card" v-if="campaignInitialized">
          <h3>📅 Configuración de campaña</h3>
          <p class="card-desc">Fecha del sorteo final y precio del número.</p>
          <div class="form-grid">
            <div class="input-group">
              <label>Fecha del sorteo</label>
              <input v-model="closingDateInput" type="date" />
            </div>
            <div class="input-group">
              <label>Precio por número (COP)</label>
              <input v-model.number="numberPriceInput" type="number" min="1000" step="1000" />
            </div>
          </div>
          <div class="form-actions">
            <button class="btn-primary" :disabled="savingDate" @click="saveClosingDate">
              {{ savingDate ? 'Guardando...' : dateSaved ? '✅ Guardado' : 'Guardar' }}
            </button>
          </div>
        </section>

        <!-- Danger zone: reset campaign -->
        <section class="card danger-card">
          <h3>⚠️ Reiniciar campaña</h3>
          <p class="card-desc">Borra todos los números vendidos, participantes y configuración. Úsalo solo para lanzar un nuevo sorteo desde cero.</p>
          <div v-if="!confirmReset">
            <button class="btn-danger" @click="confirmReset = true">Reiniciar campaña</button>
          </div>
          <div v-else class="reset-confirm">
            <p class="reset-warning">⚠️ Esta acción es <strong>irreversible</strong>. ¿Estás seguro?</p>
            <div class="form-actions">
              <button class="btn-ghost" @click="confirmReset = false">Cancelar</button>
              <button class="btn-danger" :disabled="resetting" @click="resetCampaign">
                {{ resetting ? 'Reiniciando...' : 'Sí, reiniciar todo' }}
              </button>
            </div>
          </div>
        </section>

        <!-- Generate link -->
        <section class="card">
          <h3>Generar link de participante</h3>
          <div class="form-grid">
            <div class="input-group">
              <label>Teléfono</label>
              <input v-model="form.phone" type="tel" placeholder="3001234567" @input="autocompleteByPhone" />
            </div>
            <div class="input-group">
              <label>Nombre</label>
              <input v-model="form.name" type="text" placeholder="Juan Pérez" />
            </div>
            <div class="input-group">
              <label>Números comprados</label>
              <input v-model.number="form.quantity" type="number" min="1" max="50" />
            </div>
            <div class="input-group">
              <label>Método de pago</label>
              <select v-model="form.paymentMethod">
                <option value="nequi">Nequi</option>
                <option value="bancolombia">Bancolombia</option>
                <option value="daviplata">Daviplata</option>
                <option value="davivienda">Davivienda</option>
                <option value="llave_breb">Llave Breb</option>
              </select>
            </div>
            <div class="input-group">
              <label>Cortesía (compra 4 lleva 1 gratis)</label>
              <div class="courtesy-badge" :class="{ inactive: courtesy === 0 }">
                {{ courtesy > 0 ? `+${courtesy} número${courtesy > 1 ? 's' : ''} gratis 🎁` : 'Ninguna — compra mínimo 4' }}
              </div>
            </div>
          </div>
          <div class="form-actions">
            <button class="btn-primary" :disabled="generating" @click="generateLink">
              {{ generating ? 'Generando...' : 'Generar link' }}
            </button>
          </div>
          <div v-if="generatedLink" class="generated-link">
            <p class="link-label">Link generado:</p>
            <div class="link-box">
              <span class="link-text">{{ generatedLink }}</span>
              <button class="btn-copy" @click="copyLink">{{ copied ? '✅' : '📋' }}</button>
            </div>
            <p class="link-hint">Envía este link por WhatsApp al participante.</p>
          </div>
        </section>

        <!-- $50k early prize draw -->
        <section class="card">
          <h3>💚 Sortear Premio $50k (100 ventas)</h3>
          <p class="card-desc">Se otorga automáticamente cuando se alcanzan 100 números vendidos.</p>
          <div class="rng-area">
            <p v-if="soldCount < 100" class="rng-check">
              Faltan <strong>{{ 100 - soldCount }}</strong> números para alcanzar 100 ventas.
            </p>
            <p v-else class="rng-check">
              ✅ Se han vendido <strong>{{ soldCount }}</strong> números. ¡Listo para sortear!
            </p>
            <button
              class="btn-primary"
              :disabled="soldCount < 100 || sortingEarlyPrize"
              @click="sortEarlyPrize"
            >
              {{ sortingEarlyPrize ? 'Sorteando...' : soldCount >= 100 && !earlyPrizeWinner ? '🎯 Sortear ahora' : earlyPrizeWinner ? `✅ ${earlyPrizeWinner.name}` : 'Esperar 100 ventas' }}
            </button>
            <div v-if="earlyPrizeWinner" class="winner-details">
              <p><strong>Ganador $50k:</strong></p>
              <p>📱 {{ earlyPrizeWinner.name }} ({{ earlyPrizeWinner.phone }})</p>
              <p>🎰 Número: {{ earlyPrizeWinner.number }}</p>
            </div>
          </div>
        </section>

        <!-- Random number generator for closing draw -->
        <section class="card">
          <h3>🎰 Generador Premio Cierre ($500k)</h3>
          <p class="card-desc">Úsalo en vivo durante el sorteo final.</p>
          <div class="rng-area">
            <div class="rng-number" :class="{ spinning: rngSpinning }">{{ rngResult || '???' }}</div>
            <button class="btn-primary" :disabled="rngSpinning" @click="spinRNG">
              {{ rngSpinning ? 'Sorteando...' : 'Girar' }}
            </button>
            <p v-if="rngResult" class="rng-check">
              Estado: <strong :class="rngSoldStatus ? 'text-green' : 'text-red'">
                {{ rngSoldStatus ? `✅ Vendido — ${rngWinnerName}` : '❌ No vendido — girar de nuevo' }}
              </strong>
            </p>
          </div>
        </section>

        <!-- Winner image generator -->
        <section class="card">
          <h3>🖼️ Generar imagen ganador</h3>
          <div class="form-grid">
            <div class="input-group">
              <label>Nombre del ganador</label>
              <input v-model="img.name" type="text" placeholder="Juan Pérez" />
            </div>
            <div class="input-group">
              <label>Número ganador</label>
              <input v-model.number="img.number" type="number" />
            </div>
            <div class="input-group">
              <label>Premio</label>
              <input v-model="img.prize" type="text" placeholder="$100.000" />
            </div>
          </div>
          <button class="btn-primary" @click="generateImage">Generar imagen</button>
          <canvas ref="canvasRef" width="800" height="450" style="display:none"></canvas>
          <div v-if="imgUrl" class="img-preview">
            <img :src="imgUrl" alt="Imagen ganador" />
            <a :href="imgUrl" download="ganador-rifa.png" class="btn-download">⬇️ Descargar</a>
          </div>
        </section>

        <!-- Participants table -->
        <section class="card">
          <h3>Participantes ({{ participants.length }})</h3>
          <div class="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Teléfono</th>
                  <th>Pagados</th>
                  <th>Cortesía</th>
                  <th>Total</th>
                  <th>Revelados</th>
                  <th>Ganador</th>
                  <th>Pago</th>
                  <th>Link</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="p in participants" :key="p.id">
                  <td>{{ p.name }}</td>
                  <td>{{ p.phone }}</td>
                  <td>{{ p.quantity || p.numbers?.length || 0 }}</td>
                  <td>{{ p.courtesy || 0 }}</td>
                  <td><strong>{{ p.numbers?.length || 0 }}</strong></td>
                  <td>{{ p.played || 0 }}/{{ p.numbers?.length || 0 }}</td>
                  <td>{{ getWinnerNumbers(p.id) || '—' }}</td>
                  <td>{{ p.paymentMethod }}</td>
                  <td>
                    <button class="btn-mini" @click="copyParticipantLink(p.id)">
                      📋 Copiar
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onUnmounted } from 'vue'
import { db, auth } from '../firebase'
import {
  collection, onSnapshot, doc, getDoc, getDocs, updateDoc, writeBatch, arrayUnion
} from 'firebase/firestore'
import {
  signInWithEmailAndPassword, signOut, onAuthStateChanged
} from 'firebase/auth'
import { assignNumbers, buildPurchase, courtesyFor, newCampaign } from '../lib/raffle'

// --- Auth ---
const email = ref('')
const password = ref('')
const authenticated = ref(false)
const loginError = ref('')
const loggingIn = ref(false)

// Restore session; only accounts with the { admin: true } custom claim get in.
onAuthStateChanged(auth, async user => {
  if (!user) {
    authenticated.value = false
    stopListeners()
    return
  }
  const { claims } = await user.getIdTokenResult()
  if (claims.admin === true) {
    authenticated.value = true
    startListeners()
  } else {
    loginError.value = 'Esta cuenta no tiene permisos de administrador.'
    await signOut(auth)
  }
})

async function login() {
  if (!email.value || !password.value) return
  loggingIn.value = true
  loginError.value = ''
  try {
    await signInWithEmailAndPassword(auth, email.value, password.value)
    // onAuthStateChanged will set authenticated = true
  } catch (e) {
    loginError.value = 'Correo o contraseña incorrectos.'
    password.value = ''
  } finally {
    loggingIn.value = false
  }
}

async function logout() {
  await signOut(auth)
  authenticated.value = false
}

// --- Data ---
const participants = ref([])
const gridState = ref({})
const config = ref({})
const campaignInitialized = computed(() => !!config.value.winnerNumbers?.length)
let unsubParticipants, unsubGrid, unsubConfig, unsubConfigWinners

// --- Campaign initialization ---
const initPreview = ref(null)
const initializing = ref(false)

function previewInit() {
  initPreview.value = newCampaign()
}

async function initializeCampaign() {
  if (!initPreview.value || initializing.value) return
  initializing.value = true

  const { winnerNumbers, activationPoints } = initPreview.value
  const batch = writeBatch(db)

  // Public campaign info: no winning numbers and no activation points.
  batch.set(doc(db, 'config', 'campaign'), {
    winnersRevealed: 0,
    winners: [],
    closingDate: 'Por definir',
    numberPrice: 5000,
    createdAt: new Date().toISOString(),
  })
  // Admin-only: which numbers win and at which sale each one is handed out.
  batch.set(doc(db, 'config', 'winners'), {
    winnerNumbers,
    activationPoints,
    assignedWinners: [],
  })
  // The winning numbers are shown on the board from day one (that's the game).
  for (const n of winnerNumbers) {
    batch.set(doc(db, 'grid', String(n)), { status: 'winner' })
  }
  await batch.commit()

  initPreview.value = null
  initializing.value = false
}

// Non-winning numbers on the board that belong to someone.
const soldCount = computed(() =>
  Object.values(gridState.value).filter(d => d.status === 'sold' || d.status === 'revealed').length
)

const totalNumbersSold = computed(() =>
  participants.value.reduce((acc, p) => acc + (p.numbers?.length || 0), 0)
)

const totalNumbersRevealed = computed(() =>
  participants.value.reduce((acc, p) => acc + (p.played || 0), 0)
)

// Courtesy numbers are free: only paid quantity counts.
const totalRecaudado = computed(() =>
  participants.value.reduce((acc, p) => acc + (p.quantity || 0) * (config.value.numberPrice || 5000), 0)
)

// --- Closing date + price ---
const closingDateInput = ref(config.value.closingDate || '')
const numberPriceInput = ref(config.value.numberPrice || 5000)
const savingDate = ref(false)
const dateSaved = ref(false)

async function saveClosingDate() {
  if (!closingDateInput.value) return
  savingDate.value = true
  const formatted = new Date(closingDateInput.value).toLocaleDateString('es-CO', {
    day: 'numeric', month: 'long', year: 'numeric'
  })
  await updateDoc(doc(db, 'config', 'campaign'), {
    closingDate: formatted,
    numberPrice: numberPriceInput.value || 5000
  })
  config.value.closingDate = formatted
  config.value.numberPrice = numberPriceInput.value
  savingDate.value = false
  dateSaved.value = true
  setTimeout(() => dateSaved.value = false, 3000)
}

// --- Reset campaign ---
const confirmReset = ref(false)
const resetting = ref(false)

async function resetCampaign() {
  resetting.value = true

  // Campaign data only: the users phone book persists across campaigns.
  const refs = []
  for (const name of ['grid', 'participants', 'publicParticipants']) {
    const snap = await getDocs(collection(db, name))
    snap.docs.forEach(d => refs.push(d.ref))
  }
  refs.push(doc(db, 'config', 'campaign'), doc(db, 'config', 'winners'))

  // Firestore batches are limited to 500 writes.
  for (let i = 0; i < refs.length; i += 450) {
    const batch = writeBatch(db)
    refs.slice(i, i + 450).forEach(ref => batch.delete(ref))
    await batch.commit()
  }

  config.value = {}
  participants.value = []
  confirmReset.value = false
  resetting.value = false
  initPreview.value = null
  closingDateInput.value = ''
}

// --- Generate link ---
const form = ref({ phone: '', name: '', quantity: 1, paymentMethod: 'nequi' })
const generating = ref(false)
const generatedLink = ref('')
const copied = ref(false)

const courtesy = computed(() => Math.floor(form.value.quantity / 4))

async function autocompleteByPhone() {
  if (form.value.phone.length < 10) {
    form.value.name = ''
    return
  }
  const userSnap = await getDoc(doc(db, 'users', form.value.phone))
  if (userSnap.exists()) {
    form.value.name = userSnap.data().name
  } else {
    form.value.name = ''
  }
}

async function generateLink() {
  if (!form.value.name || !form.value.phone || form.value.quantity < 1) return
  generating.value = true

  try {
    const { quantity, phone, name, paymentMethod } = form.value
    const winnerNumbers = config.value.winnerNumbers || []
    const { numbers, winnersAssigned } = assignNumbers({
      count: quantity + courtesyFor(quantity),
      takenNumbers: Object.entries(gridState.value)
        .filter(([, d]) => d.status === 'sold' || d.status === 'revealed')
        .map(([n]) => Number(n)),
      winnerNumbers,
      activationPoints: config.value.activationPoints || [],
      assignedWinners: config.value.assignedWinners || [],
    })

    const token = crypto.randomUUID()
    const publicId = crypto.randomUUID()
    const docs = buildPurchase({
      token, publicId, phone, name, quantity, paymentMethod, numbers, winnerNumbers,
      now: new Date().toISOString(),
    })

    // One atomic write: a purchase is either fully recorded or not at all.
    const batch = writeBatch(db)
    batch.set(doc(db, 'users', phone), docs.user, { merge: true })
    batch.set(doc(db, 'participants', token), docs.participant)
    batch.set(doc(db, 'publicParticipants', publicId), docs.publicParticipant)
    for (const n of docs.gridSold) {
      batch.set(doc(db, 'grid', String(n)), { status: 'sold' })
    }
    if (winnersAssigned.length) {
      batch.update(doc(db, 'config', 'winners'), { assignedWinners: arrayUnion(...winnersAssigned) })
    }
    await batch.commit()

    generatedLink.value = `${window.location.origin}/jugar?token=${token}`
    form.value = { phone: '', name: '', quantity: 1, paymentMethod: 'nequi' }
  } catch (e) {
    console.error('Error generando link:', e)
    alert(e.message)
  } finally {
    generating.value = false
  }
}

function copyLink() {
  navigator.clipboard.writeText(generatedLink.value)
  copied.value = true
  setTimeout(() => copied.value = false, 2000)
}

function copyParticipantLink(token) {
  const link = `${window.location.origin}/jugar?token=${token}`
  navigator.clipboard.writeText(link)
}

function getWinnerNumbers(token) {
  const participant = participants.value.find(p => p.id === token)
  if (!participant) return null
  const numbers = (config.value.winners || [])
    .filter(w => w.publicId === participant.publicId)
    .map(w => w.number)
  return numbers.length > 0 ? `🏆 ${numbers.join(', ')}` : null
}

function ownerOf(number) {
  return participants.value.find(p => p.numbers?.includes(number))
}

// --- Early prize ($50k) ---
const sortingEarlyPrize = ref(false)
const earlyPrizeWinner = ref(null)

async function sortEarlyPrize() {
  if (soldCount.value < 100 || sortingEarlyPrize.value) return
  sortingEarlyPrize.value = true

  // The first 100 numbers handed out, in purchase order.
  const firstHundred = [...participants.value]
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    .flatMap(p => p.numbers || [])
    .slice(0, 100)

  const winningNumber = firstHundred[Math.floor(Math.random() * firstHundred.length)]
  const winnerParticipant = ownerOf(winningNumber)

  if (winnerParticipant) {
    earlyPrizeWinner.value = {
      name: winnerParticipant.name,
      phone: winnerParticipant.phone,
      number: winningNumber,
    }
    // Public campaign doc: no phone number.
    await updateDoc(doc(db, 'config', 'campaign'), {
      earlyPrizeWinner: {
        name: winnerParticipant.name,
        number: winningNumber,
        timestamp: new Date().toISOString(),
      }
    })
  }

  sortingEarlyPrize.value = false
}

// --- RNG for closing draw ---
const rngResult = ref(null)
const rngSpinning = ref(false)
const rngSoldStatus = ref(false)
const rngWinnerName = ref('')

async function spinRNG() {
  rngSpinning.value = true
  rngResult.value = null
  rngSoldStatus.value = false

  // Animate
  const duration = 2500
  const start = Date.now()
  while (Date.now() - start < duration) {
    rngResult.value = Math.floor(Math.random() * 1000) + 1
    await sleep(80)
  }

  const final = Math.floor(Math.random() * 1000) + 1
  rngResult.value = final
  rngSpinning.value = false

  // Check if sold
  const participant = ownerOf(final)
  rngSoldStatus.value = !!participant
  rngWinnerName.value = participant?.name || ''
}

// --- Winner image ---
const img = ref({ name: '', number: '', prize: '$100.000' })
const canvasRef = ref(null)
const imgUrl = ref('')

function generateImage() {
  const canvas = canvasRef.value
  const ctx = canvas.getContext('2d')
  const W = 800, H = 450

  // Gradient background
  const gradient = ctx.createLinearGradient(0, 0, W, H)
  gradient.addColorStop(0, '#1a1a2e')
  gradient.addColorStop(0.5, '#16213e')
  gradient.addColorStop(1, '#0f3460')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, W, H)

  // Stars background
  ctx.fillStyle = 'rgba(255, 215, 0, 0.3)'
  for (let i = 0; i < 30; i++) {
    const x = Math.random() * W
    const y = Math.random() * H
    const size = Math.random() * 3 + 1
    drawStar(ctx, x, y, size, '#ffd700')
  }

  // Gold glowing border
  ctx.shadowColor = 'rgba(245, 158, 11, 0.8)'
  ctx.shadowBlur = 20
  ctx.shadowOffsetX = 0
  ctx.shadowOffsetY = 0
  ctx.strokeStyle = '#f59e0b'
  ctx.lineWidth = 8
  ctx.strokeRect(10, 10, W - 20, H - 20)
  ctx.shadowColor = 'transparent'

  // Title with shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'
  ctx.font = 'bold 32px Segoe UI'
  ctx.textAlign = 'center'
  ctx.fillText('🎰 LA RULETA 🎰', W / 2 + 2, 72)
  ctx.fillStyle = '#ffd700'
  ctx.fillText('🎰 LA RULETA 🎰', W / 2, 70)

  // Winner label (green glow)
  ctx.shadowColor = 'rgba(16, 185, 129, 0.8)'
  ctx.shadowBlur = 15
  ctx.fillStyle = '#10b981'
  ctx.font = 'bold 28px Segoe UI'
  ctx.fillText('¡¡ GANADOR !!', W / 2, 135)
  ctx.shadowColor = 'transparent'

  // Name (large and bold)
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 48px Segoe UI'
  ctx.shadowColor = 'rgba(0, 0, 0, 0.7)'
  ctx.shadowBlur = 5
  ctx.fillText(img.value.name, W / 2, 220)
  ctx.shadowColor = 'transparent'

  // Number
  ctx.fillStyle = '#fbbf24'
  ctx.font = 'bold 24px Segoe UI'
  ctx.fillText(`Número Ganador: ${img.value.number}`, W / 2, 275)

  // Prize (huge)
  ctx.fillStyle = '#ffd700'
  ctx.font = 'bold 64px Segoe UI'
  ctx.shadowColor = 'rgba(255, 215, 0, 0.6)'
  ctx.shadowBlur = 10
  ctx.fillText(img.value.prize, W / 2, 365)
  ctx.shadowColor = 'transparent'

  // Footer
  ctx.fillStyle = '#10b981'
  ctx.font = 'bold 14px Segoe UI'
  ctx.fillText('✓ ¡El organizador te contactará pronto!', W / 2, 420)

  imgUrl.value = canvas.toDataURL('image/png')
}

function drawStar(ctx, x, y, size, color) {
  ctx.fillStyle = color
  const points = 5
  const outerRadius = size
  const innerRadius = size / 2
  let angle = 0

  ctx.beginPath()
  for (let i = 0; i < points * 2; i++) {
    const radius = i % 2 === 0 ? outerRadius : innerRadius
    const ax = x + Math.cos(angle) * radius
    const ay = y + Math.sin(angle) * radius
    if (i === 0) ctx.moveTo(ax, ay)
    else ctx.lineTo(ax, ay)
    angle += Math.PI / points
  }
  ctx.closePath()
  ctx.fill()
}

function formatPrice(amount) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(amount)
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

// Private collections are only readable by admins, so listeners start after
// the admin claim is confirmed (not on mount).
function startListeners() {
  stopListeners()
  unsubParticipants = onSnapshot(collection(db, 'participants'), snap => {
    participants.value = snap.docs.map(d => ({ id: d.id, ...d.data() }))
  })

  unsubGrid = onSnapshot(collection(db, 'grid'), snap => {
    const state = {}
    snap.forEach(d => { state[Number(d.id)] = d.data() })
    gridState.value = state
  })

  // Live config: merge campaign + winners into a single reactive object
  unsubConfig = onSnapshot(doc(db, 'config', 'campaign'), snap => {
    config.value = { ...config.value, ...(snap.exists() ? snap.data() : {}) }
    const early = config.value.earlyPrizeWinner
    if (early && !earlyPrizeWinner.value) {
      earlyPrizeWinner.value = { ...early, phone: ownerOf(early.number)?.phone || '' }
    }
  })
  unsubConfigWinners = onSnapshot(doc(db, 'config', 'winners'), snap => {
    config.value = { ...config.value, ...(snap.exists() ? snap.data() : {}) }
  })
}

function stopListeners() {
  unsubParticipants?.()
  unsubGrid?.()
  unsubConfig?.()
  unsubConfigWinners?.()
  unsubParticipants = unsubGrid = unsubConfig = unsubConfigWinners = null
}

onUnmounted(stopListeners)
</script>

<style scoped>
.page { min-height: 100vh; background: var(--color-bg); }

.login-screen {
  min-height: 100vh;
  display: flex; align-items: center; justify-content: center; padding: 20px;
}
.login-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 16px; padding: 40px 32px;
  width: 100%; max-width: 360px;
  display: flex; flex-direction: column; align-items: center; gap: 16px; text-align: center;
}
.moto-icon { font-size: 48px; }
.login-card h2 { font-size: 24px; font-weight: 800; color: var(--color-primary); }
.login-card p { color: var(--color-text-muted); font-size: 14px; }
.error-msg { color: var(--color-red); font-size: 13px; }
.attempts-msg { color: var(--color-text-muted); font-size: 12px; }

.header {
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  padding: 14px 20px;
}
.header-content {
  max-width: 1100px; margin: 0 auto;
  display: flex; align-items: center; gap: 16px; flex-wrap: wrap;
}
h1 { font-size: 18px; font-weight: 800; color: var(--color-primary); flex: 1; }
.header-stats { display: flex; gap: 16px; font-size: 13px; color: var(--color-text-muted); }
.header-stats strong { color: var(--color-text); }

.admin-body {
  max-width: 1100px; margin: 0 auto;
  padding: 20px; display: flex; flex-direction: column; gap: 20px;
}

.card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 14px; padding: 24px;
  display: flex; flex-direction: column; gap: 16px;
}
.card h3 { font-size: 16px; font-weight: 700; color: var(--color-text); }
.card-desc { font-size: 13px; color: var(--color-text-muted); }

.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 14px;
}
.input-group { display: flex; flex-direction: column; gap: 6px; }
.input-group label { font-size: 12px; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.5px; }
.input-group input,
.input-group select {
  background: var(--color-surface-2);
  border: 1px solid var(--color-border);
  color: var(--color-text);
  padding: 10px 12px;
  border-radius: 8px;
  font-size: 14px;
  font-family: inherit;
}
.input-group input:focus,
.input-group select:focus { outline: none; border-color: var(--color-primary); }

.courtesy-badge {
  background: rgba(16,185,129,0.1);
  border: 1px solid var(--color-green);
  color: var(--color-green);
  padding: 10px 12px; border-radius: 8px; font-size: 14px; font-weight: 600;
}
.courtesy-badge.inactive {
  background: var(--color-surface-2);
  border-color: var(--color-border);
  color: var(--color-text-muted);
  font-weight: 400;
}

.form-actions { display: flex; gap: 10px; }

.generated-link {
  background: var(--color-surface-2);
  border: 1px solid var(--color-border);
  border-radius: 10px; padding: 14px;
  display: flex; flex-direction: column; gap: 8px;
}
.link-label { font-size: 11px; color: var(--color-text-muted); text-transform: uppercase; }
.link-box { display: flex; align-items: center; gap: 8px; }
.link-text { flex: 1; font-size: 13px; color: var(--color-primary); word-break: break-all; }
.btn-copy { background: var(--color-border); color: var(--color-text); padding: 6px 10px; border-radius: 6px; font-size: 16px; }
.link-hint { font-size: 12px; color: var(--color-text-muted); }

/* RNG */
.rng-area { display: flex; flex-direction: column; align-items: center; gap: 16px; }
.rng-number {
  font-size: 80px; font-weight: 900;
  color: var(--color-primary);
  min-width: 200px; text-align: center;
  transition: all 0.1s;
}
.rng-number.spinning { color: var(--color-text-muted); }
.rng-check { font-size: 14px; color: var(--color-text-muted); }
.winner-details {
  background: rgba(16, 185, 129, 0.1);
  border: 1px solid var(--color-green);
  border-radius: 10px;
  padding: 12px;
  text-align: center;
  color: var(--color-green);
  font-size: 13px;
}
.winner-details p { margin: 4px 0; }
.text-green { color: var(--color-green); }
.text-red { color: var(--color-red); }

/* Image */
.img-preview { display: flex; flex-direction: column; align-items: center; gap: 12px; }
.img-preview img { width: 100%; max-width: 600px; border-radius: 10px; border: 1px solid var(--color-border); }
.btn-download {
  padding: 10px 20px; background: var(--color-surface-2);
  border: 1px solid var(--color-border); border-radius: 8px;
  color: var(--color-text); font-size: 14px;
}

/* Table */
.table-wrapper { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
thead { background: var(--color-surface-2); }
th { padding: 10px 12px; text-align: left; color: var(--color-text-muted); font-weight: 600; font-size: 11px; text-transform: uppercase; }
td { padding: 10px 12px; border-top: 1px solid var(--color-border); color: var(--color-text); }
tr:hover td { background: var(--color-surface-2); }

.btn-mini {
  background: var(--color-surface-2);
  border: 1px solid var(--color-border);
  color: var(--color-text-muted);
  padding: 4px 10px; border-radius: 6px; font-size: 12px;
}

.btn-primary {
  background: var(--color-primary); color: #000;
  font-weight: 700; padding: 11px 24px;
  border-radius: 10px; font-size: 14px;
  transition: background 0.2s;
}
.btn-primary:hover:not(:disabled) { background: var(--color-primary-dark); }
.btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
.btn-ghost {
  background: transparent; border: 1px solid var(--color-border);
  color: var(--color-text-muted); padding: 8px 14px;
  border-radius: 8px; font-size: 13px;
}

/* Danger zone */
.danger-card { border-color: var(--color-red); }
.danger-card h3 { color: var(--color-red); }
.btn-danger {
  background: var(--color-red); color: #fff;
  font-weight: 700; padding: 11px 24px;
  border-radius: 10px; font-size: 14px;
  transition: opacity 0.2s;
}
.btn-danger:hover:not(:disabled) { opacity: 0.85; }
.btn-danger:disabled { opacity: 0.5; cursor: not-allowed; }
.reset-confirm { display: flex; flex-direction: column; gap: 12px; }
.reset-warning { font-size: 13px; color: var(--color-red); }

/* Init campaign */
.init-preview {
  background: var(--color-surface-2);
  border: 1px solid var(--color-border);
  border-radius: 10px; padding: 14px;
  display: flex; flex-direction: column; gap: 8px;
}
.preview-label { font-size: 11px; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.4px; }
.winner-nums { display: flex; flex-wrap: wrap; gap: 8px; }
.winner-pairs { display: flex; flex-direction: column; gap: 8px; }
.winner-pair { display: flex; align-items: center; gap: 8px; }
.pair-arrow { color: var(--color-text-muted); font-size: 14px; }
.winner-badge {
  background: rgba(16,185,129,0.15);
  border: 1px solid var(--color-green);
  color: var(--color-green);
  padding: 4px 12px; border-radius: 20px;
  font-size: 14px; font-weight: 700;
}
.activation-badge {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  color: var(--color-text-muted);
  padding: 4px 10px; border-radius: 20px;
  font-size: 12px;
}
</style>
