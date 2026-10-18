#!/usr/bin/env node
// fallow-ignore-file unused-file
// Manual CLI utility; invoked directly with `node scripts/convert-images.ts`.

/**
 * Convert character PNG images to WebP for better web delivery
 * Processes both Ressa and Dr. Log characters
 * Usage: node scripts/convert-images.ts
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');

async function convertCharacterImages(
  name: string,
  pattern: RegExp
): Promise<void> {
  const sourceDir = path.join(repositoryRoot, 'design', name);
  const targetDir = path.join(repositoryRoot, 'public', 'images', name);

  if (!existsSync(sourceDir)) {
    console.log(`⊘ Skipped ${name}: design directory not found`);
    return;
  }

  try {
    // Create target directory if it doesn't exist
    if (!existsSync(targetDir)) {
      mkdirSync(targetDir, { recursive: true });
    }

    const pngFiles = readdirSync(sourceDir).filter((file) => pattern.test(file));

    if (pngFiles.length === 0) {
      console.log(`⊘ No files found for ${name} matching pattern`);
      return;
    }

    console.log(`\nProcessing ${name}...`);
    console.log(`Found ${pngFiles.length} PNG files to convert...`);

    for (const file of pngFiles) {
      const sourcePath = path.join(sourceDir, file);
      const baseName = file.replace('.png', '');
      const webpPath = path.join(targetDir, `${baseName}.webp`);
      const pngOutputPath = path.join(targetDir, file);

      try {
        // Convert to WebP
        await sharp(sourcePath).webp({ quality: 80 }).toFile(webpPath);
        console.log(`✓ Converted ${file} → ${baseName}.webp`);

        // Also copy PNG as fallback
        copyFileSync(sourcePath, pngOutputPath);
        console.log(`✓ Copied ${file} (fallback)`);
      } catch (err) {
        console.error(
          `✗ Error converting ${file}:`,
          err instanceof Error ? err.message : 'Unknown image conversion error'
        );
      }
    }

    console.log(`✓ ${name} conversion complete!`);
  } catch (error) {
    console.error(`Error processing ${name}:`, error);
  }
}

async function convertAllCharacters(): Promise<void> {
  try {
    // Convert Ressa character
    await convertCharacterImages('ressa', /^ressa-pose-\d+\.png$/);

    // Convert Dr. Log character
    await convertCharacterImages('drlog', /^drlog-pose-\d+\.png$/);

    console.log('\n✓ All image conversions complete!');
  } catch (error) {
    console.error('Error:', error);
    process.exitCode = 1;
  }
}

await convertAllCharacters();
