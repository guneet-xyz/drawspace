import { defineConfig } from 'vitest/config'
import base from './vitest.config'

if (!process.env.TEST_DATABASE_URL)
  throw new Error(
    'Set TEST_DATABASE_URL to a migrated, disposable test database.',
  )

export default defineConfig({
  resolve: base.resolve,
  test: {
    include: ['tests/integration/**/*.test.ts'],
    env: { DATABASE_URL: process.env.TEST_DATABASE_URL },
    fileParallelism: false,
  },
})
