import { getAuthHeaders } from '../lib/auth-session';
import {
  isSessionHistorySearchMatches,
  type SessionHistorySearchCandidate,
  type SessionHistorySearchMatch,
} from '../lib/session-history-search';

export interface SessionHistorySemanticSearchState {
  matches: SessionHistorySearchMatch[] | null;
  isSearching: boolean;
  error: string | null;
}

export interface SessionHistorySemanticSearchDependencies {
  fetcher: typeof fetch;
  getAuthHeaders: typeof getAuthHeaders;
}

const initialState: SessionHistorySemanticSearchState = {
  matches: null,
  isSearching: false,
  error: null,
};

/** Framework-neutral owner for abortable semantic history search requests. */
export class SessionHistorySemanticSearchController {
  private state: SessionHistorySemanticSearchState = { ...initialState };
  private readonly listeners = new Set<() => void>();
  private readonly fetcher: typeof fetch;
  private readonly getHeaders: typeof getAuthHeaders;
  private requestId = 0;
  private abortController: AbortController | null = null;

  constructor(dependencies: Partial<SessionHistorySemanticSearchDependencies> = {}) {
    this.fetcher = dependencies.fetcher ?? fetch;
    this.getHeaders = dependencies.getAuthHeaders ?? getAuthHeaders;
  }

  getSnapshot = (): Readonly<SessionHistorySemanticSearchState> => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  search = async (
    query: string,
    candidates: SessionHistorySearchCandidate[]
  ): Promise<void> => {
    const trimmedQuery = query.trim();
    if (this.state.isSearching || !trimmedQuery || candidates.length === 0) {
      return;
    }

    this.abortController?.abort();
    const abortController = new AbortController();
    this.abortController = abortController;
    const requestId = ++this.requestId;
    this.update({ isSearching: true, matches: null, error: null });

    try {
      const headers = await this.getHeaders({ 'Content-Type': 'application/json' });
      if (abortController.signal.aborted || requestId !== this.requestId) return;

      const response = await this.fetcher('/api/ai/search-sessions', {
        method: 'POST',
        headers,
        body: JSON.stringify({ query: trimmedQuery, candidates }),
        signal: abortController.signal,
      });
      if (!response.ok) {
        throw new Error('The semantic search request failed.');
      }
      const payload: unknown = await response.json();
      const matches =
        payload && typeof payload === 'object'
          ? (payload as { matches?: unknown }).matches
          : undefined;
      const candidateIds = new Set(candidates.map((candidate) => candidate.id));
      if (!isSessionHistorySearchMatches(matches, candidateIds)) {
        throw new Error('The semantic search response was invalid.');
      }
      if (requestId === this.requestId) this.update({ matches });
    } catch (error) {
      if (!abortController.signal.aborted && requestId === this.requestId) {
        this.update({
          error:
            error instanceof Error &&
            error.message === 'The semantic search response was invalid.'
              ? error.message
              : 'Semantic ranking is unavailable; showing text matches.',
        });
      }
    } finally {
      if (requestId === this.requestId) {
        this.abortController = null;
        this.update({ isSearching: false });
      }
    }
  };

  clear = (): void => {
    this.requestId += 1;
    this.abortController?.abort();
    this.abortController = null;
    this.update({ ...initialState });
  };

  destroy = (): void => {
    this.requestId += 1;
    this.abortController?.abort();
    this.abortController = null;
    this.state = { ...initialState };
    this.listeners.clear();
  };

  private update(patch: Partial<SessionHistorySemanticSearchState>): void {
    const next = { ...this.state, ...patch };
    if (
      next.matches === this.state.matches &&
      next.isSearching === this.state.isSearching &&
      next.error === this.state.error
    ) {
      return;
    }

    this.state = next;
    this.listeners.forEach((listener) => listener());
  }
}
