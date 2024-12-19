import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Enable global test APIs like describe, it, expect
    globals: true,
    // Include source files for coverage
    include: ['**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    // Configure coverage collection
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/**', 'dist/**'],
    },
    // Environment setup
    environment: 'node',
  },
})
