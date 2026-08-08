import { useState } from 'react';

import type {
  VideoLibraryFilters,
} from '@/lib/video-library';
import type {
  VideoLibraryPresentationMode,
  VideoLibrarySortOption,
} from './video-library-view-model';

export function useVideoLibraryViewState() {
  const [newDomain, setNewDomain] = useState('');
  const [presentationMode, setPresentationMode] =
    useState<VideoLibraryPresentationMode>('lounge');
  const [sortOrder, setSortOrder] = useState<VideoLibrarySortOption>('newest');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [playNextEnabled, setPlayNextEnabled] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [filters, setFilters] = useState<VideoLibraryFilters>({
    tab: 'watchable',
    search: '',
    status: 'all',
    category: 'all',
    hostname: '',
    checked: 'all',
  });

  return {
    newDomain,
    setNewDomain,
    presentationMode,
    setPresentationMode,
    sortOrder,
    setSortOrder,
    showAdvanced,
    setShowAdvanced,
    playNextEnabled,
    setPlayNextEnabled,
    isSettingsOpen,
    setIsSettingsOpen,
    filters,
    setFilters,
  };
}
