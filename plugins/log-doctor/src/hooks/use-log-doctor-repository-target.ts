import { useEffect, useState } from 'react';

import type { UserPreferences } from '@/lib/types';

export function useLogDoctorRepositoryTarget(preferences: UserPreferences): {
  owner: string;
  repo: string;
  branch: string;
  setOwner: (value: string) => void;
  setRepo: (value: string) => void;
  setBranch: (value: string) => void;
} {
  const [owner, setOwner] = useState('');
  const [repo, setRepo] = useState('');
  const [branch, setBranch] = useState('');

  useEffect(() => {
    const config = preferences.gitHub.config;
    if (!config) return;
    setOwner(config.owner);
    setRepo(config.repo);
    setBranch(config.branch ?? '');
  }, [preferences.gitHub.config]);

  return { owner, repo, branch, setOwner, setRepo, setBranch };
}
