import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { PluginNotice } from '@/components/plugins/plugin-notice';
import { PluginPageShell } from '@/components/plugins/plugin-page-shell';

const normalizeMarkup = (html: string): string =>
  html.replace(/\s+/g, ' ').trim();

test('PluginPageShell renders info tone frame tokens snapshot', () => {
  const html = normalizeMarkup(
    renderToStaticMarkup(
      React.createElement(
        PluginPageShell,
        {
          title: 'Plugin title',
          description: 'Plugin description',
          icon: React.createElement('span', null, 'I'),
          tone: 'info',
          children: React.createElement('div', null, 'body'),
        },
        null
      )
    )
  );

  assert.match(
    html,
    /rounded-lg p-2 bg-primary text-primary-foreground shadow-md/
  );
  assert.match(html, /Plugin title/);
  assert.match(html, /Plugin description/);
});

test('PluginNotice renders warning tone snapshot', () => {
  const html = normalizeMarkup(
    renderToStaticMarkup(
      React.createElement(PluginNotice, {
        tone: 'warning',
        title: 'Warning title',
        description: 'Warning description',
        icon: React.createElement('span', null, '!'),
      })
    )
  );

  assert.match(html, /border-amber-300 bg-amber-50 text-amber-900/);
  assert.match(html, /Warning title/);
  assert.match(html, /Warning description/);
});
