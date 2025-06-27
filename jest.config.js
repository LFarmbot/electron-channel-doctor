module.exports = {
    testEnvironment: 'node',
    collectCoverage: true,
    coverageDirectory: 'coverage',
    coveragePathIgnorePatterns: [
        '/node_modules/',
        '/examples/',
        '/test/'
    ],
    testMatch: [
        '**/test/**/*.test.js'
    ],
    verbose: true
}; 