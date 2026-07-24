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
          // The root tsconfig sets isolatedModules: true for esbuild's file-by-file
          // compile; ts-jest reads it as "transpile only" and skips type-checking
          // the whole test suite. Force full diagnostics here — tests only.
          isolatedModules: false,
          // ink v4 is ESM-only with an exports-only package.json, invisible to the
          // node10 resolution this CJS override pins. Point type resolution at its
          // real types; runtime is unaffected (tests never execute the ink path).
          paths: {
            ink: ['./node_modules/ink/build/index.d.ts'],
          },
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
