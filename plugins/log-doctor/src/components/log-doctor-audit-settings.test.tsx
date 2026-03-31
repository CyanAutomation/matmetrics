import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { DEFAULT_AUDIT_CONFIG } from '@/lib/types';

import { AuditSettings } from './log-doctor-audit-settings';

const onConfigChange = async () => undefined;

function renderSettings({
  mode,
  config = DEFAULT_AUDIT_CONFIG,
}: {
  mode: 'standard' | 'strict' | 'custom';
  config?: typeof DEFAULT_AUDIT_CONFIG;
}): string {
  return renderToStaticMarkup(
    <AuditSettings
      mode={mode}
      config={config}
      sessionCount={6}
      onConfigChange={onConfigChange}
    />
  );
}

test('default view exposes one top-level strictness control (UX guardrail)', () => {
  const markup = renderSettings({ mode: 'standard' });

  const strictnessControlMatches =
    markup.match(/How sensitive should checks be\?/g) ?? [];
  assert.equal(
    strictnessControlMatches.length,
    1,
    'expected exactly one top-level strictness control'
  );

  const topLevelOptions = markup.match(/aria-pressed="(?:true|false)"/g) ?? [];
  assert.equal(
    topLevelOptions.length,
    3,
    'guardrail: adding top-level options must go through the Advanced/custom path'
  );
});

test('per-rule toggles and thresholds stay hidden until Advanced/custom path is opened', () => {
  const defaultMarkup = renderSettings({ mode: 'standard' });

  assert.doesNotMatch(
    defaultMarkup,
    /Toggle Missing techniques in hard sessions/
  );
  assert.doesNotMatch(defaultMarkup, /Toggle Missing session summary/);
  assert.doesNotMatch(defaultMarkup, /Effort level threshold/);
  assert.doesNotMatch(defaultMarkup, /Outlier threshold/);

  const customConfig = {
    rules: DEFAULT_AUDIT_CONFIG.rules.map((rule) =>
      rule.code === 'empty_notes' ? { ...rule, enabled: false } : { ...rule }
    ),
  };
  const customMarkup = renderSettings({ mode: 'custom', config: customConfig });

  assert.match(customMarkup, /Using custom advanced settings\./);
  assert.match(customMarkup, /Toggle Missing techniques in hard sessions/);
  assert.match(customMarkup, /Toggle Missing session summary/);
  assert.match(customMarkup, /Effort level threshold/);
  assert.match(customMarkup, /Outlier threshold/);
});

test('default mode uses plain-language labels and avoids raw statistical labels', () => {
  const markup = renderSettings({ mode: 'standard' });

  assert.match(markup, /How sensitive should checks be\?/);
  assert.match(markup, /Gentle/);
  assert.match(markup, /Balanced/);
  assert.match(markup, /Thorough/);

  assert.doesNotMatch(markup, /no_techniques_high_effort/);
  assert.doesNotMatch(markup, /durationStdDevMultiplier/);
  assert.doesNotMatch(markup, /effortThreshold/);
  assert.doesNotMatch(markup, /std\s*dev/i);
});
