import assert from 'node:assert/strict';
import test from 'node:test';
import type { JudoSession, MutationResult, SessionCategory } from '@/lib/types';
import {
  SessionFormSubmitController,
  type SessionFormData,
  type SessionFormSubmitOptions,
} from './session-form-submit-controller';

const formData: SessionFormData = {
  date: '2026-11-09',
  duration: '75',
  description: 'Practiced entries against a moving partner.',
  techniques: ['Uchi-mata'],
  effort: 4,
  category: 'Randori' as SessionCategory,
  notes: 'Keep the head up.',
  videoUrl: ' https://example.com/session.mp4 ',
};

function options(overrides: Partial<SessionFormSubmitOptions> = {}) {
  const events: string[] = [];
  return {
    events,
    value: {
      onSuccess: () => events.push('success'),
      onError: () => events.push('error'),
      onStart: () => events.push('start'),
      showToast: (toast: { title: string; description?: string }) =>
        events.push(`${toast.title}:${toast.description ?? ''}`),
      ...overrides,
    },
  };
}

test('submit controller validates URLs before storage and exposes inline errors', async () => {
  let storageCalls = 0;
  const controller = new SessionFormSubmitController({
    saveSession: async () => {
      storageCalls += 1;
      return { status: 'synced' };
    },
    updateSession: async () => ({ status: 'synced' }),
    createSessionId: () => 'new-session',
  });
  const callbacks = options();

  const submitted = await controller.submit(
    { ...formData, videoUrl: 'javascript:alert(1)' },
    undefined,
    callbacks.value
  );

  assert.equal(submitted, false);
  assert.equal(storageCalls, 0);
  assert.equal(controller.getSnapshot().isSubmitting, false);
  assert.match(controller.getSnapshot().errorMessage ?? '', /valid absolute http\(s\) URL/i);
  assert.deepEqual(callbacks.events, []);
  controller.destroy();
});

test('submit controller saves new sessions and reports queued persistence', async () => {
  let saved: JudoSession | undefined;
  const controller = new SessionFormSubmitController({
    saveSession: async (session) => {
      saved = session;
      return { status: 'queued' };
    },
    updateSession: async () => ({ status: 'synced' }),
    createSessionId: () => 'new-session',
  });
  const callbacks = options();

  const submitted = await controller.submit(formData, undefined, callbacks.value);

  assert.equal(submitted, true);
  assert.deepEqual(saved, {
    id: 'new-session',
    date: '2026-11-09',
    duration: 75,
    description: 'Practiced entries against a moving partner.',
    techniques: ['Uchi-mata'],
    effort: 4,
    category: 'Randori',
    notes: 'Keep the head up.',
    videoUrl: 'https://example.com/session.mp4',
  });
  assert.deepEqual(callbacks.events, [
    'start',
    'Session Saved!:Changes are saved locally and queued to sync when the connection is ready.',
    'success',
  ]);
  assert.deepEqual(controller.getSnapshot(), {
    isSubmitting: false,
    errorMessage: null,
  });
  controller.destroy();
});

test('submit controller updates edited sessions and reports storage failures', async () => {
  const edited: JudoSession = {
    id: 'existing-session',
    date: '2026-11-01',
    category: 'Technical',
    effort: 3,
    techniques: [],
    description: 'Before edit',
  };
  let updated: JudoSession | undefined;
  const controller = new SessionFormSubmitController({
    saveSession: async () => ({ status: 'synced' }),
    updateSession: async (session) => {
      updated = session;
      throw new Error('storage unavailable');
    },
    createSessionId: () => 'unused-id',
  });
  const callbacks = options();

  const submitted = await controller.submit(formData, edited, callbacks.value);

  assert.equal(submitted, false);
  assert.equal(updated?.id, edited.id);
  assert.equal(updated?.description, formData.description);
  assert.match(controller.getSnapshot().errorMessage ?? '', /could not be updated/i);
  assert.deepEqual(callbacks.events, ['start', 'error']);
  controller.destroy();
});

test('submit controller rejects concurrent submissions while one save is pending', async () => {
  let resolveSave: ((result: MutationResult) => void) | undefined;
  let saveCalls = 0;
  const controller = new SessionFormSubmitController({
    saveSession: () => {
      saveCalls += 1;
      return new Promise<MutationResult>((resolve) => {
        resolveSave = resolve;
      });
    },
    updateSession: async () => ({ status: 'synced' }),
    createSessionId: () => 'new-session',
  });
  const callbacks = options();

  const firstSubmission = controller.submit(formData, undefined, callbacks.value);
  assert.equal(controller.getSnapshot().isSubmitting, true);
  const secondSubmission = await controller.submit(formData, undefined, callbacks.value);
  assert.equal(secondSubmission, false);
  assert.equal(saveCalls, 1);

  resolveSave?.({ status: 'synced' });
  assert.equal(await firstSubmission, true);
  assert.equal(controller.getSnapshot().isSubmitting, false);
  controller.destroy();
});
