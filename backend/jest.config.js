/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  forceExit: true,
  testTimeout: 30000,
  // Default: run only unit tests (not integration)
  testMatch: ['**/tests/*.test.js'],
  // Global mocks for Redis / BullMQ so unit tests never open real connections
  moduleNameMapper: {},
  // Setup file to silence noisy connection errors during unit tests
  globalSetup: undefined,
  // Collect coverage from source files only
  collectCoverageFrom: ['src/**/*.js'],
  coverageDirectory: 'coverage',
  // Verbose output for CI
  verbose: true,
};
