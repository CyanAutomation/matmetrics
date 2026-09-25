import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';

import { validateSkills } from './skill-metadata-validation';

function main(): void {
  const repoRoot = process.cwd();
  const skillsRoot = join(repoRoot, '.github', 'skills');
  const diagnostics = validateSkills(skillsRoot, repoRoot);
  const errors = diagnostics.filter((item) => item.severity === 'error');
  const warnings = diagnostics.filter((item) => item.severity === 'warning');

  if (diagnostics.length === 0) {
    console.log('All skill metadata and local Markdown links are valid.');
    return;
  }

  for (const diagnostic of diagnostics) {
    const label = diagnostic.severity.toUpperCase();
    console.log(`${label} ${diagnostic.path}: ${diagnostic.message}`);
  }

  console.log(
    `Checked skills: ${errors.length} error(s), ${warnings.length} warning(s).`
  );

  if (errors.length > 0) {
    process.exitCode = 1;
  }
}

if (
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}

export { main as validateSkillMetadataMain };
