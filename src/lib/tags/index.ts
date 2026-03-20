import { getSessions, updateSession } from '@/lib/storage';
import { createTagService } from './service';

export const tagService = createTagService({
  getSessions,
  updateSession,
});

export * from './service';
