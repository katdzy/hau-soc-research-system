// Security-rules tests: run against the emulators started by `docker compose up`.
//
//   npm run test:rules
//
// They load the real storage.rules into the running Storage emulator, and put
// the open emulator rules back when they finish, so the app keeps working.
// Their files go to their own bucket (gs://demo-local) and their Firestore
// documents (projects/rules_*) are removed afterwards; the app's data is left
// alone.

import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['rules-tests/**/*.test.js'],
    environment: 'node',
    // One emulator, one rule set at a time.
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 30000,
  },
})
