import { getGitHubSessionPath } from './github-storage';
import type { GitHubConfig, JudoSession, SessionFileIssue } from './types';

export type LogDoctorScanResult = {
  success: boolean;
  message: string;
  branch?: string;
  summary: {
    totalFiles: number;
    validFiles: number;
    invalidFiles: number;
  };
  files: Array<{
    path: string;
    status: 'valid' | 'invalid';
    errors?: string[];
    id?: string;
    date?: string;
  }>;
};

export function buildLogDoctorScanResult({
  sessions,
  issues,
  branch,
}: {
  sessions: JudoSession[];
  issues: SessionFileIssue[];
  branch?: string;
}): LogDoctorScanResult {
  const validFiles = sessions.map((session) => ({
    path: getGitHubSessionPath(session),
    status: 'valid' as const,
    id: session.id,
    date: session.date,
  }));
  const invalidFiles = issues.map((issue) => ({
    path: issue.filePath,
    status: 'invalid' as const,
    errors: [issue.message],
  }));
  const summary = {
    totalFiles: validFiles.length + invalidFiles.length,
    validFiles: validFiles.length,
    invalidFiles: invalidFiles.length,
  };

  return {
    success: summary.invalidFiles === 0,
    message:
      summary.invalidFiles === 0
        ? `Checked ${summary.totalFiles} training file(s).`
        : `Checked ${summary.totalFiles} training file(s); ${summary.invalidFiles} need attention.`,
    branch,
    summary,
    files: [...validFiles, ...invalidFiles],
  };
}

export async function scanTrainingDataWithNext(
  config: GitHubConfig
): Promise<LogDoctorScanResult> {
  const { scanSessionsFromGitHub } = await import('./session-storage');
  const { sessions, issues } = await scanSessionsFromGitHub(config);
  return buildLogDoctorScanResult({
    sessions,
    issues,
    branch: config.branch,
  });
}
