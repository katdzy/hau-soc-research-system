// Dev server only (vite.config.js): the endpoint behind the test panel's Spawn
// tab on a LIVE Firebase project. The panel works out the change in the browser
// (the same spawn.js transforms as on the local store) and posts it here as
// `{ changes, password }` (spawn.js diffStores); this applies it with the
// admin key in .secrets/ — real logins, email verified, for new accounts.
//
// Only for a dev server pointed at a live project (not the emulators, never in
// a build). The caller must send the ID token of a signed-in, verified
// institutional account, and every change must touch dummy data only
// (core.mjs checkChanges): real accounts and groups are never changed.

import { pathToFileURL } from 'node:url'
import { connect, checkChanges, applyChanges, updateList } from './core.mjs'

const INSTITUTIONAL = /@(student\.)?hau\.edu\.ph$/i
const MAX_BODY = 2 * 1024 * 1024

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const parts = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY) { reject(new Error('Request too large.')); req.destroy() }
      else parts.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(parts).toString('utf8')))
    req.on('error', reject)
  })
}

export function liveSpawnPlugin() {
  return {
    name: 'hausoc-live-spawn',
    apply: 'serve',
    configureServer(server) {
      const env = server.config.env
      if (env.VITE_BACKEND !== 'firebase' || env.VITE_USE_EMULATORS === 'true') return
      const root = pathToFileURL(`${server.config.root}/`)

      server.middlewares.use('/__live-spawn', async (req, res) => {
        const send = (status, body) => {
          res.statusCode = status
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify(body))
        }
        if (req.method !== 'POST') return send(405, { error: 'POST only.' })
        try {
          const { db, auth } = connect(root, env.VITE_FIREBASE_PROJECT_ID)
          const token = String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '')
          const caller = token ? await auth.verifyIdToken(token).catch(() => null) : null
          if (!caller?.email_verified || !INSTITUTIONAL.test(caller.email ?? '')) {
            return send(401, { error: 'Sign in with a verified institutional account first (People).' })
          }
          const { changes, password } = JSON.parse(await readBody(req))
          await checkChanges(db, changes)
          const result = await applyChanges(db, auth, changes, password)
          updateList(root, result)
          server.config.logger.info(`[live-spawn] ${caller.email}: +${result.created} ~${result.updated} −${result.deleted} documents, +${result.logins} −${result.removedLogins} logins`)
          send(200, { created: result.created, updated: result.updated, deleted: result.deleted, logins: result.logins, removedLogins: result.removedLogins })
        } catch (e) {
          send(400, { error: e.message })
        }
      })
    },
  }
}
