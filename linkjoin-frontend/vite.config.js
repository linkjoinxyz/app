import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// VITE_PROXY_TARGET points the dev server at a different backend (e.g. a
// throwaway local one) without editing this file.
const API_TARGET = process.env.VITE_PROXY_TARGET || 'http://localhost:8000'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: API_TARGET,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/ws': {
        target: API_TARGET.replace('http','ws'),
        ws: true,
        changeOrigin: true,
      },
    },
  },
})
