import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { port: 5180 },
  test: {
    // Never let a test reach Firebase, whatever .env says.
    env: { VITE_BACKEND: 'local', VITE_USE_EMULATORS: 'false' },
  },
})
