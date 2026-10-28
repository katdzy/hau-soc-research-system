// Load the demo seed (§6 personas, G1–G4, NPCs) into the LIVE Firebase project
// named in .env, so uploads and cross-role reflection can be tested there.
//
//   node scripts/live-seed/seed-live.mjs              dry run: counts only, no network
//   node scripts/live-seed/seed-live.mjs --confirm-live   writes to the live project
//
// It never wipes: it refuses if the project already has users. It needs the
// temporary test rules published first (the real firestore.rules deny client writes).

import { readFileSync } from 'node:fs'
import { initializeApp } from 'firebase/app'
import { getFirestore, collection, getDocs, limit, query, writeBatch, doc } from 'firebase/firestore'
import { buildSeed } from '../../src/backend/seed.js'
import { COLLECTIONS } from '../../src/backend/schema.js'

const env = Object.fromEntries(
  readFileSync(new URL('../../.env', import.meta.url), 'utf8')
    .split('\n')
    .map(l => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/))
    .filter(Boolean)
    .map(([, k, v]) => [k, v.replace(/^['"]|['"]$/g, '')]),
)

const seed = buildSeed()
const rows = COLLECTIONS.map(name => [name, Object.values(seed[name] ?? {})]).filter(([, r]) => r.length)
const total = rows.reduce((n, [, r]) => n + r.length, 0)

console.log(`Project: ${env.VITE_FIREBASE_PROJECT_ID}`)
for (const [name, r] of rows) console.log(`  ${name.padEnd(22)} ${r.length}`)
console.log(`  ${'total'.padEnd(22)} ${total}`)

if (!process.argv.includes('--confirm-live')) {
  console.log('\nDry run. Add --confirm-live to write these documents.')
  process.exit(0)
}

const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  appId: env.VITE_FIREBASE_APP_ID,
})
const db = getFirestore(app)

const existing = await getDocs(query(collection(db, 'users'), limit(1)))
if (!existing.empty) {
  console.error('\nThe project already has users. Refusing to write over live data.')
  process.exit(1)
}

const BATCH_LIMIT = 400
for (const [name, r] of rows) {
  for (let i = 0; i < r.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db)
    r.slice(i, i + BATCH_LIMIT).forEach(row => batch.set(doc(db, name, row.id), row))
    await batch.commit()
  }
  console.log(`wrote ${name}`)
}
console.log(`\nDone: ${total} documents.`)
process.exit(0)
