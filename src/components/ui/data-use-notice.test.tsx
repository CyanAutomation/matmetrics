import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { DataUseNotice } from '@/components/ui/data-use-notice';

test('data use notices explain each optional review without exposing implementation names', () => {
  const notices = [
    'checkin',
    'tag-suggestions',
    'history',
    'semantic-history-search',
    'audit',
  ] as const;
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
  assert.match(html[3], /up to eight sessions/i);
  assert.match(html[3], /chosen locally by text overlap and recency/i);
  assert.match(html[3], /external AI service/i);
  assert.match(html[3], /Session IDs and your full history are not sent/i);
  assert.match(html[4], /description, notes, selected type, effort rating/i);
  assert.match(html[4], /up to 12 saved technique tags/i);
  assert.match(html[4], /exact checks still run/i);
  assert.doesNotMatch(copy, /JEV|TypeSafe|OpenRouter|Cloudflare|model/i);
  assert.match(copy, /data-slot="data-use-notice"/);
});
