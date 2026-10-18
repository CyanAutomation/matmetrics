import assert from 'node:assert/strict';
import test from 'node:test';

import { derivePluginAllowedClassTokens } from '@/components/plugins/plugin-style-policy';
import {
  type DashboardChartToken,
  resolveDashboardCategoryBarClass,
  resolveDashboardCategoryChartToken,
  resolvePluginSeverityToneClass,
  resolvePluginTierPresentation,
} from '@/lib/ui-semantic';
import type { PluginMaturityTier } from '@/lib/plugins/types';
import type { SessionCategory } from '@/lib/types';

test('maps supported severities and rejects unsupported values', () => {
  // Design contract: docs/blueprint.md#status--semantic-tokens.
  const cases = [
    { severity: 'error', expectedTone: 'ui-pill-error' },
    { severity: 'warning', expectedTone: 'ui-pill-warning' },
    { severity: 'info', expectedTone: 'ui-pill-info' },
  ] as const;

  for (const { severity, expectedTone } of cases) {
    assert.equal(resolvePluginSeverityToneClass(severity), expectedTone);
  }

  for (const unsupportedSeverity of ['critical', 'toString']) {
    assert.throws(
      () => resolvePluginSeverityToneClass(unsupportedSeverity),
      {
        name: 'RangeError',
        message: `Unsupported plugin severity: ${unsupportedSeverity}`,
      }
    );
  }
});

test('plugin maturity tier presentation exposes text and policy-backed semantic tones', () => {
  // Design-system requirements: docs/blueprint.md#status--semantic-tokens and
  // docs/plugin-ui-contract.md#accessibility-baseline-for-plugin-controls.
  const scenarios: Array<{
    tier: PluginMaturityTier;
    label: string;
    toneClass: string;
  }> = [
    { tier: 'bronze', label: 'Bronze', toneClass: 'ui-pill-warning' },
    {
      tier: 'silver',
      label: 'Silver',
      toneClass: 'ui-pill-trend-neutral',
    },
    { tier: 'gold', label: 'Gold', toneClass: 'ui-pill-trend-positive' },
  ];
  const allowedClasses = derivePluginAllowedClassTokens();

  for (const scenario of scenarios) {
    const presentation = resolvePluginTierPresentation(scenario.tier);

    assert.equal(presentation.label, scenario.label);
    assert.equal(presentation.toneClass, scenario.toneClass);
    assert.ok(
      allowedClasses.has(presentation.toneClass),
      `${scenario.tier} must emit a class from the plugin style policy`
    );
  }
});

test('dashboard category bars resolve to chart palette token order', () => {
  // Design contract: docs/blueprint.md#dashboard-session-category-chart-palette.
  const scenarios: Array<{
    category: SessionCategory;
    token: DashboardChartToken;
  }> = [
    { category: 'Technical', token: 'chart-1' },
    { category: 'Randori', token: 'chart-2' },
    { category: 'Shiai', token: 'chart-3' },
    { category: 'Cardio', token: 'chart-4' },
    { category: 'S&C', token: 'chart-5' },
  ];
  const approvedTokens = new Set<DashboardChartToken>([
    'chart-1',
    'chart-2',
    'chart-3',
    'chart-4',
    'chart-5',
  ]);
  const resolvedTokens = scenarios.map(({ category, token }) => {
    const resolvedToken = resolveDashboardCategoryChartToken(category);

    assert.equal(resolvedToken, token);
    assert.ok(
      approvedTokens.has(resolvedToken),
      `${category} must resolve to an approved dashboard chart token`
    );

    return resolvedToken;
  });

  assert.equal(
    new Set(resolvedTokens).size,
    scenarios.length,
    'supported session categories must remain visually distinct'
  );
  assert.equal(
    resolveDashboardCategoryChartToken('Open Mat'),
    'chart-4',
    'unknown categories must use the documented fallback token'
  );

  assert.equal(resolveDashboardCategoryBarClass('Technical'), 'bg-chart-1');
  assert.equal(resolveDashboardCategoryBarClass('Randori'), 'bg-chart-2');
  assert.equal(resolveDashboardCategoryBarClass('Shiai'), 'bg-chart-3');
});
