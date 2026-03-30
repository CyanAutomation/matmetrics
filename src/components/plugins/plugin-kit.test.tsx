import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import {
  PLUGIN_DESTRUCTIVE_CANCEL_LABEL,
  PLUGIN_DESTRUCTIVE_CONFIRM_LABEL,
  PLUGIN_DESTRUCTIVE_PENDING_LABEL,
  PluginDestructiveAction,
} from '@/components/plugins/plugin-destructive-action';
import { PluginAuthGateNotice } from '@/components/plugins/plugin-auth-gate-notice';
import { PluginSectionCard } from '@/components/plugins/plugin-section-card';
import {
  PluginStatCard,
  PluginStatsGrid,
} from '@/components/plugins/plugin-stats-grid';
import { PluginToolbar } from '@/components/plugins/plugin-toolbar';

const normalizeMarkup = (html: string): string =>
  html.replace(/\s+/g, ' ').trim();

test('PluginAuthGateNotice switches copy based on auth availability', () => {
  const signedOut = normalizeMarkup(
    renderToStaticMarkup(
      React.createElement(PluginAuthGateNotice, {
        isAuthenticated: false,
        authAvailable: false,
      })
    )
  );

  const signedIn = normalizeMarkup(
    renderToStaticMarkup(
      React.createElement(PluginAuthGateNotice, {
        isAuthenticated: true,
        authAvailable: true,
      })
    )
  );

  assert.match(signedOut, /Authentication is currently unavailable/i);
  assert.match(signedIn, /requires an active session/i);
});

test('PluginStatsGrid and PluginStatCard render stat labels and values', () => {
  const html = normalizeMarkup(
    renderToStaticMarkup(
      React.createElement(
        PluginStatsGrid,
        null,
        React.createElement(PluginStatCard, {
          label: 'Checked links',
          value: 8,
        })
      )
    )
  );

  assert.match(html, /Checked links/);
  assert.match(html, />8</);
});

test('PluginSectionCard renders header and content regions', () => {
  const html = normalizeMarkup(
    renderToStaticMarkup(
      React.createElement(PluginSectionCard, {
        title: 'Inventory',
        description: 'Audit rows',
        children: React.createElement('p', null, 'content block'),
      })
    )
  );

  assert.match(html, /Inventory/);
  assert.match(html, /Audit rows/);
  assert.match(html, /content block/);
});

test('PluginToolbar applies responsive toolbar layout classes', () => {
  const html = normalizeMarkup(
    renderToStaticMarkup(
      React.createElement(
        PluginToolbar,
        null,
        React.createElement('span', null, 'left'),
        React.createElement('span', null, 'right')
      )
    )
  );

  assert.match(html, /sm:flex-row/);
  assert.match(html, /left/);
  assert.match(html, /right/);
});

test('PluginDestructiveAction exposes safe defaults for confirmation copy', () => {
  const element = PluginDestructiveAction({
    open: true,
    onOpenChange: () => {},
    title: 'Delete records',
    description: 'This cannot be undone.',
    onConfirm: () => {},
  });

  assert.equal(PLUGIN_DESTRUCTIVE_CONFIRM_LABEL, 'Confirm');
  assert.equal(PLUGIN_DESTRUCTIVE_CANCEL_LABEL, 'Cancel');
  assert.equal(PLUGIN_DESTRUCTIVE_PENDING_LABEL, 'Working...');
  assert.equal(element.props.confirmLabel, PLUGIN_DESTRUCTIVE_CONFIRM_LABEL);
});
