import assert from 'node:assert/strict';
import test from 'node:test';

import {
  pluginSeverityToneClass,
  pluginTierToneClass,
  resolveDashboardCategoryBarClass,
} from '@/lib/ui-semantic';

test('plugin severity tones map to semantic utility classes', () => {
  assert.deepEqual(pluginSeverityToneClass, {
    error: 'ui-pill-error',
    warning: 'ui-pill-warning',
    info: 'ui-pill-info',
  });
});

test('plugin maturity tiers map to semantic trend classes', () => {
  assert.deepEqual(pluginTierToneClass, {
    bronze: 'ui-pill-warning',
    silver: 'ui-pill-trend-neutral',
    gold: 'ui-pill-trend-positive',
  });
});

test('dashboard category bars resolve to chart palette token order', () => {
  assert.equal(
    resolveDashboardCategoryBarClass('Technical'),
    'bg-[hsl(var(--chart-1))]'
  );
  assert.equal(
    resolveDashboardCategoryBarClass('Randori'),
    'bg-[hsl(var(--chart-2))]'
  );
  assert.equal(
    resolveDashboardCategoryBarClass('Shiai'),
    'bg-[hsl(var(--chart-3))]'
  );
  assert.equal(
    resolveDashboardCategoryBarClass('Open Mat'),
    'bg-[hsl(var(--chart-4))]'
  );
});
