import { useCallback, useEffect, useState } from 'react';

import { tagService } from '@/lib/tags';

export function useTagManagerData(onRefresh: () => void) {
  const [tags, setTags] = useState<string[]>([]);
  const refreshTags = useCallback(() => {
    setTags(tagService.listTags());
    onRefresh();
  }, [onRefresh]);

  useEffect(() => {
    refreshTags();
  }, [refreshTags]);

  return { tags, refreshTags };
}
