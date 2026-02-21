import { defineConfig } from 'vite'
import basicSsl from '@vitejs/plugin-basic-ssl'

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/tinysaber/' : '/',
  plugins: [basicSsl()],
  resolve: {
    dedupe: ['three'],
  },
  server: {
    host: true,
  },
}))
