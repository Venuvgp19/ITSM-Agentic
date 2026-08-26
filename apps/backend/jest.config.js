// Minimal Jest config for this backend -- jest/ts-jest/@nestjs/testing were
// already installed as dependencies but never wired up (no config existed, zero
// *.spec.ts files anywhere in apps/backend before servicenow.service.spec.ts).
// Kept intentionally small; extend as more spec files are added.
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  moduleFileExtensions: ['js', 'json', 'ts'],
};
