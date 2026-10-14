import base from '@duck-diff/vitest-config'
import react from '@vitejs/plugin-react'
import { defineConfig, mergeConfig } from 'vitest/config'

export default mergeConfig(
  base,
  defineConfig({
    plugins: [react()],
    test: { environment: 'jsdom', include: ['src/**/__tests__/**/*.test.{ts,tsx}'], setupFiles: ['src/test-setup.ts'] },
  }),
)
