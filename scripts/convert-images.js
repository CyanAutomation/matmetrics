#!/usr/bin/env node

/**
 * Convert Ressa PNG images to WebP for better web delivery
 * Usage: node scripts/convert-images.js
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const sourceDir = path.join(__dirname, '../design/ressa');
const targetDir = path.join(__dirname, '../public/images/ressa');

async function convertImages() {
  try {
    // Create target directory if it doesn't exist
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const pngFiles = fs
      .readdirSync(sourceDir)
      .filter((file) => file.match(/^ressa-pose-\d+\.png$/));

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

    console.log('\n✓ Image conversion complete!');
    console.log(`  WebP files: ${targetDir}/ressa-pose-*.webp`);
    console.log(`  PNG fallbacks: ${targetDir}/ressa-pose-*.png`);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

convertImages();
