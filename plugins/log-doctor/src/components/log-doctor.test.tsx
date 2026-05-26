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
  it('mounts with validation tab controls and switches to audit content', async () => {
    const view = render(
      <AuthProvider>
        <LogDoctor />
      </AuthProvider>
    );

    try {
      assert.ok(view.getByRole('tab', { name: 'File Validation' }));
      assert.ok(view.getByRole('tab', { name: 'Session Audit' }));
      assert.ok(view.getByLabelText('Owner'));
      assert.ok(view.getByLabelText('Repository'));
      assert.ok(view.getByRole('button', { name: 'Scan repository' }));

      fireEvent.click(view.getByRole('tab', { name: 'Session Audit' }));

      await waitFor(() => {
        assert.ok(view.getByText('Session audit status'));
        assert.equal(view.queryByText('Repository target'), null);
      });
    } finally {
      view.unmount();
    }
  });

  it('keeps audit state unchanged while mutating file-validation state', async () => {
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
      await waitFor(() => {
        assert.ok(view.getByRole('button', { name: 'Run session audit checks' }));
      });

      fireEvent.click(view.getByRole('tab', { name: 'File Validation' }));
      fireEvent.change(view.getByLabelText('Owner'), { target: { value: 'team-a' } });
      fireEvent.change(view.getByLabelText('Repository'), { target: { value: 'matmetrics' } });
      fireEvent.change(view.getByLabelText('Branch (optional)'), {
        target: { value: 'main' },
      });

      fireEvent.click(view.getByRole('tab', { name: 'Session Audit' }));

      await waitFor(() => {
        assert.ok(view.getByRole('button', { name: '1. Run check' }));
        assert.ok(view.getByRole('button', { name: 'Run session audit checks' }));
      });
    } finally {
      view.unmount();
    }
  });

  it('keeps file-validation state unchanged while mutating audit state and intentionally shares active tab', async () => {
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
      await waitFor(() => {
        assert.ok(view.getByRole('button', { name: 'Run session audit checks' }));
      });

      fireEvent.click(view.getByRole('tab', { name: 'File Validation' }));
      await waitFor(() => {
        assert.ok(view.getByText('Repository target'));
        assert.equal(view.queryByText('Session audit status'), null);
      });

      fireEvent.click(view.getByRole('tab', { name: 'Session Audit' }));
      await waitFor(() => {
        assert.ok(view.getByRole('button', { name: 'Run session audit checks' }));
        assert.equal(view.queryByText('Repository target'), null);
      });
    } finally {
      view.unmount();
    }
  });
});
