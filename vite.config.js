import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import obfuscatorPlugin from 'vite-plugin-javascript-obfuscator'

const isProd = process.env.NODE_ENV === 'production'

export default defineConfig({
  server: { port: 5175, strictPort: true },
  plugins: [
    react(),
    isProd && obfuscatorPlugin({
      options: {
        compact: true,
        controlFlowFlattening: false,
        stringArray: false,
        renameGlobals: false,
        selfDefending: false,
        reservedStrings: [
          '^jspdf$', '^jspdf-autotable$', '^exceljs$', '^xlsx$',
          '^\\./', '^\\.\\./',
        ],
      },
    }),
  ].filter(Boolean),
  base: '/ICTlab/',
  build: {
    outDir: 'docs',
    sourcemap: false,
  },
})
