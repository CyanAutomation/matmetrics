import type { EffortLevel, JudoSession, SessionCategory } from '../lib/types';
import { formatLocalDateInputValue } from '../lib/utils';

export interface SessionFormState {
  date: string;
  duration: string;
  description: string;
  techniques: string[];
  newTech: string;
  effort: EffortLevel;
  category: SessionCategory;
  notes: string;
  videoUrl: string;
  isEditing: boolean;
}

export interface SessionFormControllerDependencies {
  today: () => Date;
  deferDefaultDate: boolean;
}

export type SessionFormStateUpdater<Value> =
  | Value
  | ((currentValue: Value) => Value);

type SessionFormField = Exclude<keyof SessionFormState, 'isEditing'>;

/** Framework-neutral owner for session form values and edit-target changes. */
export class SessionFormController {
  private state: SessionFormState;
  private readonly listeners = new Set<() => void>();
  private readonly today: () => Date;
  private readonly deferDefaultDate: boolean;
  private sessionToEdit?: JudoSession;

  constructor(
    sessionToEdit?: JudoSession,
    dependencies: Partial<SessionFormControllerDependencies> = {}
  ) {
    this.today = dependencies.today ?? (() => new Date());
    this.deferDefaultDate = dependencies.deferDefaultDate ?? false;
    this.sessionToEdit = sessionToEdit;
    this.state = this.createState(sessionToEdit, this.deferDefaultDate);
  }

  getSnapshot = (): Readonly<SessionFormState> => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  setDate = (value: SessionFormStateUpdater<string>): void =>
    this.setField('date', value);

  setDuration = (value: SessionFormStateUpdater<string>): void =>
    this.setField('duration', value);

  setDescription = (value: SessionFormStateUpdater<string>): void =>
    this.setField('description', value);

  setTechniques = (value: SessionFormStateUpdater<string[]>): void =>
    this.setField('techniques', value);

  setNewTech = (value: SessionFormStateUpdater<string>): void =>
    this.setField('newTech', value);

  setEffort = (value: SessionFormStateUpdater<EffortLevel>): void =>
    this.setField('effort', value);

  setCategory = (value: SessionFormStateUpdater<SessionCategory>): void =>
    this.setField('category', value);

  setNotes = (value: SessionFormStateUpdater<string>): void =>
    this.setField('notes', value);

  setVideoUrl = (value: SessionFormStateUpdater<string>): void =>
    this.setField('videoUrl', value);

  setSessionToEdit = (sessionToEdit?: JudoSession): void => {
    if (sessionToEdit === this.sessionToEdit) return;
    this.sessionToEdit = sessionToEdit;
    this.update(this.createState(sessionToEdit, this.deferDefaultDate));
  };

  ensureDefaultDate = (): void => {
    if (this.sessionToEdit || this.state.date) return;
    this.setField('date', formatLocalDateInputValue(this.today()));
  };

  reset = (): void => {
    this.update({
      techniques: [],
      description: '',
      notes: '',
      videoUrl: '',
      duration: '',
      effort: 3,
      category: 'Technical',
      newTech: '',
    });
  };

  destroy = (): void => {
    // Keep the snapshot intact so React Strict Mode effect replay cannot clear
    // values between the initial mount and its development-only remount.
    this.listeners.clear();
  };

  private createState(
    sessionToEdit: JudoSession | undefined,
    deferDefaultDate: boolean
  ): SessionFormState {
    return {
      date: sessionToEdit
        ? sessionToEdit.date
        : deferDefaultDate
          ? ''
          : formatLocalDateInputValue(this.today()),
      duration: sessionToEdit?.duration?.toString() ?? '',
      description: sessionToEdit?.description || '',
      techniques: sessionToEdit?.techniques ? [...sessionToEdit.techniques] : [],
      newTech: '',
      effort: sessionToEdit?.effort || 3,
      category: sessionToEdit?.category || 'Technical',
      notes: sessionToEdit?.notes || '',
      videoUrl: sessionToEdit?.videoUrl || '',
      isEditing: Boolean(sessionToEdit),
    };
  }

  private setField<Field extends SessionFormField>(
    field: Field,
    value: SessionFormStateUpdater<SessionFormState[Field]>
  ): void {
    const currentValue = this.state[field];
    const nextValue = typeof value === 'function'
      ? (value as (currentValue: SessionFormState[Field]) => SessionFormState[Field])(
          currentValue
        )
      : value;
    this.update({ [field]: nextValue } as Partial<SessionFormState>);
  }

  private update(patch: Partial<SessionFormState>): void {
    const next = { ...this.state, ...patch };
    if (
      Object.keys(patch).every((key) =>
        Object.is(
          this.state[key as keyof SessionFormState],
          next[key as keyof SessionFormState]
        )
      )
    ) {
      return;
    }

    this.state = next;
    this.listeners.forEach((listener) => listener());
  }
}
