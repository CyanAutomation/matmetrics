#!/usr/bin/env node

/**
 * Convert character PNG images to WebP for better web delivery
 * Processes both Ressa and Dr. Log characters
 * Usage: node scripts/convert-images.js
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

async function convertCharacterImages(name, pattern) {
  const sourceDir = path.join(__dirname, `../design/${name}`);
  const targetDir = path.join(__dirname, `../public/images/${name}`);

  if (!fs.existsSync(sourceDir)) {
    console.log(`⊘ Skipped ${name}: design directory not found`);
    return;
  }

  try {
    // Create target directory if it doesn't exist
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const pngFiles = fs
      .readdirSync(sourceDir)
      .filter((file) => file.match(pattern));

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
        fs.copyFileSync(sourcePath, pngOutputPath);
        console.log(`✓ Copied ${file} (fallback)`);
      } catch (err) {
        console.error(`✗ Error converting ${file}:`, err.message);
      }
    }

    console.log(`✓ ${name} conversion complete!`);
  } catch (err) {
    console.error(`Error processing ${name}:`, err);
  }
}

async function convertAllCharacters() {
  try {
    // Convert Ressa character
    await convertCharacterImages('ressa', /^ressa-pose-\d+\.png$/);

    // Convert Dr. Log character
    await convertCharacterImages('drlog', /^drlog-pose-\d+\.png$/);

    console.log('\n✓ All image conversions complete!');
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

convertAllCharacters();
