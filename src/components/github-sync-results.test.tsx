import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error Next bundles this parser without publishing type declarations.
import { parse } from 'next/dist/compiled/node-html-parser';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import {
  SyncResultsDetailPane,
  SyncResultsHistoryList,
  SyncResultsMainPanel,
  type GitHubSyncSurfaceState,
  type GitHubSyncHistoryData,
} from './github-sync-results';

function renderElement(jsx: ReactElement) {
  const markup = renderToStaticMarkup(jsx);
  const parsed = parse(markup);
  const root = parsed.tagName
    ? parsed
    : parsed.childNodes.find(
        (node: { nodeType?: number }) => node.nodeType === 1
      );

  assert.ok(root, 'expected a root element in rendered markup');
  return root as NonNullable<typeof root>;
}

const successState: GitHubSyncSurfaceState<GitHubSyncHistoryData> = {
  status: 'success',
  warnings: ['data/2026/03/20260301-matmetrics.md: duplicate id'],
  data: {
    message: 'Diagnosed 2 markdown file(s) with 1 invalid file(s)',
    branch: 'main',
    totalFiles: 2,
    invalidFiles: 1,
    files: [
      {
        path: 'data/2026/03/20260301-matmetrics.md',
        status: 'invalid',
        errors: ['duplicate id'],
        id: 'session-1',
        date: '2026-03-01',
      },
    ],
  },
};

test('main panel renders loading, empty, error, and success states with actions', () => {
  const loading = renderElement(
    <SyncResultsMainPanel
      state={{ status: 'loading' }}
      onRetry={() => undefined}
      onRunSync={() => undefined}
    />
  );
  assert.match(loading.textContent, /Loading sync results/);

  const empty = renderElement(
    <SyncResultsMainPanel
      state={{ status: 'empty', message: 'No data found' }}
      onRetry={() => undefined}
      onRunSync={() => undefined}
    />
  );
  assert.match(empty.textContent, /Run sync/);

  const error = renderElement(
    <SyncResultsMainPanel
      state={{ status: 'error', message: 'Unauthorized' }}
      onRetry={() => undefined}
      onRunSync={() => undefined}
    />
  );
  assert.match(error.textContent, /Retry/);
  assert.match(error.textContent, /Unauthorized/);

  const success = renderElement(
    <SyncResultsMainPanel
      state={successState}
      onRetry={() => undefined}
      onRunSync={() => undefined}
    />
  );
  assert.match(success.textContent, /Warnings/);
  assert.match(success.textContent, /file\(s\) checked/);
});

test('history list renders all states and supports empty/action affordance', () => {
  const loading = renderElement(
    <SyncResultsHistoryList
      state={{ status: 'loading' }}
      selectedPath={null}
      onSelect={() => undefined}
      onRetry={() => undefined}
      onRunSync={() => undefined}
    />
  );
  assert.match(loading.textContent, /Loading history/);

  const empty = renderElement(
    <SyncResultsHistoryList
      state={{ status: 'empty', message: 'No rows' }}
      selectedPath={null}
      onSelect={() => undefined}
      onRetry={() => undefined}
      onRunSync={() => undefined}
    />
  );
  assert.match(empty.textContent, /Run sync/);

  const error = renderElement(
    <SyncResultsHistoryList
      state={{ status: 'error', message: 'Failed' }}
      selectedPath={null}
      onSelect={() => undefined}
      onRetry={() => undefined}
      onRunSync={() => undefined}
    />
  );
  assert.match(error.textContent, /Retry history/);

  const success = renderElement(
    <SyncResultsHistoryList
      state={successState}
      selectedPath={null}
      onSelect={() => undefined}
      onRetry={() => undefined}
      onRunSync={() => undefined}
    />
  );
  assert.match(success.textContent, /20260301-matmetrics\.md/);
});

test('detail pane renders loading, empty, error, and warning details for success', () => {
  const loading = renderElement(
    <SyncResultsDetailPane
      state={{ status: 'loading' }}
      selectedPath={null}
      onRetry={() => undefined}
    />
  );
  assert.match(loading.textContent, /Loading details/);

  const empty = renderElement(
    <SyncResultsDetailPane
      state={{ status: 'empty', message: 'No data' }}
      selectedPath={null}
      onRetry={() => undefined}
    />
  );
  assert.match(empty.textContent, /No detail to show yet/);

  const error = renderElement(
    <SyncResultsDetailPane
      state={{ status: 'error', message: 'Failed' }}
      selectedPath={null}
      onRetry={() => undefined}
    />
  );
  assert.match(error.textContent, /Retry details/);

  const success = renderElement(
    <SyncResultsDetailPane
      state={successState}
      selectedPath={'data/2026/03/20260301-matmetrics.md'}
      onRetry={() => undefined}
    />
  );
  assert.match(success.textContent, /File warnings/);
  assert.match(success.textContent, /duplicate id/);
});
