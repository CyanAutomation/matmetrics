import assert from 'node:assert/strict';
import test from 'node:test';

import { createActionFeedbackController } from './interaction';

type ScheduledTask = {
  id: number;
  dueAt: number;
  callback: () => void;
  canceled: boolean;
};

function createSchedulerHarness() {
  let now = 0;
  let nextId = 1;
  let clearCalls = 0;
  const tasks: ScheduledTask[] = [];

  const schedule = (callback: () => void, delayMs: number) => {
    const task: ScheduledTask = {
      id: nextId,
      dueAt: now + delayMs,
      callback,
      canceled: false,
    };
    nextId += 1;
    tasks.push(task);
    return task.id as unknown as ReturnType<typeof setTimeout>;
  };

  const clear = (handle: ReturnType<typeof setTimeout>) => {
    const id = handle as unknown as number;
    const task = tasks.find((candidate) => candidate.id === id);
    if (task && !task.canceled) {
      task.canceled = true;
      clearCalls += 1;
    }
  };

  const runDueTasks = () => {
    const dueTasks = tasks
      .filter((task) => !task.canceled && task.dueAt <= now)
      .sort((a, b) => a.dueAt - b.dueAt || a.id - b.id);

    for (const task of dueTasks) {
      task.canceled = true;
      task.callback();
    }
  };

  return {
    schedule,
    clear,
    advanceBy(ms: number) {
      now += ms;
      runDueTasks();
    },
    flushAll() {
      const activeTasks = tasks
        .filter((task) => !task.canceled)
        .sort((a, b) => a.dueAt - b.dueAt || a.id - b.id);
      for (const task of activeTasks) {
        now = Math.max(now, task.dueAt);
        task.canceled = true;
        task.callback();
      }
    },
    getClearCalls() {
      return clearCalls;
    },
    getScheduledDelays() {
      return tasks.map((task) => task.dueAt);
    },
  };
}

test('action feedback controller eventually transitions success and error to idle', () => {
  const successStates: string[] = [];
  const successScheduler = createSchedulerHarness();
  const successController = createActionFeedbackController(
    (state) => successStates.push(state),
    successScheduler.schedule,
    successScheduler.clear
  );

  successController.showSuccess();
  assert.deepEqual(successStates, ['success']);

  successScheduler.flushAll();
  assert.deepEqual(successStates, ['success', 'idle']);

  const errorStates: string[] = [];
  const errorScheduler = createSchedulerHarness();
  const errorController = createActionFeedbackController(
    (state) => errorStates.push(state),
    errorScheduler.schedule,
    errorScheduler.clear
  );

  errorController.showError();
  assert.deepEqual(errorStates, ['error']);

  errorScheduler.flushAll();
  assert.deepEqual(errorStates, ['error', 'idle']);
});

test('error reset is scheduled later than success reset', () => {
  const scheduler = createSchedulerHarness();
  const states: string[] = [];

  const controller = createActionFeedbackController(
    (state) => states.push(state),
    scheduler.schedule,
    scheduler.clear
  );

  controller.showSuccess();
  const [successDueAt] = scheduler.getScheduledDelays();

  controller.reset();
  controller.showError();
  const [, errorDueAt] = scheduler.getScheduledDelays();

  assert.ok(errorDueAt > successDueAt);
  assert.deepEqual(states, ['success', 'idle', 'error']);
});

test('reset() and dispose() cancel pending idle resets', () => {
  const resetStates: string[] = [];
  const resetScheduler = createSchedulerHarness();
  const resetController = createActionFeedbackController(
    (state) => resetStates.push(state),
    resetScheduler.schedule,
    resetScheduler.clear
  );

  resetController.showSuccess();
  resetController.reset();
  const resetClearCalls = resetScheduler.getClearCalls();

  resetScheduler.flushAll();

  assert.equal(resetClearCalls, 1);
  assert.deepEqual(resetStates, ['success', 'idle']);

  const disposeStates: string[] = [];
  const disposeScheduler = createSchedulerHarness();
  const disposeController = createActionFeedbackController(
    (state) => disposeStates.push(state),
    disposeScheduler.schedule,
    disposeScheduler.clear
  );

  disposeController.showError();
  disposeController.dispose();
  const disposeClearCalls = disposeScheduler.getClearCalls();

  disposeScheduler.flushAll();

  assert.equal(disposeClearCalls, 1);
  assert.deepEqual(disposeStates, ['error']);
});
