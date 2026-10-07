import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { Sidebar, SidebarInset, SidebarProvider } from './sidebar';

test('SidebarInset exposes a shrink-safe flex item contract', () => {
  const html = renderToStaticMarkup(<SidebarInset>Content</SidebarInset>);

  // The content area must be allowed to shrink beside desktop navigation.
  // See docs/blueprint.md#component-layout-contracts.
  assert.match(html, /class="[^"]*\bmin-w-0\b[^"]*"/);
});

test('desktop sidebar reserves its configured width in the flex layout', () => {
  const html = renderToStaticMarkup(
    <SidebarProvider>
      <Sidebar>
        <div>Navigation</div>
      </Sidebar>
      <SidebarInset>Content</SidebarInset>
    </SidebarProvider>
  );
  const spacer = html.match(/<div class="([^"]*)"><\/div>/)?.[1] ?? '';

  // Desktop navigation reserves its configured width in the content layout.
  // See docs/blueprint.md#component-layout-contracts.
  assert.match(spacer, /w-\[var\(--sidebar-width\)\]/);
  assert.match(html, /group peer hidden shrink-0 text-sidebar-foreground xl:block/);
});
