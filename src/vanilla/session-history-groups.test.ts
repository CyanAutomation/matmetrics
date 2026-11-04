import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import type { JudoSession } from '../lib/types';
import {
  mountSessionHistoryGroups,
  sessionHistoryGroupsHtml,
  type SessionHistoryGroupsProps,
} from './session-history-groups';

const { JSDOM } = createRequire(import.meta.url)('jsdom');

const firstSession: JudoSession = {
  id: 'session-one',
  date: '2026-09-20',
  category: 'Technical',
  effort: 4,
  techniques: ['Uchi mata', 'Osoto gari'],
  description: 'Grip movement',
  notes: 'Good rounds',
};

const secondSession: JudoSession = {
  ...firstSession,
  id: 'session-two',
  date: '2026-09-18',
  techniques: ['Kesa gatame'],
};

function makeProps(
  overrides: Partial<SessionHistoryGroupsProps> = {}
): SessionHistoryGroupsProps {
  const grouped = [{ monthLabel: 'September 2026', sessions: [firstSession] }];
  return {
    grouped,
    filteredSessions: grouped.flatMap((group) => group.sessions),
    deletingSessionId: null,
    density: 'compact',
    semanticSearchActive: false,
    onRequestDelete: () => {},
    onEditSession: () => {},
    onFilterTechnique: () => {},
    ...overrides,
  };
}

test('renders accessible month groups and a helpful empty-filter state', () => {
  const props = makeProps({
    grouped: [{ monthLabel: '<September> & October', sessions: [firstSession] }],
    filteredSessions: [firstSession],
    semanticSearchActive: true,
  });
  const dom = new JSDOM(sessionHistoryGroupsHtml(props));
  const root = dom.window.document.querySelector(
    '[data-ui-session-history-groups]'
  ) as HTMLElement;

  assert.equal(root.querySelector('h3')?.textContent, '<September> & October');
  assert.equal(
    root.querySelector('section')?.getAttribute('aria-label'),
    '<September> & October'
  );
  assert.equal(root.querySelectorAll('[data-ui-session-history-row]').length, 1);
  assert.equal(root.querySelector('[data-session-history-empty]'), null);
  assert.equal(root.querySelector('script'), null);

  const unusualId = 'session-" ><img src=x>';
  const escapedDom = new JSDOM(
    sessionHistoryGroupsHtml(
      makeProps({
        grouped: [
          {
            monthLabel: 'September 2026',
            sessions: [{ ...firstSession, id: unusualId }],
          },
        ],
        filteredSessions: [{ ...firstSession, id: unusualId }],
      })
    )
  );
  assert.equal(
    escapedDom.window.document.querySelector('[data-session-id]')?.getAttribute('data-session-id'),
    unusualId
  );
  assert.equal(escapedDom.window.document.querySelector('img'), null);

  const emptyDom = new JSDOM(
    sessionHistoryGroupsHtml(
      makeProps({
        grouped: [],
        filteredSessions: [],
        semanticSearchActive: true,
      })
    )
  );
  assert.equal(
    emptyDom.window.document.querySelector('[data-session-history-empty-title]')?.textContent,
    'JEV found no likely sessions among the candidates checked.'
  );
  assert.equal(
    emptyDom.window.document.querySelector('[data-session-history-empty-description]')?.textContent,
    'Try another query or broaden the date, type, or effort filters.'
  );
  dom.window.close();
  escapedDom.window.close();
  emptyDom.window.close();
});

test('updates rows in place, keeps disclosures and focus, and uses latest callbacks', () => {
  const calls: string[] = [];
  const initial = makeProps();
  const dom = new JSDOM('<div id="host"></div>');
  const host = dom.window.document.querySelector('#host') as HTMLElement;
  host.innerHTML = sessionHistoryGroupsHtml(initial);
  const root = host.querySelector(
    '[data-ui-session-history-groups]'
  ) as HTMLElement;
  const controller = mountSessionHistoryGroups(root, initial);
  const row = root.querySelector('[data-ui-session-history-row]')!;
  const details = row.querySelector('.ui-session-details') as HTMLDetailsElement;
  const chip = row.querySelector(
    '.ui-action-chip-list__chip'
  ) as HTMLButtonElement;
  details.open = true;
  chip.focus();

  controller.update(
    makeProps({
      grouped: [
        {
          monthLabel: 'October 2026',
          sessions: [{ ...firstSession, notes: 'Updated notes' }],
        },
      ],
      filteredSessions: [{ ...firstSession, notes: 'Updated notes' }],
      density: 'comfortable',
      onFilterTechnique: (technique) => calls.push(`new:${technique}`),
    })
  );

  assert.equal(root.querySelector('[data-ui-session-history-row]'), row);
  assert.equal(row.querySelector('.ui-session-details'), details);
  assert.equal(details.open, true);
  assert.equal(dom.window.document.activeElement, chip);
  assert.equal(row.textContent?.includes('Updated notes'), true);
  assert.equal(
    row.classList.contains('ui-session-history-row--comfortable'),
    true
  );
  chip.click();
  assert.deepEqual(calls, ['new:Uchi mata']);

  controller.destroy();
  chip.click();
  assert.deepEqual(calls, ['new:Uchi mata']);
  dom.window.close();
});

test('removes stale rows and tears down their controls', () => {
  const calls: string[] = [];
  const initial = makeProps({
    grouped: [
      { monthLabel: 'September 2026', sessions: [firstSession, secondSession] },
    ],
    filteredSessions: [firstSession, secondSession],
    onFilterTechnique: (technique) => calls.push(technique),
  });
  const dom = new JSDOM('<div id="host"></div>');
  const host = dom.window.document.querySelector('#host') as HTMLElement;
  host.innerHTML = sessionHistoryGroupsHtml(initial);
  const root = host.querySelector(
    '[data-ui-session-history-groups]'
  ) as HTMLElement;
  const controller = mountSessionHistoryGroups(root, initial);
  const removedRow = root.querySelector(
    '[data-session-id="session-two"]'
  ) as HTMLElement;
  const removedChip = removedRow.querySelector(
    '.ui-action-chip-list__chip'
  ) as HTMLButtonElement;

  controller.update(
    makeProps({
      grouped: [{ monthLabel: 'September 2026', sessions: [firstSession] }],
      filteredSessions: [firstSession],
    })
  );
  assert.equal(root.querySelector('[data-session-id="session-two"]'), null);
  removedChip.click();
  assert.deepEqual(calls, []);
  controller.destroy();
  dom.window.close();
});

test('updates the no-results message in place and restores grouped rows', () => {
  const initial = makeProps();
  const dom = new JSDOM('<div id="host"></div>');
  const host = dom.window.document.querySelector('#host') as HTMLElement;
  host.innerHTML = sessionHistoryGroupsHtml(initial);
  const root = host.querySelector(
    '[data-ui-session-history-groups]'
  ) as HTMLElement;
  const controller = mountSessionHistoryGroups(root, initial);

  controller.update(
    makeProps({
      grouped: [],
      filteredSessions: [],
      semanticSearchActive: true,
    })
  );
  assert.equal(
    host.querySelector('[data-ui-session-history-groups]'),
    root
  );
  assert.equal(
    root.querySelector('[data-session-history-empty-title]')?.textContent,
    'JEV found no likely sessions among the candidates checked.'
  );

  controller.update(initial);
  assert.equal(root.querySelector('[data-session-history-empty]'), null);
  assert.equal(root.querySelectorAll('[data-ui-session-history-row]').length, 1);
  controller.destroy();
  dom.window.close();
});

test('validates the complete row tree before attaching child listeners', () => {
  const calls: string[] = [];
  const props = makeProps({
    grouped: [
      { monthLabel: 'September 2026', sessions: [firstSession, secondSession] },
    ],
    filteredSessions: [firstSession, secondSession],
    onFilterTechnique: (technique) => calls.push(technique),
  });
  const dom = new JSDOM('<div id="host"></div>');
  const host = dom.window.document.querySelector('#host') as HTMLElement;
  host.innerHTML = sessionHistoryGroupsHtml(props);
  const root = host.querySelector(
    '[data-ui-session-history-groups]'
  ) as HTMLElement;
  const secondRow = root.querySelector(
    '[data-session-id="session-two"]'
  ) as HTMLElement;
  secondRow.querySelector('.ui-action-chip-list')?.remove();

  assert.throws(
    () => mountSessionHistoryGroups(root, props),
    /Session history row markup is missing \[data-session-techniques\] \.ui-action-chip-list/
  );
  (root.querySelector('.ui-action-chip-list__chip') as HTMLButtonElement).click();
  assert.deepEqual(calls, []);
  dom.window.close();
});

test('rejects duplicate session and month keys before producing markup', () => {
  assert.throws(
    () =>
      sessionHistoryGroupsHtml(
        makeProps({
          grouped: [
            {
              monthLabel: 'September 2026',
              sessions: [firstSession, { ...firstSession }],
            },
          ],
          filteredSessions: [firstSession, firstSession],
        })
      ),
    /session ids must be unique/
  );
  assert.throws(
    () =>
      sessionHistoryGroupsHtml(
        makeProps({
          grouped: [
            { monthLabel: 'September 2026', sessions: [firstSession] },
            { monthLabel: 'September 2026', sessions: [secondSession] },
          ],
          filteredSessions: [firstSession, secondSession],
        })
      ),
    /month labels must be unique/
  );
  assert.throws(
    () =>
      sessionHistoryGroupsHtml(
        makeProps({
          filteredSessions: [firstSession, { ...firstSession }],
        })
      ),
    /filtered session ids must be unique/
  );
});
