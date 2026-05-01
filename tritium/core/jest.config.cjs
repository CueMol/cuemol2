/**
 * Jest configuration for CueMol Node.js bindings tests
 */

// export default {
module.exports = {
  preset: 'ts-jest',

  // Test environment - Node.js for C++ addon testing
  testEnvironment: 'node',

  // Supported file extensions
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs'],

  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        useESM: true,
      },
    ],
  },
  
  // Test file patterns - matches both current and qlib/ subdirectory structure
  testMatch: [
    '<rootDir>/src/tests/**/*.test.{js,ts}',
    '<rootDir>/src/tests/**/*.spec.js',
  ],
  
  // Files and directories to ignore
  testPathIgnorePatterns: [
    '/node_modules/',
    '/build/',
    '/dist/',
    '/cxx_src/',
  ],
  
  // Module paths - helps with imports
  modulePaths: [
    '<rootDir>/src',
  ],
  
  // Coverage configuration
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/tests/**',           // Exclude test files
    '!src/test_run.js',        // Exclude test runner script
    '!src/wrappers/**',        // Exclude generated wrappers (optional)
  ],
  
  // Coverage output directory
  coverageDirectory: 'coverage',
  
  // Coverage reporters
  coverageReporters: [
    'text',
    'text-summary',
    'html',
    'lcov',
  ],
  
  // Optional coverage thresholds - uncomment and adjust as needed
  // coverageThresholds: {
  //   global: {
  //     branches: 70,
  //     functions: 70,
  //     lines: 70,
  //     statements: 70,
  //   },
  // },
  
  // Display individual test results with the test suite hierarchy
  verbose: true,
  
  // The maximum amount of workers used to run tests
  // Set to 1 for debugging C++ crashes to get sequential execution
  // maxWorkers: 1,
  
  // Automatically clear mock calls and instances between every test
  clearMocks: true,
  
  // Indicates whether the coverage information should be collected while executing the test
  // collectCoverage: false,
  
  // The test environment will be torn down after all tests in a suite have finished
  // testEnvironmentOptions: {},
  
  // Setup files to run after the test framework has been installed
  // Uncomment if you need global test setup
  // setupFilesAfterEnv: ['<rootDir>/src/tests/jest.setup.js'],
  
  // Global setup/teardown for CueMol initialization (if needed)
  // globalSetup: '<rootDir>/src/tests/global-setup.js',
  // globalTeardown: '<rootDir>/src/tests/global-teardown.js',
  
  // Fail tests on console warnings/errors (optional)
  // This can help catch issues but may be too strict for some tests
  // setupFilesAfterEnv: ['<rootDir>/src/tests/console-fail.js'],
  
  // Test timeout in milliseconds (default: 5000)
  // Increase if tests interact with slow C++ operations
  testTimeout: 30000,
  
  // Module name mapper for path aliases (optional)
  // Path aliases (keep in sync with tsconfig.json "paths")
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@tests/(.*)$': '<rootDir>/src/tests/$1',
  },
  
  // Bail out after the first test failure
  // Useful for debugging - stops on first error
  // bail: 1,
  
  // Run tests in band (sequentially) - useful for debugging C++ issues
  // This is equivalent to --runInBand or --maxWorkers=1
  // Uncomment for debugging:
  // maxWorkers: 1,
};
