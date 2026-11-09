import assert from 'node:assert/strict';
import test from 'node:test';
import type { JudoSession } from '@/lib/types';
import { SessionHistoryDialogController } from './session-history-dialog-controller';

function session(id: string): JudoSession {
  return {
    id,
    date: '2026-11-01',
    category: 'Technical',
    effort: 3,
    techniques: ['Uchi-mata'],
    description: 'Practiced entries against a moving partner.',
  };
}

test('dialog controller publishes edit and delete selection changes', () => {
  const controller = new SessionHistoryDialogController();
  const first = session('session-1');
  const second = session('session-2');
  const snapshots: string[] = [];
  const unsubscribe = controller.subscribe(() => {
    const state = controller.getSnapshot();
    snapshots.push(
      `${state.editingSession?.id ?? '-'}:${state.sessionPendingDeletion?.id ?? '-'}`
    );
  });

  controller.requestEdit(first);
  controller.requestDelete(second, false);
  controller.closeEdit();
  controller.closeDelete();

  assert.deepEqual(snapshots, [
    'session-1:-',
    'session-1:session-2',
    '-:session-2',
    '-:-',
  ]);
  assert.equal(controller.getSnapshot().editingSession, null);
  assert.equal(controller.getSnapshot().sessionPendingDeletion, null);

  unsubscribe();
  controller.destroy();
});

test('dialog controller ignores stale completions and blocks delete requests while deleting', () => {
  const controller = new SessionHistoryDialogController();
  const first = session('session-1');
  const second = session('session-2');

  controller.requestEdit(first);
  controller.requestEdit(second);
  controller.completeEdit(first.id);
  assert.equal(controller.getSnapshot().editingSession?.id, second.id);
  controller.completeEdit(second.id);
  assert.equal(controller.getSnapshot().editingSession, null);

  controller.requestDelete(first, false);
  controller.requestDelete(second, true);
  assert.equal(controller.getSnapshot().sessionPendingDeletion?.id, first.id);
  controller.completeDelete(second.id);
  assert.equal(controller.getSnapshot().sessionPendingDeletion?.id, first.id);
  controller.completeDelete(first.id);
  assert.equal(controller.getSnapshot().sessionPendingDeletion, null);

  controller.destroy();
});
