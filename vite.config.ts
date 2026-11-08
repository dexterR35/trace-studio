import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
const headers = { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'credentialless' }
export default defineConfig({ plugins: [react()], server: { headers }, preview: { headers }, optimizeDeps: { exclude: ['@imgly/background-removal'] }, build: { chunkSizeWarningLimit: 1400 } })
