export type GitHubSyncSurfaceState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T; warnings: string[] }
  | { status: 'empty'; message: string }
  | { status: 'error'; message: string };

export type GitHubSyncHistoryFile = {
  path: string;
  status: string;
  errors: string[];
  id?: string;
  date?: string;
};

export type GitHubSyncHistoryData = {
  message: string;
  branch?: string;
  totalFiles: number;
  invalidFiles: number;
  files: GitHubSyncHistoryFile[];
};

export type LoadGitHubSyncHistoryOptions = {
  owner: string;
  repo: string;
  branch?: string;
  getHeaders: (headers?: HeadersInit) => Promise<HeadersInit>;
  fetchImpl?: typeof fetch;
  onStateChange: (state: GitHubSyncSurfaceState<GitHubSyncHistoryData>) => void;
};
