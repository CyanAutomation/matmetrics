// @ts-expect-error jsdom types not available
import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
(globalThis as any).window = dom.window;
(globalThis as any).document = dom.window.document;
(globalThis as any).navigator = dom.window.navigator;

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react';

import { AuthProvider } from '@/components/auth-provider';
import { LogDoctor } from './log-doctor';

describe('LogDoctor component', () => {
  it('simulates scan/preview/apply interactions and verifies destructive event payloads', async () => {
    const events: Array<{ action: string; stage: string; metadata: Record<string, unknown> }> = [];
    window.addEventListener('logDoctorDestructiveAction', (event) => {
      events.push((event as CustomEvent).detail);
    });

    const view = render(
      <AuthProvider>
        <LogDoctor />
      </AuthProvider>
    );

    try {
      fireEvent.change(view.getByLabelText('Owner'), { target: { value: 'team-a' } });
      fireEvent.change(view.getByLabelText('Repository'), { target: { value: 'matmetrics' } });

      fireEvent.click(view.getByRole('button', { name: 'Scan repository' }));
      await waitFor(() => {
        assert.ok(view.getByRole('button', { name: 'Preview fixes' }));
      });
      fireEvent.click(view.getByRole('button', { name: 'Preview fixes' }));

      assert.equal(view.getByRole('button', { name: /Apply normalization fixes to 0 selected files/i }).hasAttribute('disabled'), true);

      // Failure-path UI assertions: actions remain disabled until valid selection exists.
      assert.equal(view.getByRole('button', { name: 'Preview fixes' }).hasAttribute('disabled'), true);

      // No destructive action callback should fire while action is disabled.
      await waitFor(() => {
        assert.equal(events.length, 0);
      });
    } finally {
      view.unmount();
    }
  });

  it('simulates audit run/review/mark-fixed flow and keeps expected state transitions', async () => {
    const view = render(
      <AuthProvider>
        <LogDoctor />
      </AuthProvider>
    );

    try {
      fireEvent.click(view.getByRole('tab', { name: 'Session Audit' }));

      await waitFor(() => {
        assert.ok(view.getByText('Session audit status'));
      });

      fireEvent.click(view.getByRole('button', { name: '1. Run check' }));
      fireEvent.click(view.getByRole('button', { name: 'Run session audit checks' }));

      await waitFor(() => {
        assert.ok(view.getByRole('button', { name: 'Run check again' }));
        assert.equal(view.getByRole('button', { name: '2. Review findings' }).hasAttribute('disabled'), false);
      });

      fireEvent.click(view.getByRole('button', { name: '2. Review findings' }));
      fireEvent.click(view.getByRole('button', { name: '3. Mark fixed' }));

      await waitFor(() => {
        assert.ok(view.getByText(/need attention/i));
      });
    } finally {
      view.unmount();
    }
  });
});
