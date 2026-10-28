import { defineConfig } from 'vitest/config'

// Tests sit in __tests__ beside the code; nothing else is collected.
const ARTIFACTS = ['**/node_modules/**', '**/dist/**', '**/coverage/**', '**/.turbo/**', '**/.cache/**']

// Turbo runs four packages at once, so one worker per core would swamp the machine.
const MAX_WORKERS = 4

const TEST_LOGS = process.env.TEST_LOGS

export default defineConfig({
  test: {
    coverage: {
      exclude: [...ARTIFACTS, '**/__tests__/**', '**/*.config.*'],
      provider: 'v8',
      reporter: ['text', 'lcov'],
    },
    exclude: ARTIFACTS,
    // Each package keeps its own: turbo runs them at once, and a shared one at the root is wiped by one
    // run while another is writing to it (ENOTEMPTY).
    fsModuleCachePath: 'node_modules/.vitest-cache',
    include: ['src/**/__tests__/**/*.test.ts'],
    maxWorkers: MAX_WORKERS,
    passWithNoTests: true,
    restoreMocks: true,
    silent: TEST_LOGS === 'failed' ? 'passed-only' : TEST_LOGS !== '1',
    testTimeout: 20_000,
  },
})
