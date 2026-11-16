import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const contractPath = new URL('../src/lib/keiko-api/openapi.yaml', import.meta.url);
const metadataPath = new URL('../src/lib/keiko-api/metadata.ts', import.meta.url);
const [contract, metadata] = await Promise.all([
  readFile(contractPath),
  readFile(metadataPath, 'utf8'),
]);
const expected = metadata.match(/sourceSha256: '([a-f0-9]{64})'/)?.[1];
const actual = createHash('sha256').update(contract).digest('hex');
if (!expected || actual !== expected) {
  console.error(`Pinned Keiko contract checksum mismatch: expected ${expected ?? 'missing'}, got ${actual}`);
  process.exitCode = 1;
} else {
  console.log(`Pinned Keiko contract verified (${actual}).`);
}
