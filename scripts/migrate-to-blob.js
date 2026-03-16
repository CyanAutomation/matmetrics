#!/usr/bin/env node

/**
 * Migration script: Copy markdown files from data/ directory to Vercel Blob Storage
 * 
 * Usage:
 *   VERCEL_BLOB_READ_WRITE_TOKEN=... node scripts/migrate-to-blob.js
 * 
 * This script:
 * 1. Scans the data/ directory for markdown files
 * 2. Reads each file and validates the frontmatter
 * 3. Uploads to Vercel Blob Storage using the same path structure
 * 4. Reports migration progress and any errors
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { put, list } from '@vercel/blob';
import matter from 'gray-matter';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const VERCEL_BLOB_TOKEN = process.env.VERCEL_BLOB_READ_WRITE_TOKEN;
const DATA_DIR = path.join(__dirname, '..', 'data');
const SESSIONS_PREFIX = 'sessions/';

// Validate environment
if (!VERCEL_BLOB_TOKEN) {
  console.error('❌ Error: VERCEL_BLOB_READ_WRITE_TOKEN environment variable not set');
  process.exit(1);
}

/**
 * Recursively find all markdown files in a directory
 */
function findMarkdownFiles(dir, files = []) {
  if (!fs.existsSync(dir)) {
    return files;
  }

  const items = fs.readdirSync(dir);

  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      findMarkdownFiles(fullPath, files);
    } else if (item.endsWith('.md')) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Validate markdown frontmatter has required fields
 */
function validateMarkdown(filePath, markdown) {
  try {
    const { data } = matter(markdown);

    if (!data.id || typeof data.id !== 'string') {
      return { valid: false, error: 'Missing or invalid "id"' };
    }
    if (!data.date || typeof data.date !== 'string') {
      return { valid: false, error: 'Missing or invalid "date"' };
    }
    if (data.effort === undefined || typeof data.effort !== 'number') {
      return { valid: false, error: 'Missing or invalid "effort"' };
    }
    if (!data.category || typeof data.category !== 'string') {
      return { valid: false, error: 'Missing or invalid "category"' };
    }

    return { valid: true };
  } catch (error) {
    return { valid: false, error: (error).message };
  }
}

/**
 * Convert local file path to blob path
 * Since we're migrating from data/YYYY/MM/file.md to blob sessions/YYYY/MM/file.md
 */
function getBlobPath(filePath) {
  // Get relative path from data directory
  const relativePath = path.relative(DATA_DIR, filePath);
  // Normalize to forward slashes and add prefix
  return SESSIONS_PREFIX + relativePath.replace(/\\/g, '/');
}

/**
 * Check if a blob path already exists
 */
async function blobExists(blobPath) {
  try {
    const { blobs } = await list({
      prefix: blobPath,
    });
    return blobs.some(b => b.pathname === blobPath);
  } catch (error) {
    // If there's an error listing, assume it doesn't exist
    return false;
  }
}

/**
 * Main migration function
 */
async function migrate() {
  console.log('🚀 Starting migration to Vercel Blob Storage...\n');

  const markdownFiles = findMarkdownFiles(DATA_DIR);

  if (markdownFiles.length === 0) {
    console.log('ℹ️  No markdown files found in data/ directory. Migration complete!');
    process.exit(0);
  }

  console.log(`📁 Found ${markdownFiles.length} markdown file(s) to migrate\n`);

  let migratedCount = 0;
  let skippedCount = 0;
  const errors = [];

  for (const filePath of markdownFiles) {
    try {
      const fileName = path.basename(filePath);
      const markdown = fs.readFileSync(filePath, 'utf-8');

      // Validate markdown
      const validation = validateMarkdown(filePath, markdown);
      if (!validation.valid) {
        console.log(`⚠️  Skipped ${fileName}: ${validation.error}`);
        skippedCount++;
        errors.push({ file: fileName, error: validation.error });
        continue;
      }

      const blobPath = getBlobPath(filePath);

      // Check if already exists
      const exists = await blobExists(blobPath);
      if (exists) {
        console.log(`⏭️  Skipped ${fileName}: Already exists in Blob Storage`);
        skippedCount++;
        continue;
      }

      // Upload to blob
      const blob = await put(blobPath, markdown, {
        access: 'public',
        token: VERCEL_BLOB_TOKEN,
      });

      console.log(`✅ Uploaded ${fileName} → ${blobPath}`);
      migratedCount++;
    } catch (error) {
      const fileName = path.basename(filePath);
      console.log(`❌ Failed to migrate ${fileName}: ${(error).message}`);
      errors.push({ file: path.basename(filePath), error: (error).message });
    }
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('✨ Migration Summary');
  console.log('='.repeat(50));
  console.log(`📤 Uploaded: ${migratedCount} file(s)`);
  console.log(`⏭️  Skipped: ${skippedCount} file(s)`);
  console.log(`❌ Failed: ${errors.length} file(s)`);

  if (errors.length > 0) {
    console.log('\n⚠️  Errors:');
    errors.forEach(({ file, error }) => {
      console.log(`  - ${file}: ${error}`);
    });
  }

  if (migratedCount === 0 && errors.length === 0) {
    console.log('\nℹ️  All files were either skipped or already migrated.');
  } else {
    console.log('\n✅ Migration complete!');
  }
}

// Run migration
migrate().catch(error => {
  console.error('Fatal error during migration:', error);
  process.exit(1);
});
