import {
  getSessionQuickFilterRange,
  type SessionHistoryQuickFilter,
} from '../lib/session-history-filter';

export type SessionHistoryDensity = 'comfortable' | 'compact';

export interface SessionHistoryFilterState {
  searchQuery: string;
  categoryFilter: string;
  effortFilter: string;
  fromDate: string;
  toDate: string;
  filtersOpen: boolean;
  density: SessionHistoryDensity;
}

const initialState: SessionHistoryFilterState = {
  searchQuery: '',
  categoryFilter: 'all',
  effortFilter: 'all',
  fromDate: '',
  toDate: '',
  filtersOpen: false,
  density: 'compact',
};

/** Framework-neutral state and actions for the training-history filter UI. */
export class SessionHistoryFilterController {
  private state: SessionHistoryFilterState = { ...initialState };
  private readonly listeners = new Set<() => void>();

  getSnapshot = (): Readonly<SessionHistoryFilterState> => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  setSearchQuery = (searchQuery: string): void => {
    this.update({ searchQuery });
  };

  setCategoryFilter = (categoryFilter: string): void => {
    this.update({ categoryFilter });
  };

  setEffortFilter = (effortFilter: string): void => {
    this.update({ effortFilter });
  };

  setFromDate = (fromDate: string): void => {
    this.update({ fromDate });
  };

  setToDate = (toDate: string): void => {
    this.update({ toDate });
  };

  setDensity = (density: SessionHistoryDensity): void => {
    this.update({ density });
  };

  setFiltersOpen = (filtersOpen: boolean): void => {
    this.update({ filtersOpen });
  };

  toggleFilters = (): void => {
    this.update({ filtersOpen: !this.state.filtersOpen });
  };

  filterByTechnique = (technique: string): void => {
    this.update({ searchQuery: technique, filtersOpen: false });
  };

  applyQuickFilter = (
    kind: SessionHistoryQuickFilter,
    today = new Date()
  ): void => {
    this.update(getSessionQuickFilterRange(kind, today));
  };

  clearFilters = (): void => {
    this.update({
      searchQuery: '',
      categoryFilter: 'all',
      effortFilter: 'all',
      fromDate: '',
      toDate: '',
    });
  };

  private update(patch: Partial<SessionHistoryFilterState>): void {
    const changed = Object.entries(patch).some(
      ([key, value]) =>
        this.state[key as keyof SessionHistoryFilterState] !== value
    );
    if (!changed) return;

    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }
}
