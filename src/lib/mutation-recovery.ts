import type { SyncOperation, SyncOperationIssue } from './sync-queue';
import type { SessionSnapshot } from './keiko-session-revision';

export type RecoveryExportOperation = {
  operationId: string;
  operationType: SyncOperation['type'];
  sessionId: string;
  queuedAt: number;
  expectedRevision?: number;
  idempotencyKey?: string;
  attempted?: boolean;
  payload?: Omit<SessionSnapshot, 'keikoRevision' | 'revisionSha'>;
  previousSession?: Omit<SessionSnapshot, 'keikoRevision' | 'revisionSha'>;
  issueCategory?: {
    category: SyncOperationIssue['type'];
    status?: number;
    code?: string;
  };
};

export type MutationRecoveryExport = {
  format: 'matmetrics-session-mutation-recovery';
  version: 1;
  exportedAt: string;
  operations: RecoveryExportOperation[];
};

function safeSessionPayload(
  session: SessionSnapshot
): Omit<SessionSnapshot, 'keikoRevision' | 'revisionSha'> {
  return {
    id: session.id,
    date: session.date,
    techniques: [...session.techniques],
    effort: session.effort,
    category: session.category,
    ...(session.description === undefined ? {} : { description: session.description }),
    ...(session.notes === undefined ? {} : { notes: session.notes }),
    ...(session.duration === undefined ? {} : { duration: session.duration }),
    ...(session.videoUrl === undefined ? {} : { videoUrl: session.videoUrl }),
  };
}

function getSessionId(operation: SyncOperation): string {
  return operation.type === 'DELETE' ? operation.id : operation.session.id;
}

export function buildMutationRecoveryExport(
  operations: SyncOperation[],
  exportedAt = new Date().toISOString()
): MutationRecoveryExport {
  return {
    format: 'matmetrics-session-mutation-recovery',
    version: 1,
    exportedAt,
    operations: operations.map((operation) => {
      const common = {
        operationId: `${operation.type}:${getSessionId(operation)}:${operation.queuedAt}`,
        operationType: operation.type,
        sessionId: getSessionId(operation),
        queuedAt: operation.queuedAt,
        ...(operation.syncIssue
          ? {
              issueCategory: {
                category: operation.syncIssue.type,
                ...(operation.syncIssue.status === undefined
                  ? {}
                  : { status: operation.syncIssue.status }),
                ...(operation.syncIssue.code === undefined
                  ? {}
                  : { code: operation.syncIssue.code }),
              },
            }
          : {}),
      };

      if (operation.type === 'DELETE') {
        return {
          ...common,
          ...(operation.expectedRevision === undefined
            ? {}
            : { expectedRevision: operation.expectedRevision }),
          ...(operation.session
            ? { payload: safeSessionPayload(operation.session) }
            : {}),
        };
      }

      if (operation.type === 'UPDATE') {
        const expectedRevision =
          operation.expectedRevision ?? operation.session.keikoRevision;
        return {
          ...common,
          ...(expectedRevision === undefined ? {} : { expectedRevision }),
          payload: safeSessionPayload(operation.session),
          ...(operation.previousSession
            ? { previousSession: safeSessionPayload(operation.previousSession) }
            : {}),
        };
      }

      return {
        ...common,
        ...(operation.idempotencyKey === undefined
          ? {}
          : { idempotencyKey: operation.idempotencyKey }),
        ...(operation.attempted === undefined
          ? {}
          : { attempted: operation.attempted }),
        payload: safeSessionPayload(operation.session),
      };
    }),
  };
}
