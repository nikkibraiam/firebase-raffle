// Grants the { admin: true } custom claim to an existing Firebase Auth user of
// your own project. Needs Application Default Credentials with access to it:
//
//   gcloud auth application-default login
//   node scripts/set-admin.mjs <project-id> <email>

import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'

const [projectId, email] = process.argv.slice(2)
if (!projectId || !email) {
  console.error('Usage: node scripts/set-admin.mjs <project-id> <email>')
  process.exit(1)
}

initializeApp({ projectId })
const user = await getAuth().getUserByEmail(email)
await getAuth().setCustomUserClaims(user.uid, { ...user.customClaims, admin: true })
console.log(`${email} is now an admin of ${projectId}. Sign out and in again to refresh the token.`)
