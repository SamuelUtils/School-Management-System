module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    roots: ['<rootDir>/tests'],
    testMatch: ['**/tests/**/*.test.ts', '**/tests/**/*.spec.ts'],
    moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
    moduleNameMapper: { // To match tsconfig paths
      '^@/(.*)$': '<rootDir>/src/$1'
    },
    collectCoverage: true,
    testTimeout: 15000,
    coverageDirectory: "coverage",
    coverageProvider: "v8", // or "babel"
    setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'] // For global setup/teardown
  };