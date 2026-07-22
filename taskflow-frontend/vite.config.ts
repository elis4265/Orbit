import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { visualizer } from 'rollup-plugin-visualizer'

export default defineConfig({
  plugins: [
    react(),
    visualizer({ filename: 'reports/bundle-stats.html', gzipSize: true }),
  ],
  server: {
    proxy: {
      '/api': { target: 'http://localhost:8000', changeOrigin: true, ws: true },
      '/ws': { target: 'ws://localhost:1234', ws: true, changeOrigin: true, rewrite: (p) => p.replace(/^\/ws/, '') },
    },
  },
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-tanstack': ['@tanstack/react-query'],
          'vendor-tiptap': [
            '@tiptap/react',
            '@tiptap/starter-kit',
            '@tiptap/extension-collaboration',
            '@tiptap/extension-image',
            '@tiptap/extension-mention',
            '@hocuspocus/provider',
            'yjs',
            'prosemirror-view',
            'prosemirror-codemirror-6',
          ],
          'vendor-codemirror': [
            'codemirror',
            '@codemirror/language-data',
            '@codemirror/theme-one-dark',
          ],
          'vendor-charts': ['recharts'],
          'vendor-dnd': ['@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities'],
        },
      },
    },
  },
})
