import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const githubSettingsSource = readFileSync(
  path.join(process.cwd(), 'src', 'components', 'github-settings.tsx'),
  'utf8'
);

test('GitHubSettings keeps explicit loading assertions for pending actions', () => {
  assert.match(
    githubSettingsSource,
    /isTesting|isSyncing|Loader2|Testing\.\.\.|Syncing\.\.\.|Loading…/i
  );
});

test('GitHubSettings includes an error plus recovery signal in one assertion context', () => {
  assert.match(
    githubSettingsSource,
    /Sync failed due to an unexpected server response\. Please try again\./i
  );

});
});
