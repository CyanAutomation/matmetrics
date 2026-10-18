#!/usr/bin/env node

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

try {
  require.resolve('tsx');
} catch {
  console.error(
    [
      'Missing required package: tsx.',
      'This project executes TypeScript scripts/tests with Node using --import tsx.',
      'Remediation: install devDependencies (for example: npm install) and avoid production-only installs (for example: npm ci --omit=dev).',
    ].join('\n')
  );
  process.exit(1);
}
