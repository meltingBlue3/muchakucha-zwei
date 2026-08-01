const { createRequire } = require('node:module');

const reactNativeEnvironment = require('jest-expo/jest-preset').testEnvironment;
const reactNativeEnvironmentRequire = createRequire(reactNativeEnvironment);
const { ModuleMocker } = reactNativeEnvironmentRequire('jest-mock');

if (typeof ModuleMocker.prototype.clearMocksOnScope !== 'function') {
  ModuleMocker.prototype.clearMocksOnScope = function clearMocksOnScope(scope) {
    for (const key of Object.keys(scope)) {
      const descriptor = Object.getOwnPropertyDescriptor(scope, key);
      if (descriptor == null || !('value' in descriptor)) {
        continue;
      }
      const value = descriptor.value;
      if (
        value != null &&
        (typeof value === 'object' || typeof value === 'function') &&
        '_isMockFunction' in value &&
        this.isMockFunction(value) &&
        typeof value.mockClear === 'function'
      ) {
        value.mockClear();
      }
    }
  };
}

/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  clearMocks: true,
  restoreMocks: true,
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '^lucide-react-native/icons/(.*)$': '<rootDir>/node_modules/lucide-react-native/dist/cjs/icons/$1.js',
  },
  // React Native 0.86's environment uses Jest 29's ModuleMocker. Jest 30 calls
  // this scoped cleanup hook, so add the forward-compatible no-secret shim.
  testEnvironment: reactNativeEnvironment,
  testEnvironmentOptions: {
    customExportConditions: ['require', 'react-native'],
  },
  testMatch: ['<rootDir>/src/**/__tests__/**/*-test.[jt]s?(x)'],
  watchman: false,
};
