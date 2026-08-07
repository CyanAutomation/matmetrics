import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { PluginToolbar } from '@/components/plugins/plugin-toolbar';

test('plugin toolbar follows the centralized responsive layout policy', () => {
  const html = renderToStaticMarkup(React.createElement(PluginToolbar));

  assert.match(html, /sm:flex-row/);
});
