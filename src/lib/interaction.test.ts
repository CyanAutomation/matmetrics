import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createActionFeedbackController,
  getFeedbackResetDelay,
} from './interaction';

test('feedback reset delays are short and state-specific', () => {
  const successDelay = getFeedbackResetDelay('success');
  const loadingDelay = getFeedbackResetDelay('loading');
  const errorDelay = getFeedbackResetDelay('error');

  assert.equal(successDelay, loadingDelay);
  assert.ok(successDelay > 0);
  assert.ok(successDelay < 2000);
  assert.ok(errorDelay > successDelay);
  assert.ok(errorDelay < 2500);
});

test('action feedback controller resets transient states back to idle', () => {
  const states: string[] = [];
  const scheduled = {
    callback: undefined as (() => void) | undefined,
  };
  let scheduledDelay = 0;
  let cleared = 0;

  const controller = createActionFeedbackController(
    (state) => states.push(state),
    (callback, delayMs) => {
      scheduled.callback = callback;
      scheduledDelay = delayMs;
      return 1 as unknown as ReturnType<typeof setTimeout>;
    },
    () => {
      cleared += 1;
    }
  );

  controller.startLoading();
  controller.showSuccess();

  assert.deepEqual(states, ['loading', 'success']);
  assert.equal(scheduledDelay, 1400);

  const callback = scheduled.callback;
  if (callback) {
    callback();
  }

  assert.deepEqual(states, ['loading', 'success', 'idle']);
  controller.dispose();
  assert.equal(cleared, 0);
});

test('action feedback controller clears pending reset when showing an error', () => {
  const states: string[] = [];
  const scheduledCallbacks: Array<() => void> = [];
  let cleared = 0;

  const controller = createActionFeedbackController(
    (state) => states.push(state),
    (callback) => {
      scheduledCallbacks.push(callback);
      return scheduledCallbacks.length as unknown as ReturnType<typeof setTimeout>;
    },
    () => {
      cleared += 1;
    }
  );

  controller.showSuccess();
  controller.showError();

  assert.deepEqual(states, ['success', 'error']);
  assert.equal(cleared, 1);

  scheduledCallbacks.at(-1)?.();

  assert.deepEqual(states, ['success', 'error', 'idle']);
});
