import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error Next bundles this parser without publishing type declarations.
import { parse } from 'next/dist/compiled/node-html-parser';
import { CalendarDays } from 'lucide-react';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { SidebarProvider } from '@/components/ui/sidebar';
import { DashboardHeader } from './dashboard-header';

test('dashboard header keeps shared product branding separate from page headings', () => {
  const document = parse(
    renderToStaticMarkup(
      React.createElement(
        SidebarProvider,
        null,
        React.createElement(DashboardHeader, {
          title: 'Training history',
          pageIcon: CalendarDays,
          isOnline: true,
          isSyncing: false,
          pendingCount: 0,
          syncStatusText: '',
          initials: 'MS',
          displayName: 'Marc',
          email: 'marc@example.com',
          guestWorkspaceLabel: 'Guest Workspace',
          hasUser: true,
          authAvailable: true,
          onLogSession: () => undefined,
          onOpenVersionHistory: () => undefined,
          onSignOut: () => undefined,
          onOpenAuth: () => undefined,
        })
      )
    )
  );
  const header = document.querySelector('header');
  const brandHeading = header?.querySelector('h1');

  assert.equal(brandHeading?.textContent, 'MatMetrics');
  assert.match(brandHeading?.getAttribute('class') ?? '', /sr-only/);
  assert.match(brandHeading?.getAttribute('class') ?? '', /sm:not-sr-only/);
  assert.equal(
    brandHeading?.nextElementSibling?.textContent,
    'Training workspace'
  );
  assert.equal(brandHeading?.textContent.includes('Training'), false);
});
