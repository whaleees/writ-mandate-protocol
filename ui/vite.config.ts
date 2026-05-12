import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@sdk': path.resolve(__dirname, '../sdk/src'),
    },
  },
  define: {
    'process.env': '{}',
    global: 'globalThis',
  },
  optimizeDeps: {
    esbuildOptions: {
      define: { global: 'globalThis' },
    },
    include: ['buffer'],
  },
})
