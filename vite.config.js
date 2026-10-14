import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  test: {
    // Rules and function tests share one emulator database.
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
})
