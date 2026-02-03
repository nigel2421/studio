const nextJest = require('next/jest')

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files in your test environment
  dir: './',
})

// Add any custom config to be passed to Jest
const customJestConfig = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testEnvironment: 'jest-environment-jsdom',
  moduleDirectories: ['node_modules', '<rootDir>/'],
  moduleNameMapper: {
    '^yaml$': '<rootDir>/node_modules/yaml/dist/index.js',
    '^jsonpath-plus$': '<rootDir>/node_modules/jsonpath-plus/dist/index-node-cjs.cjs',
    '^jspdf$': '<rootDir>/node_modules/jspdf/dist/jspdf.node.min.js',
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  transformIgnorePatterns: [
    'node_modules/(?!(yaml|genkit|@genkit-ai|dotprompt|jsonpath-plus)/)',
  ],
  modulePathIgnorePatterns: ['<rootDir>/functions/'],
}

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
module.exports = createJestConfig(customJestConfig)
