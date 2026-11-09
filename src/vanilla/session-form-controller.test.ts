import assert from 'node:assert/strict';
import test from 'node:test';
import type { JudoSession } from '@/lib/types';
import { SessionFormController } from './session-form-controller';

function session(overrides: Partial<JudoSession> = {}): JudoSession {
  return {
    id: 'session-1',
    date: '2026-11-01',
    duration: 75,
    category: 'Randori',
    effort: 4,
    techniques: ['Uchi-mata'],
    description: 'Worked on entries against a moving partner.',
    notes: 'Keep the head up.',
    videoUrl: 'https://example.com/session.mp4',
    ...overrides,
  };
}

function makeController(sessionToEdit?: JudoSession) {
  return new SessionFormController(sessionToEdit, {
    today: () => new Date(2026, 10, 9, 12),
  });
}

test('form controller initializes new sessions and replaces state when the edit target changes', () => {
  const controller = makeController();
  assert.equal(controller.getSnapshot().date, '2026-11-09');
  assert.equal(controller.getSnapshot().isEditing, false);
  assert.equal(controller.getSnapshot().effort, 3);
  assert.equal(controller.getSnapshot().category, 'Technical');

  const edited = session();
  controller.setSessionToEdit(edited);
  assert.deepEqual(controller.getSnapshot(), {
    date: edited.date,
    duration: '75',
    description: edited.description,
    techniques: ['Uchi-mata'],
    newTech: '',
    effort: 4,
    category: 'Randori',
    notes: 'Keep the head up.',
    videoUrl: 'https://example.com/session.mp4',
    isEditing: true,
  });

  controller.setSessionToEdit(undefined);
  assert.equal(controller.getSnapshot().date, '2026-11-09');
  assert.equal(controller.getSnapshot().isEditing, false);
  assert.deepEqual(controller.getSnapshot().techniques, []);
  controller.destroy();
});

test('form controller can defer local date initialization until after the first render', () => {
  const controller = new SessionFormController(undefined, {
    deferDefaultDate: true,
    today: () => new Date(2026, 10, 9, 12),
  });

  assert.equal(controller.getSnapshot().date, '');
  controller.ensureDefaultDate();
  assert.equal(controller.getSnapshot().date, '2026-11-09');
  controller.destroy();
});

test('form controller supports functional updates and reset preserves the date', () => {
  const controller = makeController(session());
  controller.setTechniques((techniques) => [...techniques, 'Newaza']);
  controller.setNewTech('Kesa-gatame');
  controller.setDescription('Updated description');
  controller.setDate('2026-11-08');

  controller.reset();

  assert.equal(controller.getSnapshot().date, '2026-11-08');
  assert.equal(controller.getSnapshot().duration, '');
  assert.equal(controller.getSnapshot().description, '');
  assert.deepEqual(controller.getSnapshot().techniques, []);
  assert.equal(controller.getSnapshot().newTech, '');
  assert.equal(controller.getSnapshot().effort, 3);
  assert.equal(controller.getSnapshot().category, 'Technical');
  assert.equal(controller.getSnapshot().notes, '');
  assert.equal(controller.getSnapshot().videoUrl, '');
  assert.equal(controller.getSnapshot().isEditing, true);
  controller.destroy();
});

test('form controller publishes changed values and stops notifying after unsubscribe', () => {
  const controller = makeController();
  let notifications = 0;
  const unsubscribe = controller.subscribe(() => notifications++);

  controller.setEffort(3);
  controller.setEffort(5);
  unsubscribe();
  controller.setCategory('Cardio');

  assert.equal(notifications, 1);
  assert.equal(controller.getSnapshot().category, 'Cardio');
  controller.destroy();
});
