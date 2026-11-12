const { availableParallelism } = require('node:os');
const { transformIgnorePatterns } = require('jest-expo/jest-preset');

/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  // Jest defaults to one worker per CPU thread minus one. Every worker loads
  // the React Native environment and, on a cold cache, transforms the same
  // modules, so on a 16-core / 32-thread machine 31 workers were slower than 8
  // and pushed the first render in a file past the 5-second test timeout.
  // Machines with fewer than 9 threads keep Jest's default.
  maxWorkers: Math.min(8, Math.max(availableParallelism() - 1, 1)),
  // The preset sends every react-native* file through Babel. These two already
  // ship as plain CommonJS, yet took about 30% of a cold run's transform time,
  // repeated in every worker.
  transformIgnorePatterns: [
    ...transformIgnorePatterns,
    '/node_modules/react-native-svg/lib/commonjs/',
    '/node_modules/react-native/Libraries/Renderer/implementations/',
  ],
  clearMocks: true,
  restoreMocks: true,
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '^lucide-react-native/icons/(.*)$': '<rootDir>/node_modules/lucide-react-native/dist/cjs/icons/$1.js',
  },
  testEnvironmentOptions: {
    customExportConditions: ['require', 'react-native'],
  },
  // Deliberately does NOT use the `<rootDir>` tag: Jest's Windows glob
  // normalization (replacePathSepForGlob) converts `\` to `/` everywhere
  // except when followed by one of `$()+.?^{}` — so a rootDir containing a
  // dot-directory segment (e.g. a git worktree under `.claude/worktrees/…`)
  // leaves one literal backslash before that segment, which no longer
  // matches the forward-slash-normalized candidate file paths and silently
  // yields zero test matches. A `**/`-anchored relative glob sidesteps the
  // rootDir substitution entirely and matches the same file set.
  testMatch: ['**/src/**/__tests__/**/*-test.[jt]s?(x)'],
  watchman: false,
};
