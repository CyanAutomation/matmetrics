import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { SidebarInset } from './sidebar';

test('SidebarInset exposes a shrink-safe flex item contract', () => {
  const html = renderToStaticMarkup(<SidebarInset>Content</SidebarInset>);

  assert.match(html, /class="[^"]*\bmin-w-0\b[^"]*"/);
});
