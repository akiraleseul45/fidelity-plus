/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  setupFiles: ['<rootDir>/tests/setupEnv.js'],
  // Isolate DB per test file via DB_PATH env.
  clearMocks: true,
  testTimeout: 10000,
};
