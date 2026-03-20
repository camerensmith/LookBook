/** @type {import('jest').Config} */
module.exports = {
    testEnvironment: 'jsdom',
    testMatch: ['**/tests/**/*.test.js'],
    collectCoverageFrom: ['app.js'],
    coverageDirectory: 'coverage',
    coverageReporters: ['text', 'lcov'],
};
