

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jest-environment-jsdom',
  transform: {
    '^.+\\.[tj]sx?$': 'ts-jest',
  },
  moduleNameMapper: {
    '^@/components/(.*)$': '<rootDir>/src/components/$1',
    '^@/lib/(.*)$': '<rootDir>/src/lib/$1',
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  transformIgnorePatterns: [
    "/node_modules/(?!(@genkit-ai|genkit|dotprompt|yaml|jsonpath-plus)/)"
  ],
  clearMocks: true,
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  modulePathIgnorePatterns: [
    '<rootDir>/deployed2live/',
    '<rootDir>/.firebase/',
    '<rootDir>/functions/',
    '<rootDir>/src/functions/',
    '<rootDir>/dataconnect/',
    '<rootDir>/apphosting.*'
  ],
};
