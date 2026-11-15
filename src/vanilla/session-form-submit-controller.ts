import { saveSession, updateSession } from '../lib/storage';
import type {
  EffortLevel,
  SessionCategory,
} from '../lib/types';
import { isKeikoRevision, type SessionSnapshot } from '../lib/keiko-session-revision';

export interface SessionFormData {
  date: string;
  duration: string;
  description: string;
  techniques: string[];
  effort: EffortLevel;
  category: SessionCategory;
  notes: string;
  videoUrl: string;
}

export interface SessionFormSubmitState {
  isSubmitting: boolean;
  errorMessage: string | null;
}

export interface SessionFormSubmitOptions {
  onSuccess: () => void;
  onError: () => void;
  onStart: () => void;
  showToast: (toast: { title: string; description?: string }) => void;
}

export interface SessionFormSubmitControllerDependencies {
  saveSession: typeof saveSession;
  updateSession: typeof updateSession;
  createSessionId: () => string;
}

interface DurationParseResult {
  value: number | undefined;
  error: string | null;
}

const initialState: SessionFormSubmitState = {
  isSubmitting: false,
  errorMessage: null,
};

function validateVideoUrl(videoUrl: string): string | null {
  const trimmedVideoUrl = videoUrl.trim();
  if (!trimmedVideoUrl) return null;

  try {
    const parsedVideoUrl = new URL(trimmedVideoUrl);
    if (
      parsedVideoUrl.protocol !== 'http:' &&
      parsedVideoUrl.protocol !== 'https:'
    ) {
      throw new Error('unsupported protocol');
    }
  } catch {
    return 'Please provide a valid absolute http(s) URL (for example, a YouTube link).';
  }

  return null;
}

function parseDuration(duration: string): DurationParseResult {
  const trimmedDuration = duration.trim();
  if (!trimmedDuration) return { value: undefined, error: null };

  const parsedDuration = Number(trimmedDuration);
  if (
    !Number.isFinite(parsedDuration) ||
    !Number.isInteger(parsedDuration) ||
    parsedDuration < 1 ||
    parsedDuration > 999
  ) {
    return {
      value: undefined,
      error: 'Duration must be a whole number between 1 and 999 minutes.',
    };
  }

  return { value: parsedDuration, error: null };
}

function createSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    return Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  }
  return `session-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .substring(2)}`;
}

function buildSessionData(
  formData: SessionFormData,
  sessionToEdit: SessionSnapshot | undefined,
  createId: () => string,
  duration: number | undefined
): SessionSnapshot {
  const trimmedVideoUrl = formData.videoUrl.trim();

  return {
    id: sessionToEdit?.id || createId(),
    date: formData.date,
    techniques: formData.techniques,
    effort: formData.effort,
    category: formData.category,
    description: formData.description,
    notes: formData.notes,
    ...(trimmedVideoUrl && { videoUrl: trimmedVideoUrl }),
    ...(duration !== undefined && { duration }),
    ...(isKeikoRevision(sessionToEdit?.keikoRevision)
      ? { keikoRevision: sessionToEdit.keikoRevision }
      : {}),
  };
}

function submitErrorMessage(error: unknown, isEditing: boolean): string {
  const status =
    error && typeof error === 'object' && 'status' in error &&
    typeof error.status === 'number'
      ? error.status
      : undefined;

  if (status === 412) {
    return 'This session changed elsewhere. Your edits are preserved. Close this form and reopen the session to load the current version.';
  }
  if (status === 428) {
    return 'The session revision is missing. Your edits are preserved. Close this form and reload the session from history before trying again.';
  }
  if (status === 404) {
    return 'This session no longer exists. Your edits are preserved in this form; close it only after saving a copy of your changes.';
  }
  if (status === 401 || status === 403) {
    return 'Your sign-in or access expired. Your edits are preserved. Sign in again, then reopen the session before trying again.';
  }
  return `The session could not be ${isEditing ? 'updated' : 'saved'}. Your local view has been reconciled to match persisted data.`;
}

/** Framework-neutral owner for session submission state and persistence flow. */
export class SessionFormSubmitController {
  private state: SessionFormSubmitState = { ...initialState };
  private readonly listeners = new Set<() => void>();
  private readonly save: typeof saveSession;
  private readonly updateSession: typeof updateSession;
  private readonly createId: () => string;

  constructor(
    dependencies: Partial<SessionFormSubmitControllerDependencies> = {}
  ) {
    this.save = dependencies.saveSession ?? saveSession;
    this.updateSession = dependencies.updateSession ?? updateSession;
    this.createId = dependencies.createSessionId ?? createSessionId;
  }

  getSnapshot = (): Readonly<SessionFormSubmitState> => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  submit = async (
    formData: SessionFormData,
    sessionToEdit: SessionSnapshot | undefined,
    options: SessionFormSubmitOptions
  ): Promise<boolean> => {
    if (this.state.isSubmitting) return false;

    this.publish({ errorMessage: null });
    const validationError = validateVideoUrl(formData.videoUrl);
    if (validationError) {
      this.publish({ errorMessage: validationError });
      return false;
    }

    const durationResult = parseDuration(formData.duration);
    if (durationResult.error) {
      this.publish({ errorMessage: durationResult.error });
      return false;
    }

    this.publish({ isSubmitting: true });
    const isEditing = Boolean(sessionToEdit);
    options.onStart();

    try {
      const sessionData = buildSessionData(
        formData,
        sessionToEdit,
        this.createId,
        durationResult.value
      );
      const result = isEditing
        ? await this.updateSession(sessionData)
        : await this.save(sessionData);

      options.showToast({
        title: isEditing ? 'Session Updated!' : 'Session Saved!',
        description:
          result.status === 'queued'
            ? 'Changes are saved locally and queued to sync when the connection is ready.'
            : undefined,
      });

      options.onSuccess();
      return true;
    } catch (error) {
      this.publish({ errorMessage: submitErrorMessage(error, isEditing) });
      options.onError();
      return false;
    } finally {
      this.publish({ isSubmitting: false });
    }
  };

  destroy = (): void => {
    this.listeners.clear();
  };

  private publish(patch: Partial<SessionFormSubmitState>): void {
    const next = { ...this.state, ...patch };
    if (
      next.isSubmitting === this.state.isSubmitting &&
      next.errorMessage === this.state.errorMessage
    ) {
      return;
    }

    this.state = next;
    this.listeners.forEach((listener) => listener());
  }
}
