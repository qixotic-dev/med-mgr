module.exports = {
  displayName: 'rx-order-manager',
  preset: '../../jest.preset.js',
  // Prefer packages' "browser" export condition for ESM resolution, matching
  // where this app actually runs. Note this has no effect on CommonJS
  // `require()` resolution as of Jest 30: jest-runtime now always adds
  // "node" to the CJS condition set regardless of this override, so
  // @angular/fire/firebase's Node-platform build still loads under `require`
  // — see the `fetch` polyfill in test-setup.ts for how that's handled.
  testEnvironmentOptions: {
    customExportConditions: ['browser'],
  },
  setupFilesAfterEnv: ['<rootDir>/src/test-setup.ts'],
  coverageDirectory: '../../coverage/apps/rx-order-manager',
  transform: {
    '^.+\\.(ts|mjs|js|html)$': [
      'jest-preset-angular',
      {
        tsconfig: '<rootDir>/tsconfig.spec.json',
        stringifyContentPathRegex: '\\.(html|svg)$',
      },
    ],
  },
  transformIgnorePatterns: ['node_modules/(?!.*\\.mjs$)'],
  snapshotSerializers: [
    'jest-preset-angular/build/serializers/no-ng-attributes',
    'jest-preset-angular/build/serializers/ng-snapshot',
    'jest-preset-angular/build/serializers/html-comment',
  ],
};
