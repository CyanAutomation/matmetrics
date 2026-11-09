import type { JudoSession } from '../lib/types';

export interface SessionHistoryDialogState {
  editingSession: JudoSession | null;
  sessionPendingDeletion: JudoSession | null;
}

const initialState: SessionHistoryDialogState = {
  editingSession: null,
  sessionPendingDeletion: null,
};

/** Framework-neutral owner for the selected history edit and delete targets. */
export class SessionHistoryDialogController {
  private state: SessionHistoryDialogState = { ...initialState };
  private readonly listeners = new Set<() => void>();

  getSnapshot = (): Readonly<SessionHistoryDialogState> => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  requestEdit = (session: JudoSession): void => {
    this.update({ editingSession: session });
  };

  closeEdit = (): void => {
    this.update({ editingSession: null });
  };

  completeEdit = (sessionId: string): void => {
    if (this.state.editingSession?.id !== sessionId) return;
    this.closeEdit();
  };

  requestDelete = (session: JudoSession, isDeleting: boolean): void => {
    if (isDeleting) return;
    this.update({ sessionPendingDeletion: session });
  };

  closeDelete = (): void => {
    this.update({ sessionPendingDeletion: null });
  };

  completeDelete = (sessionId: string): void => {
    if (this.state.sessionPendingDeletion?.id !== sessionId) return;
    this.closeDelete();
  };

  destroy = (): void => {
    this.state = { ...initialState };
    this.listeners.clear();
  };

  private update(patch: Partial<SessionHistoryDialogState>): void {
    const next = { ...this.state, ...patch };
    if (
      next.editingSession === this.state.editingSession &&
      next.sessionPendingDeletion === this.state.sessionPendingDeletion
    ) {
      return;
    }

    this.state = next;
    this.listeners.forEach((listener) => listener());
  }
}
