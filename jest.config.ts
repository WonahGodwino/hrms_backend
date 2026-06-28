import type { Config } from 'jest'
import nextJest from 'next/jest.js'

const createJestConfig = nextJest({ dir: './' })

const config: Config = {
  testEnvironment: 'node',
  testTimeout: 60000,
  // Each test file opens its own Prisma client/pg pool against the remote
  // Aiven DB; too many workers in parallel causes connection contention that
  // slows every query down rather than speeding the suite up.
  maxWorkers: 2,
  // Scoped to tests/ only — some *.test.ts files elsewhere in src/ (e.g.
  // period-filter.test.ts) are written for Node's built-in node:test runner,
  // not Jest, and would otherwise collide with Jest's default discovery.
  roots: ['<rootDir>/tests'],
  testPathIgnorePatterns: ['<rootDir>/.next/', '<rootDir>/node_modules/'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup-jest.ts'],
  // src/app/lib/prisma.ts owns its pg Pool outside the Prisma driver adapter,
  // so $disconnect() doesn't reliably close it — force exit rather than
  // hang waiting for a handle tests can't reach.
  forceExit: true,
  // next/jest's auto-generated moduleNameMapper only covers CSS/image/font
  // mocks, not the @/ path alias — static `import` statements still resolve
  // via the SWC transform, but jest.mock('@/...') passes the alias as a
  // runtime string that only Jest's own resolver sees, so it needs this.
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
}

export default createJestConfig(config)
