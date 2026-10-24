/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

/** Every bare import stays external: peers (react, pepperscore) and runtime deps (tonal, ...). */
const isExternal = (id: string) =>
  !id.startsWith('.') && !id.startsWith('/') && !id.startsWith('\0') && !/^[A-Za-z]:[\\/]/.test(id)

export default defineConfig({
  plugins: [react()],
  build: {
    lib: { entry: { index: 'src/index.ts', core: 'src/core/index.ts' }, formats: ['es'] },
    rolldownOptions: { external: isExternal },
    sourcemap: true,
    emptyOutDir: true,
    copyPublicDir: false,
  },
  test: {
    name: 'ivories',
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    // The reader (bare 'pepperscore': Verovio, workers) resolves a stub in jsdom; 'pepperscore/audio' is the real one.
    alias: [{ find: /^pepperscore$/, replacement: fileURLToPath(new URL('./src/react/notation/pepperscore.stub.ts', import.meta.url)) }],
  },
})
