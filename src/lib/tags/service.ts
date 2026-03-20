import type { JudoSession, MutationResult } from '@/lib/types';

export type TagOperationConflictCode =
  | 'empty_source_tag'
  | 'empty_target_tag'
  | 'tag_not_found'
  | 'target_tag_exists'
  | 'case_conflict'
  | 'merge_same_tag';

export interface TagOperationConflict {
  code: TagOperationConflictCode;
  message: string;
}

export interface TagOperationSummary {
  dryRun: boolean;
  affectedSessionCount: number;
  changedTagCount: number;
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
    const sourceTag = oldName.trim();
    const targetTag = newName.trim();
    const dryRun = options.dryRun ?? false;
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
        dryRun,
        affectedSessionCount: 0,
        changedTagCount: 0,
        conflicts,
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
        dryRun,
        affectedSessionCount: 0,
        changedTagCount: 0,
        conflicts,
      };
    }

    let affectedSessionCount = 0;
    let changedTagCount = 0;
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
        updatedSessions.push({
          ...session,
          techniques: nextTechniques,
        });
      }
    });

    if (!dryRun) {
      await Promise.all(updatedSessions.map((session) => updateSession(session)));
    }

    return {
      dryRun,
      affectedSessionCount,
      changedTagCount,
      conflicts,
    };
  }

  async function mergeTags(
    sourceTag: string,
    targetTag: string,
    options: TagOperationOptions = {}
  ): Promise<TagOperationSummary> {
    const normalizedSource = normalizeTag(sourceTag);
    const normalizedTarget = normalizeTag(targetTag);
    const dryRun = options.dryRun ?? false;

    if (normalizedSource === normalizedTarget) {
      return {
        dryRun,
        affectedSessionCount: 0,
        changedTagCount: 0,
        conflicts: [
          {
            code: 'merge_same_tag',
            message: 'Cannot merge a tag into itself.',
          },
        ],
      };
    }

    return renameTag(sourceTag, targetTag, options);
  }

  async function deleteTag(
    tagName: string,
    options: TagOperationOptions = {}
  ): Promise<TagOperationSummary> {
    const targetTag = tagName.trim();
    const dryRun = options.dryRun ?? false;
    const sessions = getSessions();

    if (!targetTag) {
      return {
        dryRun,
        affectedSessionCount: 0,
        changedTagCount: 0,
        conflicts: [
          {
            code: 'empty_source_tag',
            message: 'Tag to delete cannot be empty.',
          },
        ],
      };
    }

    const normalizedTarget = normalizeTag(targetTag);
    const hasTag = getUniqueTags(sessions).some(
      (tag) => normalizeTag(tag) === normalizedTarget
    );

    if (!hasTag) {
      return {
        dryRun,
        affectedSessionCount: 0,
        changedTagCount: 0,
        conflicts: [
          {
            code: 'tag_not_found',
            message: `Tag "${targetTag}" does not exist.`,
          },
        ],
      };
    }

    const updatedSessions: JudoSession[] = [];
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
      updatedSessions.push({
        ...session,
        techniques: session.techniques.filter(
          (tag) => normalizeTag(tag) !== normalizedTarget
        ),
      });
    });

    if (!dryRun) {
      await Promise.all(updatedSessions.map((session) => updateSession(session)));
    }

    return {
      dryRun,
      affectedSessionCount,
      changedTagCount,
      conflicts: [],
    };
  }

  return {
    listTags,
    searchTags,
    renameTag,
    mergeTags,
    deleteTag,
  };
}

export type TagService = ReturnType<typeof createTagService>;
