import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error Next bundles this parser without publishing type declarations.
import { parse } from 'next/dist/compiled/node-html-parser';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { PluginNotice } from '@/components/plugins/plugin-notice';
import {
  PLUGIN_PAGE_CLASS_PATTERNS,
  PluginPageShell,
} from '@/components/plugins/plugin-page-shell';

const compositionContract = 'docs/blueprint.md#plugin-page-composition';
const feedbackContract = 'docs/blueprint.md#feedback-states';

test(`PluginPageShell renders the semantic page composition (${compositionContract})`, () => {
  const document = parse(
    renderToStaticMarkup(
      React.createElement(
        PluginPageShell,
        {
          title: 'Plugin title',
          description: 'Plugin description',
          icon: React.createElement('span', { 'data-testid': 'icon' }, 'I'),
          tone: 'info',
        },
        React.createElement('div', { 'data-testid': 'content' }, 'body')
      )
    )
  );

  const shell = document.querySelector('section');
  const header = shell?.querySelector('header');
  const heading = header?.querySelector('h2');
  const description = header?.querySelector('h2 + p');
  const icon = header?.querySelector('[data-testid="icon"]');
  const iconFrame = icon?.parentNode;
  const content = shell?.querySelector('[data-testid="content"]');
  const contentRegion = content?.parentNode;

  assert.ok(shell, `${compositionContract}: expected a semantic section shell`);
  assert.equal(
    heading?.textContent,
    'Plugin title',
    `${compositionContract}: the page title must be an h2`
  );
  assert.equal(
    description?.textContent,
    'Plugin description',
    `${compositionContract}: the lead description must immediately follow the title`
  );
  assert.equal(
    iconFrame?.parentNode,
    header,
    `${compositionContract}: the icon frame must be placed directly in the header`
  );
  assert.equal(
    header?.firstChild,
    iconFrame,
    `${compositionContract}: the icon must precede the title and description group`
  );
  assert.match(
    iconFrame?.getAttribute('class') ?? '',
    /\bbg-primary\b/,
    `${compositionContract}: the info tone must style the framed icon semantically`
  );
  assert.ok(
    contentRegion
      ?.getAttribute('class')
      ?.split(' ')
      .includes(PLUGIN_PAGE_CLASS_PATTERNS.cardSpacing),
    `${compositionContract}: projected children must remain in the marked content region`
  );
});

test(`PluginPageShell omits the optional icon without changing heading composition (${compositionContract})`, () => {
  const document = parse(
    renderToStaticMarkup(
      React.createElement(
        PluginPageShell,
        {
          title: 'Text-only plugin',
          description: 'No icon is supplied',
        },
        React.createElement('span', { 'data-testid': 'content' }, 'body')
      )
    )
  );
  const header = document.querySelector('header');

  assert.equal(
    header?.childNodes.length,
    1,
    `${compositionContract}: an omitted icon must not leave an empty frame`
  );
  assert.equal(
    header?.querySelector('h2 + p')?.textContent,
    'No icon is supplied',
    `${compositionContract}: the description must still immediately follow the h2`
  );
  assert.equal(
    document.querySelector('[data-testid="content"]')?.textContent,
    'body',
    `${compositionContract}: omitting the icon must preserve projected content`
  );
});

test(`PluginNotice exposes semantic feedback structure and tone (${feedbackContract})`, () => {
  const scenarios = [
    {
      tone: 'warning',
      toneMarker: 'bg-[hsl(var(--color-warning-container))]',
    },
    { tone: 'info', toneMarker: 'bg-primary/5' },
  ] as const;

  for (const { tone, toneMarker } of scenarios) {
    const document = parse(
      renderToStaticMarkup(
        React.createElement(PluginNotice, {
          tone,
          title: `${tone} notice`,
          description: `${tone} details`,
          icon: React.createElement('svg', {
            'aria-hidden': 'true',
            'data-testid': `${tone}-icon`,
          }),
        })
      )
    );
    const notice = document.querySelector('[role="alert"]');
    const title = notice?.querySelector('h5');
    const description = notice?.querySelector('h5 + div');
    const icon = notice?.querySelector(`[data-testid="${tone}-icon"]`);

    assert.ok(
      notice,
      `${feedbackContract}: ${tone} notices must be announced as alerts`
    );
    assert.ok(
      notice.getAttribute('class')?.split(' ').includes(toneMarker),
      `${feedbackContract}: ${tone} notices must expose their semantic tone token`
    );
    assert.equal(
      title?.nextElementSibling,
      description,
      `${feedbackContract}: notice descriptions must immediately follow their heading`
    );
    assert.equal(
      title?.parentNode,
      notice,
      `${feedbackContract}: notice headings must belong directly to the alert`
    );
    assert.equal(
      icon?.parentNode,
      notice,
      `${feedbackContract}: the reinforcing icon must render inside the alert`
    );
    assert.equal(
      notice.firstChild,
      icon,
      `${feedbackContract}: the reinforcing icon must precede the feedback copy`
    );
  }
});
