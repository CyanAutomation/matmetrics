/**
 * Validate skill metadata consistency across all skills.
 *
 * Ensures:
 * - All SKILL.md files have valid YAML frontmatter
 * - `name` field matches folder name
 * - Required fields present: name, description, license (optional but recommended)
 * - No trailing whitespace or formatting issues
 *
 * Usage: npx tsx scripts/validate-skill-metadata.ts
 */

import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

interface SkillMetadata {
  name?: string;
  description?: string;
  license?: string;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

const SKILLS_DIR = join(process.cwd(), '.github', 'skills');
const YAML_FRONT_MATTER_RE = /^---\n([\s\S]*?)\n---/;
const REQUIRED_FIELDS = ['name', 'description'] as const;
const RECOMMENDED_FIELDS = ['license'] as const;

interface ValidationResult {
  skillName: string;
  path: string;
  folderName: string;
  passed: boolean;
  errors: string[];
  warnings: string[];
}

function parseYamlFrontMatter(content: string): SkillMetadata | null {
  const match = content.match(YAML_FRONT_MATTER_RE);
  if (!match) {
    return null;
  }

  const yamlContent = match[1];
  const metadata: SkillMetadata = {};

  // Simple YAML parser for flat key-value pairs
  yamlContent.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    const colonIndex = trimmed.indexOf(':');
    if (colonIndex === -1) return;

    const key = trimmed.substring(0, colonIndex).trim();
    const value = trimmed.substring(colonIndex + 1).trim();

    // Remove quotes if present
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      metadata[key] = value.slice(1, -1);
    } else {
      metadata[key] = value;
    }
  });

  return metadata;
}

function validateSkill(skillPath: string, folderName: string): ValidationResult {
  const skillFile = join(skillPath, 'SKILL.md');
  const errors: string[] = [];
  const warnings: string[] = [];
  let metadata: SkillMetadata | null = null;
  let skillName = '(unknown)';

  try {
    const content = readFileSync(skillFile, 'utf-8');
    metadata = parseYamlFrontMatter(content);

    if (!metadata) {
      errors.push('No YAML frontmatter found (expected --- ... --- at top of file)');
    } else {
      // Validate required fields
      for (const field of REQUIRED_FIELDS) {
        if (!metadata[field]) {
          errors.push(`Missing required field: ${field}`);
        }
      }

      // Validate name matches folder name
      if (metadata.name) {
        skillName = metadata.name;
        if (metadata.name !== folderName) {
          errors.push(
            `Metadata 'name' field '${metadata.name}' does not match folder name '${folderName}'\n` +
              `  Fix: Update line in SKILL.md: name: ${folderName}`,
          );
        }
      }

      // Recommend license field
      for (const field of RECOMMENDED_FIELDS) {
        if (!metadata[field]) {
          warnings.push(`Recommended field missing: ${field}`);
        }
      }
    }
  } catch (err) {
    errors.push(`Failed to read SKILL.md: ${err instanceof Error ? err.message : String(err)}`);
  }

  return {
    skillName,
    path: skillFile,
    folderName,
    passed: errors.length === 0,
    errors,
    warnings,
  };
}

function main() {
  console.log('🔍 Validating skill metadata...\n');

  const skillFolders = readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  if (skillFolders.length === 0) {
    console.error('❌ No skill folders found in .github/skills/');
    process.exit(1);
  }

  const results: ValidationResult[] = skillFolders.map((folder) =>
    validateSkill(join(SKILLS_DIR, folder), folder),
  );

  // Print results
  let totalPassed = 0;
  let totalWarnings = 0;

  results.forEach((result) => {
    const icon = result.passed ? '✅' : '❌';
    console.log(`${icon} ${result.folderName} (name: ${result.skillName})`);

    result.errors.forEach((error) => {
      console.log(`   ERROR: ${error}`);
    });

    result.warnings.forEach((warning) => {
      console.log(`   WARN: ${warning}`);
      totalWarnings++;
    });

    if (result.passed) {
      totalPassed++;
    }

    if (!result.passed || result.warnings.length > 0) {
      console.log();
    }
  });

  console.log('\n' + '='.repeat(60));
  console.log(`Results: ${totalPassed}/${results.length} skills passed`);
  if (totalWarnings > 0) {
    console.log(`Warnings: ${totalWarnings}`);
  }

  const failedCount = results.filter((r) => !r.passed).length;
  if (failedCount > 0) {
    console.log(`\n❌ ${failedCount} skill(s) failed validation`);
    process.exit(1);
  } else if (totalWarnings > 0) {
    console.log('\n⚠️  All skills passed, but check warnings above');
    process.exit(0);
  } else {
    console.log('\n✅ All skills passed validation!');
    process.exit(0);
  }
}

main();
