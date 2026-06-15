import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api-openai': {
        target: 'https://api.openai.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-openai/, ''),
        headers: {
          Referer: 'https://api.openai.com',
          Origin: 'https://api.openai.com',
        }
      },
      '/api-openrouter': {
        target: 'https://openrouter.ai',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-openrouter/, ''),
        headers: {
          Referer: 'https://openrouter.ai',
          Origin: 'https://openrouter.ai',
        }
      },
      '/api-gemini': {
        target: 'https://generativelanguage.googleapis.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-gemini/, ''),
        headers: {
          Referer: 'https://generativelanguage.googleapis.com',
          Origin: 'https://generativelanguage.googleapis.com',
        }
      }
    }
  }
})
