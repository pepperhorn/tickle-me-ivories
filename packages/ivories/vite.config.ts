/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [react()],
  test: {
    name: 'ivories', environment: 'jsdom', globals: true, setupFiles: ['./src/test-setup.ts'],
    // pepperscore is an optional peer and not installed here (R9): tests resolve a stub.
    alias: { pepperscore: fileURLToPath(new URL('./src/react/notation/pepperscore.stub.ts', import.meta.url)) },
  },
})
