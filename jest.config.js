/** @type {import('ts-jest').JestConfigWithTsJest} */
export default {
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  transform: {
    // ts-jest compiles TS/TSX to CJS for test execution regardless of tsconfig module setting.
    // This avoids ESM issues with __dirname, jest globals, etc. in tests.
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: false,
        tsconfig: {
          // Override module to CJS for tests — the source tsconfig uses node16/ESM
          module: 'commonjs',
          moduleResolution: 'node',
          jsx: 'react-jsx',
        },
      },
    ],
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.test.ts', '!src/**/*.d.ts'],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  // Strip .js extensions from imports so CJS require() resolves correctly.
  // @actions/github@8 pulls ESM-only @octokit/* majors that Jest's CJS
  // registry cannot require() (runtime Node >= 22 can) — map it to a stub;
  // tests always replace the private octokit field with a fake anyway.
  moduleNameMapper: {
    '^@actions/github$': '<rootDir>/src/test-support/actions-github-stub.ts',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
};
