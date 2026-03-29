import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const githubSettingsSource = readFileSync(
  path.join(process.cwd(), 'src', 'components', 'github-settings.tsx'),
  'utf8'
);

test('loading state exposes user-visible loading spinner label and disabled semantics', () => {
  assert.match(
    githubSettingsSource,
    /disabled=\{syncHistoryState\.status === 'loading'\}[\s\S]*?Loader2[\s\S]*?Loading…/i,
    'loading state should disable control and show loading indicator text'
  );

  assert.match(
    githubSettingsSource,
    /\{isTesting \? \([\s\S]*?Loader2[\s\S]*?\{controlState\.testConnectionLabel\}[\s\S]*?\) :/i,
    'loading state should show test button loading spinner and loading label'
  );
});

test('error messaging includes deterministic recovery guidance', () => {
  assert.match(
    githubSettingsSource,
    /Sync failed due to an unexpected server response\. Please try again\./i
  );
});
