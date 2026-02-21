import { defineConfig } from 'vite'
import basicSsl from '@vitejs/plugin-basic-ssl'

export default defineConfig({
  plugins: [basicSsl()],
  resolve: {
    dedupe: ['three'],
  },
  server: {
    host: true,
  }
})
