import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error Next bundles this parser without publishing type declarations.
import { parse } from 'next/dist/compiled/node-html-parser';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { Sidebar, SidebarInset, SidebarProvider } from './sidebar';

test('desktop sidebar exposes its configured width and navigation content', () => {
  const document = parse(renderToStaticMarkup(
    <SidebarProvider>
      <Sidebar>
        <nav aria-label="Main navigation">Training history</nav>
      </Sidebar>
      <SidebarInset>Content</SidebarInset>
    </SidebarProvider>
  ));

  const provider = document.querySelector('[style*="--sidebar-width"]');
  const sidebar = document.querySelector('[data-sidebar="sidebar"]');
  assert.match(provider?.getAttribute('style') ?? '', /--sidebar-width:\s*16rem/);
  assert.equal(sidebar?.querySelector('nav')?.textContent, 'Training history');
  assert.ok(document.querySelector('[data-state="expanded"]'));
});
