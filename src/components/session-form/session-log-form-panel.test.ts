import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test, { afterEach, before, beforeEach, mock } from 'node:test';
import type { SessionAssessment } from '@/lib/jev-client';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost',
});
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  HTMLFormElement: dom.window.HTMLFormElement,
  HTMLButtonElement: dom.window.HTMLButtonElement,
  DocumentFragment: dom.window.DocumentFragment,
  Event: dom.window.Event,
  getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
  IS_REACT_ACT_ENVIRONMENT: true,
});
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: dom.window.navigator,
});

const React = require('react') as typeof import('react');
const { cleanup, fireEvent, render, screen } =
  require('@testing-library/react') as typeof import('@testing-library/react');

const assessment: SessionAssessment = {
  suggestedCategory: 'Technical',
  categoryConfidence: 0.9,
  categoryFitProbability: 0.9,
  hasUsefulDetail: 0.8,
  hasReflection: 0.7,
  fatigueSignal: 0,
  injurySignal: 0,
  effortConflictProbability: 0.1,
  unsupportedTechniqueTags: [],
};
let initialAssessment: SessionAssessment | null = null;
let invalidationCount = 0;
let SessionLogForm: typeof import('./session-log-form-panel').SessionLogForm;

const noOp = () => undefined;
const stableAiForm = {
  reset: noOp,
  isLoadingTransform: false,
  transformMessage: null,
  isLoadingSuggest: false,
  suggestMessage: null,
};
const stableFeedback = {
  reset: noOp,
  showSuccess: noOp,
  showError: noOp,
  startLoading: noOp,
  feedbackState: 'idle',
};

before(async () => {
  mock.module('@/components/auth-provider', {
    namedExports: {
      useAuth: () => ({
        canUseAi: true,
        authAvailable: true,
        preferences: {
          sessionTypes: { enabledCategories: ['Technical'] },
        },
      }),
    },
  });
  mock.module('@/hooks/use-toast', {
    namedExports: { useToast: () => ({ toast: noOp }) },
  });
  mock.module('@/hooks/use-session-form-ai', {
    namedExports: { useSessionFormAi: () => stableAiForm },
  });
  mock.module('@/hooks/use-action-feedback', {
    namedExports: { useActionFeedback: () => stableFeedback },
  });
  mock.module('@/hooks/use-session-log-form-actions', {
    namedExports: {
      useSessionLogFormActions: () => ({
        handleAddTech: noOp,
        handleTransform: noOp,
        handleSuggest: noOp,
        handleRemoveTech: noOp,
      }),
    },
  });
  mock.module('@/hooks/use-session-form', {
    namedExports: {
      useSessionFormState: () => {
        const [description, setDescription] = React.useState('');
        const [category, setCategory] = React.useState('Technical');
        const [notes, setNotes] = React.useState('');
        return {
          date: '',
          setDate: noOp,
          duration: '',
          setDuration: noOp,
          description,
          setDescription,
          techniques: [],
          newTech: '',
          setNewTech: noOp,
          effort: 3,
          setEffort: noOp,
          category,
          setCategory,
          notes,
          setNotes,
          videoUrl: '',
          setVideoUrl: noOp,
          reset: noOp,
          isEditing: false,
        };
      },
      useVideoUrlValidation: () => null,
      useFormSubmit: () => ({ isSubmitting: false, submit: noOp }),
    },
  });
  mock.module('@/hooks/use-session-assessment', {
    namedExports: {
      useSessionAssessment: () => {
        const [currentAssessment, setCurrentAssessment] =
          React.useState(initialAssessment);
        const assessmentRef = React.useRef(currentAssessment);
        const invalidate = React.useCallback(() => {
          if (assessmentRef.current === null) return;
          assessmentRef.current = null;
          invalidationCount += 1;
          setCurrentAssessment(null);
        }, []);
        return {
          assessment: currentAssessment,
          assess: noOp,
          invalidate,
          isLoading: false,
        };
      },
    },
  });
  ({ SessionLogForm } = await import('./session-log-form-panel'));
});

beforeEach(() => {
  initialAssessment = null;
  invalidationCount = 0;
});

afterEach(cleanup);

function renderForm() {
  return render(
    React.createElement(
      React.StrictMode,
      null,
      React.createElement(SessionLogForm, { onSuccess: noOp })
    )
  );
}

test('typing in the mounted session form remains controlled without an update-depth error', () => {
  renderForm();
  const description = screen.getByRole('textbox', {
    name: 'What did you practise?',
  }) as HTMLTextAreaElement;

  assert.doesNotThrow(() => {
    fireEvent.change(description, { target: { value: 'Uchi mata entries' } });
    fireEvent.change(description, {
      target: { value: 'Uchi mata entries and finishes' },
    });
  });
  assert.equal(description.value, 'Uchi mata entries and finishes');
  assert.equal(invalidationCount, 0);
});

test('editing assessed input clears the stale assessment exactly once', () => {
  initialAssessment = assessment;
  renderForm();
  const description = screen.getByRole('textbox', {
    name: 'What did you practise?',
  }) as HTMLTextAreaElement;

  // Strict Mode sets the effect up twice, but guarded invalidation only changes
  // assessment state once. Further keystrokes are no-ops while it is null.
  assert.equal(invalidationCount, 1);
  fireEvent.change(description, { target: { value: 'First edit' } });
  fireEvent.change(description, { target: { value: 'Second edit' } });

  assert.equal(description.value, 'Second edit');
  assert.equal(invalidationCount, 1);
});
