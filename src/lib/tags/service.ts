import type { JudoSession, MutationResult } from '@/lib/types';

export type TagOperationConflictCode =
  | 'empty_source_tag'
  | 'empty_target_tag'
  | 'tag_not_found'
  | 'target_tag_exists'
  | 'case_conflict'
  | 'merge_same_tag'
  | 'session_update_failed';

export interface TagOperationConflict {
  code: TagOperationConflictCode;
  message: string;
  failedSessionIds?: string[];
}

export interface TagOperationSummary {
  dryRun: boolean;
  affectedSessionCount: number;
  changedTagCount: number;
  affectedSessionIds: string[];
  failedSessionIds: string[];
  affectedTags: string[];
  conflicts: TagOperationConflict[];
}

interface TagServiceDependencies {
  getSessions: () => JudoSession[];
  updateSession: (session: JudoSession) => Promise<MutationResult>;
}

interface TagOperationOptions {
  dryRun?: boolean;
}

function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase();
}

function getUniqueTags(sessions: JudoSession[]): string[] {
  const tags = new Set<string>();
  sessions.forEach((session) => {
    session.techniques.forEach((tag) => tags.add(tag));
  });

  return Array.from(tags).sort((a, b) => a.localeCompare(b));
}

export function createTagService({
  getSessions,
  updateSession,
}: TagServiceDependencies) {
  async function applyUpdatesSequentially(
    sessionsToUpdate: JudoSession[],
    summary: TagOperationSummary
  ): Promise<TagOperationSummary> {
    const failedSessionIds: string[] = [];

    for (const session of sessionsToUpdate) {
      try {
        await updateSession(session);
      } catch (error) {
        failedSessionIds.push(session.id);
        const reason =
          error instanceof Error ? error.message : 'Unknown update failure';

        return {
          ...summary,
          failedSessionIds,
          conflicts: [
            {
              code: 'session_update_failed',
              message: `Failed to update session "${session.id}": ${reason}`,
              failedSessionIds,
            },
          ],
        };
      }
    }

    return {
      ...summary,
      failedSessionIds,
    };
  }

  function summarizeRenameOrMerge(
    oldName: string,
    newName: string,
    dryRun: boolean
  ): {
    summary: TagOperationSummary;
    updatedSessions: JudoSession[];
  } {
    const sourceTag = oldName.trim();
    const targetTag = newName.trim();
    const sessions = getSessions();
    const availableTags = getUniqueTags(sessions);
    const conflicts: TagOperationConflict[] = [];

    if (!sourceTag) {
      conflicts.push({
        code: 'empty_source_tag',
        message: 'Source tag cannot be empty.',
      });
    }

    if (!targetTag) {
      conflicts.push({
        code: 'empty_target_tag',
        message: 'Target tag cannot be empty.',
      });
    }

    if (conflicts.length > 0) {
      return {
        summary: {
          dryRun,
          affectedSessionCount: 0,
          changedTagCount: 0,
          affectedSessionIds: [],
          failedSessionIds: [],
          affectedTags: [],
          conflicts,
        },
        updatedSessions: [],
      };
    }

    const normalizedSource = normalizeTag(sourceTag);
    const normalizedTarget = normalizeTag(targetTag);
    const hasSource = availableTags.some(
      (tag) => normalizeTag(tag) === normalizedSource
    );
    const hasExactTarget = availableTags.includes(targetTag);
    const hasNormalizedTarget = availableTags.some(
      (tag) => normalizeTag(tag) === normalizedTarget
    );

    if (!hasSource) {
      conflicts.push({
        code: 'tag_not_found',
        message: `Tag "${sourceTag}" does not exist.`,
      });
    }

    if (normalizedSource === normalizedTarget) {
      if (sourceTag !== targetTag && hasExactTarget) {
        conflicts.push({
          code: 'case_conflict',
          message: `Cannot rename "${sourceTag}" to "${targetTag}" because that casing already exists.`,
        });
      }
    } else if (hasNormalizedTarget) {
      conflicts.push({
        code: 'target_tag_exists',
        message: `Tag "${targetTag}" already exists. Use merge instead.`,
      });
    }

    if (conflicts.length > 0) {
      return {
        summary: {
          dryRun,
          affectedSessionCount: 0,
          changedTagCount: 0,
          affectedSessionIds: [],
          failedSessionIds: [],
          affectedTags: [],
          conflicts,
        },
        updatedSessions: [],
      };
    }

    let affectedSessionCount = 0;
    let changedTagCount = 0;
    const affectedSessionIds: string[] = [];
    const updatedSessions: JudoSession[] = [];

    sessions.forEach((session) => {
      let sessionChangedCount = 0;
      const nextTechniques = Array.from(
        new Set(
          session.techniques.map((tag) => {
            if (normalizeTag(tag) === normalizedSource) {
              sessionChangedCount += 1;
              return targetTag;
            }
            return tag;
          })
        )
      );

      if (sessionChangedCount > 0) {
        affectedSessionCount += 1;
        changedTagCount += sessionChangedCount;
        affectedSessionIds.push(session.id);
        updatedSessions.push({
          ...session,
          techniques: nextTechniques,
        });
      }
    });

    return {
      summary: {
        dryRun,
        affectedSessionCount,
        changedTagCount,
        affectedSessionIds,
        failedSessionIds: [],
        affectedTags: Array.from(new Set([sourceTag, targetTag])),
        conflicts: [],
      },
      updatedSessions,
    };
  }

  function summarizeDelete(
    tagName: string,
    dryRun: boolean
  ): {
    summary: TagOperationSummary;
    updatedSessions: JudoSession[];
  } {
    const targetTag = tagName.trim();
    const sessions = getSessions();

    if (!targetTag) {
      return {
        summary: {
          dryRun,
          affectedSessionCount: 0,
          changedTagCount: 0,
          affectedSessionIds: [],
          failedSessionIds: [],
          affectedTags: [],
          conflicts: [
            {
              code: 'empty_source_tag',
              message: 'Tag to delete cannot be empty.',
            },
          ],
        },
        updatedSessions: [],
      };
    }

    const normalizedTarget = normalizeTag(targetTag);
    const hasTag = getUniqueTags(sessions).some(
      (tag) => normalizeTag(tag) === normalizedTarget
    );

    if (!hasTag) {
      return {
        summary: {
          dryRun,
          affectedSessionCount: 0,
          changedTagCount: 0,
          affectedSessionIds: [],
          failedSessionIds: [],
          affectedTags: [],
          conflicts: [
            {
              code: 'tag_not_found',
              message: `Tag "${targetTag}" does not exist.`,
            },
          ],
        },
        updatedSessions: [],
      };
    }

    const updatedSessions: JudoSession[] = [];
    const affectedSessionIds: string[] = [];
    let affectedSessionCount = 0;
    let changedTagCount = 0;

    sessions.forEach((session) => {
      const removedCount = session.techniques.filter(
        (tag) => normalizeTag(tag) === normalizedTarget
      ).length;

      if (removedCount === 0) {
        return;
      }

      affectedSessionCount += 1;
      changedTagCount += removedCount;
      affectedSessionIds.push(session.id);
      updatedSessions.push({
        ...session,
        techniques: session.techniques.filter(
          (tag) => normalizeTag(tag) !== normalizedTarget
        ),
      });
    });

    return {
      summary: {
        dryRun,
        affectedSessionCount,
        changedTagCount,
        affectedSessionIds,
        failedSessionIds: [],
        affectedTags: [targetTag],
        conflicts: [],
      },
      updatedSessions,
    };
  }

  function listTags(): string[] {
    return getUniqueTags(getSessions());
  }

  function searchTags(query: string): string[] {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return listTags();
    }

    return listTags().filter((tag) => tag.toLowerCase().includes(needle));
  }

  async function renameTag(
    oldName: string,
    newName: string,
    options: TagOperationOptions = {}
  ): Promise<TagOperationSummary> {
    const dryRun = options.dryRun ?? false;
    const { summary, updatedSessions } = summarizeRenameOrMerge(
      oldName,
      newName,
      dryRun
    );

    if (!dryRun && summary.conflicts.length === 0) {
      return applyUpdatesSequentially(updatedSessions, summary);
    }

    return summary;
  }

  async function mergeTags(
    sourceTag: string,
    targetTag: string,
    options: TagOperationOptions = {}
  ): Promise<TagOperationSummary> {
    const dryRun = options.dryRun ?? false;
    const source = sourceTag.trim();
    const target = targetTag.trim();
    const normalizedSource = normalizeTag(source);
    const normalizedTarget = normalizeTag(target);
    const sessions = getSessions();
    const availableTags = getUniqueTags(sessions);

    const conflicts: TagOperationConflict[] = [];
    const hasSource = availableTags.some(
      (tag) => normalizeTag(tag) === normalizedSource
    );
    const hasTarget = availableTags.some(
      (tag) => normalizeTag(tag) === normalizedTarget
    );

    if (!source) {
      conflicts.push({
        code: 'empty_source_tag',
        message: 'Source tag cannot be empty.',
      });
    }

    if (!target) {
      conflicts.push({
        code: 'empty_target_tag',
        message: 'Target tag cannot be empty.',
      });
    }

    if (source && target && normalizedSource === normalizedTarget) {
      conflicts.push({
        code: 'merge_same_tag',
        message: 'Cannot merge a tag into itself.',
      });
    }

    if (source && !hasSource) {
      conflicts.push({
        code: 'tag_not_found',
        message: `Tag "${source}" does not exist.`,
      });
    }

    if (target && !hasTarget) {
      conflicts.push({
        code: 'tag_not_found',
        message: `Tag "${target}" does not exist.`,
      });
    }

    if (conflicts.length > 0) {
      return {
        dryRun,
        affectedSessionCount: 0,
        changedTagCount: 0,
        affectedSessionIds: [],
        failedSessionIds: [],
        affectedTags: [],
        conflicts,
      };
    }

    let affectedSessionCount = 0;
    let changedTagCount = 0;
    const affectedSessionIds: string[] = [];
    const updatedSessions: JudoSession[] = [];

    sessions.forEach((session) => {
      let sessionChangedCount = 0;
      const nextTechniques = Array.from(
        new Set(
          session.techniques.map((tag) => {
            if (normalizeTag(tag) === normalizedSource) {
              sessionChangedCount += 1;
              return target;
            }
            return tag;
          })
        )
      );

      if (sessionChangedCount > 0) {
        affectedSessionCount += 1;
        changedTagCount += sessionChangedCount;
        affectedSessionIds.push(session.id);
        updatedSessions.push({
          ...session,
          techniques: nextTechniques,
        });
      }
    });

    const summary: TagOperationSummary = {
      dryRun,
      affectedSessionCount,
      changedTagCount,
      affectedSessionIds,
      failedSessionIds: [],
      affectedTags: Array.from(new Set([source, target])),
      conflicts: [],
    };

    if (!dryRun) {
      return applyUpdatesSequentially(updatedSessions, summary);
    }

    return summary;
  }

  async function analyzeRename(
    oldName: string,
    newName: string
  ): Promise<TagOperationSummary> {
    return summarizeRenameOrMerge(oldName, newName, true).summary;
  }

  async function analyzeMerge(
    sourceTag: string,
    targetTag: string
  ): Promise<TagOperationSummary> {
    return mergeTags(sourceTag, targetTag, { dryRun: true });
  }

  async function deleteTag(
    tagName: string,
    options: TagOperationOptions = {}
  ): Promise<TagOperationSummary> {
    const dryRun = options.dryRun ?? false;
    const { summary, updatedSessions } = summarizeDelete(tagName, dryRun);

    if (!dryRun && summary.conflicts.length === 0) {
      return applyUpdatesSequentially(updatedSessions, summary);
    }

    return summary;
  }

  async function analyzeDelete(tagName: string): Promise<TagOperationSummary> {
    return summarizeDelete(tagName, true).summary;
  }

  return {
    listTags,
    searchTags,
    analyzeRename,
    analyzeMerge,
    analyzeDelete,
    renameTag,
    mergeTags,
    deleteTag,
  };
}

export type TagService = ReturnType<typeof createTagService>;
