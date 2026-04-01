import assert from 'node:assert/strict';
import test from 'node:test';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
// @ts-expect-error Next bundles this parser without publishing type declarations.
import { parse } from 'next/dist/compiled/node-html-parser';

import {
  ChartContext,
  ChartStyle,
  ChartTooltipContent,
  type ChartConfig,
} from './chart';

function renderElement(jsx: ReactElement) {
  const markup = renderToStaticMarkup(jsx);
  const parsed = parse(markup);
  const root = parsed.tagName
    ? parsed
    : parsed.childNodes.find((node: { nodeType?: number }) => node.nodeType === 1);

  assert.ok(root, 'expected a root element in rendered markup');

  return { root: root as NonNullable<typeof root>, markup };
}

test('chart style serializes color, marker shape, and stroke style CSS variables', () => {
  const { markup } = renderElement(
    <ChartStyle
      id="chart-demo"
      config={{
        primary: {
          label: 'Primary',
          color: 'hsl(var(--primary))',
          markerShape: 'circle',
          strokeStyle: 'solid',
        },
        secondary: {
          label: 'Secondary',
          color: 'hsl(var(--secondary))',
          markerShape: 'diamond',
          strokeStyle: 'dashed',
        },
      }}
    />
  );

  assert.match(markup, /--color-primary:\s*hsl\(var\(--primary\)\);/);
  assert.match(markup, /--marker-primary:\s*circle;/);
  assert.match(markup, /--stroke-primary:\s*solid;/);
  assert.match(markup, /--marker-secondary:\s*diamond;/);
  assert.match(markup, /--stroke-secondary:\s*dashed;/);
});

test('tooltip detailFormatter receives series label, value+unit, date/timestamp, and optional delta', () => {
  const { root } = renderElement(
    <ChartContext.Provider
      value={{
        config: {
          effort: { label: 'Effort', color: 'hsl(var(--primary))' },
        } satisfies ChartConfig,
      }}
    >
      <ChartTooltipContent
        active
        valueUnit="/5"
        payload={[
          {
            dataKey: 'effort',
            name: 'effort',
            value: 4,
            color: 'hsl(var(--primary))',
            payload: {
              date: 'Mar 12',
              timestamp: '2026-03-12',
              delta: '+1',
            },
          },
        ]}
        detailFormatter={(item) => (
          <div data-testid="tooltip-contract">
            <span>{item.seriesLabel}</span>
            <span>{item.valueWithUnit}</span>
            <span>{item.date}</span>
            <span>{item.timestamp}</span>
            <span>{item.delta}</span>
          </div>
        )}
      />
    </ChartContext.Provider>
  );

  const contractNode = root.querySelector('[data-testid="tooltip-contract"]');
  assert.ok(contractNode, 'expected detail formatter output to be rendered');

  const text = contractNode.textContent;
  assert.match(text, /Effort/);
  assert.match(text, /4 \/5/);
  assert.match(text, /Mar 12/);
  assert.match(text, /2026-03-12/);
  assert.match(text, /\+1/);
});
