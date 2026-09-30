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
  // Shared-branding hierarchy requirement: the product owns the primary heading,
  // while the header exposes workspace and page context separately.
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
  const productHeading = header?.querySelector('h1');
  const workspaceContext = header?.querySelector('p');
  const pageContext = header?.querySelector('[title="Training history"]');

  assert.equal(productHeading?.textContent, 'MatMetrics');
  assert.equal(workspaceContext?.textContent, 'Training workspace');
  assert.equal(pageContext?.getAttribute('title'), 'Training history');
});
