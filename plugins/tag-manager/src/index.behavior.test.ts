import assert from 'node:assert/strict';
import test from 'node:test';

import { TagManager } from '@/components/tag-manager';

import { initPlugin } from './index';

test('initPlugin registers tag manager renderer with refresh wiring', () => {
  let renderer:
    | ((context: { refreshSessions: () => void }) => unknown)
    | undefined;

  initPlugin({
    registerPluginComponent: (_, registerRenderer) => {
      renderer = registerRenderer;
    },
  });

  assert.ok(renderer, 'initPlugin should provide a renderer callback');

  const refreshSessions = () => undefined;
  const element = renderer!({ refreshSessions });

  assert.ok(element && typeof element === 'object');
  assert.equal((element as { type?: unknown }).type, TagManager);
  assert.equal(
    (element as { props?: { onRefresh?: unknown } }).props?.onRefresh,
    refreshSessions
  );
});
