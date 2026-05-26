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

  it('keeps destructive confirmation dialogs hidden until a destructive action is initiated', () => {
    const view = render(
      <AuthProvider>
        <LogDoctor />
      </AuthProvider>
    );

    try {
      assert.equal(view.queryByRole('dialog', { name: 'Apply normalization fixes?' }), null);
      assert.equal(view.queryByRole('dialog', { name: 'Reset diagnostics state?' }), null);
    } finally {
      view.unmount();
    }
  });
});
