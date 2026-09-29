import { readFile } from 'node:fs/promises';
import { evaluateThresholdInput } from './jev-threshold-evaluator';

async function run(): Promise<void> {
  const path = process.argv[2];
  if (!path) {
    throw new Error(
      'Usage: npm run jev:evaluate-thresholds -- /path/to/labeled-predictions.json'
    );
  }

  const contents = await readFile(path, 'utf8');
  const results = evaluateThresholdInput(JSON.parse(contents));
  console.log(JSON.stringify(results, null, 2));
}

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Evaluation failed');
  process.exitCode = 1;
});
