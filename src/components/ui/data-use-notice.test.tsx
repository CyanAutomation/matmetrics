import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { DataUseNotice } from '@/components/ui/data-use-notice';

test('data use notices explain each optional review without exposing implementation names', () => {
  const notices = ['checkin', 'tag-suggestions', 'history'] as const;
  const html = notices.map((variant) =>
    renderToStaticMarkup(React.createElement(DataUseNotice, { variant }))
  );
  const copy = html.join(' ');

  assert.match(html[0], /description and notes/i);
  assert.match(html[0], /external service/i);
  assert.match(html[1], /suggestions/i);
  assert.match(html[1], /external service/i);
  assert.match(html[2], /up to five sessions/i);
  assert.match(html[2], /classifies recurring training themes/i);
  assert.match(html[2], /don&#x27;t change anything/i);
  assert.doesNotMatch(copy, /JEV|TypeSafe|OpenRouter|Cloudflare|model/i);
  assert.match(copy, /data-slot="data-use-notice"/);
});
