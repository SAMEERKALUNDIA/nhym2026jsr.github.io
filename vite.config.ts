import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'
import { aifBridge } from './plugins/bridge/index.ts'

// Locked file: the runner and the publisher depend on this shape. Hosts and the
// HMR port come from the environment, never from a site's edits.
const allowedHosts = (process.env.AIF_ALLOWED_HOSTS ?? '').split(',').filter(Boolean)

const root = fileURLToPath(new URL('.', import.meta.url)).replace(/\/$/, '')

export default defineConfig(({ command }) => {
  const dev = command === 'serve'
  return {
  // In dev, JSX routes through a shim that stamps each DOM element with its
  // source location; production uses React's own runtime, so no tag ships.
  plugins: [
    react(dev ? { jsxImportSource: '@aif/jsx' } : {}),
    tailwindcss(),
    ...(dev ? [aifBridge()] : []),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@aif/jsx': fileURLToPath(new URL('./plugins/bridge/jsx', import.meta.url)),
    },
  },
  define: {
    // The badge is the edge's. This stays false rather than going away: a site
    // committed before that move still carries a main.tsx reading it, and this
    // file is the template's on every build, so the bundle would throw.
    __AIF_BADGE__: JSON.stringify(false),
    __AIF_ROOT__: JSON.stringify(root),
  },
  server: {
    host: true,
    port: 5173,
    allowedHosts: allowedHosts.length > 0 ? allowedHosts : undefined,
    // The preview is framed from an https origin, so the HMR socket has to be
    // told the public port rather than guessing 5173.
    hmr: { clientPort: 443, protocol: 'wss' },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    // The real budget is gzip and the runner enforces it; this only silences
    // the vendor chunk, whose raw size is React's floor.
    chunkSizeWarningLimit: 300,
    rollupOptions: {
      output: {
        // Icons are shared across routes, so their own chunk is cached once
        // rather than duplicated into every route chunk that imports one.
        manualChunks: (id: string) => {
          if (/node_modules\/(react|react-dom|react-router|scheduler)\//.test(id)) return 'react'
          if (/node_modules\/lucide-react\//.test(id)) return 'icons'
          return undefined
        },
      },
    },
  },
  }
})
