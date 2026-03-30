import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { PluginNotice } from '@/components/plugins/plugin-notice';
import { PluginPageShell } from '@/components/plugins/plugin-page-shell';

const normalizeMarkup = (html: string): string =>
  html.replace(/\s+/g, ' ').trim();

test('PluginPageShell renders title, description, icon, and content regions', () => {
  const html = normalizeMarkup(
    renderToStaticMarkup(
      React.createElement(
        PluginPageShell,
        {
          title: 'Plugin title',
          description: 'Plugin description',
          icon: React.createElement('span', null, 'I'),
          tone: 'info',
        },
        React.createElement('div', null, 'body')
      )
    )
  );

  assert.match(html, /Plugin title/);
  assert.match(html, /Plugin description/);
  assert.match(html, /body/);
});

test('PluginNotice renders notice title and description content', () => {
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

  assert.match(html, /Warning title/);
  assert.match(html, /Warning description/);
});
