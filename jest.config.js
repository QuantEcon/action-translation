/** @type {import('ts-jest').JestConfigWithTsJest} */
export default {
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  transform: {
    // ts-jest compiles TS to CJS for test execution regardless of tsconfig module setting.
    // This avoids ESM issues with __dirname, jest globals, etc. in tests.
    '^.+\\.ts$': ['ts-jest', {
      useESM: false,
      tsconfig: {
        // Override module to CJS for tests — the source tsconfig uses node16/ESM
        module: 'commonjs',
        moduleResolution: 'node',
      },
    }],
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.test.ts',
    '!src/**/*.d.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  // Strip .js extensions from imports so CJS require() resolves correctly
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
};
