import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import type { JudoSession } from '../lib/types';
import { mountSessionHistoryRow, sessionHistoryRowHtml, type SessionHistoryRowProps } from './session-history-row';

const { JSDOM } = createRequire(import.meta.url)('jsdom');

const session: JudoSession = {
  id: 'session-1',
  date: '2026-09-20',
  category: 'Technical',
  effort: 4,
  techniques: ['Uchi mata', 'Osoto gari', 'Kesa gatame', 'Newaza'],
  description: 'Grip movement and entries',
  notes: 'Good rounds',
  duration: 90,
  videoUrl: 'https://www.example.com/watch?v=1',
};

function makeProps(overrides: Partial<SessionHistoryRowProps> = {}): SessionHistoryRowProps {
  return {
    session,
    onDelete: () => undefined,
    onEdit: () => undefined,
    onFilterTechnique: () => undefined,
    deletingSessionId: null,
    density: 'compact',
    ...overrides,
  };
}

test('renders the session row from reusable badges, actions, chips, and details', () => {
  const dom = new JSDOM(sessionHistoryRowHtml(makeProps()));
  const row = dom.window.document.querySelector('[data-ui-session-history-row]')!;

  assert.equal(row.querySelector('[data-session-date]')?.textContent, 'Sunday, September 20th');
  assert.equal(row.querySelector('[data-session-category]')?.textContent, 'Technical');
  assert.equal(row.querySelector('[data-session-effort]')?.textContent, 'Hard');
  assert.equal(row.querySelector('[data-session-duration]')?.textContent, '90 min');
  assert.equal(row.querySelectorAll('.ui-action-chip-list__chip').length, 3);
  assert.match(row.textContent!, /\+1 more/);
  assert.match(row.textContent!, /Grip movement and entries · Good rounds/);
  assert.equal(row.querySelector('a')?.getAttribute('href'), 'https://www.example.com/watch?v=1');
  assert.equal(row.querySelector('summary[aria-label="Actions for session from Sunday, September 20th, 2026"]') !== null, true);
  assert.equal(row.querySelector('.ui-badge--technical') !== null, true);
  assert.equal(row.querySelector('.ui-badge--effort-hard') !== null, true);
  dom.window.close();
});

test('escapes user content and omits unsafe video URLs', () => {
  const dom = new JSDOM(sessionHistoryRowHtml(makeProps({
    session: { ...session, description: '<script>bad</script>', notes: 'Good & safe', videoUrl: 'javascript:alert(1)' },
  })));
  const row = dom.window.document.querySelector('[data-ui-session-history-row]')!;

  assert.equal(row.querySelector('script'), null);
  assert.match(row.textContent!, /<script>bad<\/script>/);
  assert.match(row.textContent!, /Good & safe/);
  assert.equal(row.querySelector('a'), null);
  assert.doesNotMatch(row.innerHTML, /javascript:/);
  dom.window.close();
});

test('updates props in place, preserves disclosures and focus, and routes actions', async () => {
  const calls: string[] = [];
  const initial = makeProps({
    onDelete: (id) => calls.push(`delete:${id}`),
    onEdit: (value) => calls.push(`edit:${value.id}`),
    onFilterTechnique: (value) => calls.push(`filter:${value}`),
    deletingSessionId: session.id,
  });
  const dom = new JSDOM('<div></div>');
  const host = dom.window.document.querySelector('div')!;
  host.innerHTML = sessionHistoryRowHtml(initial);
  const controller = mountSessionHistoryRow(host, initial);
  const row = host.querySelector('[data-ui-session-history-row]') as HTMLElement;
  const actionDetails = row.querySelector('.ui-action-disclosure') as HTMLDetailsElement;
  const sessionDetails = row.querySelector('.ui-session-details') as HTMLDetailsElement;
  const chip = row.querySelector('.ui-action-chip-list__chip') as HTMLButtonElement;
  const deleteButton = row.querySelector('[data-action-value="delete"]') as HTMLButtonElement;

  actionDetails.open = true;
  sessionDetails.open = true;
  chip.focus();
  chip.click();
  deleteButton.click();
  assert.equal(deleteButton.disabled, true);

  controller.update(makeProps({
    session: { ...session, category: 'Randori', effort: 5, duration: 75, notes: 'Updated notes' },
    density: 'comfortable',
    onDelete: (id) => calls.push(`new-delete:${id}`),
    onEdit: (value) => calls.push(`new-edit:${value.id}`),
    onFilterTechnique: (value) => calls.push(`new-filter:${value}`),
  }));

  assert.equal(host.querySelector('[data-ui-session-history-row]'), row);
  assert.equal(row.querySelector('.ui-action-disclosure'), actionDetails);
  assert.equal(row.querySelector('.ui-session-details'), sessionDetails);
  assert.equal(actionDetails.open, true);
  assert.equal(sessionDetails.open, true);
  assert.equal(dom.window.document.activeElement, chip);
  assert.equal(row.querySelector('[data-session-category]')?.textContent, 'Randori');
  assert.equal(row.querySelector('[data-session-effort]')?.textContent, 'Intense');
  assert.equal(row.querySelector('[data-session-duration]')?.textContent, '75 min');
  assert.match(row.textContent!, /Updated notes/);
  assert.equal(row.classList.contains('ui-session-history-row--comfortable'), true);
  assert.equal((row.querySelector('[data-action-value="delete"]') as HTMLButtonElement)?.disabled, false);

  (row.querySelector('[data-action-value="edit"]') as HTMLButtonElement).click();
  assert.equal(actionDetails.open, false);
  (row.querySelector('[data-action-value="delete"]') as HTMLButtonElement).click();
  await new Promise((resolve) => setTimeout(resolve, 10));
  (row.querySelector('.ui-action-chip-list__chip') as HTMLButtonElement).click();

  assert.deepEqual(calls, ['filter:Uchi mata', 'new-edit:session-1', 'new-delete:session-1', 'new-filter:Uchi mata']);
  controller.destroy();
  dom.window.close();
});
