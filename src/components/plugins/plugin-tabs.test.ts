import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test, { afterEach, beforeEach } from 'node:test';
import React from 'react';

import { PluginTabPanel, PluginTabs } from './plugin-tabs';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
const { cleanup, fireEvent, render } =
  require('@testing-library/react') as typeof import('@testing-library/react');

const domGlobals = [
  'window',
  'document',
  'navigator',
  'HTMLElement',
  'IS_REACT_ACT_ENVIRONMENT',
] as const;
const originalGlobalDescriptors = Object.fromEntries(
  domGlobals.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)])
);
let dom: InstanceType<typeof JSDOM> | undefined;

beforeEach(() => {
  dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'http://localhost',
  });
  Object.defineProperties(globalThis, {
    window: { configurable: true, value: dom.window },
    document: { configurable: true, value: dom.window.document },
    navigator: { configurable: true, value: dom.window.navigator },
    HTMLElement: { configurable: true, value: dom.window.HTMLElement },
    IS_REACT_ACT_ENVIRONMENT: { configurable: true, value: true, writable: true },
  });
});

afterEach(() => {
  cleanup();
  dom?.window.close();
  dom = undefined;

  for (const name of domGlobals) {
    const descriptor = originalGlobalDescriptors[name];
    if (descriptor) {
      Object.defineProperty(globalThis, name, descriptor);
    } else {
      delete (globalThis as Record<string, unknown>)[name];
    }
  }
});

test('PluginTabs uses roving focus and supports standard tab keyboard navigation', () => {
  function Harness() {
    const [activeTab, setActiveTab] = React.useState('validation');

    return React.createElement(
      React.Fragment,
      null,
      React.createElement(PluginTabs, {
        ariaLabel: 'Data check sections',
        tabs: [
          { id: 'validation', label: 'File Validation' },
          { id: 'audit', label: 'Session Audit' },
        ],
        activeTab,
        onTabChange: setActiveTab,
      }),
      React.createElement(
        PluginTabPanel,
        { tabId: 'validation', selected: activeTab === 'validation' },
        activeTab === 'validation' ? 'Validation content' : null
      ),
      React.createElement(
        PluginTabPanel,
        { tabId: 'audit', selected: activeTab === 'audit' },
        activeTab === 'audit' ? 'Audit content' : null
      )
    );
  }

  const { getByRole } = render(React.createElement(Harness));
  const tablist = getByRole('tablist', { name: 'Data check sections' });
  const validationTab = getByRole('tab', { name: 'File Validation' });
  const auditTab = getByRole('tab', { name: 'Session Audit' });

  assert.equal(tablist.getAttribute('aria-orientation'), 'horizontal');
  assert.equal(validationTab.tabIndex, 0);
  assert.equal(auditTab.tabIndex, -1);
  assert.equal(validationTab.getAttribute('aria-controls'), 'plugin-tab-panel-validation');
  assert.equal(
    getByRole('tablist', { name: 'Data check sections' })
      .parentElement?.querySelectorAll('[role="tabpanel"]')
      .length,
    2
  );
  assert.equal(
    getByRole('tabpanel').getAttribute('aria-labelledby'),
    validationTab.id
  );

  fireEvent.keyDown(validationTab, { key: 'ArrowRight' });
  assert.equal(document.activeElement, auditTab);
  assert.equal(auditTab.getAttribute('aria-selected'), 'true');
  assert.equal(auditTab.tabIndex, 0);
  assert.equal(getByRole('tabpanel').textContent, 'Audit content');
  assert.equal(
    getByRole('tabpanel').getAttribute('id'),
    auditTab.getAttribute('aria-controls')
  );

  fireEvent.keyDown(auditTab, { key: 'ArrowRight' });
  assert.equal(document.activeElement, validationTab);
  assert.equal(validationTab.getAttribute('aria-selected'), 'true');

  fireEvent.keyDown(validationTab, { key: 'ArrowLeft' });
  assert.equal(document.activeElement, auditTab);
  assert.equal(auditTab.getAttribute('aria-selected'), 'true');

  fireEvent.keyDown(auditTab, { key: 'Home' });
  assert.equal(document.activeElement, validationTab);
  assert.equal(validationTab.getAttribute('aria-selected'), 'true');

  fireEvent.keyDown(validationTab, { key: 'End' });
  assert.equal(document.activeElement, auditTab);
  assert.equal(auditTab.getAttribute('aria-selected'), 'true');
});
