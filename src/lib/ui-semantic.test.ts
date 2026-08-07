import assert from 'node:assert/strict';
import test from 'node:test';

import {
  pluginTierToneClass,
  resolveDashboardCategoryBarClass,
  resolvePluginSeverityToneClass,
} from '@/lib/ui-semantic';

test('plugin severity resolver covers every supported semantic tone', () => {
  assert.equal(resolvePluginSeverityToneClass('error'), 'ui-pill-error');
  assert.equal(resolvePluginSeverityToneClass('warning'), 'ui-pill-warning');
  assert.equal(resolvePluginSeverityToneClass('info'), 'ui-pill-info');
});

test('plugin severity resolver rejects unknown severities', () => {
  assert.throws(
    () => resolvePluginSeverityToneClass('critical'),
    /Unsupported plugin severity: critical/
  );
  assert.throws(() => resolvePluginSeverityToneClass('toString'));
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
